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