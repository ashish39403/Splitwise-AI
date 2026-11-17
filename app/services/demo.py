"""Development-only sample workspace creation for local product demos."""

from __future__ import annotations

from datetime import date, timedelta
from uuid import NAMESPACE_URL, uuid5

from django.db import transaction

from app.models import ApplicationProfile, Expense, ExpenseParticipant, Group, GroupMembership

DEMO_GROUP_NAME = "Goa Trip 2025"
DEMO_MEMBERS = (
    ("Riya", "riya.demo@splitter.local"),
    ("Karan", "karan.demo@splitter.local"),
    ("Sahil", "sahil.demo@splitter.local"),
    ("Diya", "diya.demo@splitter.local"),
)
DEMO_EXPENSES = (
    ("Hotel (3 nights)", 2_400_000, 0, "Hotel stay"),
    ("Cab (Airport → Hotel)", 250_000, 1, "Airport transfer"),
    ("Dinner at Thalassa", 675_000, 2, "Group dinner"),
    ("Water Sports", 500_000, 1, "Beach activities"),
    ("Lunch at Beach Shack", 325_000, 3, "Lunch"),
    ("Scooter Rental", 300_000, 3, "Two-day rental"),
    ("Cafe & Snacks", 175_000, 0, "Coffee break"),
)


def create_demo_workspace(owner: ApplicationProfile) -> Group:
    """Create one idempotent, fully-derived workspace for the signed-in user."""
    existing = Group.objects.filter(name=DEMO_GROUP_NAME, created_by=owner).first()
    if existing:
        return existing

    with transaction.atomic():
        group = Group.objects.create(
            name=DEMO_GROUP_NAME,
            description="A sample trip workspace for exploring Splitter AI.",
            created_by=owner,
        )
        GroupMembership.objects.create(
            group=group,
            profile=owner,
            role=GroupMembership.Role.ADMIN,
        )
        profiles = [owner]
        for display_name, email in DEMO_MEMBERS:
            profile, _ = ApplicationProfile.objects.get_or_create(
                neon_auth_user_id=uuid5(NAMESPACE_URL, f"splitter-demo:{email}"),
                defaults={"display_name": display_name, "email": email},
            )
            GroupMembership.objects.get_or_create(group=group, profile=profile)
            profiles.append(profile)

        for index, (description, amount_minor, payer_index, _note) in enumerate(DEMO_EXPENSES):
            expense = Expense.objects.create(
                group=group,
                description=description,
                amount_minor=amount_minor,
                payer=profiles[payer_index + 1],
                split_method=Expense.SplitMethod.EQUAL,
                expense_date=date.today() - timedelta(days=index),
                source=Expense.Source.MANUAL,
                created_by=owner,
            )
            share_minor = amount_minor // len(profiles)
            ExpenseParticipant.objects.bulk_create(
                [
                    ExpenseParticipant(
                        expense=expense,
                        profile=profile,
                        share_amount_minor=share_minor,
                    )
                    for profile in profiles
                ]
            )
    return group
