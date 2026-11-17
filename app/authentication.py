"""JWT authentication for Neon Managed Auth."""

import logging
from functools import lru_cache
from urllib.parse import urlparse
from uuid import UUID

import jwt
from django.conf import settings
from rest_framework import authentication, exceptions

from app.models import ApplicationProfile

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def jwk_client() -> jwt.PyJWKClient:
    """Reuse one JWKS client so signing keys are cached across requests."""
    return jwt.PyJWKClient(settings.NEON_AUTH_JWKS_URL)


def neon_auth_origin() -> str:
    """Neon signs JWTs with `iss` and `aud` set to the auth URL's origin only."""
    parsed = urlparse(settings.NEON_AUTH_BASE_URL)
    if not parsed.scheme or not parsed.netloc:
        raise exceptions.AuthenticationFailed("Neon Auth is not configured.")
    return f"{parsed.scheme}://{parsed.netloc}"


class NeonAuthentication(authentication.BaseAuthentication):
    def authenticate_header(self, request):
        """Let DRF return a proper 401 (instead of 403) for a missing/invalid token."""
        return 'Bearer realm="api"'

    def authenticate(self, request):
        parts = authentication.get_authorization_header(request).split()
        if not parts:
            return None
        if len(parts) != 2 or parts[0].lower() != b"bearer":
            raise exceptions.AuthenticationFailed("Use a Bearer access token.")
        if not settings.NEON_AUTH_JWKS_URL or not settings.NEON_AUTH_BASE_URL:
            raise exceptions.AuthenticationFailed("Neon Auth is not configured.")

        origin = neon_auth_origin()
        try:
            key = jwk_client().get_signing_key_from_jwt(parts[1]).key
            claims = jwt.decode(
                parts[1],
                key,
                algorithms=["EdDSA"],
                issuer=origin,
                audience=origin,
                leeway=settings.NEON_AUTH_CLOCK_SKEW_SECONDS,
            )
        except (jwt.PyJWTError, OSError) as error:
            # PyJWTError covers bad signatures/claims; OSError covers an unreachable JWKS URL.
            # Log the failure *reason* (never the token) so token/refresh issues can be diagnosed.
            logger.warning(
                "Neon Auth token rejected: %s: %s",
                type(error).__name__,
                error,
            )
            raise exceptions.AuthenticationFailed("Invalid or expired Neon Auth token.") from error

        try:
            user_id = UUID(str(claims.get("sub")))
        except (ValueError, TypeError, AttributeError) as error:
            raise exceptions.AuthenticationFailed(
                "Neon Auth token has an invalid subject."
            ) from error

        profile, _ = ApplicationProfile.objects.get_or_create(
            neon_auth_user_id=user_id,
            defaults={
                "display_name": claims.get("name") or "User",
                "email": claims.get("email") or "",
            },
        )
        return profile, parts[1].decode()
