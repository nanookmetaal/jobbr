# Jobbr

A professional matching platform - think Tinder for jobs and mentorship. Create a profile as a job seeker, employer, mentor, or mentee, and get matched with complementary people based on what you offer and what you're looking for.

## Features

- Passwordless sign-in via magic link (email)
- Profile creation and editing (job seeker, employer, mentor, mentee)
- Profile analysis - completeness score, strengths, gaps, and improvement tips
- Smart matching using vector embeddings (Voyage AI) - finds complementary profiles, not just similar ones
- Swipe left/right on matches (drag or click)
- Mutual match detection with coffee invite notification
- Notification bell with unread count

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | Python, FastAPI, SQLAlchemy (async), asyncpg |
| Database | PostgreSQL + pgvector |
| Embeddings | Voyage AI (`voyage-3`) |
| AI analysis | LangChain + Anthropic Claude |
| Email | Resend |

## Running locally

### Prerequisites

- Python 3.11-3.13 with [uv](https://docs.astral.sh/uv/)
- Node.js 18+
- PostgreSQL with pgvector (`brew install pgvector` on macOS)

### 1. Database

```bash
brew services start postgresql@17

psql postgres -c "CREATE USER jobbr WITH PASSWORD 'jobbr';"
psql postgres -c "CREATE DATABASE jobbr OWNER jobbr;"
psql -d jobbr -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env and fill in your API keys

uv sync
uv run uvicorn app.main:app --reload --port 8000
```

API docs available at http://localhost:8000/docs.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.

## Environment variables

Copy `backend/.env.example` to `backend/.env` and fill in all values:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Use the default for local setup |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/ |
| `VOYAGE_API_KEY` | https://dash.voyageai.com/ |
| `RESEND_API_KEY` | https://resend.com/ |
| `EMAIL_FROM` | A sender address on a domain verified in Resend |
| `JWT_SECRET` | Any random string (e.g. `openssl rand -hex 32`) |
| `FRONTEND_URL` | `http://localhost:3000` for local dev |

## Deploying to Railway

Both services include a `railway.json`. Deploy as two separate Railway services from this repo - one rooted at `backend/`, one at `frontend/`.

**Backend env vars:** same as above, but `DATABASE_URL` is provided automatically by Railway's PostgreSQL plugin. Set `FRONTEND_URL` to your deployed frontend URL.

**Frontend env vars:** set `NEXT_PUBLIC_API_URL` to your deployed backend URL.

Railway's managed PostgreSQL supports pgvector - the extension is enabled automatically on first startup.

## Using Claude Code?

See [CLAUDE.md](CLAUDE.md) for a detailed guide covering architecture, key decisions, and development workflows.
