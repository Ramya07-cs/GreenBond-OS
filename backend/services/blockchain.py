import json
import logging
from typing import Optional
from pathlib import Path
from config import settings

logger = logging.getLogger(__name__)

ABI_PATH = Path(__file__).parent.parent / "contracts" / "abi.json"
with open(ABI_PATH) as f:
    CONTRACT_ABI = json.load(f)


class BlockchainService:
    def __init__(self):
        self._w3 = None
        self._account = None
        self._contract = None
        self._init_failed = False  # True after bad credentials — stops retrying

    def _ensure_connected(self) -> bool:
        """
        Establish Web3 connection on first use.
        Returns True if connected and ready, False otherwise.
        """
        if self._w3 is not None:
            return True
        if self._init_failed:
            return False  # Bad credentials — don't retry on every audit call

        try:
            from web3 import Web3

            self._w3 = Web3(Web3.HTTPProvider(settings.POLYGON_RPC_URL))
            self._account = self._w3.eth.account.from_key(settings.WALLET_PRIVATE_KEY)
            self._contract = self._w3.eth.contract(
                address=Web3.to_checksum_address(settings.CONTRACT_ADDRESS),
                abi=CONTRACT_ABI,
            )
            logger.info(
                f"[Blockchain] Connected to Polygon. "
                f"Wallet: {self._account.address[:10]}..."
            )
            return True

        except ValueError as e:
            # Invalid private key or contract address — permanent failure
            logger.warning(
                f"[Blockchain] Invalid credentials ({e}). "
                f"Blockchain writes disabled until .env is updated. "
                f"All other services are unaffected."
            )
            self._init_failed = True
            self._w3 = None
            return False

        except Exception as e:
            # Network / RPC error — transient, allow retry next time
            logger.error(f"[Blockchain] Connection failed: {e}. Will retry on next write.")
            self._w3 = None
            return False

    # ── Status helpers (used by health check — don't require _ensure_connected) ─

    def is_connected(self) -> bool:
        try:
            from web3 import Web3
            w3 = Web3(Web3.HTTPProvider(settings.POLYGON_RPC_URL))
            return w3.is_connected()
        except Exception:
            return False

    def get_latest_block(self) -> Optional[int]:
        try:
            from web3 import Web3
            w3 = Web3(Web3.HTTPProvider(settings.POLYGON_RPC_URL))
            return w3.eth.block_number
        except Exception:
            return None

    def get_gas_price_gwei(self) -> Optional[float]:
        try:
            from web3 import Web3
            w3 = Web3(Web3.HTTPProvider(settings.POLYGON_RPC_URL))
            return round(w3.from_wei(w3.eth.gas_price, "gwei"), 2)
        except Exception:
            return None

    # ── Bond registration ─────────────────────────────────────────────────────

    def register_bond(self, bond_id: str, base_rate: float) -> Optional[dict]:
        if not self._ensure_connected():
            logger.warning(
                f"[Blockchain] Skipping registerBond for {bond_id} — not connected. "
                f"Bond will be stored in DB only."
            )
            return None

        try:
            from web3 import Web3

            base_bp = int(base_rate * 100)  # 5.0% → 500 basis points
            nonce = self._w3.eth.get_transaction_count(self._account.address)
            tx = self._contract.functions.registerBond(
                bond_id, base_bp,
            ).build_transaction({
                "from": self._account.address,
                "nonce": nonce,
                "gas": 150000,
                "gasPrice": self._w3.eth.gas_price,
                "chainId": 80002,  # Polygon Amoy Testnet
            })

            signed = self._w3.eth.account.sign_transaction(tx, settings.WALLET_PRIVATE_KEY)
            tx_hash = self._w3.eth.send_raw_transaction(signed.raw_transaction)
            logger.info(f"[Blockchain] registerBond TX submitted: {tx_hash.hex()} for {bond_id}")

            receipt = self._w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            result = {
                "tx_hash": receipt["transactionHash"].hex(),
                "block_number": receipt["blockNumber"],
                "gas_used": receipt["gasUsed"],
                "status": "CONFIRMED" if receipt["status"] == 1 else "FAILED",
            }
            logger.info(
                f"[Blockchain] registerBond confirmed: {result['tx_hash']} "
                f"Block #{result['block_number']} Gas: {result['gas_used']}"
            )
            return result

        except Exception as e:
            logger.error(f"[Blockchain] registerBond failed for {bond_id}: {e}")
            self._w3 = None  # Allow reconnect retry on next call
            return None

    # ── Rate change write ─────────────────────────────────────────────────────

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
        A None return is handled gracefully by daily_audit.py.
        """
        if not self._ensure_connected():
            logger.warning(
                f"[Blockchain] Skipping TX for {bond_id} — not connected. "
                f"Audit record will be written to DB without a TX hash."
            )
            return None

        try:
            from web3 import Web3

            data_hash = Web3.keccak(text=json.dumps(pr_data, default=str))
            new_bp = int(new_rate * 100)  # e.g. 7.5% → 750 basis points

            nonce = self._w3.eth.get_transaction_count(self._account.address)
            tx = self._contract.functions.recordRateChange(
                bond_id, new_bp, trigger_type, data_hash,
            ).build_transaction({
                "from": self._account.address,
                "nonce": nonce,
                "gas": 150000,
                "gasPrice": self._w3.eth.gas_price,
                "chainId": 80002,  # Polygon Amoy Testnet
            })

            signed = self._w3.eth.account.sign_transaction(tx, settings.WALLET_PRIVATE_KEY)
            tx_hash = self._w3.eth.send_raw_transaction(signed.raw_transaction)
            logger.info(f"[Blockchain] TX submitted: {tx_hash.hex()} for {bond_id}")

            receipt = self._w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            result = {
                "tx_hash": receipt["transactionHash"].hex(),
                "block_number": receipt["blockNumber"],
                "gas_used": receipt["gasUsed"],
                "status": "CONFIRMED" if receipt["status"] == 1 else "FAILED",
            }
            logger.info(
                f"[Blockchain] TX confirmed: {result['tx_hash']} "
                f"Block #{result['block_number']} Gas: {result['gas_used']}"
            )
            return result

        except Exception as e:
            logger.error(f"[Blockchain] Write failed for {bond_id}: {e}")
            self._w3 = None  # Allow reconnect retry on next call
            return None

    # ── Read functions ────────────────────────────────────────────────────────

    def get_transaction(self, tx_hash: str) -> Optional[dict]:
        if not self._ensure_connected():
            return None
        try:
            tx = self._w3.eth.get_transaction(tx_hash)
            receipt = self._w3.eth.get_transaction_receipt(tx_hash)
            block = self._w3.eth.get_block(receipt["blockNumber"])
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
            logger.error(f"[Blockchain] Failed to fetch TX {tx_hash}: {e}")
            return None

    def get_rate_history(self, bond_id: str) -> Optional[list]:
        if not self._ensure_connected():
            return None
        try:
            raw = self._contract.functions.getRateHistory(bond_id).call()
            return [
                {
                    "timestamp": entry[0],
                    "bond_id": entry[1],
                    "previous_rate": entry[2] / 100,   # basis points → percent
                    "new_rate": entry[3] / 100,
                    "trigger_type": entry[4],
                    "data_hash": entry[5].hex(),
                    "block_number": entry[6],
                }
                for entry in raw
            ]
        except Exception as e:
            logger.error(f"[Blockchain] getRateHistory failed for {bond_id}: {e}")
            return None


blockchain_service = BlockchainService()