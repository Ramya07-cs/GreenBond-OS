import logging
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date as date_type
from database import get_db
from models import AuditLog

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("/")
def get_audit_logs(
    bond_id: Optional[str] = None,
    verdict: Optional[str] = None,
    limit: int = Query(default=50, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    query = db.query(AuditLog)
    if bond_id:
        query = query.filter(AuditLog.bond_id == bond_id)
    if verdict:
        query = query.filter(AuditLog.verdict == verdict.upper())

    total = query.count()
    logs = query.order_by(AuditLog.date.desc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "logs": [
            {
                "id": log.id,
                "bond_id": log.bond_id,
                "date": str(log.date),
                "nasa_ghi": float(log.nasa_ghi) if log.nasa_ghi else None,
                "actual_kwh": float(log.actual_kwh) if log.actual_kwh else None,
                "expected_kwh": float(log.expected_kwh) if log.expected_kwh else None,
                "calculated_pr": float(log.calculated_pr) if log.calculated_pr else None,
                "verdict": log.verdict,
                "consecutive_penalty": log.consecutive_penalty,
                "consecutive_compliant": log.consecutive_compliant,
                "rate_before": float(log.rate_before) if log.rate_before else None,
                "rate_after": float(log.rate_after) if log.rate_after else None,
                "blockchain_tx_hash": log.blockchain_tx_hash,
                "block_number": log.block_number,
            }
            for log in logs
        ],
    }


@router.post("/run")
def trigger_manual_audit(
    target_date: Optional[str] = None,
    date: Optional[str] = None,          
    bond_id: Optional[str] = None,
    force: bool = False,                  # clears existing audit + Redis locks so re-audit runs
    db: Session = Depends(get_db),
):
    from tasks.daily_audit import run_daily_audit
    from redis_client import redis_client

   
    resolved_date = target_date or date
    if force and resolved_date and bond_id:
        deleted = (
            db.query(AuditLog)
            .filter(AuditLog.bond_id == bond_id, AuditLog.date == resolved_date)
            .delete()
        )
        db.commit()
        redis_client.delete(f"audit:lock:{bond_id}:{resolved_date}")
        redis_client.delete(f"catchup:queued:{bond_id}:{resolved_date}")
        logger.info(
            f"[ForceReaudit] Cleared {deleted} audit record(s) + locks "
            f"for {bond_id} on {resolved_date}"
        )

    task = run_daily_audit.apply_async(
        kwargs={"target_date": resolved_date, "bond_id": bond_id},
        queue="audits",
    )
    return {
        "message": "Audit task queued",
        "task_id": task.id,
        "target_date": resolved_date or str(date_type.today()),
        "bond_id": bond_id or "all",
        "forced": force,
    }


@router.post("/catchup")
def trigger_manual_catchup():
    try:
        from tasks.catchup import catchup_missed_audits
        summary = catchup_missed_audits()
        return {
            "message": "Catchup complete",
            "bonds_checked": summary["bonds_checked"],
            "total_missed_days_queued": summary["total_missed_days"],
            "queued": summary["queued"],
            "skipped_too_old": summary["skipped_too_old"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Catchup failed: {str(e)}")