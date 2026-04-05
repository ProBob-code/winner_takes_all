# Winner Takes All (WTA)

[![Status](https://img.shields.io/badge/status-production_core_layer-0a7ea4)](https://github.com/ProBob-code/winner_takes_all)
[![Backend](https://img.shields.io/badge/backend-FastAPI-059669)](https://fastapi.tiangolo.com/)
[![Frontend](https://img.shields.io/badge/frontend-Next.js-111827)](https://nextjs.org/)
[![Database](https://img.shields.io/badge/database-SQLAlchemy%20%2B%20Alembic-7c3aed)](https://www.sqlalchemy.org/)

Winner Takes All is a multiplayer tournament platform for paid and free 8-ball competitions. The long-term goal is a production-ready system where players can sign in, join tournaments, pay entry fees, get matched automatically, play live games, and move through a bracket until prizes are settled safely.

This repo already contains the product foundation, a working FastAPI backend, a connected Next.js frontend, a real repository layer with migrations, and pinned vendor snapshots for the game, bracket, and payment stack.

## Quick View

- Repo: [github.com/ProBob-code/winner_takes_all](https://github.com/ProBob-code/winner_takes_all)
- Architecture notes: `docs/architecture.md`
- Vendor integration notes: `docs/external-integrations.md`
- Next execution plan: `docs/phase-2-checklist.md`
- Pinned vendor commits: `vendor/manifest.json`

## What It Does

WTA is built around this player flow:

1. A player signs up or logs in.
2. The backend creates secure cookie-based sessions.
3. The player browses tournaments and wallet state.
4. The player joins a free or paid tournament.
5. The backend records the join and wallet ledger updates.
6. The next layers add payments, brackets, live matches, and payouts.

The project is currently at the production core layer:

- Working auth and refresh cookies
- Working wallet ledger and balance deduction
- Working tournament list and join flow
- Working frontend-to-backend bridge
- SQLAlchemy repository layer with Alembic migrations
- Automated backend tests and live HTTP smoke coverage

Still ahead:

- Hyperswitch payment orchestration
- Real PostgreSQL runtime verification in this environment
- Bracket generation and tournament progression
- 8-ball match embedding
- WebSockets, Redis, and live state sync

## Core Languages

- Backend: Python with FastAPI
- Frontend: TypeScript with Next.js and React
- Shared browser/server contracts: TypeScript
- Vendor payment engine: Rust in the imported Hyperswitch snapshot

The active backend is Python-first. Older Node scaffold output is not part of the active runtime path anymore.

## Repository Structure

```text
apps/
  api/                 FastAPI backend, DB layer, tests, migrations
  web/                 Next.js frontend
packages/
  contracts/           Shared TypeScript contracts
infra/
  docker/              Local compose setup for future postgres + redis runs
docs/
  architecture.md
  external-integrations.md
  phase-2-checklist.md
vendor/
  8Ball-Pool-HTML5/    Game engine snapshot
  bracket/             Bracket engine snapshot
  hyperswitch/         Slimmed payment sidecar snapshot
```

## Current Stack

- Frontend: Next.js App Router with React and TypeScript
- Backend: FastAPI with Python
- Data access: SQLAlchemy
- Migrations: Alembic
- Local fallback DB for tests and bootstrap: SQLite
- Intended production DB: PostgreSQL
- Intended realtime/cache layer: Redis

## Imported Vendor Repositories

The repo includes pinned source snapshots under `vendor/`:

- `vendor/8Ball-Pool-HTML5`
  Purpose: browser game engine candidate for `/match/[id]`
- `vendor/bracket`
  Purpose: tournament bracket reference and engine source
- `vendor/hyperswitch`
  Purpose: payment orchestration sidecar

The Hyperswitch snapshot has been trimmed to the integration-relevant source, config, Docker, and scripts so the repo avoids Windows path-length problems from unrelated fixtures and migration archives.

## Current Features

### Backend

The active backend lives in `apps/api/app/`.

Implemented endpoints:

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /user/profile`
- `GET /wallet`
- `POST /wallet/deduct`
- `GET /tournaments`
- `GET /tournaments/{id}`
- `POST /tournaments/{id}/join`
- `GET /leaderboard/global`
- `GET /leaderboard/tournaments/{id}`

Scaffolded but not implemented yet:

- payments
- live matches
- admin operations

### Frontend

The Next.js app lives in `apps/web/`.

Implemented pages:

- `/login`
- `/signup`
- `/dashboard`
- `/tournaments`
- `/tournaments/[id]`
- `/wallet`
- `/leaderboard`
- `/match/[id]`
- `/admin`

The frontend already reads real backend data through a same-origin proxy/helper layer.

## How The Current App Works

### Auth Flow

1. A user signs up or logs in from the frontend.
2. FastAPI creates access and refresh sessions.
3. The backend sets HTTP-only cookies.
4. Protected routes like `/user/profile` and `/wallet` validate those cookies.

### Wallet And Tournament Flow

1. New users receive a seeded wallet balance.
2. Tournaments can be free or paid.
3. Joining a paid tournament deducts the entry fee from the wallet.
4. The wallet transaction is stored in the ledger.
5. The participant record is added to the tournament.

### Current Playable Loop

Today's playable loop is a product-flow demo rather than the final real-time pool experience:

1. Sign up
2. Log in
3. Browse tournaments
4. Join a tournament
5. See wallet balance change
6. View leaderboard and tournament participant state

## Prerequisites

Required:

- Python 3.12+
- Node.js 20+
- npm

Useful for production-like local runs:

- PostgreSQL 16+
- Redis 7+
- Docker Desktop for `infra/docker/docker-compose.yml`

## Environment Variables

Copy `.env.example` to `.env.local` or export what you need in your shell.

Key values:

- `WTA_API_URL`
- `DATABASE_URL`
- `WTA_AUTO_INIT_DB`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

If PostgreSQL is not available yet, the backend can still bootstrap locally through the SQLite fallback path.

## Run It

### 1. Create the Python virtual environment

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 2. Install backend dependencies

```powershell
.\.venv\Scripts\python.exe -m pip install -r apps/api/requirements.txt
```

### 3. Run backend migrations

If you have PostgreSQL available, point `DATABASE_URL` to it first:

```powershell
$env:DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/wta"
cd apps/api
..\..\.venv\Scripts\python.exe -m alembic upgrade head
```

If PostgreSQL is not available, the backend can still start with SQLite fallback for local work.

### 4. Start the FastAPI backend

From `apps/api`:

```powershell
..\..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 4000
```

### 5. Start the Next.js frontend

From the repository root:

```powershell
npm install
npm run dev:web
```

The frontend will call the API at `http://127.0.0.1:4000` unless you override `WTA_API_URL`.

## Test It

### Backend tests

From the repository root:

```powershell
$env:PYTHONPATH="$PWD\\apps\\api"
.\.venv\Scripts\python.exe -m pytest apps/api/tests/test_api.py -q
```

Verified coverage today:

- health endpoint
- signup and session cookie creation
- protected profile access
- tournament join and wallet deduction
- refresh flow
- duplicate join rejection
- unauthenticated access rejection

### Frontend typecheck

```powershell
npm run typecheck
```

## How To Play The Current Build

Once both services are running:

1. Open the frontend in your browser.
2. Visit `/signup`.
3. Create a new account.
4. Open `/dashboard` to confirm the session.
5. Open `/wallet` to inspect the balance.
6. Open `/tournaments`.
7. Join a free or paid tournament.
8. Return to `/wallet` and `/tournaments/[id]` to confirm the updated state.
9. Open `/leaderboard` to inspect the current leaderboard output.

What "play" means today:

- It is a working auth, wallet, and tournament-flow demo.
- The actual pool match screen is still waiting for the 8-ball engine integration.

## Ready Vs Not Ready

Ready now:

- Monorepo structure
- Connected frontend shell
- FastAPI backend
- DB-backed repository layer
- Alembic initial schema
- Local backend tests
- Imported vendor references

Not ready yet:

- Real Hyperswitch payment flow
- Real bracket generation inside WTA
- Embedded 8-ball gameplay
- WebSocket multiplayer
- Redis-backed realtime updates
- Admin controls
- Tournament completion and payouts

## Recommended Next Steps

1. Run the backend against a real PostgreSQL instance and repeat the smoke test.
2. Build the `payments/` module around Hyperswitch.
3. Add wallet top-up and verified payment webhooks.
4. Integrate bracket generation into the tournament engine.
5. Embed the 8-ball game into the match page.
6. Add Redis and WebSocket realtime infrastructure.

## Notes

- The vendor trees are source snapshots, not nested Git repos or submodules.
- Some Windows and OneDrive filesystem behavior required safer local fallback paths and a slimmer Hyperswitch snapshot.
- The current build is a strong product foundation with a verified backend core, not the finished multiplayer tournament platform yet.
