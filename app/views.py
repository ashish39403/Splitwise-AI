from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    """Return a public liveness response without querying application data."""
    return Response({"status": "ok", "service": "splitter-ai-api"})


@api_view(["GET"])
def me(request):
    profile = request.user
    return Response(
        {
            "id": str(profile.id),
            "supabase_user_id": str(profile.supabase_user_id),
            "display_name": profile.display_name,
            "email": profile.email,
        }
    )
