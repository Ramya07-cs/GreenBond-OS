from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base


class ProductionEntry(Base):
    __tablename__ = "production_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    bond_id = Column(String(20), ForeignKey("bonds.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)

    kwh = Column(Numeric(12, 2), nullable=False)
    source = Column(String(20), default="MANUAL")  # MANUAL / IOT
    device_id = Column(String(50), nullable=True)  # IoT inverter ID
    notes = Column(Text, nullable=True)
    uploaded_by = Column(String(100), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Unique constraint: one entry per bond per day
    __table_args__ = (UniqueConstraint("bond_id", "date", name="uq_bond_date"),)

    # Relationships
    bond = relationship("Bond", back_populates="production_entries")

    def __repr__(self):
        return f"<ProductionEntry {self.bond_id} {self.date} {self.kwh} kWh [{self.source}]>"
