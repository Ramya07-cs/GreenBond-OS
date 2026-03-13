import logging
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

from database import SessionLocal
from models import Bond, AuditLog, BondStatus
from config import settings

logger = logging.getLogger(__name__)

# Adjust this to match your business rules (e.g. 30 = one month lookback max).
MAX_CATCHUP_DAYS = 30


def catchup_missed_audits(force: bool = False) -> dict:
    # Late import to avoid circular import at module load time
    from tasks.daily_audit import run_daily_audit

    # In DEBUG mode or when force=True, bypass NASA lag guard so all missed/IGNORED
    # dates are re-queued immediately — useful for local testing on restart.
    effective_force = force or settings.DEBUG

    db: Session = SessionLocal()
    summary = {
        "bonds_checked": 0,
        "total_missed_days": 0,
        "queued": [],
        "skipped_too_old": 0,
        "force_mode": effective_force,
    }

    try:
        # Only process bonds that are currently being monitored
        active_bonds = (
            db.query(Bond)
            .filter(Bond.status.in_([BondStatus.ACTIVE, BondStatus.PENALTY, BondStatus.MATURED]))
            .all()
        )

        if not active_bonds:
            logger.info("[Catchup] No active/matured bonds found. Nothing to do.")
            return summary

        logger.info(
            f"[Catchup] Checking {len(active_bonds)} bond(s) for missed audits..."
        )

        yesterday = date.today() - timedelta(days=1)
        cutoff = date.today() - timedelta(days=MAX_CATCHUP_DAYS)

        for bond in active_bonds:
            summary["bonds_checked"] += 1
            # Never audit before the bond was registered
            bond_start = bond.created_at.date() if bond.created_at else date.today()
            if bond_start >= date.today():
                logger.info(f"[Catchup] {bond.id}: registered today, skipping catchup.")
                continue
            effective_cutoff = max(cutoff, bond_start)

            # For matured bonds: cap audit range at maturity_date, not yesterday.
            # This ensures NASA lag days before maturity still get retried.
            if bond.status == BondStatus.MATURED and bond.maturity_date:
                audit_up_to = min(yesterday, bond.maturity_date)
                logger.info(f"[Catchup] {bond.id}: MATURED — auditing up to maturity date {audit_up_to}")
            else:
                audit_up_to = yesterday

            missed_dates = _find_missed_dates(db, bond.id, audit_up_to, effective_cutoff, force=effective_force)

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

            # Queue one Celery task per missed date, in strict chronological order.
            # Stagger by 30s per date so streak reads from DB are always sequential —
            # each task sees the completed streak from the previous date before running.
            queued_dates = []
            for i, missed_date in enumerate(missed_dates):
                # In force mode: delete existing IGNORED/PENDING rows so the audit
                # runs fresh and recalculates streaks correctly from scratch.
                if effective_force:
                    deleted = (
                        db.query(AuditLog)
                        .filter(
                            AuditLog.bond_id == bond.id,
                            AuditLog.date == missed_date,
                            AuditLog.verdict.in_(["IGNORED", "PENDING"]),
                        )
                        .delete()
                    )
                    if deleted:
                        logger.info(
                            f"[Catchup] Force mode: cleared {deleted} IGNORED/PENDING "
                            f"record(s) for {bond.id} on {missed_date}"
                        )
                db.commit()

                run_daily_audit.apply_async(
                    kwargs={"target_date": str(missed_date), "bond_id": bond.id},
                    queue="audits",
                    countdown=i * 30,  # stagger: 0s, 30s, 60s, etc.
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

from tasks.celery_app import celery_app  # noqa: E402 — import after function def


@celery_app.task(name="tasks.catchup.retry_ignored_audits")
def retry_ignored_audits():
    logger.info("[Catchup] Scheduled retry-ignored-audits task started.")
    summary = catchup_missed_audits(force=settings.DEBUG)
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
    force: bool = False,
) -> list[date]:

    # Find the last audited date for this bond (any verdict including IGNORED/PENDING)
    last_audited: Optional[date] = (
        db.query(func.max(AuditLog.date))
        .filter(AuditLog.bond_id == bond_id)
        .scalar()
    )

    if last_audited is None:
        start_from = cutoff
        logger.info(
            f"[Catchup] {bond_id}: no audit history found. "
            f"Will process from {cutoff}."
        )
    elif last_audited >= up_to:
        start_from = cutoff
    else:
        start_from = last_audited + timedelta(days=1)

    start_from = max(start_from, cutoff)
    if start_from > up_to:
        start_from = cutoff

    # NASA POWER has a 5–6 day processing lag. Only retry IGNORED/PENDING audits
    # that are at least 7 days old — this guarantees NASA data should be available.
    # In force/debug mode: bypass this guard — retry ALL incomplete dates immediately.
    nasa_ready_cutoff = cutoff if force else date.today() - timedelta(days=7)

    if force:
        logger.info(
            f"[Catchup] {bond_id}: FORCE mode — NASA lag guard bypassed, "
            f"all IGNORED/PENDING dates will be retried regardless of age."
        )

    retriable_incomplete: set[date] = set(
        row[0]
        for row in db.query(AuditLog.date)
        .filter(
            AuditLog.bond_id == bond_id,
            AuditLog.verdict.in_(["IGNORED", "PENDING"]),
            AuditLog.date >= max(cutoff, nasa_ready_cutoff),
            AuditLog.date <= up_to,
        )
        .all()
    )

    if retriable_incomplete:
        logger.info(
            f"[Catchup] {bond_id}: {len(retriable_incomplete)} IGNORED/PENDING day(s) "
            f"to retry: {sorted(retriable_incomplete)}"
        )

    # Dates with a COMPLIANT/PENALTY/RECOVERY record are fully done — never re-queue
    completed_dates: set[date] = set(
        row[0]
        for row in db.query(AuditLog.date)
        .filter(
            AuditLog.bond_id == bond_id,
            AuditLog.verdict.in_(["COMPLIANT", "PENALTY", "RECOVERY"]),
            AuditLog.date >= max(start_from, cutoff),
            AuditLog.date <= up_to,
        )
        .all()
    )

    fresh_incomplete: set[date] = set() if force else set(
        row[0]
        for row in db.query(AuditLog.date)
        .filter(
            AuditLog.bond_id == bond_id,
            AuditLog.verdict.in_(["IGNORED", "PENDING"]),
            AuditLog.date > nasa_ready_cutoff,
            AuditLog.date <= up_to,
        )
        .all()
    )

    scan_from = max(cutoff, start_from)

    missed = []
    current = scan_from
    while current <= up_to:
        if current not in completed_dates and current not in fresh_incomplete:
            missed.append(current)
        current += timedelta(days=1)

    return missed  # Chronological order