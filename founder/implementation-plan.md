# Winner Takes All — implementation plan

> ## Status, 12 October 2026
>
> **All three phases are built and deployed.** Phase 0 shipped first and on its
> own; Phases 1 and 2 were then built together in one pass, on the founder's
> instruction to complete all the phases rather than wait on Phase 1's gate.
>
> **That gate was not met, and it matters.** This plan said Phase 2 starts only
> once three venues are paying after their free month. Nobody is paying yet, so
> everything in Phase 2 — venue accounts, subscription billing, the chain tier —
> was built against assumed demand rather than observed demand. The shapes in it
> are guesses: how venues want staff roles organised, whether a chain is the
> right grouping, whether ₹1,500 is the right figure. Expect to rework them once
> real venues use them, and read the per-section notes below before defending any
> of those decisions to a buyer.
>
> Phase 1 is different: every item in it answers something a named buyer on the
> twenty-venue panel actually said, so it is built on evidence even though it is
> not yet validated.
>
> **Subscriptions are deliberately switched off in production.** `BILLING_ENABLED`
> is unset, so `/pricing` shows the prices and says "not open yet" rather than
> taking a mandate. Two reasons: the live Razorpay secret was exposed in chat and
> must be rotated first, and there is no reason to take a venue's money before
> Phase 1 has been tried on a real league night.
>
> **What is still genuinely untested:** none of this has been used on a league
> night. The sixty-second claim in 1.5 has not been measured against a stranger,
> and the offline guarantee in 1.2 has been tested by its unit tests and not by
> pulling a plug in a bar.


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

## Phase 0 — lawful by the end of the week ✅ shipped

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

## Phase 1 — prove it ✅ built, not yet proven

**Exit test: three venues paying after their free month.** Nothing in Phase 2
starts until that is true.

Ordered by what the buyer panel said blocks the sale, not by what is most fun
to build. Venue accounts and subscription billing were written here first and
moved to Phase 2: the first ten venues can be set up by hand and invoiced over
UPI, and building billing before anyone wants to be billed is the classic way
to spend a month on nothing.

### 1.1 The league-night playbook
**Built:** `founder/league-night-playbook.md`, and in the app at `/playbook`.
A week-by-week guide from no league at all to a paying Friday night, with a
diagnosis table for when it has not caught by week six. Deliberately useful
without the software — the fastest way to sell a scoreboard to a room with no
league is to help it start one. Linked from `/pricing`, because that is where
the three buyers who passed for this reason will be standing.

A document, not code, and the first thing to write. Three of the twenty buyers
passed because they had no competition night to score — *"I would be buying a
scoreboard for an event that does not exist yet."* A week-by-week guide to
starting one from zero may convert more venues than any feature below.

### 1.2 Offline-first scoring — the hard requirement
**Built:** `apps/frontend/lib/outbox.ts`, `lib/local-score.ts`,
`public/sw.js`, `components/network-badge.tsx`.

Every tap is written to IndexedDB before the request is attempted, replayed in
order on reconnect, and carries an id the server claims exactly once
(`engine_score_events`), so a replayed queue cannot count a second ball. The
board shows the server's last word with queued taps projected on top, so a tap
registers instantly with no signal at all, and unsent taps are marked so staff
do not re-tap and double-count.

The projection needs a second copy of the scoring rules in the browser, and the
risk of a second copy is drift. `apps/api/tests/local-score-mirror.test.ts`
closes that: 136 tests comparing the browser's arithmetic against the engine's
across 126 state/team/event combinations. It lives in the API's suite because
that is the only place that can import both.

**Not yet done:** tested by unit tests, not by pulling a plug in a bar. The
exit test in this plan — scores survive the connection being pulled — has not
been performed on a real night.

Two buyers refused outright over "what happens when the internet drops
mid-tournament," and both named reputational damage, not money, as the cost.
This is real engineering: a service worker, a local write queue, and sync on
reconnect for the `/api/engine/matches/:id/score` path. Scoring must never
block on the network.

### 1.3 Both players confirm the frame
**Built:** `POST /api/engine/matches/:id/confirm`, `/confirm-override`,
`components/frame-confirm.tsx`, table `engine_frame_confirmations`.

Opt-in per tournament (`require_frame_confirmation`). When on, a decided frame
is COMPLETED for the clock and the bracket but adds nothing to either team's
totals, and a final does not pay out, until both sides confirm. Unique on
(match, team), so one player cannot stand in for the other. A player who
confirms a different winner is told the result is disputed rather than having
it quietly accepted.

The host can override for a flat battery or a player who has gone home. That is
recorded as the host's own word for both sides and shown as such — the thing
confirmation exists to make visible.

Small, and it answers the objection that sinks the dispute-settling pitch: *"a
screen doesn't referee a frame — someone still types the result."* Both players
confirm on their own phones before the score locks, so the screen carries their
word rather than the owner's.

### 1.4 WhatsApp push of bracket, results and table
**Built:** `GET /api/tournaments/:id/share?kind=`, `lib/share-text.ts`,
`components/whatsapp-push.tsx`.

Not a Business API integration, and that is the decision worth defending. Every
one of the four buyers who asked for this already runs their tournament through
a group chat; what they want is the results *in that group*. A Business API
integration means onboarding each venue onto a Meta business account, a template
approval queue and a per-message fee, to deliver into a group the owner is
already holding open. So the server builds the message and the client hands it
to WhatsApp through a `wa.me` link with no recipient: the share sheet opens, the
owner picks the group, and we never hold a phone number.

Four buyers asked for this unprompted. These venues already run tournaments
through a group chat; pushing results into it beats asking regulars to adopt a
new place to look.

### 1.5 Sixty-second setup and staff mode
**Built:** `/run`, `/staff/[id]`, `POST /api/engine/quick-setup`.

`/run` asks three questions — which game, how many playing, optional names — and
one request creates the tournament, seats the players, starts it, draws the
opening fixtures and puts a join code on the screen. Entry fees are not a
parameter, so no path through it can take a stake.

Staff mode is one screen: two sides, the clock, and nothing smaller than a
thumb (`--touch-min: 48px`, scoring buttons 72–96px). No navigation, no
settings, nothing deletable. It is also the page that goes offline-first, since
it is the one being held when the wifi drops.

**Exit test not yet run:** nobody has timed a stranger. The ninety-second claim
is a design target, not a measurement.

A single "run a night" flow: pick a game, pick a bracket size, done. Staff mode
is one screen, big buttons, scoring only — assume the person holding the phone
was trained for ninety seconds. Measure it: if a stranger takes longer than a
minute, it is not finished.

### 1.6 Big-screen display mode — `/display/[tournamentId]`
**Built:** `/display/[id]`, full bleed, read-only, polling every three seconds.

The panel's caveat is honoured: every size scales with the viewport rather than
being set for 1080p, the VS column collapses below 760px, and it works propped
on a tablet or a spare monitor and degrades to a phone. Nothing is positioned
against an assumed aspect ratio, and there is nothing to tap, so it is safe on a
screen nobody is guarding. It corrects for a device clock that is minutes out,
which a bar's spare tablet usually is, and keeps the last good picture on screen
when a poll fails rather than blanking.

A full-bleed, no-chrome view of the live bracket and running score, readable
from across a room. You already have the live state
(`GET /api/engine/tournaments/:id/state`) and the streaming plumbing; this is
presentation.

**Panel caveat:** two buyers said the wall TV is already showing cricket. It
must work propped on a tablet or a spare monitor, and degrade to a phone. Do
not assume a free screen.

### 1.7 Join by QR
**Built:** `POST /api/tournaments/:id/join-code`, `GET`/`POST /api/join/:code`,
`/join/[code]`, `components/night-links.tsx`, table `tournament_join_codes`.

One field and one button: the player types a name and is in. No account, no
wallet, no password, no terms to scroll past. The route creates an engine team
rather than a participant, because a participant has an account and a wallet and
a walk-in has neither; a signed-in player keeps their account on the team so a
season table can still add their weeks up.

Codes are reused rather than reissued while live, so a QR the room has already
scanned keeps working when the host reopens the display. Six hours' TTL. The
route refuses any tournament carrying a fee — someone who scanned a poster has
not agreed to a charge.

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

## Phase 2 — scale it ⚠️ built ahead of its gate

Everything here is wasted effort until someone has paid for Phase 1.

### 2.1 Venue accounts
**Built:** `venues`, `venue_members`, `tournaments.venue_id`; `/venues`,
`/venues/[id]`; venue routes under `/api/venues`.

A host may only attribute a night to a venue they actually work at — without
that check, the activity figures a chain owner is paying to see could be written
by anyone. Staff get staff mode and nothing else, which is the six-of-twenty
blocker this is really for.

**Speculative:** the three roles (owner, manager, staff) are a guess. So is the
decision that a venue belongs to exactly one chain.

A `venues` table; a host owns one or more, and tournaments and series belong to
a venue. Small change — `host_id` already exists on `tournaments`.

### 2.2 Subscription billing
**Built:** `apps/api/src/lib/billing.ts`, `venue_subscriptions`,
`subscription_events`, `/api/billing/*`, `/pricing`.

Razorpay Subscriptions with a 30-day trial expressed as a future `start_at`, so
the mandate is authorised now and the first charge falls due after the free
month. Webhooks are signature-verified against the raw body, fail closed on a
missing secret, and de-duplicated on the provider's event id — Razorpay
redelivers, and without that a redelivered charge would extend a period twice.
Cancellation is at cycle end: a venue that has paid for this month keeps it.

**The important architectural point.** Billing is gated by `BILLING_ENABLED`,
*not* by `STAKES_ENABLED`, and the two must stay separate. A venue paying for
tournament software is a business-to-business sale of software; a player paying
to enter a game is a stake. The Online Gaming Act 2025 prohibits the second and
says nothing about the first, so routing venue billing through the stakes switch
would have switched off the one revenue line that is lawful in order to guard
against the one that is not. `apps/api/tests/billing.test.ts` pins this.

**Off in production.** `BILLING_ENABLED` is unset: the prices show, the checkout
says "not open yet". The live Razorpay secret was exposed in chat and has to be
rotated before any of this takes real money.

Razorpay **Subscriptions**, billed to the venue as business software. Ordinary
B2B SaaS, not an online money game, and it reuses the Razorpay integration you
already fought to get working — the keys stay useful.

### 2.3 Chain tier
**Built:** `chains`, `/api/chains/*`, `/chains/[id]`.

The cross-venue league table is the thing a chain owner cannot get by buying the
single-venue product twice, so it is the centre of the page: a player's record
follows them between rooms instead of restarting at each, and anyone playing at
more than one site is marked. Beside it, per-site activity with the quiet rooms
flagged — a site that has not run a night in three weeks is the one about to
cancel, and the owner seeing that before we do is better for both of us.

**Speculative, and the most speculative thing here:** no chain has been sold to.
The ₹1,200 per site and the three-site minimum are reasoned from the CFO review,
not negotiated with anyone.

Chain owners multiply any per-venue price across their sites, so they are more
unit-sensitive than single-venue owners despite earning more. One dashboard and
a league table spanning venues is what moves them from one pilot site to all of
them.

### 2.4 The UI revamp
**Built:** spacing, type and touch-target tokens in `globals.css`, and a
component vocabulary built on them (`.auto-grid`, `.field`, `.input`, `.chip`,
`.stat`, `.data-table`, `.plan`, plus the display, staff and join styles).

Colour was already tokenised; size was not, which is why the pages carry
thousands of one-off inline paddings and font sizes. The new tokens are the
scale those move onto as pages are touched — deliberately few steps, because a
scale with twelve values is a scale nobody follows.

The two surfaces that actually sell — the big screen and staff mode — were
designed on the tokens from the start rather than retrofitted, which is why this
item stayed in Phase 2 rather than being done earlier.

**Not done:** the existing pages have not been migrated off their inline styles.
That is a long, low-risk grind best done page by page, and nothing depends on it.

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
