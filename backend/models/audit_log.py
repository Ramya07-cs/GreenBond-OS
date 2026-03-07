from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    bond_id = Column(String(20), ForeignKey("bonds.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)

    # Data inputs
    nasa_ghi = Column(Numeric(6, 3), nullable=True)         # kWh/m²
    actual_kwh = Column(Numeric(12, 2), nullable=True)

    # Calculated values
    expected_kwh = Column(Numeric(12, 2), nullable=True)
    calculated_pr = Column(Numeric(6, 4), nullable=True)
    threshold = Column(Numeric(4, 2), default=0.75)

    # Verdict
    verdict = Column(String(20), nullable=True)             # COMPLIANT / PENALTY / IGNORED
    consecutive_penalty = Column(Integer, default=0)
    consecutive_compliant = Column(Integer, default=0)

    # Rate info at time of audit
    rate_before = Column(Numeric(5, 3), nullable=True)
    rate_after = Column(Numeric(5, 3), nullable=True)

    # Blockchain proof
    blockchain_tx_hash = Column(String(100), nullable=True)
    block_number = Column(Integer, nullable=True)
    gas_used = Column(Integer, nullable=True)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    bond = relationship("Bond", back_populates="audit_logs")

    def __repr__(self):
        return f"<AuditLog {self.bond_id} {self.date} PR={self.calculated_pr} [{self.verdict}]>"
