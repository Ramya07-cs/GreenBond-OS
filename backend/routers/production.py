from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date
from pydantic import BaseModel
from database import get_db
from models import ProductionEntry, Bond

router = APIRouter(prefix="/api/production", tags=["production"])


class ManualEntry(BaseModel):
    bond_id: str
    date: date
    kwh: float
    notes: Optional[str] = None
    uploaded_by: Optional[str] = None


class IoTEntry(BaseModel):
    device_id: str
    bond_id: str
    date: date
    kwh: float
    timestamp: Optional[str] = None


@router.post("/manual", status_code=201)
def submit_manual_entry(data: ManualEntry, db: Session = Depends(get_db)):
    bond = db.query(Bond).filter(Bond.id == data.bond_id).first()
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")

    # Check for duplicate
    existing = (
        db.query(ProductionEntry)
        .filter(
            ProductionEntry.bond_id == data.bond_id,
            ProductionEntry.date == data.date,
        )
        .first()
    )
    if existing:
        # Update existing entry
        existing.kwh = data.kwh
        existing.notes = data.notes
        existing.uploaded_by = data.uploaded_by
        existing.source = "MANUAL"
        db.commit()
        return {"message": "Entry updated", "id": existing.id}

    entry = ProductionEntry(
        bond_id=data.bond_id,
        date=data.date,
        kwh=data.kwh,
        source="MANUAL",
        notes=data.notes,
        uploaded_by=data.uploaded_by,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"message": "Entry created", "id": entry.id}


@router.post("/iot", status_code=201)
def submit_iot_entry(data: IoTEntry, db: Session = Depends(get_db)):
    """Endpoint for IoT inverter devices to push daily production data."""
    bond = db.query(Bond).filter(Bond.id == data.bond_id).first()
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")

    existing = (
        db.query(ProductionEntry)
        .filter(
            ProductionEntry.bond_id == data.bond_id,
            ProductionEntry.date == data.date,
        )
        .first()
    )
    if existing:
        existing.kwh = data.kwh
        existing.device_id = data.device_id
        existing.source = "IOT"
        db.commit()
        return {"message": "IoT entry updated", "id": existing.id}

    entry = ProductionEntry(
        bond_id=data.bond_id,
        date=data.date,
        kwh=data.kwh,
        source="IOT",
        device_id=data.device_id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"message": "IoT entry created", "id": entry.id}


@router.get("/missing/{bond_id}")
def get_missing_days(
    bond_id: str,
    year: int,
    month: int,
    db: Session = Depends(get_db),
):
    """Return days in the given month with no production data."""
    import calendar
    from datetime import date as d

    _, days_in_month = calendar.monthrange(year, month)

    # Fetch bond creation date first — days before registration are not applicable
    bond = db.query(Bond).filter(Bond.id == bond_id).first()
    bond_created = bond.created_at.date() if bond and bond.created_at else None

    # Applicable days = days up to today AND on/after bond registration
    def is_applicable(day):
        dt = d(year, month, day)
        if dt > d.today():
            return False
        if bond_created and dt < bond_created:
            return False
        return True

    all_days = {d(year, month, day) for day in range(1, days_in_month + 1) if is_applicable(day)}

    entries = (
        db.query(ProductionEntry.date)
        .filter(
            ProductionEntry.bond_id == bond_id,
            ProductionEntry.date >= d(year, month, 1),
            ProductionEntry.date <= d(year, month, days_in_month),
        )
        .all()
    )
    submitted = {e.date for e in entries}
    missing = sorted(all_days - submitted)

    return {
        "bond_id": bond_id,
        "year": year,
        "month": month,
        "missing_days": [str(d) for d in missing],
        "submitted_dates": [str(d) for d in sorted(submitted)],
        "submitted_days": len(submitted & all_days),  # only count applicable days
        "total_days": len(all_days),
        "bond_created": str(bond_created) if bond_created else None,
    }