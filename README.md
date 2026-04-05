# Winner Takes All (WTA)

Winner Takes All is a multiplayer tournament platform for paid and free 8-ball competitions.  
The long-term goal is a full production system where players can sign in, join tournaments, pay entry fees, get matched automatically, play 8-ball in real time, and progress through a live bracket until a winner is paid out.

This repository already includes the product foundation, the active FastAPI backend, the Next.js frontend, the database-backed core service layer, imported vendor references for the game/payment/bracket stack, and an executable local test path.

## What The Project Does

WTA is designed to support this end-to-end user journey:

1. A player signs up or logs in.
2. The player gets an authenticated session through secure cookies.
3. The player browses available tournaments.
4. The player joins a tournament using wallet balance.
5. The backend records tournament participation and wallet ledger changes.
6. The platform eventually generates brackets, creates matches, runs gameplay, and pays out winners.

Right now, the project is at the "production core layer" stage:

- Working auth and session cookies
- Working wallet ledger and balance deduction
- Working tournament listing and join flow
- Working frontend-to-backend bridge
- SQLAlchemy repository layer and Alembic migrations
- Automated backend tests

Still planned:

- Real payment orchestration with Hyperswitch
- Real PostgreSQL runtime verification in this environment
- Bracket engine integration
- 8-ball game embedding
- WebSocket multiplayer and live tournament progression

## Tech Stack

### Active Stack

- Frontend: Next.js App Router with React and TypeScript
- Backend: FastAPI with Python
- Data access: SQLAlchemy
- Migrations: Alembic
- Current local test database path: SQLite
- Intended production database: PostgreSQL
- Intended realtime/cache layer: Redis

### Imported Vendor Repositories

These source snapshots are already included under `vendor/`:

- `vendor/8Ball-Pool-HTML5`
  Purpose: browser game engine candidate for the match page
- `vendor/bracket`
  Purpose: tournament bracket engine and reference implementation
- `vendor/hyperswitch`
  Purpose: payment orchestration sidecar/service

Pinned sources are documented in `vendor/manifest.json`, and integration notes live in `docs/external-integrations.md`.

## Repository Structure

```text
apps/
  api/                 FastAPI backend, tests, migrations, DB layer
  web/                 Next.js frontend
packages/
  contracts/           Shared TypeScript contracts
infra/
  docker/              Local infra compose file for postgres + redis
docs/
  architecture.md
  external-integrations.md
vendor/
  8Ball-Pool-HTML5/
  bracket/
  hyperswitch/
```

## Current Features

### Backend

The active backend lives in `apps/api/app/`.

Implemented:

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
- admin dashboard logic

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

The frontend already calls the FastAPI backend through a same-origin proxy/helper layer and renders real backend data for the working flows.

## How The Current App Works

### Auth Flow

1. A user signs up or logs in from the Next.js frontend.
2. FastAPI creates access and refresh sessions.
3. The backend sets HTTP-only cookies.
4. Protected routes such as `/user/profile` and `/wallet` read those cookies.

### Wallet + Tournament Flow

1. The backend seeds a signup bonus wallet balance for new users.
2. Tournaments can be free or paid.
3. When a user joins a paid tournament, the backend deducts the entry fee.
4. The wallet transaction is recorded in the ledger.
5. The tournament participant list is updated.

### Current "Play" Loop

Today’s playable loop is not the final 8-ball experience yet.  
What you can already do is:

1. Sign up
2. Log in
3. Browse tournaments
4. Join a tournament
5. See wallet balance change
6. View leaderboard and tournament participant state

## Prerequisites

### Required

- Python 3.12+
- Node.js 20+
- npm

### For Future Production-Like Runs

- PostgreSQL 16+
- Redis 7+
- Docker Desktop if you want to use the compose file in `infra/docker/docker-compose.yml`

## Environment Variables

Copy `.env.example` to `.env.local` or export the variables in your shell as needed.

Key values:

- `WTA_API_URL`
- `DATABASE_URL`
- `WTA_AUTO_INIT_DB`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

For a simple local run, the backend can still bootstrap itself using SQLite if PostgreSQL is not available yet.

## How To Run

### 1. Create and activate the Python environment

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

If you have PostgreSQL available, point `DATABASE_URL` to it first.

Example:

```powershell
$env:DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/wta"
cd apps/api
..\..\.venv\Scripts\python.exe -m alembic upgrade head
```

If PostgreSQL is not available yet, the backend can still run locally with SQLite fallback.

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

The frontend will start on the default Next.js development port and call the API at `http://127.0.0.1:4000` unless overridden.

## How To Play The Current Build

Once both services are running:

1. Open the frontend in your browser.
2. Go to `/signup`.
3. Create a new account.
4. Open `/dashboard` to confirm you are signed in.
5. Open `/wallet` to see your current balance.
6. Open `/tournaments`.
7. Join a free or paid tournament.
8. Return to `/wallet` and `/tournaments/[id]` to verify the updated wallet and participant state.
9. Open `/leaderboard` to inspect current leaderboard output.

What "play" means today:

- It is a product-flow demo of auth, wallet, and tournament progression.
- The actual 8-ball gameplay screen is still a placeholder route until the game engine is wired in.

## How To Test

### Backend tests

From the repository root:

```powershell
$env:PYTHONPATH="$PWD\\apps\\api"
.\.venv\Scripts\python.exe -m pytest apps/api/tests/test_api.py -q
```

Current verified coverage:

- health endpoint
- signup and cookie session creation
- protected profile access
- tournament join and wallet deduction
- refresh flow
- duplicate join rejection
- unauthenticated access rejection

### Frontend typecheck

```powershell
npm run typecheck
```

## What Is Ready vs Not Ready

### Ready

- Repo structure
- Frontend shell
- FastAPI backend
- DB-backed repository layer
- Alembic initial schema
- Local backend tests
- Imported external vendor references

### Not Ready Yet

- Real Hyperswitch payment flow
- Real bracket generation in WTA
- Embedded 8-ball gameplay
- WebSocket multiplayer
- Redis-backed realtime updates
- Admin operations
- Real tournament completion and payouts

## Recommended Next Steps

1. Run the backend against a real PostgreSQL instance and repeat the full smoke test.
2. Build the `payments/` module around Hyperswitch.
3. Add wallet top-up and payment webhook verification.
4. Integrate bracket generation into the tournament engine.
5. Embed the 8-ball game into the match page.
6. Add Redis + WebSocket realtime infrastructure.

## Notes

- This repo was prepared as a local Git-ready project and includes vendor source snapshots rather than nested Git submodules.
- Some Windows/OneDrive filesystem restrictions affected earlier local SQLite and temp-directory behavior, so the local test path was adjusted to use safer temp locations where needed.
- The current implementation is best understood as a strong product foundation plus a verified backend core, not the finished multiplayer tournament platform yet.
