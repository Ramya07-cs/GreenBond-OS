from celery.schedules import crontab
from config import settings

# Compute maturity check time: 30 minutes after the daily audit.
_audit_minute = settings.AUDIT_CRON_MINUTE
_audit_hour = settings.AUDIT_CRON_HOUR

_maturity_total_minutes = _audit_hour * 60 + _audit_minute + 30
_maturity_hour = (_maturity_total_minutes // 60) % 24  # wrap at midnight
_maturity_minute = _maturity_total_minutes % 60

CELERYBEAT_SCHEDULE = {
    "daily-green-bond-audit": {
        "task": "tasks.daily_audit.run_daily_audit",
        "schedule": crontab(
            hour=_audit_hour,
            minute=_audit_minute,
        ),
        "options": {"queue": "audits"},
    },

    # ── Bond maturity check ──
    "check-bond-maturity": {
        "task": "tasks.maturity.check_bond_maturity",
        "schedule": crontab(
            hour=_maturity_hour,
            minute=_maturity_minute,
        ),
        "options": {"queue": "audits"},
    },

    "retry-ignored-audits": {
        "task": "tasks.catchup.retry_ignored_audits",
        "schedule": crontab(hour=14, minute=0),
        "options": {"queue": "audits"},
    },

    "retry-failed-blockchain-txs": {
        "task": "tasks.blockchain_retry.retry_failed_blockchain_txs_task",
        "schedule": crontab(hour=7, minute=0),
        "options": {"queue": "audits"},
    },

    "lock-expired-submissions": {
        "task": "tasks.catchup.lock_expired_ignored_as_penalty_task",
        "schedule": crontab(hour=14, minute=30),
        "options": {"queue": "audits"},
    },
}