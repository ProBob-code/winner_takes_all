# WTA Architecture Notes

This describes the system as it actually exists in this repo, not a planned future backend.

## Core Services

- `apps/frontend`: Next.js 15 (App Router) + React 19 client application.
- `apps/api`: Hono API running on **Cloudflare Workers** — handles auth, tournaments, wallet, payments, leaderboard, matches, and the dynamic tournament engine.
- `packages/contracts`: Shared Zod schemas/types used by both the frontend and (in spirit) the API's own validation layer.
- **Cloudflare D1** (serverless SQLite): system of record — schema in `apps/api/schema.sql`, incremental changes in `apps/api/migrations/`.
- **Cloudflare KV**: session storage and the rate-limiter's fixed-window counters.

There is no Postgres, Redis, or Python service in the running system. Realtime (WebSocket/Durable Objects) is not yet built — the frontend polls.

## Service Boundaries

### Auth (`apps/api/src/index.ts`, `lib/kv-sessions.ts`, `lib/crypto.ts`)

- Account creation with a signup bonus wallet credit
- PBKDF2-SHA256 password hashing (versioned hash format, 100k iterations, per-user salt)
- Access token (15 min) + refresh token (7 days) in KV, opaque 256-bit random tokens — not JWTs
- Refresh rotates the token pair; logout revokes both tokens server-side
- Route protection is opt-in per-handler via `requireUser(c)` / `requireAdmin(c)`, populated by `authMiddleware`

### Payments and Wallet (`lib/razorpay.ts`, `lib/d1-store.ts`)

- Razorpay order creation, signature-verified client-side verification, and an independent, signature-verified webhook
- Webhook verification **fails closed**: an unset `RAZORPAY_WEBHOOK_SECRET` rejects the webhook rather than accepting it
- The `pending → success` payment transition is a single conditional SQL update, so a race between the client `/verify` call and the webhook credits the wallet exactly once
- Every wallet mutation (`deductWallet`, `creditWallet`, `transferCredits`, and the entry-fee debit inside `joinTournament`) is a relative, balance-gated SQL update executed inside `db.batch()` (one transaction) — never a JS read-modify-write — so concurrent requests cannot overdraw a wallet
- A `CHECK (balance_cents >= 0)` constraint on `wallets.balance_cents` is the second line of defense
- Every balance mutation writes a `wallet_transactions` ledger row in the same transaction

### Tournaments

- Create tournaments (entry fee, max players, bracket type, optional password)
- Join with password check (constant-time compare) and balance-gated entry-fee debit
- A unique `(tournament_id, user_id)` index prevents double-joins even under concurrent requests
- `bracket_state` persisted as JSON on the tournament row for the classic bracket flow
- A separate **dynamic tournament engine** (`lib/tournament-engine.ts`) handles group-stage pairing (no repeat opponents, bye assignment), live scoring with a race-to-100 and sudden-death rule, and a match timer — used by the football/pool mini-games. All mutating engine routes require the caller to be the tournament host or an admin.

### Matches

- Score submission: players self-report their own score; the host or an admin submits/approves the final result
- `scores_approved` gates a match from being re-scored once finalized

### Leaderboards

- `D1Store.getGlobalLeaderboard` aggregates wins, losses, tournament wins, and payout earnings directly in SQL (CTEs over `matches`, `tournaments`, and `wallet_transactions`) — not a placeholder that returns zeros.

## Payment Safety Rules (enforced, not aspirational)

- Wallets are never credited from an unverified client callback — `/payments/verify` still checks the Razorpay HMAC signature and that the payment belongs to the calling user
- Webhook and client-verify paths both funnel through `markPaymentSuccess`, a single conditional update, so duplicate settlement is structurally prevented rather than relying on catching it after the fact
- Every balance mutation is a database transaction covering both the balance update and the ledger insert
- Refunds are not yet implemented; when added, they should be explicit reversing ledger entries, not silent balance rewrites (see `docs/phase-2-checklist.md`)

## Known Gaps

See `docs/phase-2-checklist.md` for the current status — in short: no realtime layer yet, `d1-store.ts`'s transaction logic is covered by design/manual review rather than an automated D1/Miniflare integration test, no refund endpoint, and the KYC/compliance pages are informational only.
