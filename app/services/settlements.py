"""Validation and persistence service for settlement records."""

from __future__ import annotations

from datetime import date
from typing import Any

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from app.models import ApplicationProfile, Group, Settlement
from app.services.balances import calculate_group_balances
from app.services.expenses import positive_integer


def settlement_input_from_payload(payload: dict[str, Any]) -> dict[str, Any]:
    payer_id = str(payload.get("payer_id", "")).strip()
    receiver_id = str(payload.get("receiver_id", "")).strip()
    if not payer_id or not receiver_id:
        raise ValidationError({"detail": "Both payer and receiver are required."})
    if payer_id == receiver_id:
        raise ValidationError({"receiver_id": "Payer and receiver must be different members."})
    currency = str(payload.get("currency", "INR")).strip().upper()
    if currency != "INR":
        raise ValidationError({"currency": "Only INR is supported in this MVP."})
    note = str(payload.get("note", "")).strip()
    if len(note) > 2000:
        raise ValidationError({"note": "Note must be 2000 characters or fewer."})
    return {
        "payer_id": payer_id,
        "receiver_id": receiver_id,
        "amount_minor": positive_integer(payload.get("amount_minor"), "amount_minor"),
        "currency": currency,
        "settled_on": parse_settled_on(payload.get("settled_on")),
        "note": note,
    }


def parse_settled_on(value: Any) -> date:
    if value in (None, ""):
        return timezone.localdate()
    try:
        return date.fromisoformat(str(value))
    except ValueError as error:
        raise ValidationError({"settled_on": "Use YYYY-MM-DD."}) from error


def create_settlement(
    group: Group, creator: ApplicationProfile, payload: dict[str, Any]
) -> Settlement:
    data = settlement_input_from_payload(payload)
    with transaction.atomic():
        # Serialize settlements for this group so two concurrent requests cannot
        # both read the same pre-settlement balances and over-settle the debt.
        Group.objects.select_for_update().get(pk=group.pk)
        balances = {
            str(item.profile.id): item.amount_minor for item in calculate_group_balances(group)
        }
        payer_balance = balances.get(data["payer_id"])
        receiver_balance = balances.get(data["receiver_id"])
        if payer_balance is None or receiver_balance is None:
            raise ValidationError({"detail": "Payer and receiver must be active group members."})
        if payer_balance >= 0 or receiver_balance <= 0:
            raise ValidationError(
                {"detail": "Settlement must be from a member who owes to one who should receive."}
            )
        maximum = min(-payer_balance, receiver_balance)
        if data["amount_minor"] > maximum:
            raise ValidationError({"amount_minor": "Settlement exceeds the outstanding balance."})
        return Settlement.objects.create(group=group, created_by=creator, **data)
