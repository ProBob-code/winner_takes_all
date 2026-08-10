# Winner Takes All (WTA)

[![CI](https://img.shields.io/badge/ci-typecheck%20%2B%20tests-0a7ea4)](.github/workflows/ci.yml)
[![Backend](https://img.shields.io/badge/backend-Hono%20on%20Cloudflare%20Workers-f38020)](https://hono.dev/)
[![Frontend](https://img.shields.io/badge/frontend-Next.js%2015%20%2B%20React%2019-111827)](https://nextjs.org/)
[![Database](https://img.shields.io/badge/database-Cloudflare%20D1%20(SQLite)-7c3aed)](https://developers.cloudflare.com/d1/)

Winner Takes All is a multiplayer tournament platform for paid and free skill-based competitions (8-ball pool and a football/turn-based scoring engine). Players sign in, join tournaments, pay entry fees via Razorpay, get matched, play, and move through brackets until prizes are settled.

## Current Stack

- **Frontend**: Next.js 15 (App Router) + React 19 + TypeScript, deployed to Vercel and/or Cloudflare Pages (via OpenNext).
- **API**: [Hono](https://hono.dev/) running on **Cloudflare Workers** — not FastAPI/Python. There is no Python backend in this repo.
- **Data**: **Cloudflare D1** (serverless SQLite) via `apps/api/schema.sql` + `apps/api/migrations/`.
- **Sessions**: **Cloudflare KV**, opaque 256-bit tokens (short-lived access token + rotating refresh token), HttpOnly cookies.
- **Payments**: **Razorpay**, order creation + webhook, INR.
- **Validation**: [Zod](https://zod.dev/) schemas for every mutating endpoint (`apps/api/src/lib/validation.ts`).
- **Shared types**: `packages/contracts` — Zod schemas shared between frontend and API.

If you're looking for the FastAPI/SQLAlchemy/Postgres/Redis backend described in older versions of this README: it was an earlier design that was superseded by the Workers/D1 implementation actually in this repo. Nothing in `apps/api/src` depends on Python, Postgres, or Redis.

## Repository Structure

```text
apps/
  api/                 Hono API on Cloudflare Workers, D1 schema + migrations, vitest suite
  frontend/            Next.js App Router frontend
packages/
  contracts/           Shared Zod schemas/types
infra/
  docker/              Local compose setup (optional, not required to run the app)
docs/
  architecture.md
  external-integrations.md
.github/workflows/
  ci.yml               Typecheck + test gate, runs on every PR and push
  deploy-api.yml        Deploys apps/api to Cloudflare Workers (gated on the same checks)
```

## Implemented Endpoints (`apps/api/src/index.ts`)

**Auth** — `POST /api/auth/signup`, `/login`, `/refresh`, `/logout`, `GET /api/user/profile`

**Payments** (Razorpay) — `POST /api/payments/create-order`, `/verify`, `/webhook`

**Tournaments** — `GET /api/tournaments`, `GET /api/tournaments/:id`, `POST /api/tournaments/create`, `POST /api/tournaments/:id/join`, `GET /api/tournaments/:id/participants`, `GET /api/tournaments/:id/bracket`

**Matches** — `GET /api/matches/:id`, `POST /api/matches/:id/submit-score`, `POST /api/matches/:id/approve-scores`

**Wallet** — `GET /api/wallet`, `POST /api/wallet/transfer`

**Notifications** — `GET /api/notifications`, `POST /api/notifications/:id/read`

**Leaderboard** — `GET /api/leaderboard/global` (real SQL aggregation, not a stub)

**Admin** — `GET /api/admin/overview` (requires `role = admin`)

**Dynamic tournament engine** (group stage + live scoring for the football/pool mini-engine) — `GET /api/engine/tournaments/:id/state`, `POST /api/engine/tournaments/:id/{add-team,start,generate,reorder}`, `POST /api/engine/matches/:id/{start,extra-time,highlight,score}`. All mutating engine routes require the caller to be the tournament host or an admin.

**Public arenas** (shareable local score trackers) — `GET /api/public-arenas`, `POST /api/public-arenas`, `GET /api/public-arenas/:id`. PINs are hashed (SHA-256) before storage, and updates to a locked arena require the owner or the correct PIN.

## Security Model

- **Passwords**: PBKDF2-SHA256, 100k iterations, per-user random salt, versioned hash format (`v2:<iterations>:<salt>:<hash>`), constant-time verification.
- **Sessions**: opaque 256-bit random tokens in KV (not JWTs) — access tokens expire in 15 minutes, refresh tokens in 7 days and rotate on use; logout revokes both server-side, not just the cookie.
- **CSRF**: cookies are `SameSite=None; Secure` (required for the cross-origin frontend/API split), so every mutating `/api/*` request is checked against an explicit `Origin` allowlist (`ALLOWED_ORIGINS` in `wrangler.toml`).
- **Money**: every wallet mutation (`deductWallet`, `creditWallet`, `transferCredits`, `joinTournament`) is a single-transaction, balance-gated relative SQL update (`balance_cents = balance_cents - ? WHERE balance_cents >= ?`) — never a JS read-modify-write — so concurrent requests cannot overdraw a wallet. A `CHECK (balance_cents >= 0)` constraint on the `wallets` table is the second line of defense.
- **Payments**: Razorpay webhook signatures are verified and **fail closed** — an unset `RAZORPAY_WEBHOOK_SECRET` rejects every webhook rather than accepting all of them. Payment state transitions (`pending → success`) are conditional updates so a concurrent `verify` call and webhook delivery can only credit the wallet once. `/api/payments/verify` checks that the payment belongs to the calling user.
- **Input validation**: every mutating endpoint parses its body through a Zod schema (`apps/api/src/lib/validation.ts`) before touching the database.
- **Rate limiting**: KV-backed fixed-window limiter on signup, login, wallet transfer, order creation, and arena writes (`apps/api/src/lib/rate-limit.ts`). This is a soft limit (KV is eventually consistent) — for hard guarantees, pair it with Cloudflare's own WAF rate-limiting rules.
- **Secrets**: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` must be set with `wrangler secret put <NAME>` (or as GitHub Actions repository secrets for CI/CD) — never committed to `wrangler.toml`.

## Environment Variables

Copy `.env.example` and fill in what you need.

**Frontend** (`apps/frontend/.env.local`):
- `NEXT_PUBLIC_API_URL` — base URL of the deployed/local Worker API.
- `NEXT_PUBLIC_LANDING_URL` — where the logo/brand link points (defaults to `/`).

**API** (`apps/api/.dev.vars` for local dev, `wrangler secret put` for deployed environments):
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`

**API** (`apps/api/wrangler.toml` `[vars]`, non-secret):
- `ALLOWED_ORIGINS` — comma-separated list of origins allowed to make cross-site cookie requests.

## Prerequisites

- Node.js 20+
- pnpm 9+ (`corepack enable` or `npm i -g pnpm`)
- A Cloudflare account with a D1 database and KV namespace (for real deploys) — for local development, `wrangler dev` provides a local D1/KV emulation automatically.

## Run It

```bash
pnpm install

# Apply the schema to your local D1 emulation (schema.sql is the full
# current schema — do NOT also run migrations/0003_*.sql on a fresh
# database, it's only for upgrading a pre-existing deployed database;
# see the comment at the top of that file)
cd apps/api
npx wrangler d1 execute winner-takes-all-db --local --file=./schema.sql
cd ../..

# Start both the API (Workers, local) and the frontend (Next.js dev server)
pnpm dev
```

The frontend calls the API at `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:8787`, wrangler's default local port).

## Test It

```bash
# Typecheck everything
pnpm typecheck

# Run the API test suite (money math, password hashing, tournament-engine
# scoring/pairing logic, Zod validation, Razorpay signature verification
# including the fail-closed webhook case, and the rate limiter)
pnpm test

# Build the frontend
pnpm --filter frontend build
```

All three are required checks in `.github/workflows/ci.yml` on every PR, and the first two also gate `.github/workflows/deploy-api.yml` before it will deploy to Cloudflare Workers.

## What's Implemented vs. Still Ahead

Implemented and tested:
- Auth (signup/login/refresh/logout) with server-revocable sessions
- Wallet ledger with atomic, race-safe balance mutations
- Tournament creation, joining (with optional password), and a real leaderboard
- Razorpay order creation, payment verification, and webhook handling
- A dynamic group-stage tournament engine with live scoring, timers, and sudden death
- Shareable "public arena" score trackers with PIN protection
- CI-gated typecheck + test suite before any deploy

Still ahead:
- Real-time updates (the frontend currently polls; no WebSocket/Durable Object layer)
- A `d1-store` integration test suite running against an actual D1/Miniflare instance (current tests cover the pure logic — money math, crypto, the scoring engine, validation, signature verification — the SQL transaction logic in `d1-store.ts` is exercised manually and via the atomic-update patterns documented above, not yet under automated integration test)
- Formal KYC/AML enforcement to back the existing compliance pages (`/kyc-aml`, `/responsible-gaming`, `/skill-based-policy`) — this is a **real-money skill-gaming product targeting India**; the compliance pages are currently informational only and are not backed by enforcement logic. Do not take this to production in a regulated market without legal review.

## Notes

- The `vendor/` directory (Hyperswitch, a third-party bracket engine, and an 8-ball game snapshot) that appeared in earlier versions of this repo has been removed — none of it was wired into the running application, and it added ~50MB of unused source to the repository. The actual 8-ball game assets that the frontend serves live in `apps/frontend/public/8ball/`.
- `docs/architecture.md` and `docs/external-integrations.md` have been updated to match the system as it actually exists in this repo.
