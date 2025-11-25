from django.db import models

# Create your models here.
from django.conf import settings
from django.db import models


class EmailAccount(models.Model):
    """
    Represents an external mailbox (Gmail, Yahoo, IMAP, etc.) for a user.

    In the future you can support OAuth tokens for Gmail / Outlook instead of
    storing passwords here. For now this is a simple IMAP/SMTP config holder.
    """

    PROVIDER_CHOICES = (
        ("gmail", "Gmail"),
        ("outlook", "Outlook / Microsoft 365"),
        ("yahoo", "Yahoo"),
        ("imap", "Generic IMAP"),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="email_accounts",
    )
    label = models.CharField(
        max_length=128,
        help_text="Friendly name, e.g. 'Personal Gmail' or 'NavonLogic'.",
    )
    provider = models.CharField(
        max_length=32,
        choices=PROVIDER_CHOICES,
        default="imap",
    )
    email_address = models.EmailField()
    imap_server = models.CharField(max_length=255, blank=True, default="")
    imap_port = models.PositiveIntegerField(default=993)
    imap_use_ssl = models.BooleanField(default=True)
    smtp_server = models.CharField(max_length=255, blank=True, default="")
    smtp_port = models.PositiveIntegerField(default=587)
    smtp_use_tls = models.BooleanField(default=True)
    username = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Usually same as email address.",
    )
    password = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="For app passwords or temporary testing only. Prefer OAuth in production.",
    )
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["label"]

    def __str__(self) -> str:
        return f"{self.label} ({self.email_address})"


class EmailMessage(models.Model):
    """
    A single email message stored in the assistant.

    Actual fetching from Gmail/IMAP will populate these rows.
    """

    FOLDER_CHOICES = (
        ("INBOX", "Inbox"),
        ("SENT", "Sent"),
        ("DRAFTS", "Drafts"),
        ("ARCHIVE", "Archive"),
        ("TRASH", "Trash"),
        ("OTHER", "Other"),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="email_messages",
    )
    account = models.ForeignKey(
        EmailAccount,
        on_delete=models.CASCADE,
        related_name="messages",
    )

    external_id = models.CharField(
        max_length=255,
        help_text="Stable provider ID or IMAP UID so we don't import duplicates.",
    )
    folder = models.CharField(
        max_length=32,
        choices=FOLDER_CHOICES,
        default="INBOX",
    )

    subject = models.CharField(max_length=998, blank=True, default="")
    from_email = models.CharField(max_length=512, blank=True, default="")
    to_emails = models.TextField(blank=True, default="")
    cc_emails = models.TextField(blank=True, default="")
    bcc_emails = models.TextField(blank=True, default="")

    body_text = models.TextField(blank=True, default="")
    body_html = models.TextField(blank=True, default="")

    sent_at = models.DateTimeField()
    is_read = models.BooleanField(default=False)
    is_starred = models.BooleanField(default=False)
    has_attachments = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-sent_at"]
        unique_together = ("account", "external_id")

    def __str__(self) -> str:
        return f"[{self.account.label}] {self.subject[:60]}"