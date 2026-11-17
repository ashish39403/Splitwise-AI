import uuid

from django.db import models


class ApplicationProfile(models.Model):
    """Application identity linked to a Supabase Auth user."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    supabase_user_id = models.UUIDField(unique=True, editable=False)
    display_name = models.CharField(max_length=120)
    email = models.EmailField(blank=True)
    avatar_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.display_name or self.email or str(self.supabase_user_id)
