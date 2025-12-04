import json
import logging
import os
from datetime import datetime, timedelta
from typing import Optional, Tuple

from django.utils import timezone

from core.models import CalendarEvent, GoogleCredential

logger = logging.getLogger(__name__)

try:
    from google.oauth2 import service_account, credentials as google_credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
except Exception:
    service_account = None  # type: ignore
    google_credentials = None  # type: ignore
    Request = None  # type: ignore
    build = None  # type: ignore

SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
]


def _load_service_account_credentials():
    if service_account is None or build is None:
        raise RuntimeError("google-api-python-client not installed")

    raw_json = os.getenv("GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON")
    json_path = os.getenv("GOOGLE_CALENDAR_SERVICE_ACCOUNT_FILE")

    if raw_json:
        info = json.loads(raw_json)
        return service_account.Credentials.from_service_account_info(
            info, scopes=SCOPES
        )

    if json_path:
        return service_account.Credentials.from_service_account_file(
            json_path, scopes=SCOPES
        )

    raise RuntimeError(
        "Missing GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON or GOOGLE_CALENDAR_SERVICE_ACCOUNT_FILE"
    )


def _load_user_credentials(user):
    if google_credentials is None or Request is None or build is None:
        raise RuntimeError("google-api-python-client not installed")

    try:
        cred_obj: GoogleCredential = user.google_credential  # type: ignore
    except GoogleCredential.DoesNotExist:
        raise RuntimeError("No Google credentials found for user.")

    creds = google_credentials.Credentials(
        token=cred_obj.access_token,
        refresh_token=cred_obj.refresh_token,
        token_uri=cred_obj.token_uri,
        client_id=cred_obj.client_id,
        client_secret=cred_obj.client_secret,
        scopes=cred_obj.scopes.split(),
    )

    # Refresh if expired
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        cred_obj.access_token = creds.token
        cred_obj.token_expiry = creds.expiry
        cred_obj.save(update_fields=["access_token", "token_expiry", "updated_at"])

    return creds


def _parse_google_time(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        # Google can return "YYYY-MM-DD" (all-day) or ISO strings, sometimes with Z.
        if len(value) == 10 and value.count("-") == 2:
            dt = datetime.fromisoformat(value)
        else:
            if value.endswith("Z"):
                value = value.replace("Z", "+00:00")
            dt = datetime.fromisoformat(value)

        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.utc)
        return dt
    except Exception as exc:
        logger.warning("google_calendar: failed to parse %r (%s)", value, exc)
        return None


def sync_google_calendar(
    user,
    calendar_id: Optional[str] = None,
    max_events: int = 50,
    use_service_account: bool = False,
) -> Tuple[int, int]:
    """
    Pull upcoming events from Google Calendar and upsert into CalendarEvent.

    Returns (created, updated).
    """
    cal_id = calendar_id or os.getenv("GOOGLE_CALENDAR_ID")
    if not cal_id:
        raise RuntimeError("GOOGLE_CALENDAR_ID not set")

    if use_service_account:
        creds = _load_service_account_credentials()
    else:
        creds = _load_user_credentials(user)

    service = build("calendar", "v3", credentials=creds, cache_discovery=False)

    now = datetime.utcnow().isoformat() + "Z"
    resp = (
        service.events()
        .list(
            calendarId=cal_id,
            timeMin=now,
            maxResults=max_events,
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
    )
    items = resp.get("items", [])
    created = 0
    updated = 0

    for ev in items:
        start_raw = ev.get("start", {}) or {}
        end_raw = ev.get("end", {}) or {}

        start = _parse_google_time(start_raw.get("dateTime") or start_raw.get("date"))
        end = _parse_google_time(end_raw.get("dateTime") or end_raw.get("date"))

        if not start:
            continue
        if not end:
            end = start + timedelta(hours=1)

        title = ev.get("summary") or "(no title)"
        description = ev.get("description") or ""
        location = ev.get("location") or ""
        external_id = ev.get("id")

        defaults = {
            "description": description,
            "start": start,
            "end": end,
            "location": location,
            "source": "google",
        }

        obj, created_flag = CalendarEvent.objects.update_or_create(
            user=user,
            source="google",
            title=title[:255],
            defaults=defaults,
        )
        if created_flag:
            created += 1
        else:
            updated += 1

    logger.info(
        "google_calendar: synced %s events (created=%s, updated=%s) for user=%s",
        len(items),
        created,
        updated,
        user,
    )
    return created, updated
