from fastapi import APIRouter, HTTPException
from services.blockchain import blockchain_service

router = APIRouter(prefix="/api/blockchain", tags=["blockchain"])


@router.get("/status")
def get_blockchain_status():
    """Return current Polygon node connection status."""
    from config import settings
    connected = blockchain_service.is_connected()
    block = blockchain_service.get_latest_block()
    gas = blockchain_service.get_gas_price_gwei()
    contract = settings.CONTRACT_ADDRESS
    contract_configured = bool(contract and contract != "0xYOUR_DEPLOYED_CONTRACT")
    return {
        "connected": connected,
        "network": "Polygon Amoy Testnet",
        "chain_id": 80002,
        "latest_block": block,
        "gas_price_gwei": gas,
        "contract_address": contract if contract_configured else None,
        "contract_configured": contract_configured,
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
    """
    Manually register a bond on the smart contract.
    Use this if a bond was created when the blockchain was unavailable
    and rate change TXs are now failing with 'bond not registered'.
    """
    from database import SessionLocal
    from models import Bond

    db = SessionLocal()
    try:
        bond = db.query(Bond).filter(Bond.id == bond_id).first()
        if not bond:
            raise HTTPException(status_code=404, detail=f"Bond {bond_id} not found in DB")

        tx = blockchain_service.register_bond(bond_id, float(bond.base_rate))
        if not tx:
            raise HTTPException(
                status_code=503,
                detail="Blockchain unavailable — registration failed. Check your RPC URL and wallet credentials."
            )
        return {"bond_id": bond_id, "tx_hash": tx["tx_hash"], "block_number": tx["block_number"], "status": tx["status"]}
    finally:
        db.close()