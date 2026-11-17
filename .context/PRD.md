# Splitter AI — Product Requirements Document

**Status:** Draft  
**Project type:** Internship project  
**Product type:** Full-stack expense-sharing web application  
**Final stack:** React, TypeScript, Django, Django REST Framework, Supabase Auth, Supabase PostgreSQL, LangChain, OpenAI API

## 1. Project Overview

Splitter AI helps groups record shared expenses, calculate individual responsibilities, track balances, and settle debts. It is designed for friends, roommates, students, travelers, couples, families, and small teams who regularly share costs.

The application also includes **AI Quick Add**, which lets a user describe an expense in natural language and converts that description into structured expense details for review and confirmation.

## 2. Problem Statement

People commonly track shared expenses through messaging applications, notes, spreadsheets, or memory. These methods become unreliable when multiple people pay for different expenses, participate in different expenses, or use unequal split rules.

Users need a simple and transparent way to answer:

- Who paid for each expense?
- Who participated?
- How much does each person owe?
- Who should pay whom?
- Has a repayment already been completed?

Manual calculations are time-consuming and prone to mistakes. Entering every expense manually is also inconvenient, which can cause users to stop recording expenses accurately.

Splitter AI addresses these problems by centralizing expense records, calculating balances, simplifying debts, and supporting natural-language expense entry while keeping the user in control of final confirmation.

## 3. Product Vision

Create a trustworthy expense-sharing application that makes group finances easy to record, understand, and settle.

The product should make users feel:

- Confident that calculations are accurate
- Able to understand how a balance was calculated
- Comfortable adding expenses quickly
- Able to settle debts with minimal unnecessary transactions

## 4. Goals

### Primary goals

1. Allow users to register and securely access their account.
2. Allow users to create groups and manage group members.
3. Support equal, custom-amount, and percentage-based expense splitting.
4. Calculate individual and group balances automatically.
5. Simplify debts into a smaller number of settlement recommendations.
6. Allow users to record and view payment settlements.
7. Provide a transparent expense and settlement history.
8. Provide AI-assisted natural-language expense creation.
9. Require user confirmation before saving AI-extracted expense data.

### Secondary goals

- Provide a responsive and accessible interface.
- Demonstrate secure integration between the frontend, backend, database, and AI service.
- Include automated tests for financial calculations and authorization rules.
- Produce a maintainable project suitable for internship evaluation and demonstration.

## 5. Non-Goals for Version 1

The first version will not include:

- Bank or UPI payment integration
- Automatic bank transaction synchronization
- Real-money transfers
- Tax or accounting compliance
- Business invoicing
- Live exchange-rate conversion
- Native Android or iOS applications
- Social feeds or public profiles
- Automatic saving of AI results without confirmation
- Advanced receipt OCR as a core workflow

These may be considered as future enhancements after the core product is stable.

## 6. Target Users and Use Cases

### Friends on a trip

Different people pay for hotels, food, transportation, and activities. The group needs final balances and a manageable settlement plan.

### Roommates

Roommates share rent, utilities, groceries, and household purchases. Some expenses involve everyone, while others involve only selected members.

### Group meals

One person pays the bill, but the cost must be split equally or according to individual consumption.

### Student events

Students purchase materials, food, or transportation for a shared event. Multiple members pay at different times and need reimbursement.

## 7. Core User Flow

```text
Register or sign in
        ↓
Create or join a group
        ↓
Add group members
        ↓
Add an expense manually or with AI Quick Add
        ↓
Review and confirm expense details
        ↓
System calculates balances
        ↓
Users view simplified debts
        ↓
Users record settlements
```

## 8. Functional Requirements

### 8.1 Authentication

Users must be able to register, sign in, sign out, and manage basic profile information. Protected API endpoints must verify authentication and authorization.

### 8.2 Groups and members

Users must be able to create groups, set a group name, add or invite members, view group members, and view group-specific expenses, balances, and settlements. Each group should have an owner or administrator for membership management.

### 8.3 Expense creation

An expense should contain:

- Description
- Total amount
- Currency
- Date
- Payer
- Participants
- Split method
- Optional notes

The system must validate that the amount is positive, the payer and participants belong to the group, and all shares or percentages add up correctly.

### 8.4 Splitting methods

The application must support:

- **Equal split:** Divide the total among selected participants.
- **Custom amount split:** Enter the exact amount owed by each participant.
- **Percentage split:** Assign a percentage to each participant; percentages must total 100%.

The calculated share for each participant must be visible before the expense is saved. Rounding must be deterministic, and the final shares must equal the original total.

### 8.5 Balance calculation

For each member, the system should calculate:

```text
Net balance = Amount paid for others − Amount owed by the user
```

Interpretation:

- Positive balance: the user should receive money.
- Negative balance: the user owes money.
- Zero balance: the user is settled.

Balances must be traceable to the relevant expenses and settlements.

### 8.6 Debt simplification

The application should use net group balances to recommend a reduced set of repayments. For example:

```text
Rahul should receive ₹800
Aman owes ₹500
Priya owes ₹300
```

Recommended settlements:

```text
Aman pays Rahul ₹500
Priya pays Rahul ₹300
```

Debt simplification must not modify the original expense records.

### 8.7 Settlements

Users must be able to view suggested repayments, record who paid whom, enter the amount and date, mark a repayment as completed, and view settlement history. The application must not claim that an external payment occurred unless a user records or confirms it.

### 8.8 Expense history

Users must be able to view expenses chronologically, open expense details, see participants and individual shares, and edit or delete expenses according to permissions. Changes must update balances consistently.

### 8.9 AI Quick Add

Users may enter text such as:

> Dinner with Rahul and Aman for ₹1,500, paid by me, split equally.

The AI service should extract structured fields including description, amount, currency, payer, participants, split method, and suggested shares.

AI output must be displayed in an editable confirmation form. The backend must validate the result, resolve names against actual group members, highlight ambiguity, handle failures gracefully, and prevent the AI response from directly writing to the database.

## 9. Non-Functional Requirements

### Security

- Enforce authentication and object-level authorization.
- Prevent users from accessing another group’s data.
- Keep OpenAI credentials on the backend.
- Validate all important data server-side.
- Apply rate limiting to AI endpoints where appropriate.

### Accuracy

- Store monetary values as integer minor units, such as paise, or use an equivalent exact representation.
- Use database transactions for expense and settlement changes.
- Ensure every split total equals the original expense total.
- Test rounding, editing, deletion, and settlement edge cases.

### Performance

- Use pagination for long expense histories.
- Keep group balance loading responsive for normal group sizes.
- Show loading, timeout, and error states for AI requests.

### Usability and accessibility

- Make expense creation understandable without technical knowledge.
- Show the effect of a split before saving.
- Do not rely on color alone to communicate positive, negative, or settled balances.
- Support common desktop and mobile screen sizes.

## 10. Suggested Data Model

```text
User
Group
GroupMember
Expense
ExpenseParticipant
Settlement
```

Relationships:

```text
User ──< GroupMember >── Group
Group ──< Expense
Expense ──< ExpenseParticipant >── User
Group ──< Settlement
```

An `Expense` should store the original expense information. An `ExpenseParticipant` should store each participant’s calculated share. This keeps the original expense separate from each person’s responsibility.

## 11. Technical Direction

### Frontend

- React
- TypeScript
- Client-side routing
- Form validation
- API client layer
- Responsive component system
- Loading, empty, validation, and error states

### Authentication

- Supabase Auth for registration, sign-in, and session management.
- React uses the Supabase client for authentication.
- Django verifies Supabase JWTs and applies application-level authorization.
- The Supabase user ID is linked to the application profile used by groups and expenses.

### Backend

- Django
- Django REST Framework
- Authentication and permissions
- Serializers for request validation
- Service layer for balance and debt calculations
- Database transactions for financial operations

### Database

- Supabase PostgreSQL
- Relational constraints and indexes
- Exact monetary representation
- Group-based query optimization

### AI integration

- Use LangChain with the `langchain-openai` integration from Django.
- Call the OpenAI API only from the backend.
- Request structured output rather than free-form text.
- Validate and normalize the result on the backend.
- Require user confirmation before persistence.
- Log failures without exposing credentials or unnecessary personal data.

## 12. Success Criteria

The project will be considered functionally successful when:

- A user can register and sign in.
- A user can create a group and add members.
- A user can create equal, custom, and percentage-based expenses.
- Balances are correct for representative scenarios.
- Debt simplification produces valid settlement recommendations.
- Settlements update balances correctly.
- AI Quick Add produces editable structured data.
- Invalid splits and unauthorized requests are rejected.
- Core financial and authorization logic is covered by automated tests.
- The application can be run using documented setup instructions.

If real users test the product, useful measurements include expense creation success rate, AI parsing failure rate, average time to add an expense, number of calculation corrections, and percentage of groups that record settlements.

## 13. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| AI misunderstands names, amounts, or split rules | Structured output, validation, editable confirmation, and ambiguity warnings |
| Rounding or formula errors create incorrect balances | Exact monetary representation, deterministic rounding, invariants, and tests |
| Feature scope expands too quickly | Prioritize expenses, balances, and settlements before enhancements |
| Users do not trust settlement recommendations | Explain recommendations and preserve original expense history |
| Financial data is exposed | Enforce authorization, protect secrets, and minimize data sent to AI |

## 14. Proposed Milestones

### Milestone 1: Foundation

- Project setup
- Authentication
- PostgreSQL connection
- User, group, and membership models
- Initial API structure

### Milestone 2: Expense management

- Manual expense creation
- Equal, custom, and percentage splits
- Expense history
- Validation and automated tests

### Milestone 3: Balances and settlements

- Balance calculation
- Debt simplification
- Settlement recording
- Balance and history screens

### Milestone 4: AI Quick Add

- Natural-language input
- OpenAI structured extraction
- Confirmation and editing flow
- Error and ambiguity handling

### Milestone 5: Quality and presentation

- Responsive UI improvements
- Authorization testing
- Calculation edge cases
- Documentation
- Deployment or demonstration setup

## 15. Open Questions

1. Will users join groups through invite links, invite codes, or direct member addition?
2. Can users edit any expense, or only the person who created it?
3. Will deleted expenses be permanently removed or archived?
4. Will version one support only INR?
5. Should categories be included in the first version?
6. Should settlements require confirmation from both users?
7. How should the application handle duplicate or ambiguous member names?
8. Should AI Quick Add support multiple expenses in one sentence?
9. Will balances be calculated dynamically or cached?
10. What is the intended maximum group size for the internship demonstration?

## 16. Project Summary

Splitter AI is a full-stack expense-sharing application that helps groups manage shared financial responsibilities. It allows users to create groups, record expenses, select participants, split bills using different methods, calculate balances, simplify debts, and record settlements. Its AI Quick Add feature converts natural-language descriptions into structured expense data for user confirmation. The project demonstrates practical use of Django, Django REST Framework, React, TypeScript, PostgreSQL, and the OpenAI API, with a focus on accuracy, transparency, security, and usability.
