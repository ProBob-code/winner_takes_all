# WTA Architecture Notes

## Core Services

- `apps/web`: Next.js client application
- `apps/api`: FastAPI service for auth, tournaments, wallet, payments, leaderboard, and matches
- Realtime service: planned WebSocket layer for match rooms and live bracket updates
- PostgreSQL: system of record
- Redis: cache, presence, pub/sub, queue support

## Service Boundaries

### Auth

- Account creation
- Login and refresh token rotation
- Session cookies and route protection

### Payments and Wallet

- Create deposit or entry orders
- Verify success via provider webhook only
- Persist idempotency keys and provider event IDs
- Record every balance mutation as a wallet transaction

### Tournaments

- Create tournaments
- Register participants
- Persist bracket state
- Progress winners across rounds

### Matches

- Start rooms for paired players
- Store result metadata
- Resolve disconnects, timeouts, and disputes

### Leaderboards

- Aggregate wins and losses
- Track total earnings
- Expose global and tournament-local rankings

## Recommended Build Order

1. Auth sessions and protected routes
2. Wallet ledger and provider webhooks
3. Safe tournament join transaction
4. Bracket generation and match creation worker
5. Realtime match room and result flow
6. Leaderboards and admin actions

## Payment Safety Rules

- Do not credit wallets from client callbacks
- Deduplicate webhook events before settlement
- Use database transactions for wallet balance plus ledger insert
- Keep refunds as explicit reversing entries, not silent balance rewrites
