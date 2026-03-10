import enum
from sqlalchemy import Column, String, Numeric, Integer, DateTime, Date, Boolean, BigInteger
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base


class BondStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    PENALTY = "PENALTY"
    MATURED = "MATURED"


class Bond(Base):
    __tablename__ = "bonds"

    id = Column(String(20), primary_key=True)           
    name = Column(String(100), nullable=False)
    capacity_kw = Column(Numeric(10, 2), nullable=False)
    lat = Column(Numeric(9, 6), nullable=False)
    lng = Column(Numeric(9, 6), nullable=False)
    base_rate = Column(Numeric(5, 3), nullable=False)
    current_rate = Column(Numeric(5, 3), nullable=False)
    status = Column(String(20), default=BondStatus.ACTIVE, nullable=False)
    tvl = Column(Integer, default=0)                   
    maturity_date = Column(Date, nullable=False)
    issuer_email = Column(String(200), nullable=True)
    issuer_phone = Column(String(20), nullable=True)

    # ── On-chain registration 
    registered_on_chain = Column(Boolean, default=False, nullable=False)
    registration_tx_hash = Column(String(100), nullable=True)
    registration_block = Column(BigInteger, nullable=True)

    # ── Lifecycle fields (set at maturity) ────────────────────────────────────
    matured_at = Column(DateTime(timezone=True), nullable=True)
    final_avg_pr = Column(Numeric(6, 4), nullable=True)     # Stored at maturity
    total_penalty_days = Column(Integer, default=0)         # Lifetime penalty count
    archived = Column(Boolean, default=False)               # True after final report

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    audit_logs = relationship("AuditLog", back_populates="bond", lazy="dynamic")
    production_entries = relationship("ProductionEntry", back_populates="bond", lazy="dynamic")
    alerts = relationship("Alert", back_populates="bond", lazy="dynamic")

    def __repr__(self):
        return f"<Bond {self.id} — {self.name} [{self.status}]>"