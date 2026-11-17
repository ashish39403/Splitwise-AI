from django.urls import path

from app.views import health_check, me

urlpatterns = [
    path("health/", health_check, name="health-check"),
    path("me/", me, name="me"),
]
