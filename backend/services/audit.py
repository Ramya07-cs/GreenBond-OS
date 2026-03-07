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
    ) -> AuditLog:
        """Persist a single day's audit record to the database."""

        # Guard: if a completed record already exists for this bond+date, never
        # overwrite it. This makes write_audit_log fully idempotent.
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
            logger.info(
                f"Skipping write for {bond_id} {audit_date} — "
                f"completed {completed.verdict} record already exists."
            )
            return completed

        # Upsert: if an IGNORED record already exists for this bond+date,
        # overwrite it now that we have real data (NASA lag resolved).
        existing = (
            db.query(AuditLog)
            .filter(
                AuditLog.bond_id == bond_id,
                AuditLog.date == audit_date,
                AuditLog.verdict == "IGNORED",
            )
            .first()
        )

        if existing:
            logger.info(
                f"Overwriting IGNORED audit for {bond_id} {audit_date} "
                f"with new verdict {penalty_decision.verdict}"
            )
            log = existing
        else:
            log = AuditLog(bond_id=bond_id, date=audit_date)
            db.add(log)

        log.nasa_ghi = pr_result.nasa_ghi if pr_result.nasa_ghi else None
        log.actual_kwh = pr_result.actual_kwh if pr_result.actual_kwh else None
        log.expected_kwh = pr_result.expected_kwh
        log.calculated_pr = pr_result.pr if pr_result.verdict != "IGNORED" else None
        log.threshold = 0.75
        log.verdict = penalty_decision.verdict
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
        """
        Retrieve the most recent consecutive penalty and compliant day counts.
        Returns (consecutive_penalty, consecutive_compliant).
        """
        last = (
            db.query(AuditLog)
            .filter(AuditLog.bond_id == bond_id)
            .order_by(AuditLog.date.desc())
            .first()
        )
        if last:
            return last.consecutive_penalty or 0, last.consecutive_compliant or 0
        return 0, 0


audit_service = AuditService()