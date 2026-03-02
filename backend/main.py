import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from config import settings
from database import create_all_tables
from routers import bonds, audit, alerts, production, blockchain, health

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs on startup and shutdown.

    Startup order:
      1. Create DB tables (dev only — use Alembic in prod)
      2. Run catchup_missed_audits() to recover any days missed while server was down
         This is safe to call every restart — it's fully idempotent.
    """
    logger.info(f"🚀 {settings.APP_NAME} starting up...")

    if settings.DEBUG:
        create_all_tables()  # Auto-create tables in dev; use Alembic in prod

    # ── CATCHUP: fill in any audit gaps caused by downtime ──────────────────
    # Import here to avoid circular imports at module load time
    try:
        from tasks.catchup import catchup_missed_audits
        logger.info("🔍 Running startup catchup check for missed audits...")
        summary = catchup_missed_audits()

        if summary["total_missed_days"] > 0:
            logger.warning(
                f"⚠️  Catchup queued {summary['total_missed_days']} missed audit(s) "
                f"across {len(summary['queued'])} bond(s). "
                f"Celery workers will process them in the background."
            )
            for entry in summary["queued"]:
                logger.warning(
                    f"   └─ {entry['bond_id']}: {len(entry['dates'])} day(s) → "
                    + ", ".join(entry["dates"])
                )
        else:
            logger.info("✅ Catchup complete — all bonds are up to date.")

    except Exception as e:
        # NEVER let a catchup failure block the server from starting.
        # Log the error loudly, but continue.
        logger.error(
            f"❌ Startup catchup failed with an unexpected error: {e}. "
            f"Server will continue — trigger manual catchup via /audit/catchup if needed.",
            exc_info=True,
        )
    # ────────────────────────────────────────────────────────────────────────

    yield
    logger.info(f"👋 {settings.APP_NAME} shutting down.")


app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "Blockchain-verified smart green bond monitoring platform. "
        "Automated PR calculation, penalty enforcement, and immutable audit trails."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(bonds.router)
app.include_router(audit.router)
app.include_router(alerts.router)
app.include_router(production.router)
app.include_router(blockchain.router)
app.include_router(health.router)


@app.get("/")
def root():
    return {
        "name": settings.APP_NAME,
        "version": "1.0.0",
        "docs": "/docs",
        "status": "running",
    }
