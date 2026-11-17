"""Rate limits for expensive endpoints."""

from rest_framework.throttling import UserRateThrottle


class AIQuickAddThrottle(UserRateThrottle):
    scope = "ai_quick_add"
