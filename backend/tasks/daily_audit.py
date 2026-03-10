import logging
from datetime import date
from celery import shared_task
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Bond, AuditLog, ProductionEntry, BondStatus
from services.nasa import nasa_service
from services.pr_engine import pr_engine
from services.penalty_engine import penalty_engine
from services.blockchain import blockchain_service
from services.alerts import alert_service
from services.audit import audit_service
from tasks.celery_app import celery_app
from redis_client import redis_client

logger = logging.getLogger(__name__)


@celery_app.task(
    name="tasks.daily_audit.run_daily_audit",
    bind=True,
    max_retries=3,
    default_retry_delay=300,  # 5 minutes between retries
)
def run_daily_audit(self, target_date: str = None, bond_id: str = None):
    audit_date = date.fromisoformat(target_date) if target_date else date.today()
    logger.info(
        f"=== Daily Audit Started for {audit_date} ==="
        + (f" [bond={bond_id}]" if bond_id else "")
    )

    db: Session = SessionLocal()
    results = {
        "date": str(audit_date),
        "bonds_processed": 0,
        "errors": [],
        "rate_changes": [],
        "missing_data": [],
    }

    try:
        query = db.query(Bond).filter(
            Bond.status.in_([BondStatus.ACTIVE, BondStatus.PENALTY])
        )
        if bond_id:
            query = query.filter(Bond.id == bond_id)
        active_bonds = query.all()

        if bond_id and not active_bonds:
            raise ValueError(
                f"Bond '{bond_id}' not found or not in ACTIVE/PENALTY status"
            )

        logger.info(f"Processing {len(active_bonds)} active bonds")

        for bond in active_bonds:
            try:
                _audit_single_bond(db, bond, audit_date, results)
                results["bonds_processed"] += 1
            except Exception as e:
                logger.error(f"Error auditing bond {bond.id}: {e}", exc_info=True)
                results["errors"].append({"bond_id": bond.id, "error": str(e)})

        db.commit()
        logger.info(
            f"=== Daily Audit Complete === "
            f"{results['bonds_processed']} bonds | "
            f"{len(results['rate_changes'])} rate changes | "
            f"{len(results['missing_data'])} missing data | "
            f"{len(results['errors'])} errors"
        )

    except Exception as e:
        db.rollback()
        logger.error(f"Fatal audit error: {e}", exc_info=True)
        raise self.retry(exc=e)
    finally:
        db.close()

    return results


def _audit_single_bond(db: Session, bond: Bond, audit_date: date, results: dict):
    """Run the complete audit pipeline for a single bond."""
    import asyncio

    # Skip if a completed (COMPLIANT or PENALTY) audit already exists for this+date. 
    # This makes the task idempotent — safe to re-run during catchup
    # or if Beat fires twice without triggering a duplicate write.
    already_done = (
        db.query(AuditLog)
        .filter(
            AuditLog.bond_id == bond.id,
            AuditLog.date == audit_date,
            AuditLog.verdict.in_(["COMPLIANT", "PENALTY"]),
        )
        .first()
    )
    if already_done:
        logger.info(
            f"  {bond.id} on {audit_date}: already has {already_done.verdict} record — skipping."
        )
        return

    logger.info(f"Auditing {bond.id} ({bond.name})")

    # ── Step 1: Fetch NASA GHI (Redis-cached) ────────────────────────────────
    nasa_ghi = asyncio.run(
        nasa_service.get_ghi(
            float(bond.lat),
            float(bond.lng),
            audit_date,
            bond_id=bond.id,   # Namespaces the Redis cache key per bond
        )
    )
    logger.info(f"  NASA GHI: {nasa_ghi} kWh/m²")

    # ── Step 2: Get production data ───────────────────────────────────────────
    production = (
        db.query(ProductionEntry)
        .filter(
            ProductionEntry.bond_id == bond.id,
            ProductionEntry.date == audit_date,
        )
        .first()
    )
    actual_kwh = float(production.kwh) if production else None
    logger.info(f"  Actual kWh: {actual_kwh}")

    # ── Step 2b: NASA lag + user data submitted = PENDING, retry later ────────
    # If user submitted production data but NASA hasn't caught up yet,don't mark as IGNORED — mark as PENDING so catchup retries it tomorrow.
    if actual_kwh is not None and nasa_ghi is None:
        logger.warning(
            f"  {bond.id} on {audit_date}: user data exists ({actual_kwh} kWh) "
            f"but NASA GHI not yet available (data lag). Skipping — will retry tomorrow."
        )
        # Do NOT write an audit log — absence means catchup will retry this date
        return

    # ── Step 3: Missing data alert ────────────────────────────────────────────
    if actual_kwh is None:
        consecutive_missing = _count_consecutive_missing(db, bond.id, audit_date)
        logger.warning(
            f"  No production data for {bond.id} on {audit_date}. "
            f"Consecutive missing: {consecutive_missing}"
        )
        results["missing_data"].append({
            "bond_id": bond.id,
            "date": str(audit_date),
            "consecutive_missing": consecutive_missing,
        })

        # Only alert on day 1 and every 3rd day — prevents email spam during catchup
        should_alert = (consecutive_missing == 1) or (consecutive_missing % 3 == 0)
        if should_alert:
            alert_service.send_missing_data_alert(
                bond_id=bond.id,
                bond_name=bond.name,
                missing_date=str(audit_date),
                consecutive_missing=consecutive_missing,
                issuer_email=bond.issuer_email,
                issuer_phone=bond.issuer_phone,
            )
        else:
            logger.info(f"  Skipping alert for {bond.id} — consecutive_missing={consecutive_missing}, not an alert day")

        # Log the missing data alert in DB
        audit_service.write_alert(
            db=db,
            bond_id=bond.id,
            alert_type="SYSTEM",
            message=f"Missing production data for {bond.id} on {audit_date}. Day will be IGNORED.",
            severity="warning",
            status="LOGGED",
        )

    # ── Step 4: Calculate PR ──────────────────────────────────────────────────
    pr_result = pr_engine.calculate(actual_kwh, nasa_ghi, float(bond.capacity_kw))
    logger.info(f"  PR: {pr_result.pr} [{pr_result.verdict}]")

    # ── Step 5: Evaluate penalty/recovery ────────────────────────────────────
    consecutive_penalty, consecutive_compliant = audit_service.get_last_streaks(db, bond.id)
    decision = penalty_engine.evaluate(
        pr_verdict=pr_result.verdict,
        consecutive_penalty=consecutive_penalty,
        consecutive_compliant=consecutive_compliant,
        current_rate=float(bond.current_rate),
        base_rate=float(bond.base_rate),
    )
    logger.info(f"  Decision: {decision.verdict} | Rate change: {decision.rate_changed}")

    # ── Step 6: Write to blockchain (if rate changed) ─────────────────────────
    tx_result = None
    if decision.rate_changed:
        tx_result = blockchain_service.write_rate_change(
            bond_id=bond.id,
            previous_rate=decision.previous_rate,
            new_rate=decision.new_rate,
            trigger_type=decision.trigger_type,
            pr_data={
                "date": str(audit_date),
                "pr": pr_result.pr,
                "nasa_ghi": nasa_ghi,
                "actual_kwh": actual_kwh,
                "consecutive_days": decision.consecutive_penalty or decision.consecutive_compliant,
            },
        )
        if tx_result:
            logger.info(f"  TX: {tx_result['tx_hash']}")

        # Update bond rate in DB
        new_status = (
            BondStatus.PENALTY
            if decision.trigger_type == "PENALTY_TRIGGER"
            else BondStatus.ACTIVE
        )
        audit_service.update_bond_rate(db, bond, decision.new_rate, new_status)
        results["rate_changes"].append({
            "bond_id": bond.id,
            "trigger": decision.trigger_type,
            "from": decision.previous_rate,
            "to": decision.new_rate,
            "tx_hash": tx_result["tx_hash"] if tx_result else None,
        })

    # ── Step 7: Send alerts (if rate changed) ────────────────────────────────
    if decision.rate_changed:
        if decision.trigger_type == "PENALTY_TRIGGER":
            alert_service.send_penalty_alert(
                bond_id=bond.id,
                bond_name=bond.name,
                previous_rate=decision.previous_rate,
                new_rate=decision.new_rate,
                consecutive_days=decision.consecutive_penalty,
                tx_hash=tx_result["tx_hash"] if tx_result else None,
                issuer_email=bond.issuer_email,
                issuer_phone=bond.issuer_phone,
            )
        elif decision.trigger_type == "RECOVERY_TRIGGER":
            alert_service.send_recovery_alert(
                bond_id=bond.id,
                bond_name=bond.name,
                previous_rate=decision.previous_rate,
                base_rate=decision.new_rate,
                consecutive_days=decision.consecutive_compliant,
                tx_hash=tx_result["tx_hash"] if tx_result else None,
                issuer_email=bond.issuer_email,
                issuer_phone=bond.issuer_phone,
            )

        audit_service.write_alert(
            db=db,
            bond_id=bond.id,
            alert_type="BLOCKCHAIN",
            message=decision.message,
            severity="critical" if decision.trigger_type == "PENALTY_TRIGGER" else "success",
            status="CONFIRMED" if tx_result else "FAILED",
            tx_hash=tx_result["tx_hash"] if tx_result else None,
            gas_used=tx_result["gas_used"] if tx_result else None,
            block_number=tx_result["block_number"] if tx_result else None,
        )

    # ── Step 8: Write audit log to DB ─────────────────────────────────────────
    audit_service.write_audit_log(
        db=db,
        bond_id=bond.id,
        audit_date=audit_date,
        pr_result=pr_result,
        penalty_decision=decision,
        tx_result=tx_result,
    )

    # ── Step 9: Invalidate Redis caches for this bond ─────────────────────────
    # Inlined here to avoid circular import (bonds router imports celery tasks)
    keys_to_delete = [
        f"bond:detail:{bond.id}",
        f"bond:pr_today:{bond.id}",
        "bonds:list",
        "dashboard:summary",
        "health:full_check",
    ]
    pattern_keys = redis_client.keys(f"bond:timeseries:{bond.id}:*")
    keys_to_delete.extend(pattern_keys)
    if keys_to_delete:
        redis_client.delete(*keys_to_delete)

    # Also clear alert caches since new alerts may have been written
    redis_client.delete("alerts:unread:count", "alerts:summary")
    logger.info(f"  Cache invalidated for {bond.id}")


def _count_consecutive_missing(db: Session, bond_id: str, up_to_date: date) -> int:
    from datetime import timedelta
    count = 0
    check_date = up_to_date

    while True:
        entry = (
            db.query(ProductionEntry)
            .filter(
                ProductionEntry.bond_id == bond_id,
                ProductionEntry.date == check_date,
            )
            .first()
        )
        if entry:
            break
        count += 1
        check_date -= timedelta(days=1)

        # Cap at 30 to avoid infinite loop on new bonds
        if count >= 30:
            break

    return count