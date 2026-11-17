"""Derived balances and deterministic debt simplification."""

from __future__ import annotations

from dataclasses import dataclass

from rest_framework.exceptions import ValidationError

from app.models import ApplicationProfile, Expense, Group, GroupMembership, Settlement


@dataclass(frozen=True)
class MemberBalance:
    profile: ApplicationProfile
    amount_minor: int


@dataclass(frozen=True)
class SettlementRecommendation:
    payer: ApplicationProfile
    receiver: ApplicationProfile
    amount_minor: int


def validate_single_balance_currency(group: Group) -> None:
    """Reject financial history that would otherwise be added across currencies."""
    expense_currencies = Expense.objects.filter(
        group=group, deleted_at__isnull=True
    ).values_list("currency", flat=True)
    settlement_currencies = Settlement.objects.filter(
        group=group,
        status__in=[Settlement.Status.RECORDED, Settlement.Status.CONFIRMED],
    ).values_list("currency", flat=True)
    currencies = {currency.upper() for currency in expense_currencies}
    currencies.update(currency.upper() for currency in settlement_currencies)
    if len(currencies) > 1:
        raise ValidationError(
            {"currency": "Balances cannot be calculated across multiple currencies."}
        )


def calculate_group_balances(group: Group) -> list[MemberBalance]:
    """Derive each active member's net balance from immutable source records."""
    validate_single_balance_currency(group)
    members = list(
        GroupMembership.objects.select_related("profile")
        .filter(group=group, status=GroupMembership.Status.ACTIVE)
        .order_by("profile_id")
    )
    profiles = {membership.profile_id: membership.profile for membership in members}
    totals = {profile_id: 0 for profile_id in profiles}

    expenses = (
        Expense.objects.filter(group=group, deleted_at__isnull=True)
        .prefetch_related("participants")
        .only("id", "payer_id", "amount_minor")
    )
    for expense in expenses:
        if expense.payer_id in totals:
            totals[expense.payer_id] += expense.amount_minor
        for participant in expense.participants.all():
            if participant.profile_id in totals:
                totals[participant.profile_id] -= participant.share_amount_minor

    settlements = Settlement.objects.filter(
        group=group,
        status__in=[Settlement.Status.RECORDED, Settlement.Status.CONFIRMED],
    ).only("payer_id", "receiver_id", "amount_minor")
    for settlement in settlements:
        if settlement.payer_id in totals:
            totals[settlement.payer_id] += settlement.amount_minor
        if settlement.receiver_id in totals:
            totals[settlement.receiver_id] -= settlement.amount_minor

    return [
        MemberBalance(profile=profiles[profile_id], amount_minor=totals[profile_id])
        for profile_id in profiles
    ]


def simplify_debts(balances: list[MemberBalance]) -> list[SettlementRecommendation]:
    """Minimize transfers while preserving exactly the same net balances."""
    creditors = sorted(
        [(item.profile, item.amount_minor) for item in balances if item.amount_minor > 0],
        key=lambda item: (-item[1], str(item[0].id)),
    )
    debtors = sorted(
        [(item.profile, -item.amount_minor) for item in balances if item.amount_minor < 0],
        key=lambda item: (-item[1], str(item[0].id)),
    )
    recommendations: list[SettlementRecommendation] = []
    creditor_index = 0
    debtor_index = 0
    while creditor_index < len(creditors) and debtor_index < len(debtors):
        receiver, receivable = creditors[creditor_index]
        payer, payable = debtors[debtor_index]
        amount = min(receivable, payable)
        recommendations.append(
            SettlementRecommendation(payer=payer, receiver=receiver, amount_minor=amount)
        )
        creditors[creditor_index] = (receiver, receivable - amount)
        debtors[debtor_index] = (payer, payable - amount)
        if creditors[creditor_index][1] == 0:
            creditor_index += 1
        if debtors[debtor_index][1] == 0:
            debtor_index += 1
    return recommendations
