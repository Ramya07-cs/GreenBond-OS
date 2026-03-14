import logging
from datetime import date, datetime, timezone
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Bond, AuditLog, BondStatus
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


def recompute_matured_bond_stats(db: Session, bond: Bond):
    """Recompute final_avg_pr and total_penalty_days for an already-MATURED bond.
    Called after NASA lag catchup fills in previously IGNORED audit records."""
    logger.info(f"[Maturity] Recomputing stats for already-matured bond {bond.id}")

    stats = (
        db.query(func.avg(AuditLog.calculated_pr).label("avg_pr"))
        .filter(AuditLog.bond_id == bond.id, AuditLog.calculated_pr.isnot(None))
        .first()
    )
    final_avg_pr = round(float(stats.avg_pr), 4) if stats and stats.avg_pr else None
    total_penalty_days = (
        db.query(func.count(AuditLog.id))
        .filter(AuditLog.bond_id == bond.id, AuditLog.verdict == "PENALTY")
        .scalar() or 0
    )

    bond.final_avg_pr = final_avg_pr
    bond.total_penalty_days = total_penalty_days
    db.flush()

    redis_client.delete(
        f"bond:detail:v2:{bond.id}", "bonds:list:v2", "dashboard:summary"
    )
    logger.info(
        f"[Maturity] {bond.id} recomputed — "
        f"avg PR: {final_avg_pr}, penalty days: {total_penalty_days}"
    )
    return {"final_avg_pr": final_avg_pr, "total_penalty_days": total_penalty_days}


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

    # ── 3. Invalidate all caches for this bond ────────────────────────────────
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