import logging
import logging.config
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from database import create_all_tables
from routers import bonds, audit, alerts, production, blockchain, health


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ── Sentry setup ──────────────────────────────────────────────────────────────
def _init_sentry():
    """
    Sentry captures unhandled exceptions, slow transactions, and task failures.
    """
    if not settings.SENTRY_DSN:
        logger.info("Sentry DSN not set — error monitoring disabled.")
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.celery import CeleryIntegration

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                SqlalchemyIntegration(),
                CeleryIntegration(),
            ],
            traces_sample_rate=0.2,     # 20% of requests traced for performance
            environment="production" if not settings.DEBUG else "development",
            release=f"greenbond-os@1.0.0",
        )
        logger.info("Sentry initialized.")
    except ImportError:
        logger.warning("sentry-sdk not installed — skipping Sentry init. pip install sentry-sdk")
    except Exception as e:
        logger.error(f"Sentry init failed: {e}")


_init_sentry()


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"{settings.APP_NAME} starting up...")

    if settings.DEBUG:
        create_all_tables()  # Auto-create tables

    # ── CATCHUP: fill in any audit gaps caused by downtime ──────────────────
    try:
        from tasks.catchup import catchup_missed_audits
        logger.info("Running startup catchup check for missed audits...")
        summary = catchup_missed_audits()

        if summary["total_missed_days"] > 0:
            logger.warning(
                f"Catchup queued {summary['total_missed_days']} missed audit(s) "
                f"across {len(summary['queued'])} bond(s). "
                f"Celery workers will process them in the background."
            )
            for entry in summary["queued"]:
                logger.warning(
                    f"   └─ {entry['bond_id']}: {len(entry['dates'])} day(s) → "
                    + ", ".join(entry["dates"])
                )
        else:
            logger.info("Catchup complete — all bonds are up to date.")

    except Exception as e:
        # NEVER let a catchup failure block the server from starting.
        logger.error(
            f"Startup catchup failed: {e}. "
            f"Server will continue — trigger manual catchup via /audit/catchup if needed.",
            exc_info=True,
        )
    # ────────────────────────────────────────────────────────────────────────

    yield
    logger.info(f"{settings.APP_NAME} shutting down.")


# ── App ───────────────────────────────────────────────────────────────────────
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
