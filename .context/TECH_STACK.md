# Splitter AI — Final Tech Stack

## Frontend

- **React + TypeScript** — Builds the responsive user interface, dashboards, forms, group screens, balances, settlements, and AI confirmation flow.

## Backend

- **Django** — Provides the application structure, ORM, validation, business logic, and database transactions.
- **Django REST Framework** — Exposes REST APIs for authentication-aware group, expense, balance, and settlement operations.

## Authentication

- **Supabase Auth** — Handles registration, sign-in, sessions, and access tokens.
- React sends the Supabase access token to Django. Django verifies the JWT and applies authorization rules.

## Database

- **Supabase PostgreSQL** — Stores users’ application profiles, groups, members, expenses, shares, balances, and settlements.
- Django accesses the database through the PostgreSQL connection and Django ORM.

## AI Pipeline

- **LangChain** — Organizes the AI Quick Add prompt and structured-output workflow.
- **OpenAI API** — Extracts expense details from natural-language input.
- AI output is validated by Django and shown to the user for confirmation before saving.

## Architecture Rule

```text
React → Django REST API → Supabase PostgreSQL
React → Supabase Auth
Django → LangChain → OpenAI API
```

Django remains the single owner of expense validation, balance calculation, debt simplification, settlements, and database writes. OpenAI keys and Supabase secret keys must remain on the backend.

## Environment

- **Development:** Supabase Free plan, local React frontend, local Django backend.
- **Deployment:** Deploy React and Django separately, connected to the same Supabase project.

This stack is sufficient for the internship MVP and can be expanded later with notifications, receipt processing, realtime updates, or payment integrations.
