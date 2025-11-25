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
)

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"profiles", ProfileViewSet, basename="profile")
router.register(r"tasks", TaskViewSet, basename="task")
router.register(r"notes", NoteViewSet, basename="note")
router.register(r"note-attachments", NoteAttachmentViewSet, basename="note-attachment")
router.register(r"contacts", ContactViewSet, basename="contact")
router.register(r"events", CalendarEventViewSet, basename="event")

urlpatterns = [
    path("", include(router.urls)),
]