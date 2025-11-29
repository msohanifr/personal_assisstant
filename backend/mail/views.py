# backend/mail/views.py
import logging

from django.db.models import Q
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.views import IsOwner
from core.serializers import TaskSerializer, NoteSerializer
from .ai_agent import analyze_email_to_tasks_and_notes
from .imap_sync import sync_imap_account
from .models import EmailAccount, EmailMessage
from .serializers import EmailAccountSerializer, EmailMessageSerializer

logger = logging.getLogger(__name__)


class EmailAccountViewSet(viewsets.ModelViewSet):
    """
    Manage the user's connected email accounts and trigger sync.

    The `sync` action uses IMAP (username/password or app password).
    """

    serializer_class = EmailAccountSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        logger.debug(
            "EmailAccountViewSet.get_queryset for user %s", self.request.user
        )
        return EmailAccount.objects.filter(user=self.request.user).order_by("label")

    def perform_create(self, serializer):
        logger.info(
            "EmailAccountViewSet.perform_create for user=%s, email=%s",
            self.request.user,
            serializer.validated_data.get("email_address"),
        )
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        logger.info(
            "EmailAccountViewSet.perform_update for user=%s, account_id=%s",
            self.request.user,
            self.get_object().id,
        )
        serializer.save()

    @action(detail=True, methods=["post"])
    def sync(self, request, pk=None):
        """
        Trigger an IMAP sync for this account.
        """
        account = self.get_object()
        logger.info(
            "EmailAccountViewSet.sync called for user=%s, account_id=%s, provider=%s",
            request.user,
            account.id,
            account.provider,
        )

        try:
            imported_count = sync_imap_account(account, limit=50)
        except Exception as exc:
            logger.exception(
                "EmailAccountViewSet.sync: IMAP sync failed for account_id=%s: %s",
                account.id,
                exc,
            )
            return Response(
                {
                    "status": "error",
                    "detail": str(exc),
                },
                status=400,
            )

        return Response(
            {
                "status": "ok",
                "imported": imported_count,
            }
        )


class EmailMessageViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only API for listing and viewing emails.

    Supports filtering by:
       - account: ?account=<account_id>
       - folder:  ?folder=INBOX
       - is_read: ?is_read=true/false
       - q:       ?q=search-term  (subject, from, to, body)
    """

    serializer_class = EmailMessageSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        request = self.request
        user = request.user
        params = request.query_params

        logger.debug(
            "EmailMessageViewSet.get_queryset user=%s, params=%s",
            user,
            dict(params),
        )

        qs = EmailMessage.objects.filter(user=user)

        account = params.get("account")
        if account:
            try:
                qs = qs.filter(account_id=int(account))
            except ValueError:
                logger.warning(
                    "EmailMessageViewSet: invalid account param '%s'", account
                )

        folder = params.get("folder")
        if folder:
            qs = qs.filter(folder=folder)

        is_read = params.get("is_read")
        if is_read in ("true", "false"):
            qs = qs.filter(is_read=(is_read == "true"))

        q = params.get("q")
        if q:
            qs = qs.filter(
                Q(subject__icontains=q)
                | Q(from_email__icontains=q)
                | Q(to_emails__icontains=q)
                | Q(body_text__icontains=q)
            )

        return qs.order_by("-sent_at")

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request, *args, **kwargs):
        """
        Return the unread email count for the current user.

        Optional filters:
          - account: ?account=<account_id>
          - folder:  ?folder=INBOX
        """
        user = request.user
        params = request.query_params

        logger.info(
            "EmailMessageViewSet.unread_count called for user=%s with params=%s",
            user,
            dict(params),
        )

        qs = EmailMessage.objects.filter(user=user, is_read=False)

        account = params.get("account")
        if account:
            try:
                qs = qs.filter(account_id=int(account))
            except ValueError:
                logger.warning(
                    "EmailMessageViewSet.unread_count: invalid account param '%s'",
                    account,
                )

        folder = params.get("folder")
        if folder:
            qs = qs.filter(folder=folder)

        unread = qs.count()
        logger.debug(
            "EmailMessageViewSet.unread_count: user=%s, unread=%s",
            user,
            unread,
        )
        return Response({"unread": unread})

    @action(detail=True, methods=["post"])
    def analyze(self, request, pk=None):
        """
        Use AI to analyze this email and create Task + Note objects.

        Response:
        {
          "status": "ok",
          "created_tasks": [...],
          "created_notes": [...]
        }
        """
        email = self.get_object()
        logger.info(
            "EmailMessageViewSet.analyze: user=%s requested AI analysis for email id=%s",
            request.user,
            email.id,
        )

        try:
            tasks, notes = analyze_email_to_tasks_and_notes(email)
        except Exception as exc:
            logger.exception(
                "EmailMessageViewSet.analyze: Analysis failed for email id=%s: %s",
                email.id,
                exc,
            )
            return Response(
                {
                    "status": "error",
                    "detail": str(exc),
                },
                status=400,
            )

        task_data = TaskSerializer(tasks, many=True).data
        note_data = NoteSerializer(notes, many=True).data

        logger.info(
            "EmailMessageViewSet.analyze: Created %s tasks, %s notes for email id=%s",
            len(task_data),
            len(note_data),
            email.id,
        )

        return Response(
            {
                "status": "ok",
                "created_tasks": task_data,
                "created_notes": note_data,
            }
        )