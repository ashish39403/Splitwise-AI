# Splitter AI

React + TypeScript frontend and Django REST API for the Splitter AI expense-sharing MVP.

## Phase 1 local setup

1. In the ignored root `.env`, paste the complete PostgreSQL URL from Supabase **Dashboard → Connect**. Do not use a Supabase Auth key as a database password; its password must be URL-encoded when it contains reserved characters.
2. Leave `OPENAI_API_KEY` empty until Phase 6, or add your own key when you are ready to build AI Quick Add. It is server-only and must never be copied into `frontend/.env`.
3. Start the API with `uv run python manage.py runserver`.
4. Start the frontend with `npm run dev` from `frontend/`.

The frontend has only a Supabase Auth client configuration. It does not read or write Supabase database tables directly; Django remains the application API and database owner.

## Verification commands

```powershell
uv run ruff check .
uv run ruff format --check .
uv run python manage.py test

Set-Location frontend
npm run check
```

With both services running, open the Vite URL and confirm that the API status card reports `splitter-ai-api is online`. The public liveness endpoint is `GET /api/health/`.
