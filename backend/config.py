from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # App
    APP_NAME: str = "GreenBond OS"
    DEBUG: bool = False           #Used in main.py
    SECRET_KEY: str = "change-me-in-production"
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Database
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/greenbonds"

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"

    # Blockchain (Polygon)
    POLYGON_RPC_URL: str = "https://polygon-amoy.g.alchemy.com/v2/YOUR_ALCHEMY_KEY"
    WALLET_PRIVATE_KEY: str = "0xYOUR_PRIVATE_KEY"
    CONTRACT_ADDRESS: str = "0xYOUR_DEPLOYED_CONTRACT"

    # NASA POWER API
    NASA_API_BASE: str = "https://power.larc.nasa.gov/api/temporal/daily/point"
    NASA_COMMUNITY: str = "RE"
    NASA_PARAMETER: str = "ALLSKY_SFC_SW_DWN"

    # Twilio SMS
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""

    # SendGrid Email
    SENDGRID_API_KEY: str = ""
    ALERT_FROM_EMAIL: str = "alerts@greenbond.io"

    # Celery Beat
    CELERY_TIMEZONE: str = "Asia/Kolkata"
    AUDIT_CRON_HOUR: int = 6
    AUDIT_CRON_MINUTE: int = 0

    # PR Engine
    PR_THRESHOLD: float = 0.75
    CONSECUTIVE_PENALTY_DAYS: int = 3
    CONSECUTIVE_RECOVERY_DAYS: int = 7
    PERFORMANCE_FACTOR: float = 0.80
    PENALTY_RATE_MULTIPLIER: float = 1.5

    class Config:
        env_file = ".env"


settings = Settings()
