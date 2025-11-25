# backend/mail/views.py
import logging

from django.db.models import Q
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.views import IsOwner
from .models import EmailAccount, EmailMessage
from .serializers import EmailAccountSerializer, EmailMessageSerializer
from .imap_sync import sync_imap_account

logger = logging.getLogger(__name__)


class EmailAccountViewSet(viewsets.ModelViewSet):
    """
    Manage the user's connected email accounts and trigger sync.

    For provider authentication:
      - Gmail: use an App Password (recommended) or OAuth2 (to be added).
      - Outlook/Office 365: basic IMAP auth is mostly disabled; prefer OAuth/Graph API.
      - Yahoo / generic IMAP: IMAP username/password or app passwords.

    The `sync` action uses IMAP (username/password or app password) right now.
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
            "EmailAccountViewSet.perform_create for user %s, email=%s",
            self.request.user,
            serializer.validated_data.get("email_address"),
        )
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        logger.info(
            "EmailAccountViewSet.perform_update for user %s, account_id=%s",
            self.request.user,
            self.get_object().id,
        )
        serializer.save()

    @action(detail=True, methods=["post"])
    def sync(self, request, pk=None):
        """
        Trigger an IMAP sync for this account.

        Right now this:
          - Connects via IMAP (using username + password/app password)
          - Fetches the latest N messages from INBOX (default 50)
          - Stores them in EmailMessage model

        Response contains how many new messages were imported.
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

        # default ordering is -sent_at from model Meta
        return qs.order_by("-sent_at")