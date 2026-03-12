import json
import logging
from typing import Optional
from pathlib import Path
from config import settings

logger = logging.getLogger(__name__)

ABI_PATH = Path(__file__).parent.parent / "contracts" / "abi.json"
with open(ABI_PATH) as f:
    CONTRACT_ABI = json.load(f)

_INSUFFICIENT_FUNDS_MARKERS = (
    "insufficient funds",
    "intrinsic gas too low",
    "exceeds allowance",
)
def _is_insufficient_funds(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(marker in msg for marker in _INSUFFICIENT_FUNDS_MARKERS)


class BlockchainService:
    def __init__(self):
        self._w3 = None
        self._account = None
        self._contract = None
        self._init_failed = False  # True after bad credentials — stops retrying

    def _ensure_connected(self) -> bool:
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

    # ── Status helpers ────────────────────────────────────────────────────────

    def _w3_readonly(self):
        from web3 import Web3
        return Web3(Web3.HTTPProvider(
            settings.POLYGON_RPC_URL,
            request_kwargs={"timeout": 5}
        ))

    def is_connected(self) -> bool:
        try:
            return self._w3_readonly().is_connected()
        except Exception:
            return False

    def get_latest_block(self) -> Optional[int]:
        try:
            return self._w3_readonly().eth.block_number
        except Exception:
            return None

    def get_gas_price_gwei(self) -> Optional[float]:
        try:
            w3 = self._w3_readonly()
            return round(w3.from_wei(w3.eth.gas_price, "gwei"), 2)
        except Exception:
            return None

    def get_wallet_balance_matic(self) -> Optional[float]:
        try:
            from web3 import Web3
            w3 = self._w3_readonly()
            if not w3.is_connected():
                return None
            # Derive address from private key without needing full _ensure_connected
            account = w3.eth.account.from_key(settings.WALLET_PRIVATE_KEY)
            balance_wei = w3.eth.get_balance(account.address)
            return round(float(w3.from_wei(balance_wei, "ether")), 6)
        except Exception as e:
            logger.error(f"[Blockchain] Balance check failed: {e}")
            return None

    def is_balance_low(self) -> bool:
        """Return True if the wallet balance is below the configured threshold."""
        bal = self.get_wallet_balance_matic()
        if bal is None:
            return False  # Can't tell — don't raise a false alarm
        return bal < settings.LOW_BALANCE_THRESHOLD_MATIC

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
            from web3 import Web3 as _W3
            network_gas_price = self._w3.eth.gas_price
            max_gas_price = _W3.to_wei(30, "gwei")
            gas_price = min(network_gas_price, max_gas_price)
            tx = self._contract.functions.registerBond(
                bond_id, base_bp,
            ).build_transaction({
                "from": self._account.address,
                "nonce": nonce,
                "gas": 250000,
                "gasPrice": gas_price,
                "chainId": 80002,
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
            if _is_insufficient_funds(e):
                bal = self.get_wallet_balance_matic()
                logger.critical(
                    f"[Blockchain] INSUFFICIENT FUNDS — registerBond for {bond_id} failed. "
                    f"Wallet balance: {bal} MATIC. Top up your wallet to restore on-chain writes."
                )
            else:
                logger.error(f"[Blockchain] registerBond failed for {bond_id}: {e}")
            self._w3 = None
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
            from web3 import Web3 as _W3
            network_gas_price = self._w3.eth.gas_price
            max_gas_price = _W3.to_wei(30, "gwei")
            gas_price = min(network_gas_price, max_gas_price)
            tx = self._contract.functions.recordRateChange(
                bond_id, new_bp, trigger_type, data_hash,
            ).build_transaction({
                "from": self._account.address,
                "nonce": nonce,
                "gas": 250000,
                "gasPrice": gas_price,
                "chainId": 80002,  # Polygon Amoy Testnet
            })

            signed = self._w3.eth.account.sign_transaction(tx, settings.WALLET_PRIVATE_KEY)
            tx_hash = self._w3.eth.send_raw_transaction(signed.raw_transaction)
            logger.info(f"[Blockchain] TX submitted: {tx_hash.hex()} for {bond_id}")

            receipt = self._w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            raw_hash = receipt["transactionHash"].hex()
            result = {
                "tx_hash": raw_hash if raw_hash.startswith("0x") else "0x" + raw_hash,
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
            if _is_insufficient_funds(e):
                bal = self.get_wallet_balance_matic()
                logger.critical(
                    f"[Blockchain] INSUFFICIENT FUNDS — TX for {bond_id} ({trigger_type}) FAILED. "
                    f"Wallet balance: {bal} MATIC. "
                    f"Rate change IS recorded in PostgreSQL (no TX hash). "
                    f"Top up wallet and use POST /api/blockchain/retry-pending to re-anchor."
                )
                # Do NOT reset _w3 — this is a funds problem, not a connection problem
                return None
            else:
                logger.error(f"[Blockchain] Write failed for {bond_id}: {e}")
                self._w3 = None  # Allow reconnect retry on next call
                return None

    # ── Read functions ────────────────────────────────────────────────────────

    def get_transaction(self, tx_hash: str) -> Optional[dict]:
        try:
            from web3 import Web3

            w3 = Web3(Web3.HTTPProvider(settings.POLYGON_RPC_URL))
            if not w3.is_connected():
                logger.error("[Blockchain] RPC not reachable for TX lookup")
                return None

            if isinstance(tx_hash, str):
                tx_hash_bytes = Web3.to_bytes(hexstr=tx_hash)
            else:
                tx_hash_bytes = tx_hash

            tx = w3.eth.get_transaction(tx_hash_bytes)
            receipt = w3.eth.get_transaction_receipt(tx_hash_bytes)
            block = w3.eth.get_block(receipt["blockNumber"])
            return {
                "hash": tx_hash if isinstance(tx_hash, str) else tx_hash.hex(),
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