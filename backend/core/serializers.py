from django.utils import timezone
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

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and "tag_ids" in self.fields:
            self.fields["tag_ids"].queryset = TaskTag.objects.filter(user=request.user)

    def validate_tag_ids(self, tags):
        """Ensure all tags belong to the authenticated user."""
        request = self.context.get("request")
        if not request:
            return tags
        for tag in tags:
            if tag.user_id != request.user.id:
                raise serializers.ValidationError("Invalid tag selection.")
        return tags

    def create(self, validated_data):
        status = validated_data.get("status", Task.TODO)
        instance = super().create(validated_data)
        if status == Task.DONE and instance.completed_at is None:
            instance.completed_at = timezone.now()
            instance.save(update_fields=["completed_at"])
        return instance

    def update(self, instance, validated_data):
        old_status = instance.status
        new_status = validated_data.get("status", old_status)

        instance = super().update(instance, validated_data)

        # If status changed, adjust completed_at
        if old_status != new_status:
            if new_status == Task.DONE:
                # just became done
                if instance.completed_at is None:
                    instance.completed_at = timezone.now()
            else:
                # moved out of done
                instance.completed_at = None

            instance.save(update_fields=["status", "completed_at", "updated_at"])

        return instance


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
