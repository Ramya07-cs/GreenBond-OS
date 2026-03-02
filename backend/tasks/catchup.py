"""
catchup.py — Missed Audit Recovery

Called automatically on every server startup via main.py lifespan hook.

What it does:
  1. Looks at each active/penalty bond in the DB
  2. Finds the last date an audit was successfully logged
  3. Detects any gap between that date and yesterday (today hasn't been audited yet)
  4. Queues a run_daily_audit task for every missed date, in chronological order
  5. Logs a summary so you can see what was recovered in the server logs

Why yesterday and not today?
  Today's audit is handled by Celery Beat at 6:00 AM IST as usual.
  Catchup only fills in the historical gap — it never duplicates today's scheduled run.

What if a date was already audited?
  It checks the audit_logs table first. If a record exists for that bond + date,
  it skips it. This makes catchup fully idempotent — safe to call multiple times.
"""

import logging
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

from database import SessionLocal
from models import Bond, AuditLog, BondStatus

logger = logging.getLogger(__name__)

# Maximum number of days to look back.
# Safety cap — if the server was down for a year, we don't queue 365 tasks blindly.
# Adjust this to match your business rules (e.g. 30 = one month lookback max).
MAX_CATCHUP_DAYS = 30


def catchup_missed_audits() -> dict:
    """
    Entry point called from main.py on startup.

    Finds all gaps in audit history for active bonds and queues
    run_daily_audit tasks to fill them in.

    Returns a summary dict for logging:
      {
        "bonds_checked": 4,
        "total_missed_days": 6,
        "queued": [
          {"bond_id": "GB-2024-001", "dates": ["2025-06-08", "2025-06-09"]},
          ...
        ],
        "skipped_too_old": 1,   # bonds with gaps older than MAX_CATCHUP_DAYS
      }
    """
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
            missed_dates = _find_missed_dates(db, bond.id, yesterday, cutoff)

            if not missed_dates:
                logger.info(f"[Catchup] {bond.id}: up to date ✓")
                continue

            # Check if the oldest missed date exceeds our lookback window
            if missed_dates[0] < cutoff:
                logger.warning(
                    f"[Catchup] {bond.id}: gap starts {missed_dates[0]} which is "
                    f"older than {MAX_CATCHUP_DAYS}-day limit. "
                    f"Processing from {cutoff} onwards only."
                )
                missed_dates = [d for d in missed_dates if d >= cutoff]
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


def _find_missed_dates(
    db: Session,
    bond_id: str,
    up_to: date,
    cutoff: date,
) -> list[date]:
    """
    Return a sorted list of dates (oldest first) that have NO audit_log record
    for the given bond, between cutoff and up_to inclusive.

    Strategy:
      1. Find the most recent audit log date for this bond
      2. If never audited → start from cutoff
      3. Walk day by day from the day after last audit to yesterday
      4. Collect any date that doesn't have an existing audit record
         (handles sparse gaps, not just trailing gaps)
    """
    # Find the last audited date for this bond
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
        # Already audited through yesterday — nothing to do
        return []
    else:
        # Start checking from the day after the last known audit
        start_from = last_audited + timedelta(days=1)

    # Clamp to the lookback window
    start_from = max(start_from, cutoff)

    if start_from > up_to:
        return []

    # Fetch all dates that DO have audit records in this range (fast set lookup)
    existing_dates: set[date] = set(
        row[0]
        for row in db.query(AuditLog.date)
        .filter(
            AuditLog.bond_id == bond_id,
            AuditLog.date >= start_from,
            AuditLog.date <= up_to,
        )
        .all()
    )

    # Walk the full date range and collect anything missing
    missed = []
    current = start_from
    while current <= up_to:
        if current not in existing_dates:
            missed.append(current)
        current += timedelta(days=1)

    return missed  # Already in chronological order
