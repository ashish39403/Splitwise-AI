from django.urls import path

from app.views import (
    ai_quick_add,
    demo_workspace,
    group_balances,
    group_detail,
    group_expense_detail,
    group_expenses,
    group_member_detail,
    group_members,
    group_settlement_detail,
    group_settlements,
    groups,
    health_check,
    me,
)

urlpatterns = [
    path("health/", health_check, name="health-check"),
    path("me/", me, name="me"),
    path("demo/workspace/", demo_workspace, name="demo-workspace"),
    path("groups/", groups, name="groups"),
    path("groups/<uuid:group_id>/", group_detail, name="group-detail"),
    path("groups/<uuid:group_id>/members/", group_members, name="group-members"),
    path(
        "groups/<uuid:group_id>/members/<uuid:profile_id>/",
        group_member_detail,
        name="group-member-detail",
    ),
    path("groups/<uuid:group_id>/expenses/", group_expenses, name="group-expenses"),
    path(
        "groups/<uuid:group_id>/expenses/<uuid:expense_id>/",
        group_expense_detail,
        name="group-expense-detail",
    ),
    path("groups/<uuid:group_id>/ai/quick-add/", ai_quick_add, name="ai-quick-add"),
    path("groups/<uuid:group_id>/balances/", group_balances, name="group-balances"),
    path("groups/<uuid:group_id>/settlements/", group_settlements, name="group-settlements"),
    path(
        "groups/<uuid:group_id>/settlements/<uuid:settlement_id>/",
        group_settlement_detail,
        name="group-settlement-detail",
    ),
]
