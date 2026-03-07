import logging
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

from database import SessionLocal
from models import Bond, AuditLog, BondStatus

logger = logging.getLogger(__name__)

# Adjust this to match your business rules (e.g. 30 = one month lookback max).
MAX_CATCHUP_DAYS = 30


def catchup_missed_audits() -> dict:
    # Late import to avoid circular import at module load time
    from tasks.daily_audit import run_daily_audit

    db: Session = SessionLocal()
    summary = {
        "bonds_checked": 0,
        "total_missed_days": 0,
        "queued": [],
        "skipped_too_old": 0,
    }

    try:
        # Only process bonds that are currently being monitored
        active_bonds = (
            db.query(Bond)
            .filter(Bond.status.in_([BondStatus.ACTIVE, BondStatus.PENALTY]))
            .all()
        )

        if not active_bonds:
            logger.info("[Catchup] No active bonds found. Nothing to do.")
            return summary

        logger.info(
            f"[Catchup] Checking {len(active_bonds)} active bond(s) for missed audits..."
        )

        yesterday = date.today() - timedelta(days=1)
        cutoff = date.today() - timedelta(days=MAX_CATCHUP_DAYS)

        for bond in active_bonds:
            summary["bonds_checked"] += 1
            # Never audit before the bond was registered — use registration
            # date as the hard floor, regardless of MAX_CATCHUP_DAYS
            bond_start = bond.created_at.date() if bond.created_at else date.today()
            # Bond registered today — nothing to catch up, Beat will run tonight
            if bond_start >= date.today():
                logger.info(f"[Catchup] {bond.id}: registered today, skipping catchup.")
                continue
            effective_cutoff = max(cutoff, bond_start)
            missed_dates = _find_missed_dates(db, bond.id, yesterday, effective_cutoff)

            if not missed_dates:
                logger.info(f"[Catchup] {bond.id}: up to date ✓")
                continue

            # Check if the oldest missed date exceeds our lookback window
            if missed_dates[0] < effective_cutoff:
                logger.warning(
                    f"[Catchup] {bond.id}: gap starts {missed_dates[0]} which is "
                    f"older than {MAX_CATCHUP_DAYS}-day limit. "
                    f"Processing from {effective_cutoff} onwards only."
                )
                missed_dates = [d for d in missed_dates if d >= effective_cutoff]
                summary["skipped_too_old"] += 1

            if not missed_dates:
                continue

            logger.info(
                f"[Catchup] {bond.id}: {len(missed_dates)} missed day(s) — "
                f"{missed_dates[0]} → {missed_dates[-1]}. Queuing..."
            )

            # Queue one Celery task per missed date, in chronological order.
            # Using .apply_async with countdown so they run a few seconds apart
            # and don't all slam the NASA API simultaneously.
            queued_dates = []
            for i, missed_date in enumerate(missed_dates):
                run_daily_audit.apply_async(
                    kwargs={"target_date": str(missed_date)},
                    queue="audits",
                    countdown=i * 10,  # stagger: 0s, 10s, 20s, etc.
                )
                queued_dates.append(str(missed_date))
                summary["total_missed_days"] += 1

            summary["queued"].append({"bond_id": bond.id, "dates": queued_dates})

    except Exception as e:
        logger.error(f"[Catchup] Fatal error during startup catchup: {e}", exc_info=True)
        # Don't raise — a catchup failure should never prevent the server from starting
    finally:
        db.close()

    # Final summary log
    if summary["total_missed_days"] == 0:
        logger.info("[Catchup] All bonds are up to date. No recovery needed.")
    else:
        logger.warning(
            f"[Catchup] Queued {summary['total_missed_days']} missed audit(s) "
            f"across {len(summary['queued'])} bond(s). "
            f"Celery workers will process them shortly."
        )

    return summary
    
# ── Celery task wrapper ────────────────────────────────────────────────────────
# Wrapping catchup_missed_audits as a Celery task allows Celery Beat to schedule
# the IGNORED-day retry automatically (e.g. at 14:00 daily) without requiring
# a server restart. The plain function is still used by main.py at startup.

from tasks.celery_app import celery_app  # noqa: E402 — import after function def


@celery_app.task(name="tasks.catchup.retry_ignored_audits")
def retry_ignored_audits():
    logger.info("[Catchup] Scheduled retry-ignored-audits task started.")
    summary = catchup_missed_audits()
    logger.info(
        f"[Catchup] Scheduled retry complete — "
        f"{summary['total_missed_days']} day(s) queued across "
        f"{len(summary['queued'])} bond(s)."
    )
    return summary


def _find_missed_dates(
    db: Session,
    bond_id: str,
    up_to: date,
    cutoff: date,
) -> list[date]:

    # Find the last audited date for this bond (any verdict including IGNORED)
    last_audited: Optional[date] = (
        db.query(func.max(AuditLog.date))
        .filter(AuditLog.bond_id == bond_id)
        .scalar()
    )

    if last_audited is None:
        # Bond has never been audited — start from the cutoff date
        start_from = cutoff
        logger.info(
            f"[Catchup] {bond_id}: no audit history found. "
            f"Will process from {cutoff}."
        )
    elif last_audited >= up_to:
        # Already audited through yesterday — but may still have IGNORED days
        # to retry (see below). Set start_from to cutoff so we scan the range.
        start_from = cutoff
    else:
        # Start checking from the day after the last known audit
        start_from = last_audited + timedelta(days=1)

    # Clamp to the lookback window
    start_from = max(start_from, cutoff)

    if start_from > up_to:
        start_from = cutoff  # still need to scan for IGNORED retries

    # NASA POWER has a 5–6 day processing lag. Any IGNORED audit written within
    # the last 7 days may now have GHI data available — re-queue those dates.
    nasa_lag_cutoff = date.today() - timedelta(days=7)
    retriable_ignored: set[date] = set(
        row[0]
        for row in db.query(AuditLog.date)
        .filter(
            AuditLog.bond_id == bond_id,
            AuditLog.verdict == "IGNORED",
            AuditLog.date >= max(cutoff, nasa_lag_cutoff),
            AuditLog.date <= up_to,
        )
        .all()
    )

    if retriable_ignored:
        logger.info(
            f"[Catchup] {bond_id}: {len(retriable_ignored)} IGNORED day(s) within "
            f"NASA lag window — will retry: {sorted(retriable_ignored)}"
        )

    # Fetch all dates that have a COMPLIANT or PENALTY record (truly done)
    completed_dates: set[date] = set(
        row[0]
        for row in db.query(AuditLog.date)
        .filter(
            AuditLog.bond_id == bond_id,
            AuditLog.verdict.in_(["COMPLIANT", "PENALTY"]),
            AuditLog.date >= max(start_from, cutoff),
            AuditLog.date <= up_to,
        )
        .all()
    )

    # Walk the full range from cutoff: collect missing dates + retriable IGNORED
    scan_from = max(cutoff, start_from)
    # Also scan back to nasa_lag_cutoff to catch IGNORED days in the lag window
    scan_from = min(scan_from, max(cutoff, nasa_lag_cutoff))

    missed = []
    current = scan_from
    while current <= up_to:
        if current not in completed_dates:
            missed.append(current)
        current += timedelta(days=1)

    return missed  # Already in chronological order