from celery.schedules import crontab
from config import settings

CELERYBEAT_SCHEDULE = {
    "daily-green-bond-audit": {
        "task": "tasks.daily_audit.run_daily_audit",
        "schedule": crontab(
            hour=settings.AUDIT_CRON_HOUR,
            minute=settings.AUDIT_CRON_MINUTE,
        ),
        "options": {"queue": "audits"},
    },
}
