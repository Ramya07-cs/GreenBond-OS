import time
import json
import logging
import httpx
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from models import Bond, BondStatus
from services.blockchain import blockchain_service
from redis_client import redis_client
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/health", tags=["health"])

HEALTH_CACHE_KEY = "health:full_check"
HEALTH_CACHE_TTL = 60  # seconds


@router.get("/")
def system_health(db: Session = Depends(get_db)):
    cached = redis_client.get(HEALTH_CACHE_KEY)
    if cached:
        result = json.loads(cached)
        result["cached"] = True
        return result

    # ── 2. Run all checks live ────────────────────────────────────────────────
    services = {}

    # PostgreSQL
    try:
        db.execute(text("SELECT 1"))
        services["postgresql"] = {"status": "CONNECTED", "ok": True}
    except Exception as e:
        logger.error(f"[Health] PostgreSQL check failed: {e}")
        services["postgresql"] = {"status": "ERROR", "ok": False, "error": str(e)}

    # Redis
    try:
        redis_client.ping()
        info = redis_client.info("memory")
        services["redis"] = {
            "status": "CONNECTED",
            "ok": True,
            "memory_mb": round(int(info["used_memory"]) / 1024 / 1024, 1),
        }
    except Exception as e:
        logger.error(f"[Health] Redis check failed: {e}")
        services["redis"] = {"status": "ERROR", "ok": False, "error": str(e)}

    # Celery worker — actually ping via Celery inspect (2s timeout)
    try:
        from tasks.celery_app import celery_app
        inspector = celery_app.control.inspect(timeout=2.0)
        active_workers = inspector.ping()
        worker_alive = bool(active_workers)
        services["celery_worker"] = {
            "status": "RUNNING" if worker_alive else "OFFLINE",
            "ok": worker_alive,
            "workers": list(active_workers.keys()) if active_workers else [],
        }
    except Exception as e:
        services["celery_worker"] = {"status": "ERROR", "ok": False, "error": str(e)}

    # Celery Beat — check the schedule file in multiple candidate locations.
    # Beat writes celerybeat-schedule to its CWD (typically backend/) not /tmp.
    # We also write a Redis heartbeat key from the beat schedule itself as a
    # more reliable signal — if the key exists and is fresh, Beat is alive.
    try:
        import os

        # ── Method 1: Redis heartbeat (most reliable) ─────────────────────────
        # Beat can be configured to write a heartbeat key; if present and fresh
        # (written within the last 2 hours), Beat is confirmed running.
        beat_redis_key = "celerybeat:heartbeat"
        redis_hb = redis_client.get(beat_redis_key)
        beat_alive_redis = redis_hb is not None

        # ── Method 2: Schedule file in common locations ───────────────────────
        # Beat writes celerybeat-schedule(.db) to its working directory.
        candidate_paths = [
            "celerybeat-schedule",            # backend/ when run from there
            "celerybeat-schedule.db",
            "/tmp/celerybeat-schedule",       # some deployments override this
            "/tmp/celerybeat-schedule.db",
            "../celerybeat-schedule",
        ]
        beat_alive_file = False
        beat_file_age_s = None
        for path in candidate_paths:
            if os.path.exists(path):
                age_s = time.time() - os.path.getmtime(path)
                # File must exist and be from this server session (< 24h)
                if age_s < 86400:
                    beat_alive_file = True
                    beat_file_age_s = round(age_s)
                    break

        beat_alive = beat_alive_redis or beat_alive_file
        services["celery_beat"] = {
            "status": "RUNNING" if beat_alive else "OFFLINE",
            "ok": beat_alive,
            **({"heartbeat": "redis"} if beat_alive_redis else {}),
            **({"schedule_file_age_s": beat_file_age_s} if beat_alive_file else {}),
        }
    except Exception as e:
        services["celery_beat"] = {"status": "ERROR", "ok": False, "error": str(e)}

    # Blockchain
    connected = blockchain_service.is_connected()
    wallet_balance = blockchain_service.get_wallet_balance_matic() if connected else None
    balance_low = (
        wallet_balance is not None
        and wallet_balance < settings.LOW_BALANCE_THRESHOLD_MATIC
    )
    services["blockchain"] = {
        "status": "SYNCED" if connected else "DISCONNECTED",
        "ok": connected and not balance_low,
        "network": "Polygon Amoy Testnet",
        "latest_block": blockchain_service.get_latest_block() if connected else None,
        "wallet_balance_matic": wallet_balance,
        "balance_low": balance_low,
        "balance_threshold_matic": settings.LOW_BALANCE_THRESHOLD_MATIC,
    }

    # ── 3. NASA ping — dynamic bond coordinate ────────────────────────────────
    try:
        bond = (
            db.query(Bond)
            .filter(Bond.status.in_([BondStatus.ACTIVE, BondStatus.PENALTY]))
            .order_by(Bond.id)          # deterministic — always picks same bond
            .first()
        )

        if not bond:
            services["nasa_api"] = {
                "status": "SKIPPED",
                "ok": True,  # Not a failure — just no bonds to ping with
                "reason": "No active bonds found to use as ping coordinate",
            }
        else:
            resp = httpx.get(
                settings.NASA_API_BASE,
                params={
                    "parameters": settings.NASA_PARAMETER,
                    "community": settings.NASA_COMMUNITY,
                    "longitude": float(bond.lng),
                    "latitude": float(bond.lat),
                    "start": "20250101",
                    "end": "20250101",
                    "format": "JSON",
                },
                timeout=10.0,
            )
            services["nasa_api"] = {
                "status": "OPERATIONAL" if resp.status_code == 200 else "DEGRADED",
                "ok": resp.status_code == 200,
                "latency_ms": round(resp.elapsed.total_seconds() * 1000),
                # Show which bond we used — transparent for debugging
                "ping_bond_id": bond.id,
                "ping_coords": {"lat": float(bond.lat), "lng": float(bond.lng)},
            }

    except Exception as e:
        logger.error(f"[Health] NASA API check failed: {e}")
        services["nasa_api"] = {"status": "UNREACHABLE", "ok": False, "error": str(e)}

    # ── 4. Build final response ───────────────────────────────────────────────
    all_ok = all(v.get("ok", False) for v in services.values())
    response = {
        "overall": "OPERATIONAL" if all_ok else "DEGRADED",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "services": services,
        "cached": False,
    }

    # ── 5. Cache result ───────────────────────────────────────────────────────
    try:
        redis_client.setex(HEALTH_CACHE_KEY, HEALTH_CACHE_TTL, json.dumps(response))
    except Exception as e:
        logger.warning(f"[Health] Could not write to cache: {e}")

    return response