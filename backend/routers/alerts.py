import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Alert
from redis_client import redis_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/alerts", tags=["alerts"])

UNREAD_COUNT_TTL = 30     # seconds — short: bell badge needs to be timely
SUMMARY_TTL = 60          # seconds


@router.get("/")
def get_alerts(
    bond_id: Optional[str] = None,
    severity: Optional[str] = None,
    alert_type: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    query = db.query(Alert)
    if bond_id:
        query = query.filter(Alert.bond_id == bond_id)
    if severity:
        query = query.filter(Alert.severity == severity)
    if alert_type:
        query = query.filter(Alert.type == alert_type.upper())

    total = query.count()
    alerts = query.order_by(Alert.timestamp.desc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "alerts": [
            {
                "id": a.id,
                "bond_id": a.bond_id,
                "timestamp": a.timestamp.isoformat() if a.timestamp else None,
                "type": a.type,
                "message": a.message,
                "severity": a.severity,
                "status": a.status,
                "tx_hash": a.tx_hash,
                "gas_used": a.gas_used,
                "block_number": a.block_number,
                "recipient": a.recipient,
            }
            for a in alerts
        ],
    }


@router.get("/unread/count")
def get_unread_count(db: Session = Depends(get_db)):
    cache_key = "alerts:unread:count"
    cached = redis_client.get(cache_key)
    if cached is not None:
        return {"count": int(cached), "cached": True}

    count = (
        db.query(Alert)
        .filter(Alert.severity == "critical", Alert.status != "READ")
        .count()
    )
    redis_client.setex(cache_key, UNREAD_COUNT_TTL, count)
    return {"count": count, "cached": False}


@router.patch("/{alert_id}/read")
def mark_alert_read(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = "READ"
    db.commit()

    # Invalidate immediately — don't wait for TTL
    redis_client.delete("alerts:unread:count")
    logger.info(f"[Alerts] Alert {alert_id} marked read. Unread count cache cleared.")

    return {"ok": True, "alert_id": alert_id}


@router.get("/summary")
def get_alert_summary(db: Session = Depends(get_db)):
    """Aggregated alert counts for the dashboard. Cached 60s."""
    cache_key = "alerts:summary"
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    counts = (
        db.query(Alert.severity, func.count(Alert.id))
        .group_by(Alert.severity)
        .all()
    )
    summary = {
        "total": db.query(Alert).count(),
        "by_severity": {severity: count for severity, count in counts},
        "unread_critical": db.query(Alert)
        .filter(Alert.severity == "critical", Alert.status != "READ")
        .count(),
    }

    redis_client.setex(cache_key, SUMMARY_TTL, json.dumps(summary))
    return summary
