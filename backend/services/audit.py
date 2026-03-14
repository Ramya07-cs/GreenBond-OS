import logging
from datetime import date
from typing import Optional
from sqlalchemy.orm import Session
from models import AuditLog, Alert, Bond
from services.pr_engine import PRResult
from services.penalty_engine import PenaltyDecision

logger = logging.getLogger(__name__)


class AuditService:
    """
    Writes the results of each daily audit to PostgreSQL.
    Creates audit_log and alert records with blockchain proof.
    """

    def write_audit_log(
        self,
        db: Session,
        bond_id: str,
        audit_date: date,
        pr_result: PRResult,
        penalty_decision: PenaltyDecision,
        tx_result: Optional[dict] = None,
        auto_penalty_no_data: bool = False,
    ) -> AuditLog:
        """Persist a single day's audit record to the database."""

        # Guard: if a completed record already exists for this bond+date, only
        # skip if it already has a blockchain TX hash (fully anchored).
        # If tx_hash is None, the prior blockchain write failed (e.g. out-of-gas)
        # and we should update the record with the new TX result.
        completed = (
            db.query(AuditLog)
            .filter(
                AuditLog.bond_id == bond_id,
                AuditLog.date == audit_date,
                AuditLog.verdict.in_(["COMPLIANT", "PENALTY", "RECOVERY"]),
            )
            .first()
        )
        if completed:
            if completed.blockchain_tx_hash is not None:
                logger.info(
                    f"Skipping write for {bond_id} {audit_date} — "
                    f"completed {completed.verdict} record with TX already exists."
                )
                return completed
            else:
                # Has verdict but no TX hash — update tx fields only if we now have a result
                if tx_result:
                    completed.blockchain_tx_hash = tx_result["tx_hash"]
                    completed.block_number = tx_result.get("block_number")
                    completed.gas_used = tx_result.get("gas_used")
                    db.flush()
                    logger.info(
                        f"Updated tx_hash for {bond_id} {audit_date}: {tx_result['tx_hash']}"
                    )
                else:
                    logger.info(
                        f"Completed record for {bond_id} {audit_date} still has no TX — "
                        f"blockchain write unavailable again."
                    )
                return completed

        existing_all = (
            db.query(AuditLog)
            .filter(
                AuditLog.bond_id == bond_id,
                AuditLog.date == audit_date,
            )
            .order_by(AuditLog.id.asc())
            .all()
        )

        if existing_all:
            # Keep the oldest record, delete all duplicates
            log = existing_all[0]
            for duplicate in existing_all[1:]:
                logger.warning(
                    f"Deleting duplicate audit record id={duplicate.id} "
                    f"for {bond_id} {audit_date} (verdict={duplicate.verdict})"
                )
                db.delete(duplicate)
            db.flush()
            logger.info(
                f"Updating existing audit for {bond_id} {audit_date} "
                f"(was {log.verdict}) → {penalty_decision.verdict}"
            )
        else:
            log = AuditLog(bond_id=bond_id, date=audit_date)
            db.add(log)

        log.nasa_ghi = pr_result.nasa_ghi if pr_result.nasa_ghi else None
        log.actual_kwh = None if auto_penalty_no_data else (pr_result.actual_kwh if pr_result.actual_kwh else None)
        log.expected_kwh = pr_result.expected_kwh
        # For auto-penalty (deadline exceeded, no data): store NULL PR so the
        # dashboard shows the last real PR instead of a misleading 0%.
        log.calculated_pr = None if auto_penalty_no_data else (pr_result.pr if pr_result.verdict != "IGNORED" else None)
        log.threshold = 0.75
        log.verdict = penalty_decision.verdict
        # For IGNORED days, store NULL so streak display is never misleading.
        # Streaks are always read from the last COMPLIANT/PENALTY/RECOVERY record.
        if penalty_decision.verdict == "IGNORED":
            log.consecutive_penalty = None
            log.consecutive_compliant = None
        else:
            log.consecutive_penalty = penalty_decision.consecutive_penalty
            log.consecutive_compliant = penalty_decision.consecutive_compliant
        log.rate_before = penalty_decision.previous_rate
        log.rate_after = penalty_decision.new_rate
        log.blockchain_tx_hash = tx_result["tx_hash"] if tx_result else None
        log.block_number = tx_result["block_number"] if tx_result else None
        log.gas_used = tx_result["gas_used"] if tx_result else None

        db.flush()  # Get the ID without committing

        logger.info(
            f"Audit logged: {bond_id} {audit_date} "
            f"PR={pr_result.pr} [{penalty_decision.verdict}]"
        )
        return log

    def write_alert(
        self,
        db: Session,
        bond_id: str,
        alert_type: str,
        message: str,
        severity: str,
        status: str,
        tx_hash: Optional[str] = None,
        gas_used: Optional[int] = None,
        block_number: Optional[int] = None,
        recipient: Optional[str] = None,
    ) -> Alert:
        """Persist an alert record to the database."""

        alert = Alert(
            bond_id=bond_id,
            type=alert_type,
            message=message,
            severity=severity,
            status=status,
            tx_hash=tx_hash,
            gas_used=gas_used,
            block_number=block_number,
            recipient=recipient,
        )
        db.add(alert)
        db.flush()
        return alert

    def update_bond_rate(
        self,
        db: Session,
        bond: Bond,
        new_rate: float,
        new_status: str,
    ) -> Bond:
        """Update the bond's current rate and status in the database."""
        bond.current_rate = new_rate
        bond.status = new_status
        db.flush()
        logger.info(f"Bond {bond.id} rate updated to {new_rate}% [{new_status}]")
        return bond

    def get_last_streaks(self, db: Session, bond_id: str) -> tuple[int, int]:
        last = (
            db.query(AuditLog)
            .filter(
                AuditLog.bond_id == bond_id,
                AuditLog.verdict.in_(["COMPLIANT", "PENALTY", "RECOVERY"]),
            )
            .order_by(AuditLog.date.desc())
            .first()
        )
        if last:
            return last.consecutive_penalty or 0, last.consecutive_compliant or 0
        return 0, 0


    def write_audit_log_pending(
        self,
        db: Session,
        bond_id: str,
        audit_date: date,
        actual_kwh: float,
    ) -> AuditLog:
        # Never overwrite a completed record
        completed = (
            db.query(AuditLog)
            .filter(
                AuditLog.bond_id == bond_id,
                AuditLog.date == audit_date,
                AuditLog.verdict.in_(["COMPLIANT", "PENALTY", "RECOVERY"]),
            )
            .first()
        )
        if completed:
            return completed

        existing = (
            db.query(AuditLog)
            .filter(AuditLog.bond_id == bond_id, AuditLog.date == audit_date)
            .first()
        )
        if existing:
            # Already have a PENDING/IGNORED record — just refresh the kwh value
            existing.actual_kwh = actual_kwh
            existing.verdict = "PENDING"
            db.flush()
            logger.info(f"Updated existing audit to PENDING: {bond_id} {audit_date}")
            return existing

        log = AuditLog(
            bond_id=bond_id,
            date=audit_date,
            actual_kwh=actual_kwh,
            verdict="PENDING",
        )
        db.add(log)
        db.flush()
        logger.info(f"Audit logged as PENDING: {bond_id} {audit_date} (awaiting NASA GHI)")
        return log

audit_service = AuditService()