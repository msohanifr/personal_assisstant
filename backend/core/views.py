from datetime import timedelta
import logging
from django.db.models import Q
from django.utils import timezone
import requests
from django.core.cache import cache
from django.core import signing

from django.contrib.auth.models import User
from django.http import HttpResponse
from django.conf import settings
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny

from .models import (
    Profile,
    Task,
    TaskTag,
    Note,
    NoteAttachment,
    Contact,
    CalendarEvent,
    GoogleCredential,
)
from .google_calendar import sync_google_calendar, SCOPES as GOOGLE_SCOPES
from .serializers import (
    UserSerializer,
    ProfileSerializer,
    TaskSerializer,
    TaskTagSerializer,
    NoteSerializer,
    NoteAttachmentSerializer,
    ContactSerializer,
    CalendarEventSerializer,
)

logger = logging.getLogger(__name__)


class IsOwner(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        is_owner = getattr(obj, "user", None) == request.user
        logger.debug(
            "IsOwner.check: user=%s, obj_user=%s, result=%s",
            request.user,
            getattr(obj, "user", None),
            is_owner,
        )
        return is_owner


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Limit exposure to the authenticated user only.
        return User.objects.filter(id=self.request.user.id)

    @action(detail=False, methods=["get"])
    def me(self, request):
        logger.debug("UserViewSet.me: Fetching current user %s", request.user)
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)


class ProfileViewSet(viewsets.ModelViewSet):
    serializer_class = ProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        logger.debug(
            "ProfileViewSet.get_queryset for user %s", self.request.user
        )
        return Profile.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        logger.info(
            "ProfileViewSet.perform_create: Creating profile for user %s",
            self.request.user,
        )
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        logger.info(
            "ProfileViewSet.perform_update: Updating profile for user %s",
            self.request.user,
        )
        serializer.save()


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        qs = Task.objects.filter(user=self.request.user)
        cutoff = timezone.now() - timedelta(days=3)

        # Hide done tasks older than 3 days
        qs = qs.exclude(
            Q(status=Task.DONE) &
            Q(completed_at__lt=cutoff)
        )
        return qs

    def perform_create(self, serializer):
        logger.info(
            "TaskViewSet.perform_create: Creating task for user %s",
            self.request.user,
        )
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        logger.info(
            "TaskViewSet.perform_update: Updating task for user %s",
            self.request.user,
        )
        serializer.save()

    def perform_destroy(self, instance):
        logger.info(
            "TaskViewSet.perform_destroy: Deleting task id=%s for user=%s",
            instance.id,
            self.request.user,
        )
        super().perform_destroy(instance)

class TaskTagViewSet(viewsets.ModelViewSet):
    serializer_class = TaskTagSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        logger.debug(
            "TaskTagViewSet.get_queryset for user %s", self.request.user
        )
        return TaskTag.objects.filter(user=self.request.user).order_by("name")

    def perform_create(self, serializer):
        logger.info(
            "TaskTagViewSet.perform_create: Creating tag for user %s",
            self.request.user,
        )
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        logger.info(
            "TaskTagViewSet.perform_update: Updating tag for user %s",
            self.request.user,
        )
        serializer.save()

    def perform_destroy(self, instance):
        logger.info(
            "TaskTagViewSet.perform_destroy: Deleting tag id=%s for user=%s",
            instance.id,
            self.request.user,
        )
        super().perform_destroy(instance)

class NoteViewSet(viewsets.ModelViewSet):
    serializer_class = NoteSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        request = self.request
        logger.debug(
            "NoteViewSet.get_queryset for user %s, query_params=%s",
            request.user,
            dict(request.query_params),
        )

        qs = Note.objects.filter(user=request.user).order_by("-created_at")

        task_id = request.query_params.get("task")
        if task_id:
            try:
                logger.debug(
                    "NoteViewSet.get_queryset: Filtering notes by task_id=%s",
                    task_id,
                )
                qs = qs.filter(task_id=int(task_id))
            except ValueError:
                logger.warning(
                    "NoteViewSet.get_queryset: Invalid task parameter '%s'",
                    task_id,
                )

        return qs

    def perform_create(self, serializer):
        logger.info(
            "NoteViewSet.perform_create: Creating note for user %s",
            self.request.user,
        )
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        logger.info(
            "NoteViewSet.perform_update: Updating note for user %s",
            self.request.user,
        )
        serializer.save()

    def perform_destroy(self, instance):
        logger.info(
            "NoteViewSet.perform_destroy: Deleting note id=%s for user=%s",
            instance.id,
            self.request.user,
        )
        super().perform_destroy(instance)


class NoteAttachmentViewSet(viewsets.ModelViewSet):
    """Upload and manage files/images attached to notes."""

    serializer_class = NoteAttachmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        """Ensure users cannot interact with attachments on other users' notes."""
        try:
            obj = NoteAttachment.objects.select_related("note").get(
                pk=self.kwargs.get(self.lookup_field, None)
            )
        except NoteAttachment.DoesNotExist:
            raise NotFound()

        if obj.note.user_id != self.request.user.id:
            raise PermissionDenied("Cannot access another user's attachment.")
        return obj

    def get_queryset(self):
        logger.debug(
            "NoteAttachmentViewSet.get_queryset for user %s", self.request.user
        )
        # Only attachments belonging to the current user's notes
        return NoteAttachment.objects.filter(note__user=self.request.user).order_by(
            "-created_at"
        )

    def perform_create(self, serializer):
        logger.info(
            "NoteAttachmentViewSet.perform_create: Creating note attachment "
            "for user %s (note=%s)",
            self.request.user,
            self.request.data.get("note"),
        )
        note = serializer.validated_data.get("note")
        if note and note.user != self.request.user:
            raise PermissionDenied("Cannot attach files to another user's note.")
        serializer.save()

    def perform_destroy(self, instance):
        logger.info(
            "NoteAttachmentViewSet.perform_destroy: Deleting attachment id=%s "
            "for user=%s",
            instance.id,
            self.request.user,
        )
        if instance.note.user != self.request.user:
            raise PermissionDenied("Cannot delete attachments for another user's note.")
        super().perform_destroy(instance)


class ContactViewSet(viewsets.ModelViewSet):
    serializer_class = ContactSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        logger.debug(
            "ContactViewSet.get_queryset for user %s", self.request.user
        )
        return Contact.objects.filter(user=self.request.user).order_by("name")

    def perform_create(self, serializer):
        logger.info(
            "ContactViewSet.perform_create: Creating contact for user %s",
            self.request.user,
        )
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        logger.info(
            "ContactViewSet.perform_update: Updating contact for user %s",
            self.request.user,
        )
        serializer.save()

    def perform_destroy(self, instance):
        logger.info(
            "ContactViewSet.perform_destroy: Deleting contact id=%s for user=%s",
            instance.id,
            self.request.user,
        )
        super().perform_destroy(instance)


class CalendarEventViewSet(viewsets.ModelViewSet):
    serializer_class = CalendarEventSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        logger.debug(
            "CalendarEventViewSet.get_queryset for user %s", self.request.user
        )
        return CalendarEvent.objects.filter(user=self.request.user).order_by("start")

    def perform_create(self, serializer):
        logger.info(
            "CalendarEventViewSet.perform_create: Creating event for user %s",
            self.request.user,
        )
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        logger.info(
            "CalendarEventViewSet.perform_update: Updating event for user %s",
            self.request.user,
        )
        serializer.save()

    def perform_destroy(self, instance):
        logger.info(
            "CalendarEventViewSet.perform_destroy: Deleting event id=%s for user=%s",
            instance.id,
            self.request.user,
        )
        super().perform_destroy(instance)

    @action(detail=False, methods=["post"], url_path="sync-google")
    def sync_google(self, request):
        """
        Pull upcoming events from Google Calendar using service account creds.

        Env required:
          - GOOGLE_CALENDAR_ID
          - GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON (or _FILE)
        """
        calendar_id = request.data.get("calendar_id") or request.query_params.get(
            "calendar_id"
        )
        max_events = request.data.get("max_events") or request.query_params.get(
            "max_events", 50
        )
        try:
            max_events = int(max_events)
        except Exception:
            max_events = 50

        try:
            created, updated = sync_google_calendar(
                request.user, calendar_id=calendar_id, max_events=max_events
            )
        except Exception as exc:
            logger.exception("CalendarEventViewSet.sync_google failed: %s", exc)
            return Response(
                {"status": "error", "detail": str(exc)},
                status=400,
            )

        return Response(
            {
                "status": "ok",
                "created": created,
                "updated": updated,
            }
        )


GOOGLE_OAUTH_CLIENT_ID = getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", None)
GOOGLE_OAUTH_CLIENT_SECRET = getattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", None)
GOOGLE_OAUTH_REDIRECT_URI = getattr(
    settings,
    "GOOGLE_OAUTH_REDIRECT_URI",
    "http://localhost:8001/api/google/oauth/callback/",
)


def _build_google_flow(scopes):
    try:
        from google_auth_oauthlib.flow import Flow
    except ImportError:
        raise RuntimeError(
            "google-auth-oauthlib not installed. Run pip install -r backend/requirements.txt"
        )

    if not (GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET):
        raise RuntimeError("Google OAuth client id/secret not configured.")

    config = {
        "web": {
            "client_id": GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": GOOGLE_OAUTH_CLIENT_SECRET,
            "redirect_uris": [GOOGLE_OAUTH_REDIRECT_URI],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }

    return Flow.from_client_config(
        config,
        scopes=scopes,
        redirect_uri=GOOGLE_OAUTH_REDIRECT_URI,
    )


class GoogleOAuthStartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            flow = _build_google_flow(GOOGLE_SCOPES)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=503)
        # tie state to user securely
        state = signing.dumps({"u": request.user.id}, salt="google-oauth")
        auth_url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            state=state,
            prompt="consent",
        )
        return Response({"auth_url": auth_url})


class GoogleOAuthCallbackView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        # Validate state -> user id
        state = request.GET.get("state")
        code = request.GET.get("code")
        if not state or not code:
            return Response(
                {"detail": "Missing state or code."},
                status=400,
            )

        try:
            payload = signing.loads(state, salt="google-oauth", max_age=600)
            user_id = payload.get("u")
            user = User.objects.get(id=user_id)
        except Exception:
            return Response(
                {"detail": "Invalid or expired state."},
                status=400,
            )

        flow = _build_google_flow(GOOGLE_SCOPES)
        flow.fetch_token(code=code)
        creds = flow.credentials

        GoogleCredential.objects.update_or_create(
            user=user,
            defaults={
                "access_token": creds.token,
                "refresh_token": creds.refresh_token or "",
                "token_expiry": creds.expiry,
                "token_uri": creds.token_uri,
                "client_id": creds.client_id,
                "client_secret": creds.client_secret,
                "scopes": " ".join(creds.scopes or []),
            },
        )

        html = """
        <html>
          <body>
            <h3>Google account linked</h3>
            <p>You can close this window and return to the app.</p>
          </body>
        </html>
        """
        return HttpResponse(html)

# core/views_weather.py
import logging
import os

import requests
from django.core.cache import cache
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET

logger = logging.getLogger(__name__)

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY_YAHOO_WEATHER", "")
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST_YAHOO_WEATHER", "yahoo-weather5.p.rapidapi.com")

# Hard limit: do not call external Yahoo Weather more than this per day
MAX_WEATHER_CALLS_PER_DAY = 2
WEATHER_CACHE_TTL_SECONDS = 60 * 60 * 12  # 12 hours


@require_GET
def weather_view(request):
    """
    Return normalized weather data for the dashboard.

    We:
      - Try to serve from cache first (per location).
      - If no cache, check a daily counter. If we've already hit
        MAX_WEATHER_CALLS_PER_DAY for today, we fall back to the last
        cached value (if any) or return a quota error.
      - On successful external call, we update cache + counter.

    Query params:
      - location: e.g. "New York,US" (optional, default: "New York,US").
    """
    if not RAPIDAPI_KEY:
        logger.warning("[Weather] RAPIDAPI_KEY_YAHOO_WEATHER not set")
        return JsonResponse(
            {"detail": "Weather API key not configured."},
            status=503,
        )

    location = request.GET.get("location") or "New York,US"

    # --- Cache keys ---
    location_key = f"weather:last:{location}"
    global_last_key = "weather:last:any"

    # --- Try location-specific cache first ---
    cached_data = cache.get(location_key)
    if cached_data is not None:
        logger.debug("[Weather] Serving cached result for %s", location)
        return JsonResponse(cached_data)

    # --- If no location cache, we may still fall back to global cache later ---
    global_cached = cache.get(global_last_key)

    # --- Enforce per-day call limit ---
    now = timezone.now()
    today_str = now.date().isoformat()
    count_key = f"weather:count:{today_str}"

    current_count = cache.get(count_key, 0)
    logger.debug(
        "[Weather] Current daily Yahoo calls: %s (limit=%s)",
        current_count,
        MAX_WEATHER_CALLS_PER_DAY,
    )

    if current_count >= MAX_WEATHER_CALLS_PER_DAY:
        logger.warning(
            "[Weather] Daily Yahoo Weather call limit reached (%s). "
            "Serving cached data if available.",
            MAX_WEATHER_CALLS_PER_DAY,
        )
        if global_cached is not None:
            logger.debug("[Weather] Returning global cached result after quota reached")
            return JsonResponse(global_cached)
        return JsonResponse(
            {"detail": "Daily weather quota reached. Try again later."},
            status=429,
        )

    # --- We are allowed to hit Yahoo Weather API ---
    url = f"https://{RAPIDAPI_HOST}/weather"
    params = {
        "location": location,
        "format": "json",
        "u": "c",  # 'c' for Celsius, 'f' for Fahrenheit
    }
    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }

    logger.info("[Weather] Requesting Yahoo weather for %s", location)
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=8)
        if resp.status_code != 200:
            logger.error(
                "[Weather] Yahoo API non-200: %s %s",
                resp.status_code,
                resp.text[:500],
            )
            # If we have any cached data, serve that instead of hard failing
            if global_cached is not None:
                logger.debug("[Weather] Returning global cached result after error")
                return JsonResponse(global_cached)
            return JsonResponse(
                {"detail": f"Weather API error: {resp.status_code}"},
                status=resp.status_code,
            )

        data = resp.json()
        logger.debug("[Weather] Raw Yahoo response: %s", data)

        # ---- Normalize shape for your Dashboard.jsx ----
        location_info = data.get("location", {}) or {}
        current_obs = data.get("current_observation") or {}
        current = current_obs.get("condition") or {}
        atmosphere = current_obs.get("atmosphere") or {}

        temp_c = current.get("temperature")

        normalized = {
            "city": location_info.get("city") or location,
            "country": location_info.get("country", ""),
            "condition": current.get("text", ""),
            "temperature_c": temp_c,
            # optional extras
            "humidity": atmosphere.get("humidity"),
            "visibility": atmosphere.get("visibility"),
        }

        # --- Update per-day counter (expires in ~24h) ---
        new_count = current_count + 1
        cache.set(count_key, new_count, timeout=60 * 60 * 24)
        logger.info(
            "[Weather] External Yahoo call successful. "
            "Daily count is now %s (limit=%s).",
            new_count,
            MAX_WEATHER_CALLS_PER_DAY,
        )

        # --- Cache the result for this location + global fallback ---
        cache.set(location_key, normalized, timeout=WEATHER_CACHE_TTL_SECONDS)
        cache.set(global_last_key, normalized, timeout=60 * 60 * 24)

        return JsonResponse(normalized)

    except requests.RequestException:
        logger.exception("[Weather] Exception calling Yahoo Weather")
        # Try to serve global cache if possible
        if global_cached is not None:
            logger.debug("[Weather] Returning global cached result after exception")
            return JsonResponse(global_cached)
        return JsonResponse(
            {"detail": "Failed to fetch weather."},
            status=502,
        )
