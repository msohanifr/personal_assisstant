import logging
import os
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from django.contrib.auth import get_user_model
from django.utils import timezone

from core.google_calendar import sync_google_calendar
from core.models import GoogleCredential

logger = logging.getLogger(__name__)

_scheduler: Optional[BackgroundScheduler] = None


def _sync_google_for_all_users():
    User = get_user_model()
    users = (
        User.objects.filter(google_credential__isnull=False)
        .select_related("google_credential")
    )
    for user in users:
        try:
            created, updated = sync_google_calendar(user)
            logger.info(
                "[Scheduler] Google sync for user=%s created=%s updated=%s",
                user.id,
                created,
                updated,
            )
        except Exception as exc:
            logger.exception(
                "[Scheduler] Google sync failed for user=%s: %s", user.id, exc
            )


def start_scheduler():
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    interval_minutes = int(os.getenv("GOOGLE_CALENDAR_SYNC_MINUTES", "15"))

    _scheduler = BackgroundScheduler(
        timezone=str(timezone.get_default_timezone())
    )
    _scheduler.add_job(
        _sync_google_for_all_users,
        trigger="interval",
        minutes=interval_minutes,
        max_instances=1,
        id="google-calendar-sync",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        "[Scheduler] Started Google Calendar sync every %s minutes",
        interval_minutes,
    )
    return _scheduler
