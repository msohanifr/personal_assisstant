from django.contrib.auth.models import User
from rest_framework import serializers
from .models import (
    Profile,
    Task,
    TaskTag,
    Note,
    NoteAttachment,
    Contact,
    CalendarEvent,
)

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name"]

class TaskTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskTag
        fields = "__all__"
        read_only_fields = ["user", "created_at", "updated_at"]

class ProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = Profile
        fields = ["id", "user", "timezone", "daily_start_hour", "daily_end_hour"]


class TaskSerializer(serializers.ModelSerializer):
    # Read-only nested tags for display
    tags = TaskTagSerializer(many=True, read_only=True)

    # Write-only IDs for create/update from frontend
    tag_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=TaskTag.objects.all(),
        write_only=True,
        required=False,
        source="tags",
    )

    class Meta:
        model = Task
        fields = "__all__"
        read_only_fields = ["user", "created_at", "updated_at"]


class NoteAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = NoteAttachment
        fields = "__all__"
        read_only_fields = ["created_at"]


class NoteSerializer(serializers.ModelSerializer):
    # Include attachments when fetching a note
    attachments = NoteAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Note
        fields = "__all__"
        read_only_fields = ["user", "created_at", "updated_at"]


class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = "__all__"
        read_only_fields = ["user", "created_at", "updated_at"]


class CalendarEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalendarEvent
        fields = "__all__"
        read_only_fields = ["user", "created_at", "updated_at"]