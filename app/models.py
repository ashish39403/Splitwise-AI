import uuid

from django.db import models
from django.db.models import Q
from django.utils import timezone


class ApplicationProfile(models.Model):
    """Application identity linked to a Neon Auth user."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    neon_auth_user_id = models.UUIDField(unique=True, editable=False)
    display_name = models.CharField(max_length=120)
    email = models.EmailField(blank=True)
    avatar_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.display_name or self.email or str(self.neon_auth_user_id)

    @property
    def is_authenticated(self) -> bool:
        """Satisfy Django/DRF's authenticated-user contract for verified JWTs."""
        return True

    @property
    def is_anonymous(self) -> bool:
        return False


class Group(models.Model):
    """A collection of profiles that share expenses."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(
        ApplicationProfile,
        on_delete=models.PROTECT,
        related_name="groups_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return self.name


class GroupMembership(models.Model):
    """A profile's role and membership state inside a group."""

    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        MEMBER = "member", "Member"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INVITED = "invited", "Invited"
        LEFT = "left", "Left"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="memberships")
    profile = models.ForeignKey(
        ApplicationProfile,
        on_delete=models.PROTECT,
        related_name="group_memberships",
    )
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.MEMBER)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["group", "profile"], name="unique_group_membership"),
        ]
        indexes = [models.Index(fields=["group", "profile"])]

    def __str__(self) -> str:
        return f"{self.profile} in {self.group}"


class Expense(models.Model):
    """The immutable financial event behind a shared expense."""

    class SplitMethod(models.TextChoices):
        EQUAL = "equal", "Equal"
        CUSTOM = "custom", "Custom"
        PERCENTAGE = "percentage", "Percentage"

    class Source(models.TextChoices):
        MANUAL = "manual", "Manual"
        AI_QUICK_ADD = "ai_quick_add", "AI Quick Add"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="expenses")
    description = models.CharField(max_length=255)
    amount_minor = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    payer = models.ForeignKey(
        ApplicationProfile,
        on_delete=models.PROTECT,
        related_name="expenses_paid",
    )
    split_method = models.CharField(max_length=12, choices=SplitMethod.choices)
    expense_date = models.DateField(default=timezone.localdate)
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.MANUAL)
    created_by = models.ForeignKey(
        ApplicationProfile,
        on_delete=models.PROTECT,
        related_name="expenses_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-expense_date", "-created_at"]
        indexes = [
            models.Index(fields=["group", "expense_date"]),
            models.Index(fields=["payer"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount_minor__gt=0), name="expense_amount_is_positive"
            ),
        ]

    def __str__(self) -> str:
        return self.description


class ExpenseParticipant(models.Model):
    """One group member's calculated responsibility for an expense."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name="participants")
    profile = models.ForeignKey(
        ApplicationProfile,
        on_delete=models.PROTECT,
        related_name="expense_participations",
    )
    share_amount_minor = models.PositiveBigIntegerField()
    percentage = models.DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["expense", "profile"], name="unique_expense_participant"
            ),
        ]
        indexes = [models.Index(fields=["expense", "profile"])]

    def __str__(self) -> str:
        return f"{self.profile}: {self.share_amount_minor}"


class Settlement(models.Model):
    """A user-recorded repayment between two members of one group."""

    class Status(models.TextChoices):
        RECORDED = "recorded", "Recorded"
        CONFIRMED = "confirmed", "Confirmed"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="settlements")
    payer = models.ForeignKey(
        ApplicationProfile,
        on_delete=models.PROTECT,
        related_name="settlements_paid",
    )
    receiver = models.ForeignKey(
        ApplicationProfile,
        on_delete=models.PROTECT,
        related_name="settlements_received",
    )
    amount_minor = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    settled_on = models.DateField(default=timezone.localdate)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.RECORDED)
    note = models.TextField(blank=True)
    created_by = models.ForeignKey(
        ApplicationProfile,
        on_delete=models.PROTECT,
        related_name="settlements_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-settled_on", "-created_at"]
        indexes = [models.Index(fields=["group", "settled_on"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount_minor__gt=0), name="settlement_amount_is_positive"
            ),
            models.CheckConstraint(
                condition=~Q(payer=models.F("receiver")), name="settlement_parties_differ"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.payer} paid {self.receiver} {self.amount_minor}"
