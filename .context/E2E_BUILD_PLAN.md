# Splitter AI — End-to-End Build Plan

**Target:** Internship MVP  
**Architecture:** React + TypeScript → Django REST Framework → Supabase Auth/PostgreSQL → LangChain/OpenAI  
**Phases:** 7

## Build Strategy

Build the application as a sequence of working vertical slices. Each phase should leave the project runnable and testable. Do not start AI or visual polish before authentication, data ownership, and financial calculations are reliable.

## Parallel Frontend and Backend Development

The frontend and backend will be developed side by side in every phase. The backend provides the API contract and business rules, while the frontend builds the corresponding user flow using loading, empty, error, and temporary mock states where necessary.

```text
Backend task                 Frontend task
──────────────────────       ─────────────────────────────
API contract and models  ↔   Screens, forms, and navigation
Validation and errors    ↔   Form validation and error UI
Endpoint implementation  ↔   API client integration
Database tests           ↔   Component and interaction tests
```

Frontend work must not wait for every backend endpoint to be complete. Use typed API contracts and small vertical slices so each feature becomes connected as soon as its endpoint is ready.

```text
Phase 1: Foundation
      ↓
Phase 2: Authentication and user profiles
      ↓
Phase 3: Groups and memberships
      ↓
Phase 4: Expenses and split calculations
      ↓
Phase 5: Balances, debt simplification, and settlements
      ↓
Phase 6: AI Quick Add
      ↓
Phase 7: Hardening, deployment, and final delivery
```

---

## Phase 1 — Project Foundation and Development Setup

### Objective

Create a clean, repeatable development environment for the React frontend, Django API, and Supabase PostgreSQL database.

### Work

- Confirm repository structure and environment configuration.
- Configure Django and Django REST Framework.
- Configure React with TypeScript and routing.
- Connect Django to Supabase PostgreSQL.
- Add environment variable handling.
- Configure CORS for local frontend-to-backend requests.
- Add API health endpoint and frontend API client.
- Establish formatting, linting, and test commands.
- Add a basic CI check if the repository uses CI.
- Build the initial application shell, navigation, and API status screen.

### Deliverables

- React application starts locally.
- Django API starts locally.
- Django connects to Supabase PostgreSQL.
- `GET /api/health/` returns a successful response.
- Frontend can display the API health status.
- Secrets are excluded from Git.

### Completion criteria

```text
Frontend runs → Backend runs → Database connection works → Health check passes
```

---

## Phase 2 — Authentication and Application Profiles

### Objective

Implement a complete and verified Supabase Auth flow between React and Django.

### Work

- Configure Supabase Auth.
- Implement React sign-up, sign-in, sign-out, and session refresh.
- Add protected frontend routes.
- Send the Supabase access token with Django API requests.
- Implement Django JWT verification for Supabase tokens.
- Create `ApplicationProfile` linked to the Supabase user ID.
- Implement `GET /api/me/`.
- Handle expired, missing, malformed, and invalid tokens.
- Configure frontend and backend auth error states.
- Build sign-up, sign-in, sign-out, protected route, and session-loading screens.

### Deliverables

- User can register and sign in.
- User remains signed in after page refresh.
- User can sign out.
- Django identifies the authenticated user.
- Unauthorized API requests return `401`.
- Authenticated `GET /api/me/` returns the application profile.

### Completion criteria

```text
React login → Bearer token → Django verifies token → /api/me/ returns 200
```

This phase must be completed before building protected groups or expenses.

---

## Phase 3 — Groups and Memberships

### Objective

Allow users to create groups and manage the members who share expenses.

### Work

- Implement `Group` and `GroupMembership` models.
- Add group owner/admin and member roles.
- Create group list, detail, create, and membership APIs.
- Build group creation and group dashboard screens.
- Add member management for group admins.
- Enforce object-level authorization.
- Prevent duplicate memberships.
- Add empty, loading, and error states.
- Build group list, create-group, group detail, member list, and member-management screens.

### Deliverables

- User can create a group.
- Group creator becomes an administrator.
- User can add or invite members according to the selected MVP approach.
- Members can view their groups.
- Non-members cannot access group data.
- Group dashboard displays members and basic group information.

### Completion criteria

```text
Create group → Add members → View group → Reject unauthorized access
```

---

## Phase 4 — Expenses and Split Calculations

### Objective

Implement the core expense-recording workflow with correct financial rules.

### Work

- Implement `Expense` and `ExpenseParticipant` models.
- Store amounts as integer minor units, such as paise.
- Support equal, custom-amount, and percentage splits.
- Implement split calculation services.
- Handle deterministic rounding.
- Validate payer and participants as group members.
- Validate that participant shares equal the expense total.
- Create expense list, detail, create, edit, and delete APIs.
- Build the expense form and split preview UI.
- Add database transactions for expense writes.
- Add comprehensive calculation tests.
- Build expense list, expense detail, add-expense form, split selector, live split preview, edit, and delete flows.

### Deliverables

- User can add a manual expense.
- User can select the payer and participants.
- User can preview each participant’s share.
- Equal split works correctly.
- Custom split rejects incorrect totals.
- Percentage split rejects percentages that do not total 100%.
- Expense history displays correctly.
- Authorized users can edit or delete according to policy.

### Completion criteria

```text
Create expense → Validate split → Save expense + shares atomically → Display history
```

This is the first major business milestone and must be correct before balances are added.

---

## Phase 5 — Balances, Debt Simplification, and Settlements

### Objective

Turn expense history into understandable balances and settlement actions.

### Work

- Implement balance calculation service.
- Include payer contributions and participant responsibilities.
- Include completed or confirmed settlements in balance calculations.
- Implement debt simplification between creditors and debtors.
- Add balance explanation showing contributing expenses.
- Implement `Settlement` model and APIs.
- Build balance dashboard and settlement history screens.
- Allow users to record and confirm repayments.
- Prevent invalid settlements.
- Add tests for multi-person and edge-case scenarios.
- Build balance dashboard, member balance breakdown, settlement recommendations, settlement form, and settlement history screens.

### Deliverables

- Each member can see whether they owe or should receive money.
- Group balances sum to zero.
- Debt recommendations reduce unnecessary transactions.
- Original expenses remain unchanged after simplification.
- Users can record settlements.
- Recorded settlements update balances correctly.
- Cancelled settlements do not affect current balances.

### Completion criteria

```text
Expenses + settlements → Net balances → Simplified recommendations → Updated balance after repayment
```

---

## Phase 6 — AI Quick Add

### Objective

Allow users to create a proposed expense from natural-language input without allowing AI to bypass validation or confirmation.

### Work

- Add `langchain-openai` and LangChain integration.
- Keep the OpenAI API key on the Django backend.
- Define a structured Pydantic expense schema.
- Build the Quick Add prompt and parsing service.
- Pass only relevant group context to the model.
- Resolve names against actual group members.
- Detect unknown or ambiguous members.
- Recalculate shares in Django.
- Build editable AI confirmation UI.
- Save through the normal expense creation workflow only after confirmation.
- Add timeout, rate-limit, invalid-output, and provider-error handling.
- Do not log API keys, tokens, or unnecessary financial data.
- Build Quick Add input, parsing progress state, editable AI proposal, confirmation, correction, and failure screens.

### Deliverables

- User can enter natural-language expense text.
- AI returns structured proposed fields.
- User can edit the proposal.
- Unknown names produce a clear correction message.
- User confirmation creates a normal expense.
- AI failure does not break manual expense creation.

### Completion criteria

```text
Natural language → Structured proposal → User confirms → Existing expense workflow saves it
```

The AI service parses data only; Django remains responsible for validation and persistence.

---

## Phase 7 — Hardening, Deployment, and Final Delivery

### Objective

Make the MVP reliable, secure, demonstrable, and ready for internship evaluation.

### Work

- Review all API authorization rules.
- Add frontend and backend validation for edge cases.
- Complete unit, integration, and end-to-end tests.
- Test mobile and desktop layouts.
- Add pagination for expense history.
- Improve loading, empty, and error states.
- Configure production environment variables.
- Deploy React frontend and Django backend separately.
- Configure production CORS and Supabase redirect URLs.
- Run database migrations against the production Supabase project.
- Add API documentation.
- Add setup and deployment instructions.
- Prepare demo data and a presentation walkthrough.
- Remove debug configuration and exposed secrets.
- Complete responsive frontend polish, accessibility checks, and browser-based end-to-end flows.

### Final end-to-end test

```text
Register
  → Sign in
  → Create group
  → Add members
  → Add manual expense
  → Add AI expense
  → Verify balances
  → View simplified debts
  → Record settlement
  → Verify updated balance
```

### Completion criteria

- Application can be started using documented commands.
- Authentication works in the deployed environment.
- Unauthorized users cannot access other groups.
- Financial calculations pass automated tests.
- AI Quick Add requires confirmation.
- No secret keys are exposed in frontend code or Git.
- README and context documentation describe the final system.
- A complete demo can be performed without manual database edits.

## Phase Dependencies

| Phase | Depends on | Must not start before |
| --- | --- | --- |
| 1. Foundation | None | — |
| 2. Authentication | Phase 1 | API and database are reachable |
| 3. Groups | Phase 2 | `/api/me/` works |
| 4. Expenses | Phase 3 | Membership authorization works |
| 5. Balances | Phase 4 | Expense shares are correct |
| 6. AI Quick Add | Phase 4 | Manual expense creation works |
| 7. Hardening and deployment | Phases 2–6 | Core vertical slice works |

## MVP Definition of Done

The internship MVP is complete when a real user can register, create a group, add members, record expenses using supported split methods, use AI Quick Add, view accurate balances, understand simplified settlement recommendations, record a repayment, and complete the entire workflow through the deployed interface without direct database intervention.
