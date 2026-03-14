from fastapi import APIRouter, HTTPException
from services.blockchain import blockchain_service

router = APIRouter(prefix="/api/blockchain", tags=["blockchain"])


@router.get("/status")
def get_blockchain_status():
    """Return current Polygon node connection status. All RPC calls use 5s timeout."""
    import concurrent.futures
    from config import settings

    def _fetch_status():
        connected = blockchain_service.is_connected()
        if not connected:
            return False, None, None, None
        block = blockchain_service.get_latest_block()
        gas = blockchain_service.get_gas_price_gwei()
        balance = blockchain_service.get_wallet_balance_matic()
        return connected, block, gas, balance

    try:
        with concurrent.futures.ThreadPoolExecutor() as ex:
            connected, block, gas, balance = ex.submit(_fetch_status).result(timeout=8)
    except Exception:
        connected, block, gas, balance = False, None, None, None
    contract = settings.CONTRACT_ADDRESS
    contract_configured = bool(contract and contract != "0xYOUR_DEPLOYED_CONTRACT")
    balance_low = (
        balance is not None and balance < settings.LOW_BALANCE_THRESHOLD_MATIC
    )
    return {
        "connected": connected,
        "network": "Polygon Amoy Testnet",
        "chain_id": 80002,
        "latest_block": block,
        "gas_price_gwei": gas,
        "contract_address": contract if contract_configured else None,
        "contract_configured": contract_configured,
        "wallet_balance_matic": balance,
        "balance_low": balance_low,
        "balance_threshold_matic": settings.LOW_BALANCE_THRESHOLD_MATIC,
    }


@router.get("/tx/{tx_hash}")
def get_transaction(tx_hash: str):
    """Fetch transaction details from Polygon."""
    tx = blockchain_service.get_transaction(tx_hash)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return tx


@router.get("/history/{bond_id}")
def get_rate_history(bond_id: str):
    history = blockchain_service.get_rate_history(bond_id)
    if history is None:
        raise HTTPException(
            status_code=503,
            detail="Blockchain unavailable — cannot fetch on-chain history."
        )
    return {"bond_id": bond_id, "history": history, "count": len(history)}


@router.post("/register/{bond_id}")
def register_bond_on_chain(bond_id: str):
    from database import SessionLocal
    from models import Bond
    from redis_client import redis_client

    db = SessionLocal()
    try:
        bond = db.query(Bond).filter(Bond.id == bond_id).first()
        if not bond:
            raise HTTPException(status_code=404, detail=f"Bond {bond_id} not found in DB")

        tx = blockchain_service.register_bond(bond_id, float(bond.base_rate))
        if not tx:
            raise HTTPException(
                status_code=503,
                detail="Blockchain unavailable — registration failed. Check your RPC URL and wallet credentials.",
            )

        # ── Persist registration proof to DB (only if TX confirmed) ──────────
        if tx["status"] != "CONFIRMED":
            raise HTTPException(
                status_code=503,
                detail=f"Registration TX submitted but FAILED on-chain (hash: {tx['tx_hash']}). Check wallet balance and contract.",
            )
        bond.registered_on_chain = True
        bond.registration_tx_hash = tx["tx_hash"] if tx["tx_hash"].startswith("0x") else "0x" + tx["tx_hash"]
        bond.registration_block = tx["block_number"]
        db.commit()

        # Invalidate bond caches so the registered state propagates immediately
        redis_client.delete(f"bond:detail:{bond_id}", "bonds:list", "dashboard:summary")

        return {
            "bond_id": bond_id,
            "tx_hash": tx["tx_hash"],
            "block_number": tx["block_number"],
            "status": tx["status"],
            "registered_on_chain": True,
        }
    finally:
        db.close()


@router.post("/retry-pending")
def retry_pending_blockchain_txs(bond_id: str = None, date: str = None):
    """
    Re-attempt blockchain writes for audit records that have a completed verdict
    (PENALTY/COMPLIANT/RECOVERY) but are missing a tx_hash due to a prior
    out-of-gas or RPC failure.

    Optionally filter by bond_id and/or date. Without filters, retries ALL
    unanchored records (up to 50 at a time).
    """
    from database import SessionLocal
    from models import AuditLog, Bond
    from redis_client import redis_client
    import json
    from web3 import Web3

    db = SessionLocal()
    retried = []
    failed = []

    try:
        query = (
            db.query(AuditLog)
            .filter(
                AuditLog.verdict.in_(["COMPLIANT", "PENALTY", "RECOVERY"]),
                AuditLog.blockchain_tx_hash.is_(None),
                AuditLog.rate_before.isnot(None),
                AuditLog.rate_after.isnot(None),
                AuditLog.rate_before != AuditLog.rate_after,  # only actual rate changes
            )
        )
        if bond_id:
            query = query.filter(AuditLog.bond_id == bond_id)
        if date:
            query = query.filter(AuditLog.date == date)

        records = query.order_by(AuditLog.date.asc()).limit(50).all()

        if not records:
            return {"message": "No pending-tx records found", "retried": [], "failed": []}

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

            pr_data = {
                "date": str(log.date),
                "pr": float(log.calculated_pr) if log.calculated_pr else None,
                "nasa_ghi": float(log.nasa_ghi) if log.nasa_ghi else None,
                "actual_kwh": float(log.actual_kwh) if log.actual_kwh else None,
                "retry": True,
            }

            tx_result = blockchain_service.write_rate_change(
                bond_id=log.bond_id,
                previous_rate=float(log.rate_before),
                new_rate=float(log.rate_after),
                trigger_type=trigger_type,
                pr_data=pr_data,
            )

            if tx_result:
                log.blockchain_tx_hash = tx_result["tx_hash"]
                log.block_number = tx_result.get("block_number")
                log.gas_used = tx_result.get("gas_used")
                db.flush()
                _ts_keys = redis_client.keys(f"bond:timeseries:{log.bond_id}:*")
                _bust = [f"bond:detail:{log.bond_id}", "bonds:list", "dashboard:summary"] + list(_ts_keys)
                redis_client.delete(*_bust)
                retried.append({
                    "bond_id": log.bond_id,
                    "date": str(log.date),
                    "tx_hash": tx_result["tx_hash"],
                    "block_number": tx_result.get("block_number"),
                })
            else:
                failed.append({
                    "bond_id": log.bond_id,
                    "date": str(log.date),
                    "reason": "blockchain write failed (check wallet balance / RPC)",
                })

        db.commit()
        return {
            "message": f"Retry complete: {len(retried)} anchored, {len(failed)} still failed",
            "retried": retried,
            "failed": failed,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Retry failed: {str(e)}")
    finally:
        db.close()
def set_registration_tx(bond_id: str, tx_hash: str, block_number: int = None):
    from database import SessionLocal
    from models import Bond
    from redis_client import redis_client

    db = SessionLocal()
    try:
        bond = db.query(Bond).filter(Bond.id == bond_id).first()
        if not bond:
            raise HTTPException(status_code=404, detail=f"Bond {bond_id} not found")

        bond.registered_on_chain = True
        bond.registration_tx_hash = tx_hash
        if block_number:
            bond.registration_block = block_number
        db.commit()

        redis_client.delete(f"bond:detail:{bond_id}", "bonds:list", "dashboard:summary")
        return {"bond_id": bond_id, "tx_hash": tx_hash, "block_number": block_number, "status": "updated"}
    finally:
        db.close()