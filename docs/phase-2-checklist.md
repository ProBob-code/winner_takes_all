# Phase 2 Checklist

This checklist tracks the next production-critical layer after the current auth, wallet, and tournament core.

## Phase 2 Goal

Replace fake wallet-only tournament funding with a real payment-to-wallet flow backed by Hyperswitch.

Target journey:

1. User clicks join on a paid tournament.
2. Backend checks wallet balance.
3. If balance is insufficient, backend creates a payment intent.
4. Frontend completes payment through the payment UI.
5. Webhook verifies the result.
6. Wallet is credited exactly once.
7. Tournament join is retried safely.

## Backend Work

- Create `apps/api/app/payments/service.py`
- Create `apps/api/app/payments/routes.py`
- Create `apps/api/app/payments/webhook.py`
- Add payment service wiring in `apps/api/app/main.py`
- Keep business rules in `apps/api/app/service.py` and let the payment module support that flow

## API Checklist

- `POST /payments/create-intent`
- `POST /payments/webhook`
- `POST /wallet/topup`
- `GET /payments/{id}`

## Data Checklist

- Persist payment intents and provider references
- Persist payment status transitions
- Persist wallet top-up transactions separately from tournament deductions
- Add idempotency support for payment creation and webhook processing
- Track provider event ids to ignore duplicates

## Security Checklist

- Verify webhook signatures
- Never trust frontend payment success
- Require idempotency keys for create-intent operations
- Validate user ownership before wallet credit or tournament retry
- Log and reject inconsistent payment state transitions

## Frontend Checklist

- Add wallet top-up action on `/wallet`
- Show payment pending, success, and failure states
- Retry tournament join after wallet credit
- Add transaction history and status UI

## Infra Checklist

- Add Hyperswitch service notes to local Docker setup
- Document required payment env vars
- Add local webhook testing instructions

## Exit Criteria

Phase 2 is complete when:

- Paid tournament join can trigger a real payment path
- Payment success is verified by webhook
- Wallet credit is idempotent
- Tournament join can complete after a verified top-up
- Failed or duplicate webhooks do not corrupt wallet state
