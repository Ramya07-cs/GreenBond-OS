import logging
from database import SessionLocal
from models import AuditLog, Bond
from services.blockchain import blockchain_service
from redis_client import redis_client
from tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def retry_failed_blockchain_txs() -> dict:
    """
    Finds all audit records with a completed verdict (PENALTY/COMPLIANT/RECOVERY)
    and a rate change but no blockchain TX hash — and retries them.
    Runs automatically at 07:00 IST daily via Celery Beat.
    Also callable manually via POST /api/blockchain/retry-pending.
    """
    db = SessionLocal()
    retried = []
    failed = []

    try:
        records = (
            db.query(AuditLog)
            .filter(
                AuditLog.verdict.in_(["COMPLIANT", "PENALTY", "RECOVERY"]),
                AuditLog.blockchain_tx_hash.is_(None),
                AuditLog.rate_before.isnot(None),
                AuditLog.rate_after.isnot(None),
                AuditLog.rate_before != AuditLog.rate_after,  # only actual rate changes
            )
            .order_by(AuditLog.date.asc())
            .limit(50)
            .all()
        )

        if not records:
            logger.info("[BlockchainRetry] No pending TX records found. All anchored ✓")
            return {"retried": [], "failed": []}

        logger.warning(f"[BlockchainRetry] Found {len(records)} unanchored record(s). Retrying...")

        for log in records:
            bond = db.query(Bond).filter(Bond.id == log.bond_id).first()
            if not bond:
                failed.append({"bond_id": log.bond_id, "date": str(log.date), "reason": "bond not found"})
                continue

            trigger_type = (
                "PENALTY_TRIGGER" if log.verdict == "PENALTY"
                else "RECOVERY_TRIGGER" if log.verdict == "RECOVERY"
                else "COMPLIANT"
            )

            tx_result = blockchain_service.write_rate_change(
                bond_id=log.bond_id,
                previous_rate=float(log.rate_before),
                new_rate=float(log.rate_after),
                trigger_type=trigger_type,
                pr_data={
                    "date": str(log.date),
                    "pr": float(log.calculated_pr) if log.calculated_pr else None,
                    "nasa_ghi": float(log.nasa_ghi) if log.nasa_ghi else None,
                    "actual_kwh": float(log.actual_kwh) if log.actual_kwh else None,
                    "retry": True,
                },
            )

            if tx_result:
                log.blockchain_tx_hash = tx_result["tx_hash"]
                log.block_number = tx_result.get("block_number")
                log.gas_used = tx_result.get("gas_used")
                db.flush()
                # Bust cache
                ts_keys = redis_client.keys(f"bond:timeseries:{log.bond_id}:*")
                bust = [f"bond:detail:{log.bond_id}", "bonds:list", "dashboard:summary"] + list(ts_keys)
                redis_client.delete(*bust)
                retried.append({"bond_id": log.bond_id, "date": str(log.date), "tx_hash": tx_result["tx_hash"]})
                logger.info(f"[BlockchainRetry] ✓ {log.bond_id} {log.date} → {tx_result['tx_hash']}")
            else:
                failed.append({"bond_id": log.bond_id, "date": str(log.date), "reason": "RPC/gas failure"})
                logger.warning(f"[BlockchainRetry] ✗ {log.bond_id} {log.date} — TX failed again")

        db.commit()

    except Exception as e:
        logger.error(f"[BlockchainRetry] Fatal error: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()

    logger.info(f"[BlockchainRetry] Done — {len(retried)} anchored, {len(failed)} still pending")
    return {"retried": retried, "failed": failed}


@celery_app.task(name="tasks.blockchain_retry.retry_failed_blockchain_txs_task")
def retry_failed_blockchain_txs_task():
    logger.info("[BlockchainRetry] Scheduled blockchain TX retry started.")
    summary = retry_failed_blockchain_txs()
    return summary