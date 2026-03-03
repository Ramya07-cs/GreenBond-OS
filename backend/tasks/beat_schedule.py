from celery.schedules import crontab
from config import settings

CELERYBEAT_SCHEDULE = {
    "daily-green-bond-audit": {
        "task": "tasks.daily_audit.run_daily_audit",
        "schedule": crontab(
            hour=settings.AUDIT_CRON_HOUR,      # 6 (IST)
            minute=settings.AUDIT_CRON_MINUTE,  # 0
        ),
        "options": {"queue": "audits"},
    },

    "check-bond-maturity": {
        "task": "tasks.maturity.check_bond_maturity",
        "schedule": crontab(
            hour=settings.AUDIT_CRON_HOUR,
            minute=settings.AUDIT_CRON_MINUTE + 30,  # 6:30 IST
        ),
        "options": {"queue": "audits"},
    },
}
