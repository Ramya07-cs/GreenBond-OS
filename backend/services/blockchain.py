import json
import logging
from typing import Optional
from pathlib import Path
from config import settings

logger = logging.getLogger(__name__)

ABI_PATH = Path(__file__).parent.parent / "contracts" / "abi.json"
with open(ABI_PATH) as f:
    CONTRACT_ABI = json.load(f)

# Sentinel string present in Web3/node error messages for empty wallet
_INSUFFICIENT_FUNDS_MARKERS = (
    "insufficient funds",
    "intrinsic gas too low",
    "exceeds allowance",
)


def _is_insufficient_funds(exc: Exception) -> bool:
    """Return True if the exception is caused by an empty/low wallet balance."""
    msg = str(exc).lower()
    return any(marker in msg for marker in _INSUFFICIENT_FUNDS_MARKERS)


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

    # ── Status helpers ────────────────────────────────────────────────────────

    def _w3_readonly(self):
        """Short-timeout Web3 instance for read-only status checks."""
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
        """
        Return the wallet's current MATIC balance.
        Used by the health check and blockchain status endpoint.
        Returns None if unavailable (RPC down or wallet not configured).
        """
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
        """
        Register a new bond on the smart contract.
        Must be called when a bond is created — recordRateChange will revert
        with 'bond not registered' if this isn't called first.
        base_rate is in percent (e.g. 5.0) — converted to basis points internally.
        Returns tx receipt dict, or None if blockchain is unavailable (non-fatal).
        """
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
                "gas": 300000,
                "gasPrice": self._w3.eth.gas_price,
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
        """
        Write a rate change event to the Polygon smart contract.
        Returns transaction receipt dict, or None on failure.

        On insufficient funds: logs CRITICAL, fires an email+SMS alert so the
        operator knows to top up. The audit record is still written to PostgreSQL
        without a TX hash — the rate change is not lost, just unanchored on-chain.
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
                "gas": 300000,
                "gasPrice": self._w3.eth.gas_price,
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

            # After a successful TX, check if balance has dipped low — warn early
            # so the operator tops up before the next TX fails completely.
            try:
                bal = self.get_wallet_balance_matic()
                if bal is not None and bal < settings.LOW_BALANCE_THRESHOLD_MATIC:
                    logger.warning(
                        f"[Blockchain] LOW BALANCE WARNING: wallet has {bal} MATIC remaining "
                        f"(threshold: {settings.LOW_BALANCE_THRESHOLD_MATIC} MATIC). "
                        f"Top up soon — next TX may fail."
                    )
                    _send_low_balance_alert(bal)
            except Exception:
                pass  # Never let a balance check block a successful TX result

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
                # Fire an alert so the operator is notified immediately
                _send_low_balance_alert(bal, bond_id=bond_id, trigger_type=trigger_type)
                # Do NOT reset _w3 — this is a funds problem, not a connection problem
                return None
            else:
                logger.error(f"[Blockchain] Write failed for {bond_id}: {e}")
                self._w3 = None  # Allow reconnect retry on next call
                return None

    # ── Read functions ────────────────────────────────────────────────────────

    def get_transaction(self, tx_hash: str) -> Optional[dict]:
        """
        Read-only TX lookup — uses its own RPC connection so it works even
        when the wallet/contract credentials are not configured.
        """
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


# ── Alert helper (module-level to avoid circular import) ─────────────────────

def _send_low_balance_alert(
    balance_matic: Optional[float],
    bond_id: Optional[str] = None,
    trigger_type: Optional[str] = None,
):
    """
    Fire an email + SMS alert when the wallet is out of / nearly out of funds.
    Deliberately does not raise — a broken alert must never crash the audit.
    """
    try:
        from services.alerts import alert_service
        from database import SessionLocal
        from models import Bond

        db = SessionLocal()
        try:
            # Use first active bond's contact details for the alert recipient
            bond = db.query(Bond).filter(Bond.status != "MATURED").first()
            issuer_email = bond.issuer_email if bond else None
            issuer_phone = bond.issuer_phone if bond else None
            bond_name = bond.name if bond else "Unknown"
        finally:
            db.close()

        bal_str = f"{balance_matic} MATIC" if balance_matic is not None else "unknown balance"
        if bond_id and trigger_type:
            subject = f"🚨 Blockchain TX FAILED — {bond_id} rate change not anchored on-chain"
            body = (
                f"A {trigger_type} rate change for bond {bond_id} could NOT be written "
                f"to the Polygon smart contract because the operator wallet has "
                f"insufficient funds ({bal_str}).\n\n"
                f"The rate change IS recorded in PostgreSQL but has no blockchain proof until "
                f"the wallet is topped up and POST /api/blockchain/retry-pending is called.\n\n"
                f"Top up the wallet immediately to restore audit trail integrity."
            )
        else:
            subject = f"⚠️ Blockchain wallet low balance — {bal_str} remaining"
            body = (
                f"The GreenBond OS operator wallet balance has dropped to {bal_str}, "
                f"below the {settings.LOW_BALANCE_THRESHOLD_MATIC} MATIC threshold.\n\n"
                f"Please top up the wallet soon. If balance reaches zero, future penalty "
                f"and recovery rate changes will not be anchored on the Polygon blockchain."
            )

        alert_service.send_custom_alert(
            subject=subject,
            body=body,
            issuer_email=issuer_email,
            issuer_phone=issuer_phone,
        )
        logger.info(f"[Blockchain] Low-balance alert dispatched. Balance: {bal_str}")
    except Exception as e:
        logger.error(f"[Blockchain] Failed to send low-balance alert: {e}")


blockchain_service = BlockchainService()