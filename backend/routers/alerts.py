import json
import logging
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Alert, AuditLog, Bond, BondStatus
from redis_client import redis_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/alerts", tags=["alerts"])

DIGEST_TTL = 60  # seconds


@router.get("/digest")
def get_alert_digest(
    days: int = Query(default=7, le=30),
    db: Session = Depends(get_db),
):
    cache_key = f"alerts:digest:{days}"
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    since = date.today() - timedelta(days=days)
    bonds = db.query(Bond).order_by(Bond.created_at.desc()).all()

    result = []
    for bond in bonds:
        # ── Audit logs for this bond in range ────────────────────────────────
        logs = (
            db.query(AuditLog)
            .filter(AuditLog.bond_id == bond.id, AuditLog.date >= since)
            .order_by(AuditLog.date.desc())
            .all()
        )

        # ── Blockchain TXes (audit logs that have a tx_hash) ─────────────────
        blockchain_txes = [
            {
                "date": str(l.date),
                "verdict": l.verdict,
                "tx_hash": l.blockchain_tx_hash,
                "block_number": l.block_number,
                "gas_used": l.gas_used,
                "rate_before": float(l.rate_before) if l.rate_before else None,
                "rate_after": float(l.rate_after) if l.rate_after else None,
            }
            for l in logs if l.blockchain_tx_hash
        ]

        # ── Missing production days (IGNORED verdict = no production data) ───
        missing_days = [
            {"date": str(l.date), "verdict": l.verdict}
            for l in logs if l.verdict == "IGNORED" or (l.actual_kwh is None and l.verdict != "PENDING")
        ]

        # ── Penalty streak info ───────────────────────────────────────────────
        latest = logs[0] if logs else None
        penalty_days = latest.consecutive_penalty if latest else 0
        compliant_days = latest.consecutive_compliant if latest else 0

        # ── Maturity info ─────────────────────────────────────────────────────
        days_to_maturity = None
        maturity_status = None
        if bond.maturity_date:
            delta = (bond.maturity_date - date.today()).days
            days_to_maturity = delta
            if bond.status == BondStatus.MATURED:
                maturity_status = "MATURED"
            elif delta <= 0:
                maturity_status = "DUE"
            elif delta <= 30:
                maturity_status = "SOON"
            else:
                maturity_status = "OK"

        # ── Daily audit summary rows ──────────────────────────────────────────
        audit_rows = [
            {
                "date": str(l.date),
                "verdict": l.verdict,
                "pr": float(l.calculated_pr) if l.calculated_pr else None,
                "rate_before": float(l.rate_before) if l.rate_before else None,
                "rate_after": float(l.rate_after) if l.rate_after else None,
                "tx_hash": l.blockchain_tx_hash,
                "actual_kwh": float(l.actual_kwh) if l.actual_kwh else None,
            }
            for l in logs
        ]

        result.append({
            "bond_id": bond.id,
            "bond_name": bond.name,
            "status": bond.status,
            "current_rate": float(bond.current_rate),
            "base_rate": float(bond.base_rate),
            "maturity_date": str(bond.maturity_date) if bond.maturity_date else None,
            "days_to_maturity": days_to_maturity,
            "maturity_status": maturity_status,
            "penalty_streak": penalty_days,
            "compliant_streak": compliant_days,
            "blockchain_txes": blockchain_txes,
            "missing_days": missing_days,
            "audit_rows": audit_rows,
            "total_missing": len(missing_days),
            "total_penalty": sum(1 for l in logs if l.verdict == "PENALTY"),
            "total_compliant": sum(1 for l in logs if l.verdict == "COMPLIANT"),
        })

    redis_client.setex(cache_key, DIGEST_TTL, json.dumps(result, default=str))
    return result


@router.get("/unread/count")
def get_unread_count(db: Session = Depends(get_db)):
    """Count of unread critical alerts — drives the bell badge."""
    cache_key = "alerts:unread:count"
    cached = redis_client.get(cache_key)
    if cached is not None:
        return {"count": int(cached)}

    count = (
        db.query(Alert)
        .filter(Alert.severity == "critical", Alert.status != "READ")
        .count()
    )
    redis_client.setex(cache_key, 30, count)
    return {"count": count}


@router.patch("/{alert_id}/read")
def mark_alert_read(alert_id: int, db: Session = Depends(get_db)):
    from fastapi import HTTPException
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = "READ"
    db.commit()
    redis_client.delete("alerts:unread:count")
    return {"ok": True}