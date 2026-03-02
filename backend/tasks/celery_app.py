from celery import Celery
from config import settings

celery_app = Celery(
    "greenbond",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["tasks.daily_audit"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone=settings.CELERY_TIMEZONE,
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

# Import beat schedule
from tasks.beat_schedule import CELERYBEAT_SCHEDULE
celery_app.conf.beat_schedule = CELERYBEAT_SCHEDULE
