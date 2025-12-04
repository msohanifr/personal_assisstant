from rest_framework.routers import DefaultRouter
from django.urls import path, include

from .views import (
    UserViewSet,
    ProfileViewSet,
    TaskViewSet,
    NoteViewSet,
    NoteAttachmentViewSet,
    ContactViewSet,
    CalendarEventViewSet,
    TaskTagViewSet,  # 👈 NEW
    GoogleOAuthStartView,
    GoogleOAuthCallbackView,
)

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"profiles", ProfileViewSet, basename="profile")
router.register(r"tasks", TaskViewSet, basename="task")
router.register(r"task-tags", TaskTagViewSet, basename="task-tag")  # 👈 NEW
router.register(r"notes", NoteViewSet, basename="note")
router.register(r"note-attachments", NoteAttachmentViewSet, basename="note-attachment")
router.register(r"contacts", ContactViewSet, basename="contact")
router.register(r"events", CalendarEventViewSet, basename="event")

urlpatterns = [
    path("", include(router.urls)),
    path("google/oauth/start/", GoogleOAuthStartView.as_view(), name="google-oauth-start"),
    path("google/oauth/callback/", GoogleOAuthCallbackView.as_view(), name="google-oauth-callback"),
]
