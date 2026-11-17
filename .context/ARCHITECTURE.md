# Splitter AI — System Architecture

## 1. Architecture Overview

Splitter AI follows a layered client-server architecture.

```text
┌──────────────────────────────┐
│ React + TypeScript Frontend  │
│ UI, forms, dashboards, state  │
└──────────────┬───────────────┘
               │ HTTPS REST + JWT
               ▼
┌──────────────────────────────┐
│ Django REST Framework API    │
│ Auth, validation, business   │
│ rules, balances, settlements │
└───────┬──────────────┬───────┘
        │              │
        ▼              ▼
┌───────────────┐  ┌──────────────────┐
│ Neon          │  │ LangChain        │
│ PostgreSQL    │  │ + OpenAI API     │
│ application   │  │ AI Quick Add     │
│ data          │  └──────────────────┘
└───────────────┘

React ───────────────► Neon Auth
```

The frontend is responsible for presentation and user interaction. Django is the authoritative application layer and owns all financial calculations and database writes. Neon provides Managed Better Auth and PostgreSQL infrastructure. OpenAI is accessed only through the Django backend.

## 2. Architectural Principles

1. **Backend authority:** Expense validation, balance calculations, debt simplification, and settlements are controlled by Django.
2. **Single source of truth:** Neon PostgreSQL stores the application data; React does not directly modify expense data.
3. **Explicit confirmation:** AI-generated expenses must be reviewed and confirmed before persistence.
4. **Exact money handling:** Monetary values use integer minor units, such as paise, or another exact representation—not floating-point numbers.
5. **Defense in depth:** Neon Auth authentication, Django authorization, database constraints, and input validation work together.
6. **Modular business logic:** Split calculations and debt simplification remain independent services that can be tested without HTTP or UI code.

## 3. Main Components

### 3.1 React frontend

Responsibilities:

- Render authentication, dashboard, group, expense, balance, and settlement screens.
- Manage form state and client-side validation.
- Use Neon Auth for registration, sign-in, sign-out, and token refresh.
- Attach the Neon Auth access token to Django API requests.
- Display AI-extracted data in an editable confirmation form.
- Handle loading, empty, validation, unauthorized, and server-error states.

Suggested frontend areas:

```text
src/
├── app/                 # routing and application providers
├── auth/                # Neon Auth integration
├── features/
│   ├── groups/
│   ├── expenses/
│   ├── balances/
│   ├── settlements/
│   └── quick-add/
├── components/          # shared UI components
├── lib/                 # API client and utilities
└── types/               # shared frontend types
```

### 3.2 Django REST API

Responsibilities:

- Receive and authenticate API requests.
- Verify Neon Auth JWTs.
- Map the authenticated Neon Auth user to an application profile.
- Enforce group and object-level permissions.
- Validate expense and settlement data.
- Run balance and debt calculations.
- Call the AI service for Quick Add requests.
- Persist changes using database transactions.

Suggested Django areas:

```text
app/
├── accounts/            # application profiles and authentication helpers
├── groups/              # groups and memberships
├── expenses/            # expenses and participant shares
├── settlements/         # repayments and settlement history
├── balances/            # balance calculation and debt simplification
├── ai/                  # LangChain/OpenAI integration
└── common/              # shared permissions, errors, and utilities
```

### 3.3 Neon Auth

Neon Auth is Neon’s managed Better Auth service. It owns user sign-up, sign-in, sessions, refresh tokens, and authentication providers. Do not install or operate a separate self-managed Better Auth server.

Authentication flow:

```text
1. User signs in through React and Neon Auth.
2. Neon Auth returns an access token.
3. React sends Authorization: Bearer <token> to Django.
4. Django verifies signature, issuer, audience, and expiration.
5. Django extracts the Neon Auth user ID from the verified token.
6. Django loads or creates the corresponding application profile.
7. Django applies group-level authorization before returning data.
```

Neon credentials and private keys must never be included in the frontend bundle. JWT verification must not rely on merely decoding the token.

### 3.4 Neon PostgreSQL

Neon PostgreSQL stores application-owned data accessed through Django’s PostgreSQL driver and ORM. Neon Auth remains the authentication provider.

The database should contain a clear separation between authentication records managed by Neon Auth in the `neon_auth` schema and application records managed by Django. Application migrations must not modify the managed `neon_auth` schema.

## 4. Domain Model

```text
ApplicationProfile
        │
        ├──< GroupMembership >── Group
        │                           │
        │                           ├──< Expense
        │                           │       │
        │                           │       └──< ExpenseParticipant >── ApplicationProfile
        │                           │
        │                           └──< Settlement
        │                                   ├── payer
        │                                   └── receiver
        │
        └── created/updated records
```

### Core entities

| Entity | Purpose |
| --- | --- |
| `ApplicationProfile` | Application-specific profile linked to a Neon Auth user ID |
| `Group` | A collection of users sharing expenses |
| `GroupMembership` | Membership, role, and status within a group |
| `Expense` | Original expense, payer, amount, currency, and split method |
| `ExpenseParticipant` | Individual member share for an expense |
| `Settlement` | A recorded repayment between two group members |

### Expense representation

An expense should store the original total and payer. Individual responsibilities should be stored in `ExpenseParticipant` records.

```text
Expense: Dinner, ₹1500, paid by Rahul

ExpenseParticipant:
├── Rahul: ₹500
├── Aman:  ₹500
└── Priya: ₹500
```

The sum of participant shares must equal the expense total.

## 5. Request and Data Flow

### Manual expense flow

```text
React expense form
        ↓
POST /api/groups/{id}/expenses/
        ↓
Django JWT authentication
        ↓
Group membership authorization
        ↓
Serializer validation
        ↓
Split calculation and invariant checks
        ↓
Database transaction
        ↓
Expense + participant shares saved
        ↓
Updated response returned to React
```

### Balance flow

```text
Group balance request
        ↓
Load group expenses and completed settlements
        ↓
Calculate each member's net balance
        ↓
Separate creditors and debtors
        ↓
Generate simplified settlement recommendations
        ↓
Return balances and explanation to React
```

The original expenses are never changed by debt simplification.

### AI Quick Add flow

```text
User enters natural-language expense
        ↓
React sends text and group context to Django
        ↓
Django checks user and group access
        ↓
LangChain sends a constrained prompt to OpenAI
        ↓
Structured expense object is returned
        ↓
Django validates names, amount, currency, and split rules
        ↓
React displays editable confirmation
        ↓
User confirms or corrects the data
        ↓
Normal expense creation endpoint saves it
```

The AI endpoint should parse data only. It should not create database records directly.

## 6. API Boundaries

Suggested endpoints:

```text
GET    /api/me/

GET    /api/groups/
POST   /api/groups/
GET    /api/groups/{group_id}/
POST   /api/groups/{group_id}/members/
DELETE /api/groups/{group_id}/members/{user_id}/

GET    /api/groups/{group_id}/expenses/
POST   /api/groups/{group_id}/expenses/
GET    /api/groups/{group_id}/expenses/{expense_id}/
PATCH  /api/groups/{group_id}/expenses/{expense_id}/
DELETE /api/groups/{group_id}/expenses/{expense_id}/

GET    /api/groups/{group_id}/balances/
GET    /api/groups/{group_id}/settlement-suggestions/

GET    /api/groups/{group_id}/settlements/
POST   /api/groups/{group_id}/settlements/

POST   /api/ai/parse-expense/
```

The AI parse endpoint should return a proposed object, while the standard expense endpoint remains the only endpoint that creates an expense.

## 7. Authorization Model

Authentication answers “Who is this user?” Authorization answers “What may this user do?”

Examples:

- Only authenticated users can access application APIs.
- Only group members can read group expenses and balances.
- Only group administrators can manage membership.
- Expense editing permissions must be explicit and consistent.
- A settlement must involve members of the same group.
- Users cannot submit participants from another group.

Django should enforce these rules even if the frontend hides unauthorized actions.

## 8. Financial Invariants

The backend should enforce these invariants:

- Expense amount is greater than zero.
- Payer belongs to the group.
- Every participant belongs to the group.
- Equal split shares total the expense amount.
- Custom shares total the expense amount.
- Percentages total 100% before conversion to shares.
- Settlement amount is greater than zero.
- Settlement payer and receiver are different group members.
- A settlement cannot exceed the relevant outstanding balance unless overpayment is explicitly supported.
- All money calculations use exact arithmetic.

## 9. Security and Privacy

- Store secrets in environment variables.
- Keep OpenAI and Neon credentials protected on the Django server.
- Use HTTPS in deployed environments.
- Validate and authorize every protected request in Django.
- Configure CORS to allow only the deployed frontend origin.
- Do not send unnecessary personal or financial data to OpenAI.
- Avoid logging access tokens, passwords, or full financial payloads.
- Apply request throttling to AI endpoints.
- Use database transactions for multi-table expense and settlement writes.

## 10. Deployment Architecture

```text
User Browser
    │
    ├── React static application host
    │
    └── Django API host ─── Neon PostgreSQL
                              │
                              └── Neon Auth

Django API ─── OpenAI API
```

Development uses a local React application and local Django server connected to the Neon project/branch. Production deploys the frontend and backend separately, with environment-specific URLs and secrets.

## 11. Testing Strategy

### Backend tests

- Split calculation tests
- Rounding and amount invariant tests
- Balance calculation tests
- Debt simplification tests
- Settlement update tests
- Authentication and authorization tests
- AI response validation tests
- API integration tests

### Frontend tests

- Expense form validation
- Split preview behavior
- AI confirmation and correction flow
- Loading and error states
- Protected route behavior

### End-to-end scenarios

1. Sign in and create a group.
2. Add members and create an equal split.
3. Create a custom split.
4. Verify balances and settlement recommendations.
5. Record a settlement and verify updated balances.
6. Add an expense through AI Quick Add and confirm it.
7. Verify that a non-member cannot access the group.

## 12. Future Extensions

The architecture can later support:

- Receipt upload and OCR
- Notifications and reminders
- Realtime balance updates
- Multiple currencies and exchange rates
- Payment provider integrations
- Mobile clients
- Recurring expenses
- Expense categories and analytics

These are intentionally outside the first internship MVP.
