from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import EmailAccountViewSet, EmailMessageViewSet

router = DefaultRouter()
router.register(r"email-accounts", EmailAccountViewSet, basename="email-account")
router.register(r"email-messages", EmailMessageViewSet, basename="email-message")

urlpatterns = [
    path("", include(router.urls)),
]