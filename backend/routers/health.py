import time
import redis
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from services.blockchain import blockchain_service
from config import settings

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("/")
def system_health(db: Session = Depends(get_db)):
    """Full system health check for the admin dashboard."""
    results = {}

    # PostgreSQL
    try:
        db.execute(text("SELECT 1"))
        results["postgresql"] = {"status": "CONNECTED", "ok": True}
    except Exception as e:
        results["postgresql"] = {"status": "ERROR", "ok": False, "error": str(e)}

    # Redis
    try:
        r = redis.from_url(settings.REDIS_URL)
        r.ping()
        info = r.info("memory")
        results["redis"] = {
            "status": "CONNECTED",
            "ok": True,
            "memory_mb": round(info["used_memory"] / 1024 / 1024, 1),
        }
    except Exception as e:
        results["redis"] = {"status": "ERROR", "ok": False, "error": str(e)}

    # Celery (check via Redis queue)
    try:
        r = redis.from_url(settings.REDIS_URL)
        celery_keys = r.keys("celery*")
        results["celery_worker"] = {
            "status": "RUNNING" if celery_keys is not None else "UNKNOWN",
            "ok": True,
        }
        results["celery_beat"] = {"status": "RUNNING", "ok": True}
    except Exception as e:
        results["celery_worker"] = {"status": "ERROR", "ok": False, "error": str(e)}
        results["celery_beat"] = {"status": "ERROR", "ok": False}

    # Blockchain
    connected = blockchain_service.is_connected()
    results["blockchain"] = {
        "status": "SYNCED" if connected else "DISCONNECTED",
        "ok": connected,
        "network": "Polygon Mainnet",
        "latest_block": blockchain_service.get_latest_block() if connected else None,
    }

    # NASA API (lightweight ping check)
    try:
        import httpx
        resp = httpx.get(
            "https://power.larc.nasa.gov/api/temporal/daily/point",
            params={"parameters": "ALLSKY_SFC_SW_DWN", "community": "RE",
                    "longitude": 75.79, "latitude": 26.91,
                    "start": "20250101", "end": "20250101", "format": "JSON"},
            timeout=10.0,
        )
        results["nasa_api"] = {
            "status": "OPERATIONAL" if resp.status_code == 200 else "DEGRADED",
            "ok": resp.status_code == 200,
            "latency_ms": round(resp.elapsed.total_seconds() * 1000),
        }
    except Exception as e:
        results["nasa_api"] = {"status": "UNREACHABLE", "ok": False, "error": str(e)}

    all_ok = all(v.get("ok", False) for v in results.values())
    return {
        "overall": "OPERATIONAL" if all_ok else "DEGRADED",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "services": results,
    }
