from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    bond_id = Column(String(20), ForeignKey("bonds.id"), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    type = Column(String(20), nullable=False)     # BLOCKCHAIN / EMAIL / SMS / SYSTEM
    message = Column(Text, nullable=False)
    severity = Column(String(20), nullable=False)  # critical / warning / success / info
    status = Column(String(20), default="PENDING") # DELIVERED / CONFIRMED / LOGGED / FAILED

    # Blockchain-specific fields (nullable for non-TX alerts)
    tx_hash = Column(String(100), nullable=True)
    gas_used = Column(Integer, nullable=True)
    block_number = Column(Integer, nullable=True)

    # Delivery metadata
    recipient = Column(String(200), nullable=True)  # email or phone
    error_message = Column(Text, nullable=True)     # If status=FAILED

    # Relationships
    bond = relationship("Bond", back_populates="alerts")

    def __repr__(self):
        return f"<Alert [{self.type}] {self.bond_id} {self.severity} [{self.status}]>"
