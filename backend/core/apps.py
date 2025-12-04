import os
import logging
from django.apps import AppConfig
from django.conf import settings

logger = logging.getLogger(__name__)


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        # Start background calendar sync scheduler if enabled
        if getattr(settings, "GOOGLE_CALENDAR_SYNC_ENABLED", False):
            # Avoid double-start under autoreload
            if os.environ.get("RUN_MAIN") == "true":
                try:
                    from .scheduler import start_scheduler

                    start_scheduler()
                    logger.info("Core scheduler started (Google Calendar sync).")
                except Exception as exc:
                    logger.exception(
                        "Core scheduler failed to start: %s",
                        exc,
                    )
