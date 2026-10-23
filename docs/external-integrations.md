# External Integrations

## Payments — Razorpay (live integration)

The only external payment integration actually wired into this repo is **Razorpay**, called directly over `fetch` from the Worker (`apps/api/src/lib/razorpay.ts`) — no SDK, no sidecar service.

- Order creation: `POST /api/payments/create-order` → Razorpay Orders API
- Client-side confirmation: `POST /api/payments/verify`, HMAC-SHA256 signature check
- Server-side settlement: `POST /api/payments/webhook`, HMAC-SHA256 signature check over the raw body, **fails closed** if `RAZORPAY_WEBHOOK_SECRET` is unset
- Credentials are Worker secrets (`wrangler secret put RAZORPAY_KEY_ID|RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET`), never committed to `wrangler.toml`

## Game assets — 8-ball pool

The 8-ball pool game engine is served as static assets from `apps/frontend/public/8ball/` and mounted client-side. There is no separate vendored copy in the repo — the runtime assets in `public/8ball/` are the only copy.

## Voice scoring — on-device speech to text (Moonshine + Silero VAD)

Staff mode (`/staff/:id`) can be scored by voice: "Asha two balls one foul",
"Ravi point", "scratch that". **Talk** listens for one sentence; **Hands-free**
keeps listening and acts only after the wake phrase "Bob note the points". The
words become the same taps the buttons send, through the same offline outbox,
so the API has nothing new. The black, which ends the frame and has no undo,
always waits for a tap on the screen.

**Built in, on the device (the default).** `apps/frontend/lib/speech/` runs
[Silero VAD](https://huggingface.co/onnx-community/silero-vad) to find speech
and [Moonshine tiny](https://huggingface.co/onnx-community/moonshine-tiny-ONNX)
(q8) to transcribe it, in a Web Worker via
[transformers.js](https://huggingface.co/docs/transformers.js) 4.x on ONNX
Runtime WebAssembly. Audio never leaves the phone and it works offline. First
use downloads about 34 MB of model from huggingface.co plus ONNX Runtime's
WebAssembly from cdn.jsdelivr.net, after asking; both are kept in the browser
cache. Measured on the production build in headless Chrome on a laptop CPU:
~19 s to download and warm up the first time, transcripts well under a second
after the speaker stops. Not yet measured on a low-end phone.

Why this and not the two projects it was compared with:

- **Mozilla DeepSpeech** — discontinued; the repository was archived in June
  2025 and its last models date from 2020. No supported browser build, and
  well behind current models in a noisy room. Its useful idea, a decoder that
  expects a small vocabulary, lives on in `lib/voice-command.ts`, which only
  accepts the scoring words and the two names at the table, matched by
  spelling and by sound.
- **[Handy](https://github.com/cjpais/Handy)** — an excellent MIT-licensed
  desktop app, but an app, not a library: it has no API and cannot run in a
  browser or on a phone. What makes it good is its pipeline — Silero VAD in
  front of a Whisper-family model, all local — and that pipeline is what
  `lib/speech` rebuilds in the browser, with Moonshine in place of Whisper
  because Moonshine's cost scales with the length of the audio and a score is
  a two-second sentence.

Two fallbacks remain under the **?** in the voice bar: the browser's own
speech service (Web Speech API: no download, but Chrome sends the audio to
Google and needs a connection), and a text field for **Handy on a laptop** or
typing (a Ctrl+V paste is scored as it lands; Handy's "Direct" typing needs its
auto-submit on).

Tests: `apps/api/tests/voice-command.test.ts`, including transcripts the
on-device model actually produced from synthesised speech.

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
