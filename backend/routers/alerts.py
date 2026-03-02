from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from models import Alert

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


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


@router.get("/summary")
def get_alert_summary(db: Session = Depends(get_db)):
    """Aggregated alert counts for the dashboard."""
    from sqlalchemy import func
    counts = (
        db.query(Alert.severity, func.count(Alert.id))
        .group_by(Alert.severity)
        .all()
    )
    return {
        "total": db.query(Alert).count(),
        "by_severity": {severity: count for severity, count in counts},
        "unread_critical": db.query(Alert)
        .filter(Alert.severity == "critical", Alert.status != "FAILED")
        .count(),
    }
