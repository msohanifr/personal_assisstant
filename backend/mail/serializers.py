import logging
from rest_framework import serializers

from .models import EmailAccount, EmailMessage

logger = logging.getLogger(__name__)


class EmailAccountSerializer(serializers.ModelSerializer):
    # Never expose password in API responses
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = EmailAccount
        fields = [
            "id",
            "label",
            "provider",
            "email_address",
            "imap_server",
            "imap_port",
            "imap_use_ssl",
            "smtp_server",
            "smtp_port",
            "smtp_use_tls",
            "username",
            "password",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def create(self, validated_data):
        logger.info(
            "EmailAccountSerializer.create for user=%s, email=%s",
            self.context.get("request").user if self.context.get("request") else None,
            validated_data.get("email_address"),
        )
        return super().create(validated_data)

    def update(self, instance, validated_data):
        logger.info(
            "EmailAccountSerializer.update for account id=%s", instance.id
        )
        return super().update(instance, validated_data)


class EmailMessageSerializer(serializers.ModelSerializer):
    account_label = serializers.CharField(
        source="account.label", read_only=True
    )
    account_email = serializers.CharField(
        source="account.email_address", read_only=True
    )

    class Meta:
        model = EmailMessage
        fields = [
            "id",
            "account",
            "account_label",
            "account_email",
            "external_id",
            "folder",
            "subject",
            "from_email",
            "to_emails",
            "cc_emails",
            "bcc_emails",
            "body_text",
            "body_html",
            "sent_at",
            "is_read",
            "is_starred",
            "has_attachments",
            "created_at",
        ]
        read_only_fields = ["created_at"]