import json
import logging
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import AuditLog, Bond, BondStatus, ProductionEntry
from redis_client import redis_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bonds", tags=["bonds"])

# Cache TTLs
BOND_CACHE_TTL = 300          # 5 minutes — bond metadata changes rarely
DASHBOARD_CACHE_TTL = 120     # 2 minutes — KPI summary


def _seconds_until_midnight_utc() -> int:
    """Returns seconds remaining until midnight UTC. Used for day-bound cache TTL."""
    now = datetime.utcnow()
    midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(int((midnight - now).total_seconds()), 60)


def invalidate_bond_caches(bond_id: str):
    keys_to_delete = [
        f"bond:detail:{bond_id}",
        f"bond:pr_today:{bond_id}",
        "bonds:list",
        "dashboard:summary",
        "health:full_check",   # Health check references active bonds
    ]
    # Also clear any timeseries caches for this bond
    pattern_keys = redis_client.keys(f"bond:timeseries:{bond_id}:*")
    keys_to_delete.extend(pattern_keys)

    if keys_to_delete:
        redis_client.delete(*keys_to_delete)
        logger.info(f"[Cache] Invalidated {len(keys_to_delete)} keys for bond {bond_id}")


# ── Schemas ───────────────────────────────────────────────────────────────────

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
    created_at: Optional[datetime] = None
    today_pr: Optional[float] = None
    consecutive_penalty: int = 0
    consecutive_compliant: int = 0

    class Config:
        from_attributes = True


# ── Helpers ───────────────────────────────────────────────────────────────────

def _enrich_bond(bond: Bond, db: Session) -> BondOut:
    """Attach latest audit stats to a bond object."""
    # Latest log for streaks (any verdict)
    latest_log = (
        db.query(AuditLog)
        .filter(AuditLog.bond_id == bond.id)
        .order_by(AuditLog.date.desc())
        .first()
    )
    # Latest COMPLIANT or PENALTY log for Today PR — skip IGNORED (NASA lag days)
    latest_real_log = (
        db.query(AuditLog)
        .filter(
            AuditLog.bond_id == bond.id,
            AuditLog.verdict.in_(["COMPLIANT", "PENALTY"]),
            AuditLog.calculated_pr.isnot(None),
        )
        .order_by(AuditLog.date.desc())
        .first()
    )
    out = BondOut.model_validate(bond)
    out.today_pr = float(latest_real_log.calculated_pr) if latest_real_log else None
    out.consecutive_penalty = latest_log.consecutive_penalty if latest_log else 0
    out.consecutive_compliant = latest_log.consecutive_compliant if latest_log else 0
    return out


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[BondOut])
def list_bonds(db: Session = Depends(get_db)):
    """All bonds with latest PR and streak state. Cached 5 min."""

    cache_key = "bonds:list"
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    bonds = db.query(Bond).all()
    result = [_enrich_bond(b, db) for b in bonds]
    serialized = [b.model_dump(mode="json") for b in result]

    redis_client.setex(cache_key, BOND_CACHE_TTL, json.dumps(serialized, default=str))
    return result


@router.get("/dashboard/summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    cache_key = "dashboard:summary"
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    active_bonds = db.query(Bond).filter(Bond.status != BondStatus.MATURED).all()
    active_prs = [
        float(row.calculated_pr)
        for row in (
            db.query(AuditLog.calculated_pr)
            .join(Bond, Bond.id == AuditLog.bond_id)
            .filter(Bond.status != BondStatus.MATURED)
            .filter(AuditLog.date == date.today())
            .filter(AuditLog.calculated_pr.isnot(None))
            .all()
        )
    ]

    summary = {
        "total_bonds": db.query(Bond).count(),
        "active": db.query(Bond).filter(Bond.status == BondStatus.ACTIVE).count(),
        "penalty": db.query(Bond).filter(Bond.status == BondStatus.PENALTY).count(),
        "matured": db.query(Bond).filter(Bond.status == BondStatus.MATURED).count(),
        "tvl": db.query(func.sum(Bond.tvl)).scalar() or 0,
        "avg_pr_today": round(sum(active_prs) / len(active_prs), 4) if active_prs else None,
    }

    redis_client.setex(cache_key, DASHBOARD_CACHE_TTL, json.dumps(summary, default=str))
    return summary


@router.get("/{bond_id}", response_model=BondOut)
def get_bond(bond_id: str, db: Session = Depends(get_db)):
    """Single bond with latest PR. Cached 5 min per bond."""

    cache_key = f"bond:detail:{bond_id}"
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    bond = db.query(Bond).filter(Bond.id == bond_id).first()
    if not bond:
        raise HTTPException(status_code=404, detail=f"Bond {bond_id} not found")

    out = _enrich_bond(bond, db)
    redis_client.setex(cache_key, BOND_CACHE_TTL, json.dumps(out.model_dump(mode="json"), default=str))
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

    # Invalidate list cache so new bond appears immediately
    redis_client.delete("bonds:list", "dashboard:summary")

    return bond


@router.get("/{bond_id}/timeseries")
def get_timeseries(
    bond_id: str,
    days: int = Query(default=60, ge=7, le=365),
    db: Session = Depends(get_db),
):
    
    cache_key = f"bond:timeseries:{bond_id}:{days}"
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

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

    response = {
        "bond_id": bond_id,
        "days": days,
        "perf_series": perf_series,
        "energy_series": energy_series,
        "interest_series": interest_series,
    }

    # Cache until midnight — data complete for the day after 6 AM audit
    redis_client.setex(cache_key, _seconds_until_midnight_utc(), json.dumps(response, default=str))
    return response
