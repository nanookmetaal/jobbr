# Jobbr - Claude Code Guide

## Project overview

Jobbr is a professional matching platform (think Tinder for jobs and mentorship). Users create a profile as a job seeker, employer, mentor, or mentee. The system generates embeddings for each profile and finds complementary matches using cosine similarity.

## Repo structure

```
jobbr/
├── backend/          # Python FastAPI app
│   ├── app/
│   │   ├── agents/llm.py         # Voyage AI embeddings + LangChain profile analysis
│   │   ├── routers/
│   │   │   ├── auth.py           # Magic link auth (Resend email + JWT)
│   │   │   ├── profiles.py       # Profile CRUD + embedding generation
│   │   │   ├── agents.py         # Analysis and match endpoints
│   │   │   ├── swipes.py         # Swipe left/right + mutual match detection
│   │   │   └── notifications.py  # Notification feed + coffee invites
│   │   ├── models.py             # SQLAlchemy ORM models
│   │   ├── schemas.py            # Pydantic request/response schemas
│   │   ├── database.py           # Async DB engine, session, init_db
│   │   ├── config.py             # pydantic-settings (reads .env)
│   │   └── main.py               # FastAPI app, CORS, lifespan
│   ├── .env.example
│   ├── requirements.txt
│   └── pyproject.toml
└── frontend/         # Next.js 14 app
    └── src/
        ├── app/
        │   ├── page.tsx              # Landing + magic link login
        │   ├── auth/verify/          # JWT verification callback
        │   ├── profile/create/       # Profile creation wizard
        │   ├── profile/edit/         # Edit existing profile
        │   ├── dashboard/            # Main view: profile, analysis, nav
        │   └── matches/              # Swipe interface
        └── lib/
            ├── api.ts                # Typed API client
            └── auth.ts               # JWT helpers (localStorage)
```

## Deploying to Proxmox (self-hosted)

Jobbr runs on two LXC containers on a local Proxmox node:

- **jobbr-db** - PostgreSQL 17 + pgvector
- **jobbr-app** - FastAPI (port 8000) + Next.js (port 3000)

Both containers are on the local LAN only. Public access is via Cloudflare Tunnels (`jobbr-dev.nanookmetaal.com`).

### Deploy

```bash
./deploy.sh
```

This rsyncs the current local code to `jobbr-app`, reinstalls deps, rebuilds the frontend, and restarts both services. Run it from the repo root.

### Config files on jobbr-app

- Backend env: `/opt/jobbr/backend/.env`
- Frontend env: `/opt/jobbr/frontend/.env.local` (only needs `BACKEND_URL=http://localhost:8000` - already the default, so this file can be empty)

The frontend proxies all `/api/*` requests to the backend via Next.js rewrites - the backend is never exposed directly to the browser. `BACKEND_URL` defaults to `http://localhost:8000` which works since both services run on the same container.

### SSH access

Container IPs are stored in `.env.local` at the repo root (`JOBBR_APP_HOST`, `JOBBR_DB_HOST`).

```bash
ssh -i ~/.ssh/id_ed25519 root@<JOBBR_APP_HOST>  # jobbr-app
ssh -i ~/.ssh/id_ed25519 root@<JOBBR_DB_HOST>   # jobbr-db
```

### Service management

```bash
# On jobbr-app:
systemctl status jobbr-backend jobbr-frontend
systemctl restart jobbr-backend jobbr-frontend
journalctl -u jobbr-backend -f   # tail backend logs
journalctl -u jobbr-frontend -f  # tail frontend logs
```

---

## Running locally

### Prerequisites

- Python 3.11-3.13 with [uv](https://docs.astral.sh/uv/)
- Node.js 18+
- PostgreSQL with pgvector extension

### 1. Database setup

```bash
# Start PostgreSQL (Homebrew)
brew services start postgresql@17

# Create user and database
psql postgres -c "CREATE USER jobbr WITH PASSWORD 'jobbr';"
psql postgres -c "CREATE DATABASE jobbr OWNER jobbr;"

# Enable pgvector (must be done as superuser)
psql -d jobbr -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

> pgvector must be installed first. On macOS: `brew install pgvector`
> On Linux: compile from source - see https://github.com/pgvector/pgvector

### 2. Backend

```bash
cd backend
cp .env.example .env
# Fill in all values in .env (see Environment variables section)

uv sync
uv run uvicorn app.main:app --reload --port 8000
```

The backend runs `init_db()` on startup which creates all tables and enables the vector extension.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. No `NEXT_PUBLIC_API_URL` needed - the frontend proxies `/api/*` to `http://localhost:8000` via Next.js rewrites.

## Environment variables

See `backend/.env.example` for the full list.

### Backend variables

| Variable | Required | Where to get it | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | Your DB provider | PostgreSQL connection string. Neon/Vercel Postgres sets this automatically. Must use `postgresql+asyncpg://` scheme locally. |
| `ANTHROPIC_API_KEY` | Yes | [console.anthropic.com](https://console.anthropic.com) | Used for profile analysis (analyst + coach agents). |
| `VOYAGE_API_KEY` | Yes | [dash.voyageai.com](https://dash.voyageai.com) | Used to generate profile embeddings. Free tier is 3 RPM - sufficient for small usage. |
| `RESEND_API_KEY` | Yes | [resend.com](https://resend.com) | Sends magic link and admin notification emails. Create an API key scoped to your verified domain. |
| `EMAIL_FROM` | Yes | Your Resend domain | Must match the domain your Resend API key is scoped to. Format: `Jobbr <noreply@yourdomain.com>` |
| `JWT_SECRET` | Yes | Generate yourself | Random secret for signing session JWTs. Run `openssl rand -hex 32` to generate one. |
| `FRONTEND_URL` | Yes | Your deployment | Used for CORS and constructing magic link URLs. Must include `https://` - no trailing slash. |
| `SERVICE_KEY` | Yes | Generate yourself | Shared secret between frontend server and backend. Run `openssl rand -hex 32`. Must match `SERVICE_KEY` in frontend env. |

### Frontend variables

| Variable | Required | Description |
|---|---|---|
| `BACKEND_URL` | Vercel only | Full URL of the deployed backend, e.g. `https://jobbr-hazel.vercel.app`. No trailing slash. Not needed locally or on Proxmox (defaults to `http://localhost:8000`). |
| `SERVICE_KEY` | Yes | Shared secret injected into every proxied request. Must match `SERVICE_KEY` in backend env. |

All API calls from the browser go through `/api/*` - the Next.js Route Handler forwards them to `BACKEND_URL` server-side, injecting the `SERVICE_KEY` header. The backend URL is never exposed to the browser.

## Key technical decisions

**Matching approach:** Profiles are split into two embedding vectors:
- `offer_embedding` - what this person offers (title, bio, skills, experience)
- `seek_embedding` - what they want (looking_for, profile_type)

Match score = `cosine_sim(my_offer, their_seek) + cosine_sim(my_seek, their_offer)`

This finds complementary matches (job seeker + employer) rather than similar ones.

**Embedding generation:** Voyage AI `voyage-3` model (1024 dimensions). Embeddings are generated on profile create/update. If a profile has no embeddings it won't appear in match results.

**Auth:** Passwordless magic link. A token is stored in the database with a 15-minute TTL. On verify, a 30-day JWT is issued and stored in localStorage.

**API keys in FastAPI:** pydantic-settings reads `.env` but does NOT inject into `os.environ`. Always pass API keys explicitly (e.g. `api_key=settings.ANTHROPIC_API_KEY`) when initialising SDK clients.

## Backfilling embeddings

If profiles exist without embeddings (e.g. seed data), run from `backend/`:

```bash
uv run python -c "
import asyncio
from app.database import get_db, init_db
from app.models import Profile
from app.agents.llm import generate_embeddings
from sqlalchemy import select

async def backfill():
    await init_db()
    async for db in get_db():
        result = await db.execute(select(Profile).where(Profile.offer_embedding == None))
        profiles = result.scalars().all()
        for p in profiles:
            offer_emb, seek_emb = await generate_embeddings({
                'title': p.title, 'bio': p.bio, 'skills': p.skills,
                'experience_years': p.experience_years,
                'looking_for': p.looking_for, 'profile_type': p.profile_type,
            })
            p.offer_embedding = offer_emb
            p.seek_embedding = seek_emb
            await db.commit()
            print(f'done: {p.name}')
        break

asyncio.run(backfill())
"
```

Note: Voyage AI free tier has a 3 RPM rate limit. Add `await asyncio.sleep(22)` between iterations if you hit it.

## Deployment (Vercel)

The app is deployed as two separate Vercel projects from the same GitHub repo - one rooted at `backend/`, one at `frontend/`. The production deployment uses Neon (Vercel Postgres) which includes pgvector.

### Prerequisites

Before deploying, get API keys for:
- **Anthropic** - [console.anthropic.com](https://console.anthropic.com) → API Keys
- **Voyage AI** - [dash.voyageai.com](https://dash.voyageai.com) → API Keys
- **Resend** - [resend.com](https://resend.com) → API Keys. Also verify your sending domain and create a scoped API key for that domain.

### Step 1 - Deploy the backend

1. Push the repo to GitHub
2. Go to [vercel.com](https://vercel.com) → Add New Project → import the repo
3. Set **Root Directory** to `backend`
4. Framework Preset: **Other**
5. Add all backend environment variables (see table above)
6. Deploy

After the first deploy, add a **Neon Postgres** storage integration in the Vercel dashboard. It will inject `DATABASE_URL` and `POSTGRES_URL` automatically.

> `init_db()` runs on every cold start and creates all tables. No manual migrations needed.

### Step 2 - Deploy the frontend

1. Add New Project → same repo, different project
2. Set **Root Directory** to `frontend`
3. Framework Preset: **Next.js**
4. Add environment variable:
   - `BACKEND_URL` = your backend's production URL (e.g. `https://jobbr-hazel.vercel.app`)
5. Deploy

### Step 3 - Wire them together

Once both are deployed:

1. Set `FRONTEND_URL` on the **backend** project to the frontend's production URL (e.g. `https://jobbr-ieb1.vercel.app`) - needed for CORS and magic link URLs
2. Redeploy the backend to pick up the change

> **Important:** When setting env vars via the Vercel CLI, use `printf` not `echo` to avoid trailing newlines being stored in the value, which silently breaks things like CORS.
> ```bash
> printf "https://your-url.vercel.app" | vercel env add FRONTEND_URL production
> ```

### Step 4 - Add the first admin

After the backend is live, insert the first admin directly into the database:

```bash
psql "<your-neon-connection-string>?sslmode=require" \
  -c "INSERT INTO admins (id, name, email) VALUES (gen_random_uuid(), 'Your Name', 'your@email.com');"
```

The Neon connection string is available in the Vercel dashboard under the Storage tab.


## Admin access

Jobbr has an admin role for managing profiles and the waitlist.

**How it works:**
- Admins are stored in the `admins` table (separate from `profiles`)
- When an admin logs in, their JWT includes `is_admin: true` and they are redirected to `/admin`
- The `/admin` page has two tabs: **Profiles** (all users, with delete) and **Waitlist** (pending/approved, with approve button)
- Admin API endpoints (`/admin/*`) require the `is_admin` claim in the JWT and verify the email exists in the `admins` table
- Admins bypass the waitlist - they always receive a magic link immediately

**Adding an admin:**

Insert directly into the database:

```sql
INSERT INTO admins (id, name, email)
VALUES (gen_random_uuid(), 'Name', 'email@example.com');
```

For the Neon production database:

```bash
psql "postgresql://neondb_owner:<password>@<host>/neondb?sslmode=require" \
  -c "INSERT INTO admins (id, name, email) VALUES (gen_random_uuid(), 'Name', 'email@example.com');"
```

**Removing an admin:**

```sql
DELETE FROM admins WHERE email = 'email@example.com';
```

<!-- VERCEL BEST PRACTICES START -->
## Best practices for developing on Vercel

These defaults are optimized for AI coding agents (and humans) working on apps that deploy to Vercel.

- Treat Vercel Functions as stateless + ephemeral (no durable RAM/FS, no background daemons), use Blob or marketplace integrations for preserving state
- Edge Functions (standalone) are deprecated; prefer Vercel Functions
- Don't start new projects on Vercel KV/Postgres (both discontinued); use Marketplace Redis/Postgres instead
- Store secrets in Vercel Env Variables; not in git or `NEXT_PUBLIC_*`
- Provision Marketplace native integrations with `vercel integration add` (CI/agent-friendly)
- Sync env + project settings with `vercel env pull` / `vercel pull` when you need local/offline parity
- Use `waitUntil` for post-response work; avoid the deprecated Function `context` parameter
- Set Function regions near your primary data source; avoid cross-region DB/service roundtrips
- Tune Fluid Compute knobs (e.g., `maxDuration`, memory/CPU) for long I/O-heavy calls (LLMs, APIs)
- Use Runtime Cache for fast **regional** caching + tag invalidation (don't treat it as global KV)
- Use Cron Jobs for schedules; cron runs in UTC and triggers your production URL via HTTP GET
- Use Vercel Blob for uploads/media; Use Edge Config for small, globally-read config
- If Enable Deployment Protection is enabled, use a bypass secret to directly access them
- Add OpenTelemetry via `@vercel/otel` on Node; don't expect OTEL support on the Edge runtime
- Enable Web Analytics + Speed Insights early
- Use AI Gateway for model routing, set AI_GATEWAY_API_KEY, using a model string (e.g. 'anthropic/claude-sonnet-4.6'), Gateway is already default in AI SDK
  needed. Always curl https://ai-gateway.vercel.sh/v1/models first; never trust model IDs from memory
- For durable agent loops or untrusted code: use Workflow (pause/resume/state) + Sandbox; use Vercel MCP for secure infra access
<!-- VERCEL BEST PRACTICES END -->
