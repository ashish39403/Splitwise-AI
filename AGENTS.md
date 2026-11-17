# Splitter AI — Agent Instructions

## Repository Context

Splitter AI is a full-stack AI-assisted expense-sharing application for the internship MVP. Users can create groups, add members, record shared expenses, split bills, view balances, simplify debts, record settlements, and create expenses through AI Quick Add.

Before making architectural or feature changes, read the relevant documents in `.context/`:

- `PRD.md` — product requirements and scope
- `TECH_STACK.md` — finalized technology choices
- `ARCHITECTURE.md` — system boundaries and request flows
- `DATABASE_MODELS.md` — proposed data model and financial invariants
- `E2E_BUILD_PLAN.md` — seven-phase implementation plan

## Final Technology Stack

- **Frontend:** React + TypeScript
- **Backend:** Django + Django REST Framework
- **Authentication:** Supabase Auth
- **Database:** Supabase PostgreSQL
- **AI pipeline:** LangChain + `langchain-openai` + OpenAI API

Do not introduce Neon, a second database, or a second authentication provider unless the user explicitly changes the architecture.

## Architecture Rules

The intended request flow is:

```text
React → Django REST API → Supabase PostgreSQL
React → Supabase Auth
Django → LangChain → OpenAI API
```

- React owns presentation, navigation, forms, and user interaction.
- Django is the authoritative application and business-logic layer.
- Django owns expense validation, balance calculation, debt simplification, settlement rules, and database writes.
- Supabase Auth owns authentication identity and sessions.
- Django must verify Supabase JWTs before serving protected data.
- OpenAI must be called only from Django; never expose the OpenAI key in frontend code.
- The AI parser proposes data; it must never directly create database records.
- Confirmed AI data must pass through the same validation and expense-creation path as manual data.

## Domain and Database Rules

- Use the domain terms from `DATABASE_MODELS.md`: `ApplicationProfile`, `Group`, `GroupMembership`, `Expense`, `ExpenseParticipant`, and `Settlement`.
- Link application profiles to Supabase users using the verified Supabase user ID.
- Do not duplicate password or session management in Django when Supabase Auth is being used.
- Use Django migrations for application schema changes.
- Do not modify Supabase’s internal authentication schema through application migrations.
- Keep application data and authentication data conceptually separate.
- Preserve original expenses and settlement history; debt simplification is a derived recommendation.

## Financial Rules

- Store money using exact integer minor units, such as paise; never use floating-point values for financial calculations.
- Validate all split totals on the backend.
- Equal, custom, and percentage splits must produce participant shares whose total equals the original expense amount.
- Use deterministic rounding and test rounding edge cases.
- A payer and every participant must belong to the relevant group.
- A settlement payer and receiver must be different members of the same group.
- Calculate balances from expenses and valid settlements rather than maintaining an uncontrolled mutable balance field.
- Keep balance and debt-simplification logic in testable service modules, not inside views or React components.
- Use database transactions for multi-row expense and settlement writes.

## Frontend and Backend Workflow

Develop frontend and backend side by side in vertical slices. Do not wait for the entire backend to finish before building the UI.

- Define or update the API contract first.
- Build the corresponding React screen and form in parallel.
- Use typed request and response shapes.
- Include loading, empty, validation, unauthorized, and server-error states.
- Keep frontend calculations as previews only; Django remains authoritative.
- Complete each phase in `E2E_BUILD_PLAN.md` as a working, testable slice.

## API and Authorization

- Protect all non-public endpoints.
- Enforce object-level authorization in Django, even when the frontend hides actions.
- Never trust group IDs, member IDs, payer IDs, or participant IDs supplied by the client without checking membership.
- Return consistent validation and authorization errors.
- Keep authentication separate from authorization: a valid user is not automatically allowed to access every group.
- Use `/api/me/` as the first protected endpoint when implementing or debugging authentication.

## Security and Secrets

- Keep Supabase secret/service keys, database URLs, OpenAI keys, and Django secrets in environment variables.
- Never commit `.env` files or credentials.
- Never put secret keys in React environment variables or the browser bundle.
- Do not log access tokens, passwords, API keys, or unnecessary financial payloads.
- Configure CORS to allow only known frontend origins.
- Apply throttling or rate limiting to AI endpoints.
- Treat user-entered AI text and model output as untrusted input.

## AI Quick Add Rules

- Use LangChain only where it provides value: prompt composition, structured output, and controlled parsing.
- Prefer a small structured-output pipeline over autonomous agents for the MVP.
- Validate AI output with a Pydantic/schema model and Django business rules.
- Resolve names against actual group members.
- Reject or flag unknown and ambiguous names.
- Recalculate participant shares in Django instead of trusting model-generated amounts.
- Require explicit user confirmation before saving.
- Manual expense creation must continue to work if OpenAI is unavailable.

## Testing Requirements

Add tests for every financial rule and protected workflow, including:

- Equal, custom, and percentage splits
- Rounding and total-share invariants
- Balance calculations
- Debt simplification
- Settlement effects and cancellation
- JWT authentication failures
- Group membership authorization
- AI schema validation and ambiguous names
- API and end-to-end user flows

Do not consider a feature complete only because its UI renders. Verify the API, database behavior, authorization, and edge cases.

## Change Discipline

- Preserve existing user work and unrelated changes.
- Prefer small, reviewable changes aligned with the current build phase.
- Do not add infrastructure or libraries without a clear requirement.
- Do not silently change the final stack or product scope.
- Update the relevant `.context` document when a confirmed architectural or domain decision changes.
- Keep documentation truthful: distinguish implemented behavior from planned behavior.
- Before destructive actions, verify the exact target and obtain explicit user direction when the scope is unclear.

## Shell and Tooling

- Follow the shared RTK instructions at `C:\Users\Ashish\.codex\RTK.md`.
- Prefix shell commands with `rtk` where supported.
- Use `apply_patch` for source and documentation edits.
- Prefer `rg` or `rg --files` for searching files and text.
- Do not expose credentials or sensitive environment values in command output.

## Definition of Done

A feature is done when:

1. Its API and UI behavior match the PRD.
2. Authentication and authorization are enforced server-side.
3. Financial invariants are validated and tested.
4. Loading, empty, validation, and error states exist where relevant.
5. Secrets are protected.
6. Relevant documentation is updated.
7. The feature works as part of the end-to-end user flow.
