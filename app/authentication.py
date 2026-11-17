"""Django REST Framework authentication backed by Supabase Auth."""

import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from rest_framework import authentication, exceptions

from app.models import ApplicationProfile


class SupabaseAuthentication(authentication.BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).split()
        if not header:
            return None
        if len(header) != 2 or header[0].lower() != self.keyword.lower().encode():
            raise exceptions.AuthenticationFailed("Use a Bearer access token.")
        if not settings.SUPABASE_URL or not settings.SUPABASE_PUBLISHABLE_KEY:
            raise exceptions.AuthenticationFailed("Supabase authentication is not configured.")

        token = header[1].decode("utf-8")
        auth_request = Request(
            f"{settings.SUPABASE_URL}/auth/v1/user",
            headers={
                "apikey": settings.SUPABASE_PUBLISHABLE_KEY,
                "Authorization": f"Bearer {token}",
            },
        )
        try:
            with urlopen(auth_request, timeout=5) as response:  # nosec B310 - configured HTTPS URL
                user = json.loads(response.read())
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            raise exceptions.AuthenticationFailed("Invalid or expired Supabase access token.") from error

        user_id = user.get("id")
        if not user_id:
            raise exceptions.AuthenticationFailed("Supabase user response is missing an id.")
        metadata = user.get("user_metadata") or {}
        display_name = metadata.get("full_name") or metadata.get("name") or user.get("email", "").split("@")[0]
        profile, _ = ApplicationProfile.objects.get_or_create(
            supabase_user_id=user_id,
            defaults={"display_name": display_name[:120], "email": user.get("email", "")},
        )
        return (profile, token)
