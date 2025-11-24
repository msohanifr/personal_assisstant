import logging
from django.contrib.auth.models import User
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Profile, Task, Note, Contact, CalendarEvent
from .serializers import (
    UserSerializer, ProfileSerializer,
    TaskSerializer, NoteSerializer,
    ContactSerializer, CalendarEventSerializer,
)

logger = logging.getLogger(__name__)

class IsOwner(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return getattr(obj, "user", None) == request.user

class UserViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    @action(detail=False, methods=["get"])
    def me(self, request):
        logger.debug("Fetching current user profile for %s", request.user)
        s = self.get_serializer(request.user)
        return Response(s.data)

class ProfileViewSet(viewsets.ModelViewSet):
    serializer_class = ProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    def get_queryset(self):
        logger.debug("ProfileViewSet.get_queryset for user %s", self.request.user)
        return Profile.objects.filter(user=self.request.user)
    def perform_create(self, serializer):
        logger.info("Creating profile for user %s", self.request.user)
        serializer.save(user=self.request.user)

class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    def get_queryset(self):
        logger.debug("TaskViewSet.get_queryset for user %s", self.request.user)
        return Task.objects.filter(user=self.request.user).order_by("-created_at")
    def perform_create(self, serializer):
        logger.info("Creating task for user %s", self.request.user)
        serializer.save(user=self.request.user)

class NoteViewSet(viewsets.ModelViewSet):
    serializer_class = NoteSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    def get_queryset(self):
        logger.debug("NoteViewSet.get_queryset for user %s", self.request.user)
        return Note.objects.filter(user=self.request.user).order_by("-created_at")
    def perform_create(self, serializer):
        logger.info("Creating note for user %s", self.request.user)
        serializer.save(user=self.request.user)

class ContactViewSet(viewsets.ModelViewSet):
    serializer_class = ContactSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    def get_queryset(self):
        logger.debug("ContactViewSet.get_queryset for user %s", self.request.user)
        return Contact.objects.filter(user=self.request.user).order_by("name")
    def perform_create(self, serializer):
        logger.info("Creating contact for user %s", self.request.user)
        serializer.save(user=self.request.user)

class CalendarEventViewSet(viewsets.ModelViewSet):
    serializer_class = CalendarEventSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    def get_queryset(self):
        logger.debug("CalendarEventViewSet.get_queryset for user %s", self.request.user)
        return CalendarEvent.objects.filter(user=self.request.user).order_by("start")
    def perform_create(self, serializer):
        logger.info("Creating event for user %s", self.request.user)
        serializer.save(user=self.request.user)
