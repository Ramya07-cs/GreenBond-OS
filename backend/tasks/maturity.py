"""
tasks/maturity.py — Bond Lifecycle: Maturity Detection & Final Report

Runs daily via Celery Beat (after the main audit).

What it does:
  1. Queries all ACTIVE or PENALTY bonds where maturity_date <= today
  2. For each matured bond:
     a. Computes final performance stats (avg PR, total penalty days)
     b. Updates bond status to MATURED in PostgreSQL
     c. Records matured_at timestamp and final stats
     d. Sends maturity alert to issuer (email + SMS)
     e. Logs a MATURED alert record
     f. Clears bond from Redis caches
  3. Returns a summary for logging

Why a separate task and not inside daily_audit?
  Keeps concerns separated. daily_audit is about per-day PR monitoring.
  Maturity is a one-time lifecycle event — different logic, different alerts.
"""

import logging
from datetime import date, datetime, timezone
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Bond, AuditLog, BondStatus
from services.alerts import alert_service
from services.audit import audit_service
from tasks.celery_app import celery_app
from redis_client import redis_client

logger = logging.getLogger(__name__)


@celery_app.task(name="tasks.maturity.check_bond_maturity")
def check_bond_maturity():
    """
    Detect and process bonds that have reached their maturity date.
    Safe to run multiple times — idempotent (won't re-process MATURED bonds).
    """
    today = date.today()
    db: Session = SessionLocal()
    summary = {"checked": 0, "matured": [], "errors": []}

    try:
        # Find bonds whose maturity date has passed and are still active/penalty
        due_bonds = (
            db.query(Bond)
            .filter(
                Bond.maturity_date.isnot(None),
                Bond.maturity_date <= today,
                Bond.status.in_([BondStatus.ACTIVE, BondStatus.PENALTY]),
            )
            .all()
        )

        if not due_bonds:
            logger.info("[Maturity] No bonds due for maturity today.")
            return summary

        logger.info(f"[Maturity] {len(due_bonds)} bond(s) reached maturity today.")

        for bond in due_bonds:
            summary["checked"] += 1
            try:
                _process_matured_bond(db, bond)
                summary["matured"].append(bond.id)
            except Exception as e:
                logger.error(f"[Maturity] Error processing {bond.id}: {e}", exc_info=True)
                summary["errors"].append({"bond_id": bond.id, "error": str(e)})

        db.commit()

    except Exception as e:
        db.rollback()
        logger.error(f"[Maturity] Fatal error: {e}", exc_info=True)
    finally:
        db.close()

    return summary


def _process_matured_bond(db: Session, bond: Bond):
    """Process a single bond reaching maturity."""
    logger.info(f"[Maturity] Processing {bond.id} ({bond.name})")

    # ── 1. Calculate final performance stats from audit history ───────────────
    stats = (
        db.query(
            func.avg(AuditLog.calculated_pr).label("avg_pr"),
            func.count(
                AuditLog.id
            ).filter(AuditLog.verdict == "PENALTY").label("penalty_days"),
        )
        .filter(
            AuditLog.bond_id == bond.id,
            AuditLog.calculated_pr.isnot(None),
        )
        .first()
    )

    final_avg_pr = round(float(stats.avg_pr), 4) if stats and stats.avg_pr else None

    # Count lifetime penalty days (separate query for clarity)
    total_penalty_days = (
        db.query(func.count(AuditLog.id))
        .filter(AuditLog.bond_id == bond.id, AuditLog.verdict == "PENALTY")
        .scalar()
        or 0
    )

    logger.info(
        f"[Maturity] {bond.id} final stats — "
        f"avg PR: {final_avg_pr}, penalty days: {total_penalty_days}"
    )

    # ── 2. Update bond in DB ───────────────────────────────────────────────────
    bond.status = BondStatus.MATURED
    bond.matured_at = datetime.now(timezone.utc)
    bond.final_avg_pr = final_avg_pr
    bond.total_penalty_days = total_penalty_days
    bond.current_rate = bond.base_rate      # Reset to base at maturity
    db.flush()

    # ── 3. Send maturity alert ────────────────────────────────────────────────
    alert_service.send_maturity_alert(
        bond_id=bond.id,
        bond_name=bond.name,
        maturity_date=str(bond.maturity_date),
        final_avg_pr=final_avg_pr,
        total_penalty_days=total_penalty_days,
        issuer_email=bond.issuer_email,
        issuer_phone=bond.issuer_phone,
    )

    # ── 4. Log alert record ───────────────────────────────────────────────────
    audit_service.write_alert(
        db=db,
        bond_id=bond.id,
        alert_type="SYSTEM",
        message=(
            f"Bond {bond.id} ({bond.name}) matured on {bond.maturity_date}. "
            f"Final avg PR: {final_avg_pr}. Total penalty days: {total_penalty_days}. "
            f"Status set to MATURED."
        ),
        severity="info",
        status="LOGGED",
    )

    # ── 5. Invalidate all caches for this bond ────────────────────────────────
    cache_keys = [
        f"bond:detail:{bond.id}",
        f"bond:pr_today:{bond.id}",
        "bonds:list",
        "dashboard:summary",
        "health:full_check",
    ]
    pattern_keys = redis_client.keys(f"bond:timeseries:{bond.id}:*")
    cache_keys.extend(pattern_keys)
    redis_client.delete(*cache_keys)

    logger.info(f"[Maturity] {bond.id} successfully marked MATURED.")
