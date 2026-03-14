from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date, timedelta
from pydantic import BaseModel
from database import get_db
from models import ProductionEntry, Bond

router = APIRouter(prefix="/api/production", tags=["production"])

# Grace period: data can be submitted up to 3 days after the audit date without penalty flag
# After 3 days but within 7 days: accepted but flagged as submitted_late
# After 7 days: rejected permanently
GRACE_PERIOD_DAYS = 3
HARD_DEADLINE_DAYS = 7


def check_submission_deadline(entry_date: date) -> tuple[bool, bool]:
    """
    Returns (is_rejected, is_late).
    is_rejected = True if beyond hard deadline (7 days) → HTTP 403
    is_late = True if beyond grace period (3 days) but within hard deadline
    """
    today = date.today()
    days_since = (today - entry_date).days
    if days_since > HARD_DEADLINE_DAYS:
        return True, False
    if days_since > GRACE_PERIOD_DAYS:
        return False, True
    return False, False


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

    # Enforce submission deadline
    is_rejected, is_late = check_submission_deadline(data.date)
    if is_rejected:
        days_since = (date.today() - data.date).days
        raise HTTPException(
            status_code=403,
            detail={
                "error": "SUBMISSION_DEADLINE_EXCEEDED",
                "message": f"Production data for {data.date} cannot be submitted. "
                           f"The {HARD_DEADLINE_DAYS}-day submission window has closed "
                           f"({days_since} days ago). This day has been permanently recorded as PENALTY.",
                "entry_date": str(data.date),
                "days_since": days_since,
                "hard_deadline_days": HARD_DEADLINE_DAYS,
            }
        )

    # Reject submissions for dates after bond maturity
    if bond.maturity_date and data.date > bond.maturity_date:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "BOND_MATURED",
                "message": f"Bond {data.bond_id} matured on {bond.maturity_date}. "
                           f"Production data cannot be submitted for dates after maturity.",
                "maturity_date": str(bond.maturity_date),
                "entry_date": str(data.date),
            }
        )

    today = date.today()
    days_since = (today - data.date).days

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
        existing.kwh = data.kwh
        existing.notes = data.notes
        existing.uploaded_by = data.uploaded_by
        existing.source = "MANUAL"
        existing.submitted_on = today
        existing.submitted_late = is_late
        db.commit()
        return {
            "message": "Entry updated",
            "id": existing.id,
            "submitted_late": is_late,
            "days_since": days_since,
            "warning": f"⚠ Data submitted {days_since} days after audit date. This entry is flagged as late." if is_late else None,
        }

    entry = ProductionEntry(
        bond_id=data.bond_id,
        date=data.date,
        kwh=data.kwh,
        source="MANUAL",
        notes=data.notes,
        uploaded_by=data.uploaded_by,
        submitted_on=today,
        submitted_late=is_late,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {
        "message": "Entry created",
        "id": entry.id,
        "submitted_late": is_late,
        "days_since": days_since,
        "warning": f"⚠ Data submitted {days_since} days after audit date. This entry is flagged as late." if is_late else None,
    }


@router.post("/iot", status_code=201)
def submit_iot_entry(data: IoTEntry, db: Session = Depends(get_db)):
    """Endpoint for IoT inverter devices to push daily production data."""
    bond = db.query(Bond).filter(Bond.id == data.bond_id).first()
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")

    # Enforce submission deadline
    is_rejected, is_late = check_submission_deadline(data.date)
    if is_rejected:
        days_since = (date.today() - data.date).days
        raise HTTPException(
            status_code=403,
            detail={
                "error": "SUBMISSION_DEADLINE_EXCEEDED",
                "message": f"IoT data for {data.date} rejected. Submission window closed ({days_since} days ago).",
                "entry_date": str(data.date),
                "days_since": days_since,
            }
        )

    today = date.today()

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
        existing.submitted_on = today
        existing.submitted_late = is_late
        db.commit()
        return {"message": "IoT entry updated", "id": existing.id, "submitted_late": is_late}

    entry = ProductionEntry(
        bond_id=data.bond_id,
        date=data.date,
        kwh=data.kwh,
        source="IOT",
        device_id=data.device_id,
        submitted_on=today,
        submitted_late=is_late,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"message": "IoT entry created", "id": entry.id, "submitted_late": is_late}


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
    bond_maturity = bond.maturity_date if bond and bond.maturity_date else None

    # Applicable days = on/after bond registration AND up to today AND up to maturity date
    def is_applicable(day):
        dt = d(year, month, day)
        if dt > d.today():
            return False
        if bond_created and dt < bond_created:
            return False
        if bond_maturity and dt > bond_maturity:
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

    # Fetch audited dates (real verdicts, not IGNORED) so frontend can warn on re-entry
    from models import AuditLog
    audited_entries = (
        db.query(AuditLog.date, AuditLog.verdict, AuditLog.calculated_pr, AuditLog.actual_kwh)
        .filter(
            AuditLog.bond_id == bond_id,
            AuditLog.date >= d(year, month, 1),
            AuditLog.date <= d(year, month, days_in_month),
            AuditLog.verdict.in_(["COMPLIANT", "PENALTY", "RECOVERY"]),
        )
        .all()
    )
    audited_dates = {str(e.date): e.verdict for e in audited_entries}
    # Auto-penalty dates: PENALTY with no PR and no kwh (deadline exceeded)
    auto_penalty_dates = [
        str(e.date) for e in audited_entries
        if e.verdict == "PENALTY" and e.calculated_pr is None and e.actual_kwh is None
    ]

    return {
        "bond_id": bond_id,
        "year": year,
        "month": month,
        "missing_days": [str(d) for d in missing],
        "submitted_dates": [str(d) for d in sorted(submitted)],
        "audited_dates": audited_dates,
        "auto_penalty_dates": auto_penalty_dates,
        "submitted_days": len(submitted & all_days),
        "total_days": len(all_days),
        "bond_created": str(bond_created) if bond_created else None,
    }