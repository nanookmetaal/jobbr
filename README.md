# Jobbr

A professional matching platform - think Tinder for jobs and mentorship. Create a profile as a job seeker, employer, mentor, or mentee, and get matched with complementary people based on what you offer and what you're looking for.

## Features

- Invite-only access with admin approval flow
- Passwordless sign-in via magic link (email)
- Profile creation and editing (job seeker, employer, mentor, mentee)
- Profile analysis - completeness score, strengths, gaps, and improvement tips
- Smart matching using vector embeddings (Voyage AI) - finds complementary profiles, not just similar ones
- Swipe left/right on matches
- Mutual match detection with coffee invite notification
- Admin dashboard for managing profiles and approving waitlist requests

## Architecture

### System overview

```mermaid
graph TB
    User["User Browser"]
    Admin["Admin Browser"]

    subgraph Vercel
        FE["Frontend\nNext.js 14\njobbr.nanookmetaal.com"]
        BE["Backend\nFastAPI (Python)\napi.jobbr.nanookmetaal.com"]
    end

    subgraph "Neon (PostgreSQL + pgvector)"
        DB[("Database\nprofiles, matches,\nswipes, waitlist,\nadmins, notifications")]
    end

    subgraph "External APIs"
        Anthropic["Anthropic Claude\nProfile analysis"]
        Voyage["Voyage AI\nEmbedding generation"]
        Resend["Resend\nMagic link emails"]
    end

    User -->|HTTPS| FE
    Admin -->|HTTPS /admin| FE
    FE -->|REST API| BE
    BE -->|SQL| DB
    BE -->|analyze_profile| Anthropic
    BE -->|generate_embeddings| Voyage
    BE -->|send email| Resend
```

### Authentication flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant BE as Backend
    participant DB as Database
    participant Email as Resend

    U->>FE: Enter email
    FE->>BE: POST /auth/magic-link
    BE->>DB: Check admins table
    BE->>DB: Check profiles table
    alt New user (no profile, not admin)
        BE->>DB: Add to waitlist (pending)
        BE->>Email: Notify admin
        BE-->>FE: request_pending
        FE-->>U: "Request received"
        Note over U: Admin approves via /admin dashboard
        Email-->>U: Invitation email
        U->>FE: Enter email again
        FE->>BE: POST /auth/magic-link
    end
    BE->>DB: Create magic link token (15 min TTL)
    BE->>Email: Send magic link
    BE-->>FE: Magic link sent
    U->>FE: Click link in email
    FE->>BE: GET /auth/verify?token=...
    BE->>DB: Validate + mark token used
    BE-->>FE: JWT (30 day) + is_admin flag
    alt Admin
        FE->>U: Redirect to /admin
    else User with profile
        FE->>U: Redirect to /dashboard
    else New user
        FE->>U: Redirect to /profile/create
    end
```

### Matching algorithm

```mermaid
graph LR
    subgraph "Profile A (job seeker)"
        A_offer["offer_embedding\ntitle + bio + skills\n+ work history + education"]
        A_seek["seek_embedding\nlooking_for + profile_type"]
    end

    subgraph "Profile B (employer)"
        B_offer["offer_embedding\ntitle + bio + skills"]
        B_seek["seek_embedding\nlooking_for + profile_type"]
    end

    A_offer -->|cosine similarity| Score
    B_seek -->|cosine similarity| Score
    A_seek -->|cosine similarity| Score
    B_offer -->|cosine similarity| Score
    Score["Match score =\ncos_sim(A_offer, B_seek)\n+ cos_sim(A_seek, B_offer)"]
```

Profiles are embedded as two vectors - what they **offer** and what they **seek**. Match score rewards complementary pairs (job seeker + employer) rather than similar ones.

### Database schema

```mermaid
erDiagram
    profiles {
        uuid id PK
        string email
        string name
        string profile_type
        string title
        text bio
        text work_history
        text education
        string[] skills
        int experience_years
        string location
        text looking_for
        string linkedin_url
        string website_url
        vector offer_embedding
        vector seek_embedding
    }
    matches {
        uuid id PK
        uuid profile_id_a FK
        uuid profile_id_b FK
        int compatibility_score
    }
    swipes {
        uuid id PK
        uuid swiper_id FK
        uuid swiped_id FK
        string direction
    }
    notifications {
        uuid id PK
        uuid profile_id FK
        string type
        uuid related_profile_id FK
        bool is_read
    }
    agent_analyses {
        uuid id PK
        uuid profile_id FK
        string agent_type
        jsonb result
    }
    waitlist {
        uuid id PK
        string email
        string status
        timestamp approved_at
    }
    admins {
        uuid id PK
        string email
        string name
    }
    magic_link_tokens {
        uuid id PK
        string email
        string token
        timestamp expires_at
        bool used
    }

    profiles ||--o{ matches : "has"
    profiles ||--o{ swipes : "gives/receives"
    profiles ||--o{ notifications : "receives"
    profiles ||--o{ agent_analyses : "has"
```

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | Python, FastAPI, SQLAlchemy (async), asyncpg |
| Database | PostgreSQL + pgvector (Neon) |
| Embeddings | Voyage AI (`voyage-3`, 1024 dimensions) |
| AI analysis | LangChain + Anthropic Claude |
| Email | Resend |
| Hosting | Vercel (frontend + backend as serverless functions) |

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
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| `VOYAGE_API_KEY` | https://dash.voyageai.com |
| `RESEND_API_KEY` | https://resend.com |
| `EMAIL_FROM` | A sender address on a domain verified in Resend |
| `JWT_SECRET` | Any random string (`openssl rand -hex 32`) |
| `ADMIN_SECRET` | Any random string (`openssl rand -hex 20`) |
| `ADMIN_EMAIL` | Email address that receives access request notifications |
| `FRONTEND_URL` | `http://localhost:3000` for local dev |

## Deploying to Vercel

See [CLAUDE.md](CLAUDE.md) for full step-by-step deployment instructions, including how to set up the Neon database, configure env vars, and add the first admin.

## Using Claude Code?

See [CLAUDE.md](CLAUDE.md) for a detailed guide covering architecture, key decisions, and development workflows.
