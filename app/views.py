from django.conf import settings
from django.core.paginator import EmptyPage, Paginator
from django.db import IntegrityError, transaction
from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from app.models import (
    ApplicationProfile,
    Expense,
    ExpenseParticipant,
    Group,
    GroupMembership,
    Settlement,
)
from app.services.ai_quick_add import build_quick_add_proposal
from app.services.balances import calculate_group_balances, simplify_debts
from app.services.demo import create_demo_workspace
from app.services.expenses import create_expense, expense_input_from_payload, replace_expense
from app.services.settlements import create_settlement
from app.throttling import AIQuickAddThrottle


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
            "neon_auth_user_id": str(profile.neon_auth_user_id),
            "display_name": profile.display_name,
            "email": profile.email,
        }
    )


def membership_payload(membership: GroupMembership) -> dict[str, str]:
    profile = membership.profile
    return {
        "id": str(profile.id),
        "display_name": profile.display_name,
        "email": profile.email,
        "role": membership.role,
        "status": membership.status,
        "joined_at": membership.joined_at.isoformat(),
    }


def group_payload(
    group: Group,
    membership: GroupMembership | None = None,
    member_count: int | None = None,
) -> dict[str, object]:
    count = (
        member_count
        if member_count is not None
        else group.memberships.filter(status=GroupMembership.Status.ACTIVE).count()
    )
    payload: dict[str, object] = {
        "id": str(group.id),
        "name": group.name,
        "description": group.description,
        "created_by": str(group.created_by_id),
        "created_at": group.created_at.isoformat(),
        "updated_at": group.updated_at.isoformat(),
        "member_count": count,
    }
    if membership:
        payload["current_membership"] = {
            "profile_id": str(membership.profile_id),
            "role": membership.role,
            "status": membership.status,
        }
    return payload


def active_membership_or_404(group_id: str, profile: ApplicationProfile) -> GroupMembership:
    membership = (
        GroupMembership.objects.select_related("group", "profile")
        .filter(group_id=group_id, profile=profile, status=GroupMembership.Status.ACTIVE)
        .first()
    )
    if not membership:
        raise NotFound("Group not found.")
    return membership


def require_group_admin(membership: GroupMembership) -> None:
    if membership.role != GroupMembership.Role.ADMIN:
        raise PermissionDenied("Only group administrators can manage members.")


def paginated_response(request, queryset, payload_builder):
    """Return a pagination envelope only when a caller explicitly asks for one."""
    if "page" not in request.query_params and "page_size" not in request.query_params:
        return None
    try:
        page_number = int(request.query_params.get("page", "1"))
        page_size = int(request.query_params.get("page_size", "25"))
    except ValueError as error:
        raise ValidationError(
            {"pagination": "page and page_size must be whole numbers."}
        ) from error
    if page_number < 1 or not 1 <= page_size <= 100:
        raise ValidationError(
            {"pagination": "page must be positive and page_size must be 1 to 100."}
        )
    paginator = Paginator(queryset, page_size)
    try:
        page = paginator.page(page_number)
    except EmptyPage as error:
        raise NotFound("Page not found.") from error
    return Response(
        {
            "count": paginator.count,
            "page": page.number,
            "page_size": page_size,
            "next": page.next_page_number() if page.has_next() else None,
            "previous": page.previous_page_number() if page.has_previous() else None,
            "results": [payload_builder(item) for item in page.object_list],
        }
    )


@api_view(["GET", "POST"])
def groups(request):
    if request.method == "GET":
        memberships = (
            GroupMembership.objects.select_related("group", "group__created_by")
            .filter(profile=request.user, status=GroupMembership.Status.ACTIVE)
            .annotate(
                active_member_count=Count(
                    "group__memberships",
                    filter=Q(group__memberships__status=GroupMembership.Status.ACTIVE),
                    distinct=True,
                )
            )
            .order_by("-group__updated_at")
        )
        return Response(
            [group_payload(item.group, item, item.active_member_count) for item in memberships]
        )

    name = str(request.data.get("name", "")).strip()
    description = str(request.data.get("description", "")).strip()
    if not name:
        raise ValidationError({"name": "A group name is required."})
    if len(name) > 120:
        raise ValidationError({"name": "Group name must be 120 characters or fewer."})
    if len(description) > 2000:
        raise ValidationError({"description": "Description must be 2000 characters or fewer."})

    with transaction.atomic():
        group = Group.objects.create(name=name, description=description, created_by=request.user)
        membership = GroupMembership.objects.create(
            group=group,
            profile=request.user,
            role=GroupMembership.Role.ADMIN,
        )
    return Response(group_payload(group, membership), status=status.HTTP_201_CREATED)


@api_view(["GET"])
def group_detail(request, group_id: str):
    current_membership = active_membership_or_404(group_id, request.user)
    group = current_membership.group
    members = (
        GroupMembership.objects.select_related("profile")
        .filter(group=group, status=GroupMembership.Status.ACTIVE)
        .order_by("joined_at")
    )
    payload = group_payload(group, current_membership)
    payload["members"] = [membership_payload(member) for member in members]
    return Response(payload)


@api_view(["POST"])
def demo_workspace(request):
    """Create a local-only sample group without masking normal API failures."""
    if not settings.DEBUG:
        raise NotFound("Demo workspaces are unavailable.")
    group = create_demo_workspace(request.user)
    membership = GroupMembership.objects.select_related("group").get(
        group=group,
        profile=request.user,
    )
    return Response(group_payload(group, membership), status=status.HTTP_201_CREATED)


@api_view(["POST"])
def group_members(request, group_id: str):
    current_membership = active_membership_or_404(group_id, request.user)
    require_group_admin(current_membership)
    email = str(request.data.get("email", "")).strip().lower()
    role = str(request.data.get("role", GroupMembership.Role.MEMBER))
    if not email:
        raise ValidationError({"email": "An existing user's email is required."})
    if role not in GroupMembership.Role.values:
        raise ValidationError({"role": "Role must be admin or member."})
    profile = ApplicationProfile.objects.filter(email__iexact=email).first()
    if not profile:
        raise ValidationError({"email": "No registered Splitter AI user has this email yet."})
    with transaction.atomic():
        membership = (
            GroupMembership.objects.select_for_update()
            .filter(group_id=group_id, profile=profile)
            .first()
        )
        if membership and membership.status == GroupMembership.Status.ACTIVE:
            raise ValidationError({"email": "This user is already a group member."})
        if membership:
            membership.status = GroupMembership.Status.ACTIVE
            membership.role = role
            membership.joined_at = timezone.now()
            membership.save(update_fields=["status", "role", "joined_at"])
        else:
            try:
                membership = GroupMembership.objects.create(
                    group_id=group_id, profile=profile, role=role
                )
            except IntegrityError as error:
                raise ValidationError({"email": "This user is already a group member."}) from error
    return Response(membership_payload(membership), status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
def group_member_detail(request, group_id: str, profile_id: str):
    current_membership = active_membership_or_404(group_id, request.user)
    require_group_admin(current_membership)
    group = current_membership.group
    if str(group.created_by_id) == profile_id:
        raise ValidationError({"detail": "The group creator cannot be removed."})
    membership = get_object_or_404(GroupMembership, group=group, profile_id=profile_id)
    has_expense_history = Expense.objects.filter(group=group).filter(
        Q(payer_id=profile_id) | Q(participants__profile_id=profile_id)
    ).exists()
    has_settlement_history = Settlement.objects.filter(group=group).filter(
        Q(payer_id=profile_id) | Q(receiver_id=profile_id)
    ).exists()
    if has_expense_history or has_settlement_history:
        raise ValidationError(
            {"detail": "Members with expense or settlement history cannot be removed."}
        )
    membership.status = GroupMembership.Status.LEFT
    membership.save(update_fields=["status"])
    return Response(status=status.HTTP_204_NO_CONTENT)


def participant_payload(participant: ExpenseParticipant) -> dict[str, object]:
    return {
        "profile_id": str(participant.profile_id),
        "display_name": participant.profile.display_name,
        "share_amount_minor": participant.share_amount_minor,
        "percentage": str(participant.percentage) if participant.percentage is not None else None,
    }


def expense_payload(expense: Expense) -> dict[str, object]:
    participants = expense.participants.all()
    return {
        "id": str(expense.id),
        "group_id": str(expense.group_id),
        "description": expense.description,
        "amount_minor": expense.amount_minor,
        "currency": expense.currency,
        "payer": {"id": str(expense.payer_id), "display_name": expense.payer.display_name},
        "split_method": expense.split_method,
        "expense_date": expense.expense_date.isoformat(),
        "source": expense.source,
        "created_by": str(expense.created_by_id),
        "created_at": expense.created_at.isoformat(),
        "updated_at": expense.updated_at.isoformat(),
        "participants": [participant_payload(participant) for participant in participants],
    }


def active_expense_or_404(group: Group, expense_id: str) -> Expense:
    expense = (
        Expense.objects.select_related("payer", "created_by").prefetch_related(
            Prefetch(
                "participants",
                queryset=ExpenseParticipant.objects.select_related("profile").order_by("profile_id"),
            )
        )
        .filter(id=expense_id, group=group, deleted_at__isnull=True)
        .first()
    )
    if not expense:
        raise NotFound("Expense not found.")
    return expense


def can_manage_expense(membership: GroupMembership, expense: Expense) -> bool:
    return (
        membership.role == GroupMembership.Role.ADMIN
        or expense.created_by_id == membership.profile_id
    )


def can_manage_settlement(membership: GroupMembership, settlement: Settlement) -> bool:
    return (
        membership.role == GroupMembership.Role.ADMIN
        or settlement.created_by_id == membership.profile_id
    )


@api_view(["GET", "POST"])
def group_expenses(request, group_id: str):
    membership = active_membership_or_404(group_id, request.user)
    group = membership.group
    if request.method == "GET":
        expenses = (
            Expense.objects.select_related("payer", "created_by").prefetch_related(
                Prefetch(
                    "participants",
                    queryset=ExpenseParticipant.objects.select_related("profile").order_by("profile_id"),
                )
            )
            .filter(group=group, deleted_at__isnull=True)
            .order_by("-expense_date", "-created_at")
        )
        paginated = paginated_response(request, expenses, expense_payload)
        if paginated:
            return paginated
        return Response([expense_payload(expense) for expense in expenses])

    data = expense_input_from_payload(request.data)
    expense = create_expense(group, request.user, data)
    expense = (
        Expense.objects.select_related("payer", "created_by")
        .prefetch_related(
            Prefetch(
                "participants",
                queryset=ExpenseParticipant.objects.select_related("profile").order_by("profile_id"),
            )
        )
        .get(id=expense.id)
    )
    return Response(expense_payload(expense), status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH", "DELETE"])
def group_expense_detail(request, group_id: str, expense_id: str):
    membership = active_membership_or_404(group_id, request.user)
    expense = active_expense_or_404(membership.group, expense_id)
    if request.method == "GET":
        return Response(expense_payload(expense))
    if not can_manage_expense(membership, expense):
        raise PermissionDenied("Only the expense creator or a group admin can change this expense.")
    if request.method == "DELETE":
        expense.deleted_at = timezone.now()
        expense.save(update_fields=["deleted_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    data = expense_input_from_payload(request.data)
    updated_expense = replace_expense(expense, request.user, data)
    updated_expense = (
        Expense.objects.select_related("payer", "created_by")
        .prefetch_related(
            Prefetch(
                "participants",
                queryset=ExpenseParticipant.objects.select_related("profile").order_by("profile_id"),
            )
        )
        .get(id=updated_expense.id)
    )
    return Response(expense_payload(updated_expense))


def balance_payload(group: Group) -> dict[str, object]:
    balances = calculate_group_balances(group)
    recommendations = simplify_debts(balances)
    return {
        "members": [
            {
                "profile_id": str(item.profile.id),
                "display_name": item.profile.display_name,
                "net_balance_minor": item.amount_minor,
            }
            for item in balances
        ],
        "recommendations": [
            {
                "payer_id": str(item.payer.id),
                "payer_name": item.payer.display_name,
                "receiver_id": str(item.receiver.id),
                "receiver_name": item.receiver.display_name,
                "amount_minor": item.amount_minor,
            }
            for item in recommendations
        ],
    }


def settlement_payload(settlement: Settlement) -> dict[str, object]:
    return {
        "id": str(settlement.id),
        "group_id": str(settlement.group_id),
        "payer": {"id": str(settlement.payer_id), "display_name": settlement.payer.display_name},
        "receiver": {
            "id": str(settlement.receiver_id),
            "display_name": settlement.receiver.display_name,
        },
        "amount_minor": settlement.amount_minor,
        "currency": settlement.currency,
        "settled_on": settlement.settled_on.isoformat(),
        "status": settlement.status,
        "note": settlement.note,
        "created_by": str(settlement.created_by_id),
        "created_at": settlement.created_at.isoformat(),
    }


def active_settlement_or_404(group: Group, settlement_id: str) -> Settlement:
    settlement = (
        Settlement.objects.select_related("payer", "receiver")
        .filter(id=settlement_id, group=group)
        .first()
    )
    if not settlement:
        raise NotFound("Settlement not found.")
    return settlement


@api_view(["GET"])
def group_balances(request, group_id: str):
    membership = active_membership_or_404(group_id, request.user)
    return Response(balance_payload(membership.group))


@api_view(["GET", "POST"])
def group_settlements(request, group_id: str):
    membership = active_membership_or_404(group_id, request.user)
    group = membership.group
    if request.method == "GET":
        settlements = Settlement.objects.select_related("payer", "receiver").filter(group=group)
        paginated = paginated_response(request, settlements, settlement_payload)
        if paginated:
            return paginated
        return Response([settlement_payload(item) for item in settlements])
    settlement = create_settlement(group, request.user, request.data)
    settlement = Settlement.objects.select_related("payer", "receiver").get(id=settlement.id)
    return Response(settlement_payload(settlement), status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
def group_settlement_detail(request, group_id: str, settlement_id: str):
    membership = active_membership_or_404(group_id, request.user)
    settlement = active_settlement_or_404(membership.group, settlement_id)
    if not can_manage_settlement(membership, settlement):
        raise PermissionDenied("Only the settlement creator or a group admin can change it.")
    next_status = str(request.data.get("status", ""))
    if next_status not in {Settlement.Status.CONFIRMED, Settlement.Status.CANCELLED}:
        raise ValidationError({"status": "Settlement may be confirmed or cancelled."})
    if settlement.status != Settlement.Status.RECORDED:
        raise ValidationError({"status": "Only a recorded settlement can be changed."})
    settlement.status = next_status
    settlement.save(update_fields=["status"])
    return Response(settlement_payload(settlement))


@api_view(["POST"])
@throttle_classes([AIQuickAddThrottle])
def ai_quick_add(request, group_id: str):
    """Return a validated draft only; the user must still confirm and save it."""
    membership = active_membership_or_404(group_id, request.user)
    text = str(request.data.get("text", "")).strip()
    if not text:
        raise ValidationError({"text": "Describe the expense you want to add."})
    if len(text) > 1000:
        raise ValidationError({"text": "Keep the description under 1000 characters."})
    return Response(build_quick_add_proposal(text, membership.group, request.user))
