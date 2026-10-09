# Winner Takes All — implementation plan

The name stays. What changes is what sits under it: the app stops holding
players' money and starts being software a venue pays for.

## The fact that makes this cheap

`d1-store.ts:755` — `if (fee > 0) { ...debit the wallet... }`. At an entry fee
of zero the wallet is never touched, no ledger row is written, the pot stays at
zero, and the player simply joins. **The lawful product already runs.** Every
bracket, the 8-ball and football scoring engines, weekly series and standings,
streaming, QR broadcast and arenas work today with no money in them.

Of 68 API routes, about 10 are stake machinery. The other ~58 are the product.
This is a subtraction, not a rewrite.

| Retire (10) | Keep (~58) |
|---|---|
| `GET /api/wallet` | all 14 `/api/engine/*` — the scoring engine |
| `GET /api/wallet/payouts` | all 8 `/api/stream/*` — broadcast and camera |
| `POST /api/wallet/payout` | 6 `/api/tournaments/*` |
| `POST /api/wallet/transfer` | 6 `/api/series/*` — weekly league |
| `POST /api/payments/create-order` | 3 `/api/public-arenas` |
| `POST /api/payments/verify` | 3 `/api/matches/*` |
| `POST /api/payments/webhook` | auth, profile, leaderboard, notifications |
| `GET /api/payments/config` | admin overview / users / transactions |
| `POST /api/admin/payouts/:id/settle` | |
| `POST /api/admin/users/:id/bonus` | |

---

## Phase 0 — lawful by the end of the week (about a day's work)

Do this before anything else. It is not conditional on the rest of the plan
being right.

1. **Add a kill switch.** `STAKES_ENABLED` in `apps/api/src/types.ts` `Env`,
   default off. One flag, so the change is auditable and reversible.
2. **Force entry fees to zero.** `validation.ts:91` and `:106` currently allow
   `.max(100_000)`. With stakes off, clamp to `0`.
3. **Return the 10 money routes as `410 Gone`** with a plain message. Not 404 —
   410 says deliberately withdrawn.
4. **Clear the test balances.** ₹6,097 sits in five wallets
   (₹1,900 / ₹1,397 / ₹1,000 / ₹900 / ₹900), but these were funded in Razorpay
   test mode — the Worker held no payment keys at all until 7 October 2026, and
   the keys set then are `rzp_test_`. No real money was ever taken, so there is
   nothing to refund. Write it off with a ledger row per wallet recording the
   amount and the reason rather than deleting rows, so the books still explain
   where it went. Confirm first with
   `SELECT type, is_test, COUNT(*) FROM wallet_transactions GROUP BY 1,2`.
5. **Delete the skill-based defence.** The footer line and
   `/skill-based-policy` assert a defence the 2025 Act removed. Replace with a
   plain statement: no stakes, no wallet, prizes are the venue's.
6. **Hide the money UI**: Refill Credits, Request Payout, the wallet page, and
   the topbar balance chip.

Keep the admin console — it stops being a payout queue and becomes the venue
console.

---

## Phase 1 — prove it (weeks 1–6)

**Exit test: three venues paying after their free month.** Nothing in Phase 2
starts until that is true.

Ordered by what the buyer panel said blocks the sale, not by what is most fun
to build. Venue accounts and subscription billing were written here first and
moved to Phase 2: the first ten venues can be set up by hand and invoiced over
UPI, and building billing before anyone wants to be billed is the classic way
to spend a month on nothing.

### 1.1 The league-night playbook
A document, not code, and the first thing to write. Three of the twenty buyers
passed because they had no competition night to score — *"I would be buying a
scoreboard for an event that does not exist yet."* A week-by-week guide to
starting one from zero may convert more venues than any feature below.

### 1.2 Offline-first scoring — the hard requirement
Two buyers refused outright over "what happens when the internet drops
mid-tournament," and both named reputational damage, not money, as the cost.
This is real engineering: a service worker, a local write queue, and sync on
reconnect for the `/api/engine/matches/:id/score` path. Scoring must never
block on the network.

### 1.3 Both players confirm the frame
Small, and it answers the objection that sinks the dispute-settling pitch: *"a
screen doesn't referee a frame — someone still types the result."* Both players
confirm on their own phones before the score locks, so the screen carries their
word rather than the owner's.

### 1.4 WhatsApp push of bracket, results and table
Four buyers asked for this unprompted. These venues already run tournaments
through a group chat; pushing results into it beats asking regulars to adopt a
new place to look.

### 1.5 Sixty-second setup and staff mode
A single "run a night" flow: pick a game, pick a bracket size, done. Staff mode
is one screen, big buttons, scoring only — assume the person holding the phone
was trained for ninety seconds. Measure it: if a stranger takes longer than a
minute, it is not finished.

### 1.6 Big-screen display mode — `/display/[tournamentId]`
A full-bleed, no-chrome view of the live bracket and running score, readable
from across a room. You already have the live state
(`GET /api/engine/tournaments/:id/state`) and the streaming plumbing; this is
presentation.

**Panel caveat:** two buyers said the wall TV is already showing cricket. It
must work propped on a tablet or a spare monitor, and degrade to a phone. Do
not assume a free screen.

### 1.7 Join by QR
Players scan and are in. No account, no wallet, no top-up. You already have QR
broadcast tokens; reuse the pattern.

---

## What the buyer panel changed about this plan

Twenty simulated venue owners and managers saw the pitch. **10 bought, 10
passed.** The reasons reorder the build.

**Price is not the problem, and should not be touched.** Nineteen of twenty
said ₹1,500 sat inside their acceptable band; most called it "nothing" against
their takings. Van Westendorp on their answers: acceptable ₹414–₹3,008,
indifference point ₹1,214, and ₹1,500 already inside it with headroom above.
Discounting would buy nothing. (The pricing script prints `$`; the figures are
rupees.)

**Three of the ten passes were not objections at all — they were the wrong
person.** Floor managers cannot sign a subscription in the owner's name. Sell
to owners. That alone moves the ceiling from 50% to roughly 65%.

**Three more had no league night to score.** *"I would be buying a scoreboard
for an event that does not exist yet."* The product sells scorekeeping to
venues that already run a competition night. Most do not. **Ship the playbook
with the software** — a week-by-week guide to starting a league night from
zero. That is a document, not an engineering task, and it may be worth more
than any feature in Phase 1.

**Two refused purely on offline.** Both named public embarrassment, not money.
This confirms §1.3 as a blocker, not a nicety.

**Four asked for the same thing unprompted: WhatsApp.** These venues already
run their tournaments through a WhatsApp group. Pushing the bracket, results
and league table into the group — rather than asking regulars to adopt a new
place to look — may convert more than the big screen does.

**One objection kills the dispute-settling pitch if unanswered:** *"a screen
doesn't referee a frame — someone still types the result."* The fix is small
and worth doing early: both players confirm the frame on their phones before
the score locks. Then the screen carries their word, not the owner's.

## Onboarding belongs inside Phase 1, not in a phase of its own

**Half the buyer panel's objections were staff adoption, not price.** Five of
the first ten named it, and the flip condition every one of them gave was the
same: *someone runs the first night in my venue, with my staff watching.*

That is not a feature. For the first ten venues it is you, in the room, on a
Tuesday. Productise it afterwards:

- A guided first-night mode that walks a staff member through it live.
- A **staff mode**: one screen, big buttons, scoring only, nothing else
  reachable. Assume the person holding the phone was trained for ninety seconds.
- A printable one-page run sheet for behind the counter.

---

## Phase 2 — scale it (only after three venues pay)

Everything here is wasted effort until someone has paid for Phase 1.

### 2.1 Venue accounts
A `venues` table; a host owns one or more, and tournaments and series belong to
a venue. Small change — `host_id` already exists on `tournaments`.

### 2.2 Subscription billing
Razorpay **Subscriptions**, billed to the venue as business software. Ordinary
B2B SaaS, not an online money game, and it reuses the Razorpay integration you
already fought to get working — the keys stay useful.

### 2.3 Chain tier
Chain owners multiply any per-venue price across their sites, so they are more
unit-sensitive than single-venue owners despite earning more. One dashboard and
a league table spanning venues is what moves them from one pilot site to all of
them.

### 2.4 The UI revamp
Worth doing, and worth doing here, because the display mode and staff mode are
the two screens that actually sell — and neither exists until Phase 1. Revamping
the player wallet now would polish something about to be deleted.

- A real design system: tokens for colour, type and spacing, replacing the
  thousands of inline styles currently scattered through the pages.
- The two hero surfaces designed properly: the big screen, and staff mode.
- The mobile pass is already done — every page measures clean at 390px.

---

## The objection no feature answers

One buyer said the thing worth pinning above the desk:

> "The bracket was never the hard part. Filling a dead Tuesday is."

Software that runs a bracket beautifully still does not put people in the room.
The league table is the closest thing to an answer — it gives regulars a reason
to come back next week — so treat **week-two return rate** as the number that
decides whether this business is real. If venues run one night and never a
second, the product is admin, not attendance, and no amount of UI fixes that.

## What to measure

| Metric | Why | Target for a real signal |
|---|---|---|
| Venues running a second night | the whole thesis | 7 of first 10 |
| Nights run without the founder present | is it self-serve yet | 5 in a row |
| Setup time by a stranger | the 60-second claim | under 90s |
| Paying venues after the free month | demand is real | 3 by week 8 |

## The whole plan on one page

Three phases. Phase 0 is legal and urgent; Phase 1 is everything needed to earn
the first rupee; Phase 2 is everything that only makes sense once someone pays.

| # | Phase | What | Exit test |
|---|---|---|---|
| 0 | Stop | Stakes off, wallets refunded, skill defence deleted | No participant money anywhere in the app |
| 1.1 | Prove | The league-night playbook (a document, not code) | — |
| 1.2 | Prove | Offline-first scoring | Scores survive the connection being pulled |
| 1.3 | Prove | Both players confirm the frame | — |
| 1.4 | Prove | WhatsApp push of bracket, results, table | — |
| 1.5 | Prove | Sixty-second setup and staff mode | A stranger sets up a night in under 90s |
| 1.6 | Prove | Big-screen display mode | Works on a propped tablet, not just a TV |
| 1.7 | Prove | Join by QR | — |
| 2.1–2.4 | Scale | Venue accounts, subscriptions, chain tier, UI revamp | — |

**Phase 1's gate is three paying venues.** Until then the first ten are set up
by hand and invoiced over UPI — building billing before anyone wants to be
billed is the classic way to spend a month on nothing.
