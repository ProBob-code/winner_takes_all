# External Integrations

## Payments — Razorpay (live integration)

The only external payment integration actually wired into this repo is **Razorpay**, called directly over `fetch` from the Worker (`apps/api/src/lib/razorpay.ts`) — no SDK, no sidecar service.

- Order creation: `POST /api/payments/create-order` → Razorpay Orders API
- Client-side confirmation: `POST /api/payments/verify`, HMAC-SHA256 signature check
- Server-side settlement: `POST /api/payments/webhook`, HMAC-SHA256 signature check over the raw body, **fails closed** if `RAZORPAY_WEBHOOK_SECRET` is unset
- Credentials are Worker secrets (`wrangler secret put RAZORPAY_KEY_ID|RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET`), never committed to `wrangler.toml`

## Game assets — 8-ball pool

The 8-ball pool game engine is served as static assets from `apps/frontend/public/8ball/` and mounted client-side. There is no separate vendored copy in the repo — the runtime assets in `public/8ball/` are the only copy.

## Removed: third-party vendor snapshots

Earlier versions of this repo vendored three third-party projects under `vendor/`:

- **8Ball-Pool-HTML5** (`afzalimdad9/8Ball-Pool-HTML5`) — duplicate of the game assets already served from `apps/frontend/public/8ball/`
- **bracket** (`evroon/bracket`) — a full standalone FastAPI + Vite tournament platform, kept only as design reference
- **hyperswitch** (`juspay/hyperswitch`) — a large Rust payments platform, superseded by the direct Razorpay integration above

None of the three were imported by any code in `apps/` — they were pure reference snapshots, together adding roughly 50MB of unused source to the repository. They have been removed. If you need to consult them again, the pinned commits are still recorded in git history (see the commit that removed `vendor/`), and the original sources are:

- <https://github.com/afzalimdad9/8Ball-Pool-HTML5> @ `7c7ed602e1ab1c476f9c3562fc7388861b397b04`
- <https://github.com/evroon/bracket> @ `75c2574eecd1f5722e93a7a4f0aaa6e0a454d409`
- <https://github.com/juspay/hyperswitch> @ `c5a3fce4daf059a3fdf7fe6016b497217285d626`

If a genuine need for a Hyperswitch-style multi-provider payment orchestration layer comes up later, it should be evaluated fresh against Razorpay's actual coverage rather than resurrected from the old snapshot — a lot can change in a payments platform between pins.
