import logging

from django.contrib.auth.models import User
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import (
    Profile,
    Task,
    TaskTag,
    Note,
    NoteAttachment,
    Contact,
    CalendarEvent,
)
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
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

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
        logger.debug("TaskViewSet.get_queryset for user %s", self.request.user)
        return Task.objects.filter(user=self.request.user).order_by("-created_at")

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
        serializer.save()

    def perform_destroy(self, instance):
        logger.info(
            "NoteAttachmentViewSet.perform_destroy: Deleting attachment id=%s "
            "for user=%s",
            instance.id,
            self.request.user,
        )
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