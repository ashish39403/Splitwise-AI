"""API tests for foundation and group-management workflows."""

import uuid
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import Mock, patch

import jwt
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from app import authentication as neon_authentication
from app.models import (
    ApplicationProfile,
    Expense,
    ExpenseParticipant,
    Group,
    GroupMembership,
    Settlement,
)
from app.services.ai_quick_add import AIExpenseProposal, AIParticipant, AIServiceUnavailable


class HealthCheckTests(SimpleTestCase):
    def test_health_check_returns_service_status(self):
        response = self.client.get("/api/health/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "service": "splitter-ai-api"})


@override_settings(
    NEON_AUTH_BASE_URL="https://auth.example.test/neondb/auth",
    NEON_AUTH_JWKS_URL="https://auth.example.test/neondb/auth/.well-known/jwks.json",
)
class NeonAuthenticationTests(APITestCase):
    def setUp(self):
        self.private_key = Ed25519PrivateKey.generate()
        self.public_key = self.private_key.public_key()
        self.auth_origin = "https://auth.example.test"

    def token(self, subject: str, issued_at=None) -> str:
        claims = {
            "sub": subject,
            "iss": self.auth_origin,
            "aud": self.auth_origin,
            "exp": timezone.now() + timedelta(minutes=5),
            "email": "person@example.com",
            "name": "Person",
        }
        if issued_at is not None:
            claims["iat"] = issued_at
        return jwt.encode(claims, self.private_key, algorithm="EdDSA")

    def authenticated_get(self, token: str):
        jwk_client = Mock()
        jwk_client.get_signing_key_from_jwt.return_value = SimpleNamespace(key=self.public_key)
        neon_authentication.jwk_client.cache_clear()
        with patch.object(neon_authentication.jwt, "PyJWKClient", return_value=jwk_client):
            return self.client.get("/api/me/", HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_neon_token_with_origin_issuer_and_audience_authenticates(self):
        response = self.authenticated_get(self.token(str(uuid.uuid4())))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["email"], "person@example.com")

    def test_non_uuid_neon_subject_returns_401_not_500(self):
        response = self.authenticated_get(self.token("not-a-uuid"))

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["detail"], "Neon Auth token has an invalid subject.")

    @override_settings(NEON_AUTH_CLOCK_SKEW_SECONDS=30)
    def test_small_neon_clock_skew_does_not_log_out_a_valid_user(self):
        response = self.authenticated_get(
            self.token(str(uuid.uuid4()), issued_at=timezone.now() + timedelta(seconds=15))
        )

        self.assertEqual(response.status_code, 200)


class EndpointAuthenticationTests(APITestCase):
    def test_only_health_endpoint_is_public(self):
        group_id = uuid.uuid4()
        record_id = uuid.uuid4()
        protected_requests = [
            ("get", "/api/me/"),
            ("post", "/api/demo/workspace/"),
            ("get", "/api/groups/"),
            ("post", "/api/groups/"),
            ("get", f"/api/groups/{group_id}/"),
            ("post", f"/api/groups/{group_id}/members/"),
            ("delete", f"/api/groups/{group_id}/members/{record_id}/"),
            ("get", f"/api/groups/{group_id}/expenses/"),
            ("post", f"/api/groups/{group_id}/expenses/"),
            ("get", f"/api/groups/{group_id}/expenses/{record_id}/"),
            ("patch", f"/api/groups/{group_id}/expenses/{record_id}/"),
            ("delete", f"/api/groups/{group_id}/expenses/{record_id}/"),
            ("post", f"/api/groups/{group_id}/ai/quick-add/"),
            ("get", f"/api/groups/{group_id}/balances/"),
            ("get", f"/api/groups/{group_id}/settlements/"),
            ("post", f"/api/groups/{group_id}/settlements/"),
            ("patch", f"/api/groups/{group_id}/settlements/{record_id}/"),
        ]

        self.assertEqual(self.client.get("/api/health/").status_code, 200)
        for method, path in protected_requests:
            response = getattr(self.client, method)(path, {}, format="json")
            self.assertEqual(
                response.status_code, 401, f"{method.upper()} {path} must require auth"
            )


class GroupApiTests(APITestCase):
    def setUp(self):
        self.owner = self.profile("Owner", "owner@example.com")
        self.member = self.profile("Member", "member@example.com")
        self.outsider = self.profile("Outsider", "outsider@example.com")
        self.client.force_authenticate(user=self.owner)

    @staticmethod
    def profile(name: str, email: str) -> ApplicationProfile:
        return ApplicationProfile.objects.create(
            neon_auth_user_id=uuid.uuid4(), display_name=name, email=email
        )

    def create_group(self) -> Group:
        return Group.objects.create(name="Goa trip", created_by=self.owner)

    def test_creator_becomes_an_active_administrator(self):
        response = self.client.post(
            "/api/groups/", {"name": "Goa trip", "description": "January plans"}, format="json"
        )

        self.assertEqual(response.status_code, 201)
        group = Group.objects.get(id=response.data["id"])
        membership = GroupMembership.objects.get(group=group, profile=self.owner)
        self.assertEqual(membership.role, GroupMembership.Role.ADMIN)
        self.assertEqual(membership.status, GroupMembership.Status.ACTIVE)

    def test_group_list_loads_member_counts_without_n_plus_1_queries(self):
        for index in range(3):
            group = Group.objects.create(name=f"Group {index}", created_by=self.owner)
            GroupMembership.objects.create(
                group=group, profile=self.owner, role=GroupMembership.Role.ADMIN
            )
            GroupMembership.objects.create(group=group, profile=self.member)

        with self.assertNumQueries(1):
            response = self.client.get("/api/groups/")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(all(item["member_count"] == 2 for item in response.data))

    def test_only_active_members_see_a_group(self):
        group = self.create_group()
        GroupMembership.objects.create(
            group=group, profile=self.owner, role=GroupMembership.Role.ADMIN
        )

        visible_response = self.client.get(f"/api/groups/{group.id}/")
        self.assertEqual(visible_response.status_code, 200)

        self.client.force_authenticate(user=self.outsider)
        hidden_response = self.client.get(f"/api/groups/{group.id}/")
        self.assertEqual(hidden_response.status_code, 404)

    def test_admin_can_add_existing_profile_only_once(self):
        group = self.create_group()
        GroupMembership.objects.create(
            group=group, profile=self.owner, role=GroupMembership.Role.ADMIN
        )

        response = self.client.post(
            f"/api/groups/{group.id}/members/", {"email": self.member.email}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["email"], self.member.email)

        duplicate = self.client.post(
            f"/api/groups/{group.id}/members/", {"email": self.member.email}, format="json"
        )
        self.assertEqual(duplicate.status_code, 400)

    def test_previously_removed_member_can_rejoin_without_a_second_membership_row(self):
        group = self.create_group()
        GroupMembership.objects.create(
            group=group, profile=self.owner, role=GroupMembership.Role.ADMIN
        )
        membership = GroupMembership.objects.create(
            group=group, profile=self.member, status=GroupMembership.Status.LEFT
        )

        response = self.client.post(
            f"/api/groups/{group.id}/members/", {"email": self.member.email}, format="json"
        )

        self.assertEqual(response.status_code, 201)
        membership.refresh_from_db()
        self.assertEqual(membership.status, GroupMembership.Status.ACTIVE)
        self.assertEqual(
            GroupMembership.objects.filter(group=group, profile=self.member).count(), 1
        )

    def test_regular_member_cannot_manage_members(self):
        group = self.create_group()
        GroupMembership.objects.create(
            group=group, profile=self.owner, role=GroupMembership.Role.ADMIN
        )
        GroupMembership.objects.create(group=group, profile=self.member)
        self.client.force_authenticate(user=self.member)

        response = self.client.post(
            f"/api/groups/{group.id}/members/", {"email": self.outsider.email}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_member_with_financial_history_cannot_be_removed(self):
        group = self.create_group()
        GroupMembership.objects.create(
            group=group, profile=self.owner, role=GroupMembership.Role.ADMIN
        )
        GroupMembership.objects.create(group=group, profile=self.member)
        expense = Expense.objects.create(
            group=group,
            description="Dinner",
            amount_minor=1000,
            payer=self.owner,
            split_method=Expense.SplitMethod.EQUAL,
            expense_date="2026-11-17",
            created_by=self.owner,
        )
        ExpenseParticipant.objects.create(
            expense=expense, profile=self.owner, share_amount_minor=500
        )
        ExpenseParticipant.objects.create(
            expense=expense, profile=self.member, share_amount_minor=500
        )

        response = self.client.delete(f"/api/groups/{group.id}/members/{self.member.id}/")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"], "Members with expense or settlement history cannot be removed."
        )
        self.assertEqual(
            GroupMembership.objects.get(group=group, profile=self.member).status,
            GroupMembership.Status.ACTIVE,
        )

    @override_settings(DEBUG=True)
    def test_demo_workspace_creates_an_idempotent_working_group(self):
        created = self.client.post("/api/demo/workspace/")
        repeated = self.client.post("/api/demo/workspace/")

        self.assertEqual(created.status_code, 201)
        self.assertEqual(repeated.status_code, 201)
        self.assertEqual(created.data["id"], repeated.data["id"])
        group = Group.objects.get(id=created.data["id"])
        self.assertEqual(group.memberships.filter(status=GroupMembership.Status.ACTIVE).count(), 5)
        self.assertEqual(group.expenses.count(), 7)


class ExpenseApiTests(APITestCase):
    def setUp(self):
        self.owner = self.profile("Owner", "owner@example.com")
        self.member = self.profile("Member", "member@example.com")
        self.outsider = self.profile("Outsider", "outsider@example.com")
        self.group = Group.objects.create(name="Goa trip", created_by=self.owner)
        GroupMembership.objects.create(
            group=self.group, profile=self.owner, role=GroupMembership.Role.ADMIN
        )
        GroupMembership.objects.create(group=self.group, profile=self.member)
        self.client.force_authenticate(user=self.owner)

    @staticmethod
    def profile(name: str, email: str) -> ApplicationProfile:
        return ApplicationProfile.objects.create(
            neon_auth_user_id=uuid.uuid4(), display_name=name, email=email
        )

    def payload(self, split_method: str = "equal") -> dict[str, object]:
        participants: list[dict[str, object]] = [
            {"profile_id": str(self.owner.id)},
            {"profile_id": str(self.member.id)},
        ]
        if split_method == "custom":
            participants = [
                {"profile_id": str(self.owner.id), "share_amount_minor": 600},
                {"profile_id": str(self.member.id), "share_amount_minor": 401},
            ]
        if split_method == "percentage":
            participants = [
                {"profile_id": str(self.owner.id), "percentage": "33.33"},
                {"profile_id": str(self.member.id), "percentage": "66.67"},
            ]
        return {
            "description": "Dinner",
            "amount_minor": 1001,
            "currency": "INR",
            "payer_id": str(self.owner.id),
            "split_method": split_method,
            "expense_date": "2026-11-17",
            "participants": participants,
        }

    def expenses_url(self) -> str:
        return f"/api/groups/{self.group.id}/expenses/"

    def test_equal_split_is_deterministic_and_totals_the_expense(self):
        response = self.client.post(self.expenses_url(), self.payload(), format="json")

        self.assertEqual(response.status_code, 201)
        shares = [item["share_amount_minor"] for item in response.data["participants"]]
        self.assertEqual(sum(shares), 1001)
        self.assertLessEqual(max(shares) - min(shares), 1)

    def test_custom_split_rejects_an_incorrect_total(self):
        payload = self.payload("custom")
        payload["participants"][1]["share_amount_minor"] = 400

        response = self.client.post(self.expenses_url(), payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Expense.objects.count(), 0)

    def test_percentage_split_rounds_without_losing_a_paisa(self):
        response = self.client.post(self.expenses_url(), self.payload("percentage"), format="json")

        self.assertEqual(response.status_code, 201)
        total_shares = sum(item["share_amount_minor"] for item in response.data["participants"])
        self.assertEqual(total_shares, 1001)

    def test_percentage_split_requires_exactly_one_hundred_percent(self):
        payload = self.payload("percentage")
        payload["participants"][1]["percentage"] = "60"

        response = self.client.post(self.expenses_url(), payload, format="json")

        self.assertEqual(response.status_code, 400)

    def test_percentage_split_rejects_more_than_four_decimal_places(self):
        payload = self.payload("percentage")
        payload["participants"][0]["percentage"] = "33.33333"
        payload["participants"][1]["percentage"] = "66.66667"

        response = self.client.post(self.expenses_url(), payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("at most four decimal places", str(response.data))

    def test_percentage_split_rejects_nan_without_a_server_error(self):
        payload = self.payload("percentage")
        payload["participants"][0]["percentage"] = "NaN"
        payload["participants"][1]["percentage"] = "100"

        response = self.client.post(self.expenses_url(), payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Expense.objects.count(), 0)

    def test_non_member_cannot_read_group_expenses(self):
        self.client.force_authenticate(user=self.outsider)

        response = self.client.get(self.expenses_url())

        self.assertEqual(response.status_code, 404)

    def test_creator_can_soft_delete_an_expense(self):
        created = self.client.post(self.expenses_url(), self.payload(), format="json")

        response = self.client.delete(f"{self.expenses_url()}{created.data['id']}/")

        self.assertEqual(response.status_code, 204)
        self.assertIsNotNone(Expense.objects.get(id=created.data["id"]).deleted_at)
        self.assertEqual(self.client.get(self.expenses_url()).data, [])


class BalanceAndSettlementApiTests(APITestCase):
    def setUp(self):
        self.owner = self.profile("Owner", "owner@example.com")
        self.member = self.profile("Member", "member@example.com")
        self.group = Group.objects.create(name="Goa trip", created_by=self.owner)
        GroupMembership.objects.create(
            group=self.group, profile=self.owner, role=GroupMembership.Role.ADMIN
        )
        GroupMembership.objects.create(group=self.group, profile=self.member)
        self.client.force_authenticate(user=self.owner)
        self.client.post(
            f"/api/groups/{self.group.id}/expenses/",
            {
                "description": "Hotel",
                "amount_minor": 1000,
                "payer_id": str(self.owner.id),
                "split_method": "equal",
                "participants": [
                    {"profile_id": str(self.owner.id)},
                    {"profile_id": str(self.member.id)},
                ],
            },
            format="json",
        )

    @staticmethod
    def profile(name: str, email: str) -> ApplicationProfile:
        return ApplicationProfile.objects.create(
            neon_auth_user_id=uuid.uuid4(), display_name=name, email=email
        )

    def balances_url(self) -> str:
        return f"/api/groups/{self.group.id}/balances/"

    def settlements_url(self) -> str:
        return f"/api/groups/{self.group.id}/settlements/"

    def settlement_payload(self, amount_minor: int = 500) -> dict[str, object]:
        return {
            "payer_id": str(self.member.id),
            "receiver_id": str(self.owner.id),
            "amount_minor": amount_minor,
            "note": "Hotel share",
        }

    def test_balances_and_simplified_recommendation_are_derived_from_expense_history(self):
        response = self.client.get(self.balances_url())

        balances = {
            item["profile_id"]: item["net_balance_minor"] for item in response.data["members"]
        }
        self.assertEqual(balances[str(self.owner.id)], 500)
        self.assertEqual(balances[str(self.member.id)], -500)
        self.assertEqual(sum(balances.values()), 0)
        self.assertEqual(response.data["recommendations"][0]["amount_minor"], 500)

    def test_recorded_settlement_updates_balances_and_cancel_restores_them(self):
        created = self.client.post(self.settlements_url(), self.settlement_payload(), format="json")
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["status"], Settlement.Status.RECORDED)
        settled_balances = self.client.get(self.balances_url()).data["members"]
        self.assertTrue(all(item["net_balance_minor"] == 0 for item in settled_balances))

        cancelled = self.client.patch(
            f"{self.settlements_url()}{created.data['id']}/",
            {"status": Settlement.Status.CANCELLED},
            format="json",
        )
        self.assertEqual(cancelled.status_code, 200)
        restored = {
            item["profile_id"]: item["net_balance_minor"]
            for item in self.client.get(self.balances_url()).data["members"]
        }
        self.assertEqual(restored[str(self.member.id)], -500)

    def test_confirmed_settlement_is_terminal(self):
        created = self.client.post(self.settlements_url(), self.settlement_payload(), format="json")
        confirmed = self.client.patch(
            f"{self.settlements_url()}{created.data['id']}/",
            {"status": Settlement.Status.CONFIRMED},
            format="json",
        )
        changed_again = self.client.patch(
            f"{self.settlements_url()}{created.data['id']}/",
            {"status": Settlement.Status.CANCELLED},
            format="json",
        )

        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(changed_again.status_code, 400)
        self.assertEqual(
            Settlement.objects.get(id=created.data["id"]).status, Settlement.Status.CONFIRMED
        )

    def test_regular_member_cannot_change_someone_elses_settlement(self):
        created = self.client.post(self.settlements_url(), self.settlement_payload(), format="json")
        self.client.force_authenticate(user=self.member)

        response = self.client.patch(
            f"{self.settlements_url()}{created.data['id']}/",
            {"status": Settlement.Status.CANCELLED},
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    def test_settlement_cannot_exceed_outstanding_balance(self):
        response = self.client.post(
            self.settlements_url(), self.settlement_payload(501), format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Settlement.objects.count(), 0)

    def test_balance_endpoint_rejects_legacy_mixed_currency_records(self):
        Expense.objects.create(
            group=self.group,
            description="Legacy USD entry",
            amount_minor=1,
            currency="USD",
            payer=self.owner,
            split_method=Expense.SplitMethod.EQUAL,
            expense_date="2026-11-17",
            created_by=self.owner,
        )

        response = self.client.get(self.balances_url())

        self.assertEqual(response.status_code, 400)
        self.assertIn("multiple currencies", str(response.data).lower())

    def test_expense_and_settlement_lists_support_opt_in_pagination(self):
        for index in range(3):
            Expense.objects.create(
                group=self.group,
                description=f"Expense {index}",
                amount_minor=100,
                payer=self.owner,
                split_method=Expense.SplitMethod.EQUAL,
                expense_date="2026-11-17",
                created_by=self.owner,
            )
            Settlement.objects.create(
                group=self.group,
                payer=self.member,
                receiver=self.owner,
                amount_minor=1,
                status=Settlement.Status.CANCELLED,
                settled_on="2026-11-17",
                created_by=self.owner,
            )

        expense_page = self.client.get(
            f"/api/groups/{self.group.id}/expenses/?page=1&page_size=2"
        )
        settlement_page = self.client.get(f"{self.settlements_url()}?page=1&page_size=2")

        self.assertEqual(expense_page.status_code, 200)
        self.assertEqual(expense_page.data["count"], 4)
        self.assertEqual(len(expense_page.data["results"]), 2)
        self.assertEqual(settlement_page.status_code, 200)
        self.assertEqual(settlement_page.data["count"], 3)
        self.assertEqual(len(settlement_page.data["results"]), 2)


@override_settings(OPENAI_API_KEY="test-only-key", OPENAI_MODEL="gpt-4o-mini")
class AIQuickAddApiTests(APITestCase):
    def setUp(self):
        self.owner = self.profile("Owner", "owner@example.com")
        self.member = self.profile("Member", "member@example.com")
        self.outsider = self.profile("Outsider", "outsider@example.com")
        self.group = Group.objects.create(name="Goa trip", created_by=self.owner)
        GroupMembership.objects.create(
            group=self.group, profile=self.owner, role=GroupMembership.Role.ADMIN
        )
        GroupMembership.objects.create(group=self.group, profile=self.member)
        self.client.force_authenticate(user=self.owner)
        self.url = f"/api/groups/{self.group.id}/ai/quick-add/"

        model_patcher = patch("app.services.ai_quick_add._invoke_model")
        self.mock_model = model_patcher.start()
        self.addCleanup(model_patcher.stop)

    @staticmethod
    def profile(name: str, email: str) -> ApplicationProfile:
        return ApplicationProfile.objects.create(
            neon_auth_user_id=uuid.uuid4(), display_name=name, email=email
        )

    def proposal(self, **overrides):
        values = {
            "description": "Dinner",
            "amount": "10.01",
            "currency": "INR",
            "payer_name": "me",
            "participants": [
                AIParticipant(name="Owner", percentage="33.33"),
                AIParticipant(name="Member", percentage="66.67"),
            ],
            "split_method": "percentage",
            "warnings": [],
        }
        values.update(overrides)
        return AIExpenseProposal(**values)

    def test_draft_is_validated_and_does_not_write_to_database(self):
        self.mock_model.return_value = self.proposal()

        response = self.client.post(
            self.url,
            {"text": "Dinner with Member for 1001"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["amount_minor"], 1001)
        self.assertEqual(response.data["source"], "ai_quick_add")
        self.assertEqual(
            {
                item["profile_id"]: item["share_amount_minor"]
                for item in response.data["participants"]
            },
            {str(self.owner.id): 334, str(self.member.id): 667},
        )
        self.assertEqual(Expense.objects.count(), 0)
        self.assertEqual(ExpenseParticipant.objects.count(), 0)

    def test_confirmed_draft_uses_normal_expense_creation_path(self):
        self.mock_model.return_value = self.proposal()
        draft = self.client.post(self.url, {"text": "Dinner"}, format="json").data

        response = self.client.post(
            f"/api/groups/{self.group.id}/expenses/",
            {
                "description": draft["description"],
                "amount_minor": draft["amount_minor"],
                "currency": "INR",
                "payer_id": draft["payer"]["id"],
                "split_method": draft["split_method"],
                "expense_date": draft["expense_date"],
                "source": draft["source"],
                "participants": [
                    {
                        "profile_id": item["profile_id"],
                        "percentage": item["percentage"],
                    }
                    for item in draft["participants"]
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Expense.objects.get().source, Expense.Source.AI_QUICK_ADD)

    def test_unknown_name_is_flagged_and_not_resolved(self):
        self.mock_model.return_value = self.proposal(
            split_method="equal",
            participants=[
                AIParticipant(name="Owner"),
                AIParticipant(name="Ghost"),
            ],
        )

        response = self.client.post(self.url, {"text": "Dinner"}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(any("Ghost" in warning for warning in response.data["warnings"]))
        self.assertEqual(len(response.data["participants"]), 1)
        self.assertEqual(response.data["participants"][0]["share_amount_minor"], 1001)

    def test_ambiguous_name_is_flagged(self):
        twin = self.profile("Twin", "twin@example.com")
        GroupMembership.objects.create(group=self.group, profile=twin)
        GroupMembership.objects.create(
            group=self.group,
            profile=self.profile("Twin", "other@example.com"),
        )
        self.mock_model.return_value = self.proposal(
            split_method="equal",
            participants=[AIParticipant(name="Twin"), AIParticipant(name="Owner")],
        )

        response = self.client.post(self.url, {"text": "Dinner"}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(any("ambiguous" in warning for warning in response.data["warnings"]))
        self.assertEqual(len(response.data["participants"]), 1)

    def test_invalid_split_totals_are_rejected(self):
        self.mock_model.return_value = self.proposal(
            participants=[
                AIParticipant(name="Owner", percentage="33"),
                AIParticipant(name="Member", percentage="33"),
            ]
        )

        response = self.client.post(self.url, {"text": "Dinner"}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Expense.objects.count(), 0)

    def test_non_member_cannot_use_ai_endpoint(self):
        self.client.force_authenticate(user=self.outsider)
        self.mock_model.return_value = self.proposal()

        response = self.client.post(self.url, {"text": "Dinner"}, format="json")

        self.assertEqual(response.status_code, 404)
        self.mock_model.assert_not_called()

    def test_empty_text_is_rejected(self):
        response = self.client.post(self.url, {"text": "   "}, format="json")

        self.assertEqual(response.status_code, 400)
        self.mock_model.assert_not_called()

    def test_ai_failure_returns_service_error(self):
        self.mock_model.side_effect = AIServiceUnavailable

        response = self.client.post(self.url, {"text": "Dinner"}, format="json")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(Expense.objects.count(), 0)

    def test_unmatched_name_in_percentage_split_falls_back_to_equal(self):
        self.mock_model.return_value = self.proposal(
            participants=[
                AIParticipant(name="Owner", percentage="40"),
                AIParticipant(name="Ghost", percentage="60"),
            ]
        )

        response = self.client.post(self.url, {"text": "Dinner"}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["split_method"], "equal")
        self.assertTrue(any("reset to equal" in warning for warning in response.data["warnings"]))
        self.assertEqual(
            sum(item["share_amount_minor"] for item in response.data["participants"]),
            1001,
        )
        self.assertEqual(Expense.objects.count(), 0)

    def test_zero_percentage_is_preserved_in_the_draft(self):
        self.mock_model.return_value = self.proposal(
            participants=[
                AIParticipant(name="Owner", percentage="0"),
                AIParticipant(name="Member", percentage="100"),
            ]
        )

        response = self.client.post(self.url, {"text": "Dinner"}, format="json")

        self.assertEqual(response.status_code, 200)
        percentages = {
            item["profile_id"]: item["percentage"] for item in response.data["participants"]
        }
        self.assertEqual(percentages[str(self.owner.id)], "0")
        self.assertEqual(percentages[str(self.member.id)], "100")

    def test_ai_endpoint_is_rate_limited(self):
        from django.core.cache import cache

        cache.clear()
        self.mock_model.return_value = self.proposal()
        for _ in range(10):
            self.assertEqual(
                self.client.post(self.url, {"text": "Dinner"}, format="json").status_code,
                200,
            )

        response = self.client.post(self.url, {"text": "Dinner"}, format="json")

        self.assertEqual(response.status_code, 429)
