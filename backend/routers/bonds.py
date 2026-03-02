from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import date, timedelta
from pydantic import BaseModel
from database import get_db
from models import Bond, AuditLog, ProductionEntry, BondStatus

router = APIRouter(prefix="/api/bonds", tags=["bonds"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class BondCreate(BaseModel):
    id: str
    name: str
    capacity_kw: float
    lat: float
    lng: float
    base_rate: float
    tvl: Optional[int] = 0
    maturity_date: Optional[date] = None
    issuer_email: Optional[str] = None
    issuer_phone: Optional[str] = None


class BondOut(BaseModel):
    id: str
    name: str
    capacity_kw: float
    lat: float
    lng: float
    base_rate: float
    current_rate: float
    status: str
    tvl: int
    maturity_date: Optional[date]
    today_pr: Optional[float] = None
    consecutive_penalty: int = 0
    consecutive_compliant: int = 0

    class Config:
        from_attributes = True


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[BondOut])
def list_bonds(db: Session = Depends(get_db)):
    bonds = db.query(Bond).all()
    result = []
    for bond in bonds:
        latest_log = (
            db.query(AuditLog)
            .filter(AuditLog.bond_id == bond.id)
            .order_by(AuditLog.date.desc())
            .first()
        )
        out = BondOut.model_validate(bond)
        out.today_pr = float(latest_log.calculated_pr) if latest_log and latest_log.calculated_pr else None
        out.consecutive_penalty = latest_log.consecutive_penalty if latest_log else 0
        out.consecutive_compliant = latest_log.consecutive_compliant if latest_log else 0
        result.append(out)
    return result


@router.get("/{bond_id}", response_model=BondOut)
def get_bond(bond_id: str, db: Session = Depends(get_db)):
    bond = db.query(Bond).filter(Bond.id == bond_id).first()
    if not bond:
        raise HTTPException(status_code=404, detail=f"Bond {bond_id} not found")
    latest_log = (
        db.query(AuditLog)
        .filter(AuditLog.bond_id == bond_id)
        .order_by(AuditLog.date.desc())
        .first()
    )
    out = BondOut.model_validate(bond)
    out.today_pr = float(latest_log.calculated_pr) if latest_log and latest_log.calculated_pr else None
    out.consecutive_penalty = latest_log.consecutive_penalty if latest_log else 0
    out.consecutive_compliant = latest_log.consecutive_compliant if latest_log else 0
    return out


@router.post("/", response_model=BondOut, status_code=201)
def create_bond(data: BondCreate, db: Session = Depends(get_db)):
    if db.query(Bond).filter(Bond.id == data.id).first():
        raise HTTPException(status_code=409, detail=f"Bond {data.id} already exists")
    bond = Bond(
        **data.model_dump(),
        current_rate=data.base_rate,
        status=BondStatus.ACTIVE,
    )
    db.add(bond)
    db.commit()
    db.refresh(bond)
    return bond


@router.get("/{bond_id}/timeseries")
def get_timeseries(
    bond_id: str,
    days: int = Query(default=60, ge=7, le=365),
    db: Session = Depends(get_db),
):
    """Return PR + energy time series for charting."""
    bond = db.query(Bond).filter(Bond.id == bond_id).first()
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")

    since = date.today() - timedelta(days=days)
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.bond_id == bond_id, AuditLog.date >= since)
        .order_by(AuditLog.date.asc())
        .all()
    )
    production = (
        db.query(ProductionEntry)
        .filter(ProductionEntry.bond_id == bond_id, ProductionEntry.date >= since)
        .order_by(ProductionEntry.date.asc())
        .all()
    )
    production_map = {str(p.date): float(p.kwh) for p in production}

    perf_series = [
        {
            "day": str(log.date),
            "pr": float(log.calculated_pr) if log.calculated_pr else None,
            "nasa_ghi": float(log.nasa_ghi) if log.nasa_ghi else None,
            "verdict": log.verdict,
            "threshold": 0.75,
        }
        for log in logs
    ]
    energy_series = [
        {
            "day": str(log.date),
            "actual": production_map.get(str(log.date)),
            "predicted": float(log.expected_kwh) if log.expected_kwh else None,
        }
        for log in logs
    ]
    interest_series = [
        {
            "day": str(log.date),
            "rate": float(log.rate_after) if log.rate_after else float(bond.base_rate),
        }
        for log in logs
    ]

    return {
        "bond_id": bond_id,
        "days": days,
        "perf_series": perf_series,
        "energy_series": energy_series,
        "interest_series": interest_series,
    }
