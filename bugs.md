# Splitter AI — Backend & Frontend Bug Report

Prepared: 2026-11-17
Scope: Django REST API (`app/`, `splitwise_pro/`) and React/Vite frontend (`frontend/src/`).
Status (updated 2026-11-18): **BUG-01 → BUG-19 are fixed in the working tree.** BUG-20 (refresh 401 burst) was reproduced again after its first fix; a stricter token validation, a `/token` endpoint fallback, and safe diagnostics are now in place, but the bug is still open pending a browser refresh with the new logs. AI Quick Add is now implemented end to end. Verified with **39/39 backend tests**, `manage.py check`, `ruff check`, and TypeScript type-check of the application code. The detailed root-cause notes below are retained as the record of each finding; every "Remaining Issues" line has been updated to its final state. Note: a full `npm run check` is currently blocked by an unrelated, in-progress shadcn component installation in `frontend/src/components/ui/` whose dependencies are not yet installed — none of those files are part of this bug-fix work.

> Quick summary (Hinglish): Sabse bade bugs — JWT `iss`/`aud` verification, duplicate route (balances/settlements unreachable), member-remove se balance invariant tootna, N+1 queries, fake demo data, floating-point money — **sab fix ho chuke hain**. Follow-up audit me 8 aur bugs mile (AI rate limit, NaN percentage, concurrency, refresh race etc.) wo bhi fix hue. AI Quick Add ab fully implemented hai. Backend 32/32 tests green.

---

## BUG-01 [P0 / Critical] Every authenticated API request is rejected — JWT `audience` missing and `issuer` wrong

**Component:** Backend / Authentication

**Root Cause:**
`app/authentication.py` decodes the Neon Auth JWT with:

```python
claims = jwt.decode(
    parts[1], key, algorithms=["EdDSA"], issuer=settings.NEON_AUTH_BASE_URL
)
```

Two problems:

1. **Missing `audience`:** Neon Managed Better Auth JWTs include an `aud` claim (set to the auth URL **origin**). PyJWT raises `InvalidAudienceError` whenever a token carries `aud` but no `audience` was supplied to `decode()`. The exception is a `jwt.PyJWTError`, so it is converted to `AuthenticationFailed` → **HTTP 401 for every protected endpoint**, including `/api/me/`.
2. **Wrong `issuer`:** Neon sets `iss` to the **origin** of the auth URL (e.g. `https://ep-xx.aws.neon.tech`), not the full `/neondb/auth` URL. This repo's `.env.example` — and the actual `.env` — set `NEON_AUTH_BASE_URL=.../neondb/auth`, so `issuer=settings.NEON_AUTH_BASE_URL` also fails with `InvalidIssuerError`.

Per Neon's official JWT guide, verification must use `issuer=ORIGIN, audience=ORIGIN` where `ORIGIN = f"{scheme}://{netloc}"`.

**Fix (recommended):**
Derive the origin from `NEON_AUTH_BASE_URL` and pass it as both `issuer` and `audience`:

```python
from urllib.parse import urlparse

parsed = urlparse(settings.NEON_AUTH_BASE_URL)
origin = f"{parsed.scheme}://{parsed.netloc}"
claims = jwt.decode(
    parts[1], key, algorithms=["EdDSA"], issuer=origin, audience=origin
)
```

Also fail fast at startup with a clear configuration error if `NEON_AUTH_BASE_URL` has no scheme/netloc.

**Affected Files:**
- `app/authentication.py`
- `.env.example` (document that `NEON_AUTH_BASE_URL` may include the `/neondb/auth` path and that origin is derived from it)
- `app/tests.py` (add real JWT tests)

**Verification:**
- Reproduced locally with the project venv and the exact decode arguments:

```
token has aud; decoding with issuer only:
InvalidAudienceError: Invalid audience
with audience: {'sub': ..., 'iss': ..., 'aud': ...}
```

- Confirmed the configured value has a non-root path: `PATH_SEGMENTS=/neondb/auth`, `IS_ROOT=False`.
- Neon docs reference: `docs/auth/guides/plugins/jwt` → "both should be `https://ep-xx.aws.neon.tech`".

**Remaining Issues:** None. Issuer and audience now use the auth URL origin; `test_neon_token_with_origin_issuer_and_audience_authenticates` signs a real EdDSA token and asserts 200 on `/api/me/`.

---

## BUG-02 [P0 / Critical] Duplicate route makes the entire Balances/Settlements screen unreachable

**Component:** Frontend / Routing

**Root Cause:**
`frontend/src/App.tsx` registers `/groups/:groupId` **twice**:

- Line 590: `<Route path="/groups/:groupId" element={session ? <GroupPage .../> : ...} />`
- Line 594: `<Route path="/groups/:groupId" element={session ? <GroupDetailPage /> : ...} />`

React Router matches the first equally-specific route. Verified with `matchRoutes()`:

```
FIRST
```

`GroupDetailPage` — the only screen that fetches `getGroupBalances`, `getGroupSettlements`, renders tabs, recommendations and settlement history — is dead code. Users see the older inline `GroupPage`, which has **no balances, recommendations or settlements UI at all**.

**Fix (recommended):**
Delete the duplicate. Keep one implementation — preferably `GroupDetailPage` (it has the full workflow) — and remove the inline `GroupPage` component and its unused imports (`getGroupExpenses`, `getExpense`, `addGroupMember`, `removeGroupMember`, `updateExpense`, `deleteExpense`, etc. if no longer used). Then add a routing test/assertion.

**Affected Files:**
- `frontend/src/App.tsx`
- `frontend/src/features/groups/GroupDetailPage.tsx` (becomes live)
- `frontend/src/features/groups/GroupsPage.tsx`

**Verification:**
- `rtk node -e "const {matchRoutes}=require('react-router-dom'); ..."` against the exact route table → returns `FIRST`.
- Source inspection of `GroupDetailPage.tsx` lines 44–47 and 62–68 confirms all balance/settlement calls live only there.

**Remaining Issues:** None. Single `/groups/:groupId` route renders `GroupDetailPage`; the inline `GroupPage` was deleted and its add/remove-member capability ported across.

---

## BUG-03 [P1 / High] Removing a group member corrupts the balance invariant (sum of net balances ≠ 0)

**Component:** Backend / Balances + Group membership

**Root Cause:**
`group_member_detail()` in `app/views.py` hard-deletes the `GroupMembership` row:

```python
membership.delete()
```

`calculate_group_balances()` in `app/services/balances.py` only initialises `totals` for **active** members. A removed member's `ExpenseParticipant` shares and `Settlement` rows still exist, but their side of the ledger is dropped. The remaining members keep the full credit/debit, so balances no longer sum to zero.

The model has a `GroupMembership.Status.LEFT` state that is never used — removal destroys history instead of recording it.

**Reproduction (temporary test, since removed):**
1. Owner pays ₹10.00 split equally between owner and member → balances `{owner: +500, member: -500}`, sum `0`.
2. Admin removes the member via `DELETE /api/groups/<id>/members/<profile_id>/`.
3. Balances become `{owner: +500}`, sum `500`. ❌

```
BEFORE: {owner: +500, member: -500} sum: 0
AFTER (member removed): {owner: +500} sum: 500
FAIL: AssertionError: 500 != 0
```

(The raw test output printed profiles in UUID order; owner is the creditor, member the debtor.)

**Fix (recommended):**
Pick one explicit policy and enforce it server-side:
- **Preferred:** refuse to remove a member who has non-cancelled expenses/settlements in the group (return 400 with a clear message), or
- Soft-remove by setting `status=LEFT` and make balance calculation include historical participants/settlement parties for non-deleted records, or
- In one atomic transaction: soft-delete the member's expenses/settlements and recompute/validate that the remaining balances still sum to zero.

Also replace the hard delete with `status = LEFT` so membership history survives.

**Affected Files:**
- `app/views.py` (`group_member_detail`)
- `app/services/balances.py` (`calculate_group_balances`)
- `app/models.py` (`GroupMembership.Status.LEFT`)
- `app/tests.py`

**Verification:**
- Temporary `APITestCase` reproduction failed with `500 != 0` as shown above.
- Existing 14 tests all pass — none covers member removal with financial history.

**Remaining Issues:** None. Removal is rejected with 400 when the member has expense/settlement history; soft `LEFT` status preserves history.

---

## BUG-04 [P1 / High] Non-UUID JWT `sub` crashes with an unhandled ValidationError (HTTP 500)

**Component:** Backend / Authentication

**Root Cause:**
`ApplicationProfile.neon_auth_user_id` is a `UUIDField`, but `NeonAuthentication.authenticate()` passes the raw `claims["sub"]` string straight into `ApplicationProfile.objects.get_or_create(...)`. Django's `UUIDField.to_python()` raises `django.core.exceptions.ValidationError` for a malformed subject. That is not a DRF `APIException`, so DRF cannot turn it into a clean 401/400 — the request returns **500**.

**Reproduction:**
```
NON-UUID SUB EXCEPTION: ValidationError ['‘not-a-uuid’ is not a valid UUID.']
```

**Fix (recommended):**
Validate before the query and convert to `AuthenticationFailed` (never 500):

```python
from uuid import UUID

try:
    user_id = UUID(str(claims["sub"]))
except (ValueError, TypeError, KeyError):
    raise exceptions.AuthenticationFailed("Neon Auth token has an invalid subject.")
```

**Affected Files:**
- `app/authentication.py`
- `app/tests.py`

**Verification:** Temporary test asserted the exception type; it printed `ValidationError` as expected.

**Remaining Issues:** None. Non-UUID `sub` now returns 401; covered by `test_non_uuid_neon_subject_returns_401_not_500`.

---

## BUG-05 [P2 / Medium] JWKS client is recreated on every request — no key caching

**Component:** Backend / Authentication / Performance

**Root Cause:**
`jwt.PyJWKClient(settings.NEON_AUTH_JWKS_URL)` is instantiated inside `authenticate()`. `PyJWKClient` caches keys per instance, but a fresh instance is created for every API call, so the JWKS endpoint is re-fetched on **every authenticated request** — an unnecessary network round-trip to Neon on the hot path.

**Fix (recommended):**
Create one client at module import (lazy singleton) and reuse it:

```python
@lru_cache(maxsize=1)
def get_jwk_client() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(settings.NEON_AUTH_JWKS_URL)
```

**Affected Files:** `app/authentication.py`

**Verification:** Source inspection — constructor is on line 21 inside `authenticate()`.

**Remaining Issues:** None. `jwk_client()` is cached with `@lru_cache`; tests patch `app.authentication.jwk_client` by name.

---

## BUG-06 [P2 / Medium] N+1 queries in group list and expense list endpoints

**Component:** Backend / Performance

**Root Cause:**
- `group_payload()` calls `group.memberships.filter(status=ACTIVE).count()` for every group returned by `GET /api/groups/`.
- `expense_payload()` calls `expense.participants.select_related("profile").order_by("profile_id")` for every expense returned by `GET /api/groups/<id>/expenses/`.

Both helpers are invoked in Python loops in the views, so query count grows linearly with the number of rows.

**Reproduction (temporary test with 4 groups / 3 expenses):**
```
GET /api/groups/ QUERY COUNT: 5      (1 main + 4 member-count queries)
GET expenses QUERY COUNT: 5          (1 main + 3 participant queries)
```

**Fix (recommended):**
- Annotate the group queryset: `.annotate(active_member_count=Count("memberships", filter=Q(memberships__status=ACTIVE), distinct=True))` and read `group.active_member_count`.
-Prefetch participants once: `.prefetch_related(Prefetch("participants", queryset=ExpenseParticipant.objects.select_related("profile").order_by("profile_id")))` and have `expense_payload` use `expense.participants.all()`.

**Affected Files:** `app/views.py`

**Verification:** `CaptureQueriesContext` counts above, captured with the temporary test.

**Remaining Issues:** None. Expenses prefetch participants; the group-list annotation issue is tracked and fixed as BUG-17 below.

---

## BUG-07 [P2 / Medium] Groups page silently shows fake "Demo" groups on API errors and empty states

**Component:** Frontend / `GroupsPage`

**Root Cause:**
`frontend/src/features/groups/GroupsPage.tsx` lines 39–52:

```ts
if (data.length === 0) { setGroups(DEMO_GROUPS); setIsDemo(true) }
...
catch { setGroups(DEMO_GROUPS); setIsDemo(true); setError(...) }
```

A legitimate "no groups yet" state and **any** backend/auth failure are replaced with three hard-coded groups (`demo-1`, `demo-2`, `demo-3`). Their links navigate to `/groups/demo-1`, which the API cannot resolve (UUID route) → 404/error page. Real errors are buried under fake data, which is misleading and blocks debugging.

**Fix (recommended):**
Remove the demo-data fallback entirely. Keep the real empty state (`No groups yet`) and the error alert; on error show a Retry button. Demo data belongs behind an explicit opt-in flag (`import.meta.env.DEV && VITE_DEMO_MODE`), never on the default error path.

**Affected Files:** `frontend/src/features/groups/GroupsPage.tsx`

**Verification:** Source inspection lines 8–12 and 36–53.

**Remaining Issues:** None. Demo fallback removed; real empty/error states shown. No browser verification performed.

---

## BUG-08 [P2 / Medium] Dashboard stat cards are hard-coded to zero and never update

**Component:** Frontend / `Home`

**Root Cause:**
`frontend/src/App.tsx` lines 545–565 render static values `0`, `0`, `₹0`, `0` for Groups, Expenses, Balances and Settlements. `Home` only fetches `getMe()` and `GroupsPanel` separately fetches groups; nothing feeds the cards. Users with data see "Groups 0" directly above a populated group list.

**Fix (recommended):**
Derive Groups from the already-fetched `GroupsPanel` data (lift state up or share via TanStack Query), and fetch per-group expense/balance counts, or remove the cards until real data backs them. Do not invent values client-side (backend remains authoritative).

**Affected Files:** `frontend/src/App.tsx`

**Verification:** Source inspection lines 545–565 and 463–468.

**Remaining Issues:** None. Hard-coded stat cards removed; the dashboard no longer invents numbers.

---

## BUG-09 [P2 / Medium] Sidebar navigation is largely fake; AI Quick Add doesn't exist

**Component:** Frontend navigation + missing feature

**Root Cause:**
`frontend/src/components/DashboardShell.tsx` lines 13–19 map **Expenses**, **Settlements**, and **AI Assistant** to `to='/groups'`. There are no `/expenses`, `/settlements`, or `/ai` routes in `App.tsx`. The "Search", "Notifications", and avatar buttons are also inert placeholders.

Separately, AI Quick Add — a core PRD feature — has **no backend endpoint, no LangChain/OpenAI dependency in `pyproject.toml`, and no UI**. `Expense.source` supports `ai_quick_add` but nothing ever writes it.

**Fix (recommended):**
- Either implement real routes/screens and point the nav at them, or hide nav items until they work.
- Implement AI Quick Add as a Django endpoint returning a validated *proposal* (Pydantic/schema), never a direct DB write, then feed it through the existing confirm → `expense_input_from_payload()` → `create_expense()` path.

**Affected Files:** `frontend/src/components/DashboardShell.tsx`, `frontend/src/App.tsx`, `app/urls.py`, `app/views.py`, `pyproject.toml` (add dependencies), `.context/PRD.md` (missing).

**Verification:** Source inspection + `glob frontend/src/features/**/*` (only `GroupsPage.tsx` and `GroupDetailPage.tsx`) + `pyproject.toml` dependency list.

**Remaining Issues:** None. Fake nav items removed; AI Quick Add implemented (see BUG-13/BUG-15).

---

## BUG-10 [P3 / Low] Percentage split preview disagrees with backend rounding

**Component:** Frontend / Expense form

**Root Cause:**
`ExpenseFormPage` preview (App.tsx line 492) uses:

```ts
Math.floor((amountMinor ?? 0) * Number(percentages[member.id] ?? 0) / 100)
```

The backend (`app/services/expenses.py::calculate_shares`) uses `Decimal` with `ROUND_DOWN` **plus a largest-remainder redistribution** so shares always total the expense amount. Example: 1001 paise at 33.33% / 66.67% → preview shows `333 + 667 = 1000`, backend stores `334 + 667 = 1001`. The UI shows a different number than what gets saved.

**Fix (recommended):**
Either implement the same deterministic largest-remainder algorithm in the preview (integer arithmetic only, no floats), or drop per-member preview amounts and show only "Final amounts are calculated by Splitter AI" until the backend responds.

**Affected Files:** `frontend/src/App.tsx`

**Verification:** Source inspection line 492 vs `app/services/expenses.py` lines 156–169; existing backend test `test_percentage_split_rounds_without_losing_a_paisa` passes.

**Remaining Issues:** None. Frontend preview mirrors Django's integer largest-remainder split.

---

## BUG-11 [P3 / Low] Money is converted through floating point in the frontend

**Component:** Frontend / Display + input parsing

**Root Cause:**
Both `formatMoney()` in `App.tsx`/`GroupDetailPage.tsx` and the preview logic divide integer paise by 100 into a JS `number` before formatting. For the MVP's INR paise range this is usually safe, but it violates the "never use floating point for money" rule and can produce off-by-one-paisa artifacts for very large values.

**Fix (recommended):**
Format integer minor units with `Intl.NumberFormat.formatToParts()` and replace the last two digits, or use an integer-based formatter helper shared by both pages.

**Affected Files:** `frontend/src/App.tsx`, `frontend/src/features/groups/GroupDetailPage.tsx`

**Verification:** Source inspection (`minor / 100`).

**Remaining Issues:** None. Integer money helpers live in `frontend/src/lib/money.ts`.

---

## BUG-12 [P3 / Low] More-than-4-decimal percentages are silently rounded on save

**Component:** Backend / Expense validation

**Root Cause:**
`decimal_percentage()` accepts any Decimal between 0 and 100 (e.g. `33.33333`), and `calculate_shares()` uses the full precision. But `ExpenseParticipant.percentage` is `DecimalField(max_digits=7, decimal_places=4)`, so the stored value is rounded to `33.3333`. Share amounts are stored explicitly, so balances stay correct, but the API's returned `percentage` no longer matches what the client submitted.

**Fix (recommended):**
Reject more than 4 decimal places in `decimal_percentage()` (400 with a clear message) rather than silently rounding, or raise the column precision if that is intended.

**Affected Files:** `app/services/expenses.py`, `app/models.py`, `app/tests.py`

**Verification:** Source inspection — `decimal_percentage()` lines 114–121 vs model field line 147.

**Remaining Issues:** None. More-than-4-decimal percentages are rejected with a 400; regression test added.

---

## Follow-up audit — additional bugs found and fixed

### BUG-13 [P0] AI Quick Add rate limiting never applied
- **Root cause:** `AIQuickAddThrottle` subclassed `ScopedRateThrottle`, but `@api_view` function views have no `throttle_scope` attribute, so the scope was discarded and the 10/min rate never applied.
- **Fix:** Subclass `UserRateThrottle` in `app/throttling.py`; keys by authenticated user.
- **Files:** `app/throttling.py`, `splitwise_pro/settings.py`, `app/tests.py`.
- **Verification:** `test_ai_endpoint_is_rate_limited` asserts the 11th request returns 429.

### BUG-14 [P1] `percentage: "NaN"` crashed expense creation with HTTP 500
- **Root cause:** `decimal_percentage()` compared a non-finite `Decimal` outside the `try`; the comparison raises `decimal.InvalidOperation`, which is not a DRF `APIException`.
- **Fix:** Reject non-finite values with `is_finite()` before comparing.
- **Files:** `app/services/expenses.py`, `app/tests.py`.
- **Verification:** `test_percentage_split_rejects_nan_without_a_server_error` → 400.

### BUG-15 [P1] AI Quick Add custom/percentage splits failed when a name was unmatched
- **Root cause:** Unmatched participants were dropped with a warning, but their explicit amounts/percentages were left behind, so the split no longer totalled the expense and `calculate_shares()` raised → 400 instead of a flagged draft. A legitimate `0%` was also serialized as `null`.
- **Fix:** On a dropped participant with custom/percentage split, reset the proposal to an equal split and keep the warning; preserve `0` percentages with an `is not None` check.
- **Files:** `app/services/ai_quick_add.py`, `app/tests.py`.
- **Verification:** `test_unmatched_name_in_percentage_split_falls_back_to_equal`, `test_zero_percentage_is_preserved_in_the_draft`.

### BUG-16 [P1] Concurrent settlement creation could over-settle
- **Root cause:** `transaction.atomic()` gave atomicity but no locking; two concurrent debtors could both read the same pre-settlement balances and both pass the `maximum` check.
- **Fix:** Lock the group row with `Group.objects.select_for_update()` inside the transaction before computing balances.
- **Files:** `app/services/settlements.py`.
- **Verification:** Code review; SQLite test DB does not exercise row locks.

### BUG-17 [P2] BUG-06 group-count annotation was ineffective
- **Root cause:** `active_member_count` was annotated on the `GroupMembership` row, not the related `group`, and `getattr()`'s default was evaluated eagerly — so one count query per group still ran.
- **Fix:** Pass the annotated value explicitly into `group_payload()` and only fall back to a query when it is `None`.
- **Files:** `app/views.py`, `app/tests.py`.
- **Verification:** `test_group_list_loads_member_counts_without_n_plus_1_queries` asserts 1 query for 3 groups.

### BUG-18 [P2] "Load sample workspace" shown in production (404)
- **Root cause:** The demo endpoint is DEBUG-only, but the frontend button was unconditional.
- **Fix:** Gate the button with `import.meta.env.DEV`.
- **Files:** `frontend/src/features/groups/GroupsPage.tsx`.

### BUG-19 [P2] Settlement Confirm/Cancel shown to users who always get 403
- **Root cause:** `current_membership` did not expose the profile id, so the UI could not check ownership.
- **Fix:** Add `profile_id` to `current_membership` in `group_payload()`; render the buttons only for admins or the settlement creator.
- **Files:** `app/views.py`, `frontend/src/lib/api.ts`, `frontend/src/features/groups/GroupDetailPage.tsx`.

### BUG-20 [P1] Refresh produced a burst of 401 "invalid token" errors
- **Root cause (initial hypothesis, incomplete):** Better Auth caches the session; `getSession()` can return an already-expired JWT without a network call. After a refresh several components mount together, each firing a request with the stale token and then racing to force-refresh. Single-flight + proactive refresh was implemented, but the user reproduced the issue again: **all 8 requests (4 initial + 4 retries) returned 401**, so the force-refreshed token was *also* invalid. The stale-cache race is therefore not the whole story.
- **Additional root-cause candidates under investigation:**
  1. On a cold page load the SDK's in-memory session cache is gone. `getSession()` can surface the opaque Better Auth session token (no JWT structure / no `exp`) instead of the signed JWT. The old `isUsable()` accepted any token without a decodable `exp`, so that opaque token was sent to Django and rejected.
  2. `X-Force-Fetch` may be a no-op for the JWT if the auth server does not rotate it, leaving the retry with the identical rejected token.
  3. A fresh JWT may carry different `iss`/`aud` than the one issued at sign-in, or a network/JWKS failure may reject it — these need the exact PyJWT error to distinguish.
- **Fix applied in this pass:**
  - `frontend/src/lib/auth.ts`: `isUsable()` now requires a real JWT with a finite `exp`; numeric-string `exp` is accepted. `getAccessToken()` force-refreshes, then falls back to Better Auth's JWT `GET /token` endpoint (`X-Force-Fetch`) if the session token is still not a usable JWT, and otherwise returns `null` so callers show a clear sign-in message instead of firing guaranteed-401 requests.
  - Safe dev-only diagnostics log token metadata (`isJwt`, seconds-to-expiry, `iss`, `aud`) — never the token value.
  - `frontend/src/lib/api.ts`: on a 401, log (dev only) whether the force-refreshed token is identical to the rejected one; skip a pointless retry with the same token.
  - `app/authentication.py`: log the rejected token's exception **type and message** (never the token), e.g. `Neon Auth token rejected: ExpiredSignatureError: ...`, so the exact cause is visible in the Django console.
  - `app/authentication.py` + `splitwise_pro/settings.py`: pass `leeway=NEON_AUTH_CLOCK_SKEW_SECONDS` (default 30s, overridable via env) to `jwt.decode`. PyJWT otherwise rejects a freshly issued JWT whose `iat`/`nbf` is a few seconds ahead of Django's clock with `ImmatureSignatureError` — a strong candidate for the 401-on-refresh pattern. Regression test: `test_small_neon_clock_skew_does_not_log_out_a_valid_user`.
- **Files:** `frontend/src/lib/auth.ts`, `frontend/src/lib/api.ts`, `app/authentication.py`, `splitwise_pro/settings.py`.
- **Verification:** 39/39 backend tests pass (`--keepdb`), `manage.py check` clean, `npx tsc -b` clean. **Browser-level verification and the Django/browser log lines are still required** to confirm which PyJWT error is occurring; bug remains open until the user refreshes with the new diagnostics active.

### BUG-21 [P2] Removed member could not rejoin the group
- **Root cause:** `group_members()` rejected any existing `(group, profile)` row, including a soft-`LEFT` membership, even though removal was designed to preserve financial history for a possible rejoin.
- **Fix:** Inside `transaction.atomic()` with `select_for_update()`, reactivate an existing `LEFT`/`INVITED` row in place (status, role, joined_at) instead of creating a second row; still reject already-`ACTIVE` members and pending invitations as before.
- **Files:** `app/views.py`.
- **Verification:** `test_previously_removed_member_can_rejoin_without_a_second_membership_row` passes; exactly one membership row remains.

### BUG-22 [P2] Confirmed settlement could be silently changed
- **Root cause:** `group_settlement_detail()` only blocked changes to `CANCELLED` settlements. A `CONFIRMED` settlement could be flipped to `CANCELLED`, silently rewriting settled balances.
- **Fix:** Only `RECORDED` settlements may transition to `CONFIRMED`/`CANCELLED`; any other current status returns 400.
- **Files:** `app/views.py`.
- **Verification:** `test_confirmed_settlement_is_terminal` passes; the recorded → cancelled balance-restoration test still passes.

### BUG-23 [P2] Balances endpoint accepted mixed-currency financial history
- **Root cause:** Legacy records directly inserted into `Expense`/`Settlement` could carry a non-INR currency; balance aggregation still summed their minor units as if they were INR.
- **Fix:** `validate_single_balance_currency()` in `app/services/balances.py` rejects the balances request with 400 when active expenses and non-cancelled settlements span more than one currency, before any aggregation happens.
- **Files:** `app/services/balances.py`.
- **Verification:** `test_balance_endpoint_rejects_legacy_mixed_currency_records` passes.

### BUG-24 [P2] Large expense/settlement lists had no pagination option
- **Root cause:** `/expenses/` and `/settlements/` always returned an unbounded array, so large groups could not be paged by the client.
- **Fix:** Opt-in pagination helper in `app/views.py`: without `page`/`page_size` the response stays the existing plain array (no contract break); with either query param it returns a `{count, page, page_size, next, previous, results}` envelope. `page_size` is capped at 100, invalid values return 400, and out-of-range pages return 404.
- **Files:** `app/views.py`.
- **Verification:** `test_expense_and_settlement_lists_support_opt_in_pagination` passes.

### Non-app noise
- Repeated `GET /health → 404` lines in the Django log come from an external ~30s poller. The app only uses `/api/health/`; no application code requests `/health`.

---

## Testing & Documentation Gaps (current)

| Area | Status |
|---|---|
| Backend test suite | 39 tests — JWT success/failure, clock skew, endpoint authorization, all split types, rounding, balances, currency validation, pagination, simplification, settlements, object-level authorization, AI proposal validation, rate limiting |
| Frontend automated tests | Still none (no test runner configured) |
| Browser/E2E verification | Not performed by the assistant; manual check recommended |
| `.context/` documents | Present (`PRD.md`, `TECH_STACK.md`, `ARCHITECTURE.md`, `DATABASE_MODELS.md`, `E2E_BUILD_PLAN.md`) |
| OpenAI credentials | Backend-only via `OPENAI_API_KEY` / `OPENAI_MODEL`; never exposed to the browser |

---

## Verification Commands Executed (final)

```powershell
$env:DJANGO_SECRET_KEY='test-only-key'; $env:DATABASE_URL='sqlite:///:memory:'
.venv\Scripts\python.exe manage.py test app -v 1 --keepdb  # → Ran 39 tests ... OK
.venv\Scripts\python.exe manage.py check                   # → no issues
uv run ruff check . --output-format concise                # → All checks passed!
cd frontend; npx tsc -b                                    # → application code type-checks
```

`npm run check` (ESLint across the whole frontend directory) is currently blocked by an unrelated, in-progress shadcn component installation under `frontend/src/components/ui/` whose dependencies are not installed yet. Those files are not part of this bug-fix work and were left untouched.
