"""Exact, deterministic validation and split calculation for expenses."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_DOWN, Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from app.models import ApplicationProfile, Expense, ExpenseParticipant, Group, GroupMembership


@dataclass(frozen=True)
class ParticipantInput:
    profile_id: str
    share_amount_minor: int | None = None
    percentage: Decimal | None = None


@dataclass(frozen=True)
class ExpenseInput:
    description: str
    amount_minor: int
    currency: str
    payer_id: str
    split_method: str
    expense_date: date
    participants: list[ParticipantInput]
    source: str = Expense.Source.MANUAL


def expense_input_from_payload(payload: dict[str, Any]) -> ExpenseInput:
    description = str(payload.get("description", "")).strip()
    if not description:
        raise ValidationError({"description": "A description is required."})
    if len(description) > 255:
        raise ValidationError({"description": "Description must be 255 characters or fewer."})

    amount_minor = positive_integer(payload.get("amount_minor"), "amount_minor")
    currency = str(payload.get("currency", "INR")).strip().upper()
    if currency != "INR":
        raise ValidationError({"currency": "Only INR is supported in this MVP."})
    payer_id = str(payload.get("payer_id", "")).strip()
    if not payer_id:
        raise ValidationError({"payer_id": "A payer is required."})
    split_method = str(payload.get("split_method", "")).strip()
    if split_method not in Expense.SplitMethod.values:
        raise ValidationError({"split_method": "Use equal, custom, or percentage."})
    expense_date = parse_expense_date(payload.get("expense_date"))
    raw_participants = payload.get("participants")
    if not isinstance(raw_participants, list) or not raw_participants:
        raise ValidationError({"participants": "Choose at least one participant."})

    participants: list[ParticipantInput] = []
    seen_ids: set[str] = set()
    for item in raw_participants:
        if not isinstance(item, dict):
            raise ValidationError({"participants": "Each participant must be an object."})
        profile_id = str(item.get("profile_id", "")).strip()
        if not profile_id:
            raise ValidationError({"participants": "Each participant needs a profile_id."})
        if profile_id in seen_ids:
            raise ValidationError({"participants": "A member can only appear once."})
        seen_ids.add(profile_id)
        participants.append(
            ParticipantInput(
                profile_id=profile_id,
                share_amount_minor=(
                    non_negative_integer(item.get("share_amount_minor"), "share_amount_minor")
                    if split_method == Expense.SplitMethod.CUSTOM
                    else None
                ),
                percentage=(
                    decimal_percentage(item.get("percentage"))
                    if split_method == Expense.SplitMethod.PERCENTAGE
                    else None
                ),
            )
        )
    source = str(payload.get("source", Expense.Source.MANUAL)).strip()
    if source not in Expense.Source.values:
        raise ValidationError({"source": "Unsupported expense source."})
    return ExpenseInput(
        description=description,
        amount_minor=amount_minor,
        currency=currency,
        payer_id=payer_id,
        split_method=split_method,
        expense_date=expense_date,
        participants=participants,
        source=source,
    )


def positive_integer(value: Any, field: str) -> int:
    try:
        converted = int(value)
    except (TypeError, ValueError) as error:
        raise ValidationError({field: "Use a whole number of paise."}) from error
    if converted <= 0 or str(converted) != str(value).strip():
        raise ValidationError({field: "Use a positive whole number of paise."})
    return converted


def non_negative_integer(value: Any, field: str) -> int:
    try:
        converted = int(value)
    except (TypeError, ValueError) as error:
        raise ValidationError({field: "Use a whole number of paise."}) from error
    if converted < 0 or str(converted) != str(value).strip():
        raise ValidationError({field: "Use a non-negative whole number of paise."})
    return converted


def decimal_percentage(value: Any) -> Decimal:
    try:
        percentage = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as error:
        raise ValidationError({"percentage": "Use a valid percentage."}) from error
    if (
        not percentage.is_finite()
        or percentage < 0
        or percentage > Decimal("100")
    ):
        raise ValidationError({"percentage": "Percentage must be between 0 and 100."})
    if percentage.as_tuple().exponent < -4:
        raise ValidationError({"percentage": "Percentage can have at most four decimal places."})
    return percentage


def parse_expense_date(value: Any) -> date:
    if value in (None, ""):
        return timezone.localdate()
    try:
        return date.fromisoformat(str(value))
    except ValueError as error:
        raise ValidationError({"expense_date": "Use YYYY-MM-DD."}) from error


def active_group_profiles(group: Group) -> dict[str, ApplicationProfile]:
    memberships = GroupMembership.objects.select_related("profile").filter(
        group=group, status=GroupMembership.Status.ACTIVE
    )
    return {str(membership.profile_id): membership.profile for membership in memberships}


def calculate_shares(data: ExpenseInput) -> list[tuple[ParticipantInput, int]]:
    ordered = sorted(data.participants, key=lambda item: item.profile_id)
    if data.split_method == Expense.SplitMethod.EQUAL:
        base, remainder = divmod(data.amount_minor, len(ordered))
        return [
            (participant, base + (index < remainder))
            for index, participant in enumerate(ordered)
        ]
    if data.split_method == Expense.SplitMethod.CUSTOM:
        shares = [(participant, participant.share_amount_minor or 0) for participant in ordered]
        if sum(share for _, share in shares) != data.amount_minor:
            raise ValidationError(
                {"participants": "Custom shares must equal the full expense amount."}
            )
        return shares

    total_percentage = sum((participant.percentage or Decimal("0")) for participant in ordered)
    if total_percentage != Decimal("100"):
        raise ValidationError({"participants": "Percentages must total exactly 100."})
    calculated: list[tuple[ParticipantInput, int, Decimal]] = []
    for participant in ordered:
        raw_share = Decimal(data.amount_minor) * (participant.percentage or Decimal("0")) / 100
        share = int(raw_share.to_integral_value(rounding=ROUND_DOWN))
        calculated.append((participant, share, raw_share - share))
    remaining = data.amount_minor - sum(share for _, share, _ in calculated)
    calculated.sort(key=lambda item: (-item[2], item[0].profile_id))
    for index in range(remaining):
        participant, share, fraction = calculated[index]
        calculated[index] = (participant, share + 1, fraction)
    return [(participant, share) for participant, share, _ in calculated]


def validate_membership(group: Group, data: ExpenseInput) -> dict[str, ApplicationProfile]:
    profiles = active_group_profiles(group)
    if data.payer_id not in profiles:
        raise ValidationError({"payer_id": "The payer must be an active group member."})
    missing_ids = [item.profile_id for item in data.participants if item.profile_id not in profiles]
    if missing_ids:
        raise ValidationError({"participants": "Every participant must be an active group member."})
    return profiles


def create_expense(group: Group, creator: ApplicationProfile, data: ExpenseInput) -> Expense:
    profiles = validate_membership(group, data)
    calculated_shares = calculate_shares(data)
    with transaction.atomic():
        expense = Expense.objects.create(
            group=group,
            description=data.description,
            amount_minor=data.amount_minor,
            currency=data.currency,
            payer=profiles[data.payer_id],
            split_method=data.split_method,
            expense_date=data.expense_date,
            source=data.source,
            created_by=creator,
        )
        ExpenseParticipant.objects.bulk_create(
            [
                ExpenseParticipant(
                    expense=expense,
                    profile=profiles[participant.profile_id],
                    share_amount_minor=share,
                    percentage=participant.percentage,
                )
                for participant, share in calculated_shares
            ]
        )
    return expense


def replace_expense(expense: Expense, editor: ApplicationProfile, data: ExpenseInput) -> Expense:
    profiles = validate_membership(expense.group, data)
    calculated_shares = calculate_shares(data)
    with transaction.atomic():
        expense.description = data.description
        expense.amount_minor = data.amount_minor
        expense.currency = data.currency
        expense.payer = profiles[data.payer_id]
        expense.split_method = data.split_method
        expense.expense_date = data.expense_date
        expense.save()
        expense.participants.all().delete()
        ExpenseParticipant.objects.bulk_create(
            [
                ExpenseParticipant(
                    expense=expense,
                    profile=profiles[participant.profile_id],
                    share_amount_minor=share,
                    percentage=participant.percentage,
                )
                for participant, share in calculated_shares
            ]
        )
    return expense
