"""JWT authentication for Neon Managed Auth."""

import jwt
from django.conf import settings
from rest_framework import authentication, exceptions

from app.models import ApplicationProfile


class NeonAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        parts = authentication.get_authorization_header(request).split()
        if not parts:
            return None
        if len(parts) != 2 or parts[0].lower() != b"bearer":
            raise exceptions.AuthenticationFailed("Use a Bearer access token.")
        if not settings.NEON_AUTH_JWKS_URL or not settings.NEON_AUTH_BASE_URL:
            raise exceptions.AuthenticationFailed("Neon Auth is not configured.")
        try:
            key = (
                jwt.PyJWKClient(settings.NEON_AUTH_JWKS_URL).get_signing_key_from_jwt(parts[1]).key
            )
            claims = jwt.decode(
                parts[1], key, algorithms=["EdDSA"], issuer=settings.NEON_AUTH_BASE_URL
            )
        except jwt.PyJWTError as error:
            raise exceptions.AuthenticationFailed("Invalid or expired Neon Auth token.") from error
        user_id = claims.get("sub")
        if not user_id:
            raise exceptions.AuthenticationFailed("Neon Auth token has no subject.")
        profile, _ = ApplicationProfile.objects.get_or_create(
            neon_auth_user_id=user_id,
            defaults={
                "display_name": claims.get("name") or "User",
                "email": claims.get("email") or "",
            },
        )
        return profile, parts[1].decode()
