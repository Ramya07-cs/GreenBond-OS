import json
import logging
import hashlib
from typing import Optional
from pathlib import Path
from web3 import Web3
from web3.exceptions import ContractLogicError
from config import settings

logger = logging.getLogger(__name__)

# Load ABI from contracts directory
ABI_PATH = Path(__file__).parent.parent / "contracts" / "abi.json"
with open(ABI_PATH) as f:
    CONTRACT_ABI = json.load(f)


class BlockchainService:
    """
    Writes rate change events to the GreenBond smart contract on Polygon.
    Every penalty and recovery event is permanently recorded on-chain.
    """

    def __init__(self):
        self.w3 = Web3(Web3.HTTPProvider(settings.POLYGON_RPC_URL))
        self.account = self.w3.eth.account.from_key(settings.WALLET_PRIVATE_KEY)
        self.contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(settings.CONTRACT_ADDRESS),
            abi=CONTRACT_ABI,
        )

    def is_connected(self) -> bool:
        try:
            return self.w3.is_connected()
        except Exception:
            return False

    def get_latest_block(self) -> Optional[int]:
        try:
            return self.w3.eth.block_number
        except Exception:
            return None

    def get_gas_price_gwei(self) -> Optional[float]:
        try:
            return round(self.w3.from_wei(self.w3.eth.gas_price, "gwei"), 2)
        except Exception:
            return None

    def write_rate_change(
        self,
        bond_id: str,
        previous_rate: float,
        new_rate: float,
        trigger_type: str,
        pr_data: dict,
    ) -> Optional[dict]:
        """
        Write a rate change event to the Polygon smart contract.
        Returns transaction receipt dict or None on failure.

        pr_data: {date, pr, nasa_ghi, actual_kwh, consecutive_days}
        """
        if not self.is_connected():
            logger.error("Blockchain: Not connected to Polygon node")
            return None

        try:
            # Hash the input data for on-chain integrity verification
            data_hash = Web3.keccak(text=json.dumps(pr_data, default=str))

            # Convert rates to basis points (500 = 5.00%)
            prev_bp = int(previous_rate * 100)
            new_bp = int(new_rate * 100)

            # Build transaction
            nonce = self.w3.eth.get_transaction_count(self.account.address)
            tx = self.contract.functions.recordRateChange(
                bond_id,
                prev_bp,
                new_bp,
                trigger_type,
                data_hash,
            ).build_transaction({
                "from": self.account.address,
                "nonce": nonce,
                "gas": 150000,
                "gasPrice": self.w3.eth.gas_price,
                "chainId": 137,  # Polygon Mainnet
            })

            # Sign and submit
            signed = self.w3.eth.account.sign_transaction(tx, settings.WALLET_PRIVATE_KEY)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)

            logger.info(f"TX submitted: {tx_hash.hex()} for bond {bond_id}")

            # Wait for confirmation (up to 120s)
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

            result = {
                "tx_hash": receipt["transactionHash"].hex(),
                "block_number": receipt["blockNumber"],
                "gas_used": receipt["gasUsed"],
                "status": "CONFIRMED" if receipt["status"] == 1 else "FAILED",
            }

            logger.info(
                f"TX confirmed: {result['tx_hash']} "
                f"Block #{result['block_number']} Gas: {result['gas_used']}"
            )
            return result

        except ContractLogicError as e:
            logger.error(f"Contract revert for bond {bond_id}: {e}")
            return None
        except Exception as e:
            logger.error(f"Blockchain write failed for bond {bond_id}: {e}")
            return None

    def get_transaction(self, tx_hash: str) -> Optional[dict]:
        """Fetch transaction details from chain."""
        try:
            tx = self.w3.eth.get_transaction(tx_hash)
            receipt = self.w3.eth.get_transaction_receipt(tx_hash)
            block = self.w3.eth.get_block(receipt["blockNumber"])
            return {
                "hash": tx_hash,
                "block_number": receipt["blockNumber"],
                "gas_used": receipt["gasUsed"],
                "status": "CONFIRMED" if receipt["status"] == 1 else "FAILED",
                "timestamp": block["timestamp"],
                "from": tx["from"],
                "to": tx["to"],
            }
        except Exception as e:
            logger.error(f"Failed to fetch TX {tx_hash}: {e}")
            return None


blockchain_service = BlockchainService()
