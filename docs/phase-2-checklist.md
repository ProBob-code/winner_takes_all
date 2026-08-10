# Phase 2 — Status

This checklist originally tracked "replace fake wallet-only tournament funding with a real payment-to-wallet flow" against a planned FastAPI + Hyperswitch backend. That backend was never built; the actual implementation is the Hono/Cloudflare Workers API in `apps/api/src`, using Razorpay instead of Hyperswitch. This document now reflects what that implementation actually does, and what's still open.

## Payment-to-wallet flow — done

The target journey from the original plan is implemented in `apps/api/src/index.ts` and `apps/api/src/lib/d1-store.ts`:

1. `POST /api/payments/create-order` creates a Razorpay order (idempotency key supported so client retries don't create duplicate orders).
2. The frontend completes payment through Razorpay's checkout.
3. `POST /api/payments/verify` verifies the HMAC signature and checks the payment belongs to the calling user before crediting.
4. `POST /api/payments/webhook` is the authoritative path — signature-verified (**fails closed** if `RAZORPAY_WEBHOOK_SECRET` is unset), and independent of the client-side verify call.
5. `D1Store.markPaymentSuccess` makes the `pending → success` transition a single conditional `UPDATE ... WHERE status = 'pending'`, so whichever of {verify, webhook} arrives first wins the credit and the other becomes a no-op — the wallet is credited exactly once even if both fire concurrently.
6. Wallet credits are a relative, balance-gated SQL update inside the same transaction as the ledger insert (`d1-store.ts`), not a JS read-modify-write.

## Security checklist — done

- Webhook signatures verified, fail closed on missing secret (`apps/api/src/lib/razorpay.ts`)
- Frontend payment success is never trusted directly — `/verify` still checks the signature and the order's stored status
- `create-order` accepts an idempotency key
- `/payments/verify` checks `payment.user_id === caller.id` before crediting
- Payment idempotency key and provider order ID are both unique-indexed (`migrations/0003_integrity_constraints.sql`)

## Still open

- **Real-time updates**: matches and tournament state are polled, not pushed. A WebSocket or Durable Object layer for live match rooms and bracket updates is not built.
- **D1 integration tests**: the current API test suite (`apps/api/tests/`) covers pure logic — money math, password hashing, the tournament-scoring engine, Zod validation, and Razorpay signature verification including the fail-closed webhook case. It does not yet run the SQL transaction logic in `d1-store.ts` against a real D1/Miniflare instance. Adding `@cloudflare/vitest-pool-workers` to exercise `deductWallet`/`creditWallet`/`transferCredits`/`joinTournament` under concurrent calls is the natural next step to close that gap.
- **Refunds**: there is no refund/reversal endpoint yet. The architecture notes (`docs/architecture.md`) call for refunds as explicit reversing ledger entries, not silent balance rewrites — that still needs to be built.
- **KYC/AML enforcement**: the compliance pages (`/kyc-aml`, `/responsible-gaming`, `/skill-based-policy`) are informational only; there's no backend enforcement gating real-money play on verified identity. This matters for a skill-gaming product handling real money in India — treat it as a blocker for production launch, not a nice-to-have.
