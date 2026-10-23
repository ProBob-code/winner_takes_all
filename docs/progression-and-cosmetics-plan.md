# Progression, shop and trophies

Status: **v2. Phases 1, 1b, 2 and 5 are built** (levels, profile and avatars,
trophies offline and online). Everything else is still a plan.
was earn-only. v2 adds win/loss points, separate online and offline tracks, a
coin shop, and ordering physical trophies.

What it is for: players come back more often, and keep coming back to the
venue. Each game earns them something they can see. Losing costs them
something, so the competition is real. And they have something to show off
that the people they play recognise.

---

## 1. Open questions

The rest of the plan follows from these. Each has a recommendation.

| # | Question | Recommendation | Why |
|---|---|---|---|
| Q1 | One number that goes up and down, or two? | **Decided: as in Clash Royale.** **Trophies** go up and down with wins and losses (§4). The **Collection Level** never drops (§5). | Buying an emote can't buy back a defeat, so trophies stay a measure of skill. |
| Q2 | Can artifacts be bought? | **Yes, but there are two kinds.** *Collectibles* (bought with coins). *Honours* (earned only: night wins, clearances, season titles, peak rank). | "Credibility" only works if some badges can't be bought. A 50-night-win honour is worth showing because nobody could buy it. |
| Q3 | Who pays for a physical trophy? | **The host or venue, in rupees.** Players can design or suggest one, but they don't chip into a pot. | Players pooling money into a prize the winner takes is a stake, however small. Coins can never pay for a trophy: a coin that buys goods is "convertible to money" under the Act (`coins.ts`, property 2). |
| Q4 | Engrave the winner's name? | **Offer both.** "Engrave after the night": the order goes to the vendor when the night ends, with the winner's name filled in, and is presented next week. "Present tonight": the night name and date only, plus an optional name plate. | Engraving takes days, and nobody knows the winner in advance. |
| Q5 | Who makes the trophies? | **One partner trophy shop to start**, handled manually through an admin queue. Automate once volume justifies it. | We need the right partner before we need integration code. Needs a name from you. |
| Q6 | Which trophy tracks? | **Decided: each sport, offline and online, plus a separate overall.** | See §4: Pool offline, Football offline, Pool online, and Overall as its own ladder, not a sum. |
| Q7 | Avatars: built from parts, or photo upload? | **Built from parts** (§7b). Photos maybe later. | A parts builder needs no moderation and no storage, keeps face photos out of the database, and lets avatar parts be shop and level rewards. |

---

## 2. Legal boundaries this design keeps

Everything here has to stay inside the existing rules in `lib/coins.ts` and
`lib/stakes.ts`. These are the lines:

1. **Rank points are not currency.** You can't buy, sell, transfer or redeem
   them, and they never change how many coins anything pays. A loss costs
   rank points and **never coins**: `coins.ts` property 3 stays exactly true.
2. **The coin shop sells only digital cosmetics.** They're non-transferable,
   have no cash value, have fixed prices, and **are never random**. There are no
   loot boxes, chests or "mystery" items. Paying coins for a random outcome in
   hope of something better is staking.
3. **The shop is closed whenever `stakesEnabled()` is true.** If paid entry fees
   ever come back, "pay money → win coins → spend coins on goods" starts to look
   like "other enrichment". The switch makes that combination impossible, not
   just unlikely.
4. **Trophies are a separate sale of goods, paid in rupees.** They're gated by a
   new `TROPHIES_ENABLED` flag, default off, the same way venue billing is gated
   by `BILLING_ENABLED`.
5. `coins.ts` already says to take a gaming lawyer's view before adding a coin
   sink. **Get it on points 2 and 3 before Phase 3 ships.** Selling trophies also
   makes WTA a seller of goods (e-commerce rules: seller details, returns,
   grievance contact; GST), so put that to the same lawyer.

---

## 3. What a game pays

Every finished game now has three outputs. Coins are paid exactly where and
how they are today, in `awardFrameCoins` and `/api/coins/claim-online`.

| | Coins (existing) | Rank points (new, ±) | Level XP (new, only up) |
|---|---|---|---|
| Offline frame won | 15k | **+** (Elo, §4) | 1 XP per 1k coins earned |
| Offline frame lost | 5k | **−** (Elo, §4) | 1 XP per 1k coins earned |
| Night won | 50k × players | — (frames already counted) | from coins |
| Online game won (vs AI) | 3–5k | **+**, smaller | from coins |
| Online game lost or abandoned | 0 | **−**, smaller | 0 |
| Item bought in the shop | − price | — | **+ collection points** (§5) |

---

## 4. Trophies: the tough part

*Decided (Q1, Q6). Built in Phase 2.* As in Clash Royale, a win gains
**trophies** and a loss costs them. The Collection Level (§5) is the separate
number that never drops.

### Tracks

Each player has trophies on several tracks, each its own ladder:

| Track | Fed by |
|---|---|
| **Pool, offline** (`offline:8BALL`) | frames at venue nights, recorded by the host |
| **Football, offline** (`offline:FOOTBALL`) | matches at hosted football nights |
| **Pool, online** (`online:8BALL`) | browser 8-ball against the AI, labelled **practice** because the device reports its own result |
| **Overall** (`overall`) | every rated game above. It's a **separate count with its own ladder, not a sum**: a sum would reward playing more sports, not winning. Offline counts in full; online at half weight. |

New tracks (online football, say) are one entry in `TROPHY_TRACKS`.

### Trophies per game

Everyone starts at **0**.

```
swing = clamp(round((opponent − mine) / 25), −10, +10)
win   = +(30 + swing)          // 20 to 40
loss  = −(30 − swing)          // 20 to 40
```

Beating someone with more trophies pays more, and losing to someone with fewer
costs more. Against an equal opponent it's ±30.

### Arenas: name and badge

| Trophies | Arena |
|---|---|
| 0 | Practice Table |
| 300 | Corner Pub |
| 600 | Back Room |
| 1000 | Club House |
| 1500 | Felt Hall |
| 2000 | Neon Lounge |
| 3000 | Velvet Room |
| 4000 | Grand Hall |
| 5000 | The Crown |

Arenas are places, as Clash Royale's are, and their names are deliberately
different from the level names, so "Legend" never means two things.

- **Losses are free in the first arena** (under 300), so a new player isn't
  put off on their first night.
- **Floors.** A loss never drops you out of the arena you've reached. That
  makes it tough but not crushing.
- **Peak trophies** are kept per track, for the profile.

### Rules that stop farming and collusion

- **Walk-ins without accounts** count as your own trophies, at **half
  weight** (±15). Gains against walk-ins are capped at **+90 a day per track**,
  so a host can't type in a field of names and beat them all night.
- **Same two players, same day:** 1st game full, 2nd half, 3rd onwards no
  trophies. Coins are still paid as today.
- **Only frames that reach the table count**: the same point at which coins
  are paid, after frame confirmation. A re-settled frame moves trophies once
  (unique ledger index, like coins).
- **Online games need a server-issued start.** The page reports
  `game_start`, and the API records an open game. A game with no result
  **30 minutes** later counts as a **loss**, so closing the tab before losing
  doesn't dodge it. Online gains are capped at **+120 a day**. The AI counts as
  300, 1500 or 3000 trophies for levels 1, 2 and 3. Two players on one device
  stays unrated.

### Seasons (Phase 7)

Monthly soft reset of anything above 4000, as Clash Royale resets above a
threshold. Peak trophies are kept as an honour.

---

## 5. Collection Level: only goes up

Level is built from experience you can't lose:

```
XP = lifetime coins / 1,000  +  collection points
levelFor(XP): level n needs 50 × (n − 1) × n / 2 XP      // L2 = 50, L5 = 500, L10 = 2,250, L20 = 9,500
```

- **Collection points:** every item owned adds points by rarity: common 5,
  rare 15, epic 40, legendary 100. Buying in the shop always raises Level.
  Spending lowers `balance` but never `lifetime`, so spending can't take a
  level away.
- **Every level has a name and a badge.** The existing `COIN_TITLES` names
  become level bands, so the names players already see carry over:

| Levels | Name | Badge | Lifetime coins at band start |
|---|---|---|---|
| 1–2 | New in | bronze ring | 0 |
| 3–5 | Regular | bronze star | 150k |
| 6–10 | Contender | silver star | 750k |
| 11–17 | Shark | silver fin | 2.75M |
| 18–27 | Hustler | gold cues | 7.65M |
| 28–49 | Legend | gold crown on red | 18.9M |
| 50+ | Hall of Fame | glowing gold crown | 61.25M |

  *(Built.)* Each band starts at the highest level whose coin threshold is at
  or below the old `COIN_TITLES` figure for that title. So moving titles from
  balance to level cost nobody a title. A test pins this.

  Each band's badge has a pip per level inside it, so level 7 looks different
  from level 5.
- **Profile line:** level badge and name, then offline rank tier, then up to 3
  showcased artifacts. Everywhere a name shows: leaderboard, standings, venue
  TV, scorer.

---

## 6. Shop: coins buy artifacts and emotes

- **What's sold:** collectible artifacts, emotes, borders and stickers (v1
  catalogue §6.1). Honours are never sold.
- **Fixed prices by rarity:** common 25k, rare 75k, epic 200k, legendary 500k.
  A regular who turns up and plays three frames earns about 40k a night, so a
  common costs one night and a legendary costs a season.
- **A daily rotation of 6 items**, plus a permanent section. The rotation is
  the "open the app today" hook. Clash Royale's shop rotates daily for the same
  reason. Items are always shown with their price and exact contents, so
  nothing is a surprise.
- **Bought once, owned forever.** No duplicates, no trading, no gifting
  (gifting would make coins transferable).
- **Refunds:** an undo within 10 minutes, back to coins. Never to rupees.

### 6.1 v1 catalogue size

| Kind | Starter (free) | Shop | Earned (Honours, level unlocks) |
|---|---|---|---|
| Artifacts | — | 20 collectibles | 7 honour families × 2–3 tiers (night wins, clearances, streaks, seasons, peak rank, nights played, trophies won) |
| Emotes | 6 | 14 | 4 (level 10/20/30/40) |
| Borders | 2 | 8 | season and tier exclusives |
| Stickers | 4 | 12 | gold-tier honours |
| Avatar parts | ~60 (every layer usable from day one) | ~30 | ~10 (level and honour parts) |

All original pool-room art. No Supercell assets, names or characters (see v1
§0: mechanics are fair game, art is not).

### 6.2 Emotes in use

Unchanged from v1. Up to 8 in your deck. You fire them during a night at the
venue TV (`display/[id]`) and your opponent's screen. They run through a
`NightEmotes` Durable Object modelled on `MatchFeeds`. Only players in that
night can fire them, at most 1 every 4 s. Pre-set only, with a mute toggle.

---

## 7. Physical trophies for the night (the cup you hand over)

"Trophies" on their own means the trophy count (§4). Anything you can hold is
a **physical trophy** or a **cup**, in the UI as well as here.

### Flow

1. **Where:** a "Trophy" card on the host form (`host-form.tsx`,
   `host-series-form.tsx`) and on the night and series page. Players see it
   too, with a **"Suggest this trophy"** action that sends the host a design
   (notification). Only the host pays (Q3).
2. **Design it:** choose a type (cup, shield, plaque, medal) and a size or
   price tier. Choose a finish (gold, silver, bronze, crystal) and a base
   colour. Engrave up to 3 lines, prefilled with the night or series name,
   venue and date, plus a `{winner}` line (Q4). Optionally upload a venue logo.
   Add runner-up or third place. A **live SVG preview** updates as you pick.
3. **Price:** vendor price + WTA margin + delivery + GST, all in rupees, shown
   itemised. The earliest delivery date comes from the vendor's lead time. The
   form blocks "present tonight" if it can't arrive in time.
4. **Pay:** Razorpay, reusing `lib/razorpay.ts` and the signature-verified
   webhook path, under `TROPHIES_ENABLED`. Not under `stakesEnabled`: this
   is a sale of goods, not an entry fee.
5. **Fulfilment (v1, manual):** a paid order lands in an **admin queue**
   (`app/admin`). The vendor gets an order sheet by email: design, engraving,
   address, deadline. Admin moves it through `paid → sent → in production →
   shipped → delivered`. The host gets each change in the existing
   notifications.
6. **Presented:** the host taps "Presented" on the night page. The winner
   gets a **digital twin honour** in their showcase: "Trophy · Thursday
   Shootout · The Cue Club · 23 Oct 2026". That's credibility only a real
   night can produce, and it's a reason for venues to order through WTA.

### Business note

The trophy margin is a new revenue line alongside venue subscriptions, and
lawful for the same reason: an ordinary sale. Worth a pass through
`founder/cfo.md` for vendor price, margin and volume.

### Gaps to close before launch

- **No refund endpoint exists yet** (`docs/phase-2-checklist.md`). Trophies need
  one first: cancellation is free until the order is sent to the vendor, and
  not after engraving.
- **No file storage binding yet.** Logo upload needs an R2 bucket.
- **Vendor agreement:** prices, lead times, damage and returns.

---

## 7b. Profile revamp and avatars

The profile is where all of this gets shown off. Today it is a money-era page:

| Today (`app/profile/page.tsx`) | Problem |
|---|---|
| "Wallet Balance" | There is no wallet while stakes are off. The figure is also **always 0**: the page reads `user.coins`, but `serializeUser` (`middleware/auth.ts:56`) only returns `walletBalance`. |
| Peer-to-Peer Transfer card | Calls `/api/wallet/transfer`, which returns 410 while stakes are off, so it's a dead form. Worse, "Send credits" reads as sending coins, and coins must never be transferable (`coins.ts` property 2). **Remove it.** |
| "Active & Verified" | Hard-coded. Nothing verifies an account, so the page says something untrue. **Remove it.** |
| Role "Player" | Hard-coded. Should read `user.role`. |
| Avatar = first letter of name | Replaced by the avatar below. |
| Raw `ID: WTA-…` in the hero | Moves to the account card with a copy button. Hosts still need it to add a player. |

### New layout (top to bottom; phone first, two columns from tablet up)

1. **Hero:** avatar inside the equipped border, with the sticker on its
   corner. Then name, **level badge + level name + XP bar** ("Level 12 ·
   Contender · 340 XP to 13"), **offline rank tier badge + points** (with the
   season peak in small print), and **WTA Coins**: balance large, "collected
   all time" (lifetime) under it. Buttons: *Edit avatar*, *Locker*, *Share
   profile*.
2. **Stats strip:** frames played, frames won, win rate, nights won,
   clearances, current venue streak. From `getUserMatchStats` (already
   returned, never shown) plus `coin_ledger` counts.
3. **Showcase:** the 3 equipped artifacts and the honours, with "Open locker".
4. **Rank card:** each track (offline pool, offline football, online
   practice) with tier, points, and a sparkline of the last 20 changes from
   `rating_ledger`.
5. **Trophy cabinet:** physical trophies presented to this player (from
   `trophy_orders.presented_to`), each with night, venue and date.
6. **Recent coins:** the last 5 ledger rows, linking to `/coins`.
7. **Account:** email, real role, member since, player ID with copy, logout.

### Public profile: `/players/[id]`

Showcasing needs an audience. The same page, read-only, opens when anyone
taps a name on the leaderboard, standings or venue TV QR. It shows sections
1–5 only. **Email, coin ledger and account details are never public.**

### Avatar builder

- **A layered SVG built from parts, not a photo upload.** Layers: background,
  skin tone, face shape, eyes, mouth or expression, hair, facial hair,
  headwear, outfit, outfit colour, accessory (cue, chalk, glasses).
  - Rendered client-side from a small JSON config, so it's crisp at any size,
    costs a few hundred bytes, and needs no storage bucket.
  - Photo uploads would need moderation, R2, and care under the DPDP Act for a
    face photo. Not worth it for v1.
- **Inclusive by default:** 8+ skin tones, and hair and headwear that include
  a turban, hijab, patka and caps. No gendered defaults.
- **Everyone gets a real avatar from day one.** The default is generated from
  a hash of the user id, so no profile is left with a bare letter. The player
  then edits it.
- **Ties into the economy:** about 60% of parts are free starters. The rest
  unlock by level (a gold cue at level 25) or are sold in the shop
  (`kind: "avatar_part"` in the catalogue, same prices and rules as §6).
  Honour parts, such as a crown for a season champion, are never sold.
- **Everywhere a name shows**, the avatar shows: profile, leaderboard rows,
  standings, venue TV, scorer, the opponent card on the match screen. The
  compact `player-banner.tsx` renders it at 32 px.
- **Editor:** `app/profile/avatar` has a large live preview, a tab per layer,
  a randomise button, and locked parts shown with their unlock rule. Save
  calls `PUT /api/progression/avatar`. The server rejects any part the player
  doesn't own.

---

## 8. Schema: migration `0014_progression.sql`

```sql
-- Rank, per track. track: 'offline:POOL' | 'offline:FOOTBALL' | 'online:POOL'
CREATE TABLE player_ratings (
  user_id TEXT NOT NULL, track TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1000, season TEXT NOT NULL,
  season_floor INTEGER NOT NULL DEFAULT 0, peak_rating INTEGER NOT NULL DEFAULT 1000,
  games INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, track)
);
-- Every rating change, so a player can audit it like the coin ledger.
-- The unique index makes a re-settled frame move rank exactly once.
CREATE TABLE rating_ledger (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, track TEXT NOT NULL,
  delta INTEGER NOT NULL, rating_after INTEGER NOT NULL,
  opponent_key TEXT, reference_type TEXT NOT NULL, reference_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_rating_once ON rating_ledger (user_id, track, reference_type, reference_id);

-- Server-issued online games, so an abandoned game can count as a loss.
CREATE TABLE online_games (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, ai_level INTEGER,
  started_at TEXT NOT NULL, finished_at TEXT, result TEXT   -- 'won' | 'lost' | 'abandoned'
);

-- Ownership and loadout, as in v1, with a source so honours can be told from purchases.
CREATE TABLE player_unlocks (
  user_id TEXT NOT NULL, item_id TEXT NOT NULL,
  source TEXT NOT NULL,                 -- 'starter' | 'level' | 'honour' | 'shop' | 'trophy'
  price_paid INTEGER, reference_id TEXT, unlocked_at TEXT NOT NULL, seen_at TEXT,
  PRIMARY KEY (user_id, item_id)
);
CREATE TABLE player_loadout (
  user_id TEXT PRIMARY KEY, border_id TEXT, sticker_id TEXT,
  showcase TEXT NOT NULL DEFAULT '[]', emote_deck TEXT NOT NULL DEFAULT '[]',
  avatar TEXT,                          -- JSON part config; null = generated from the user id
  updated_at TEXT NOT NULL
);

CREATE TABLE trophy_orders (
  id TEXT PRIMARY KEY, tournament_id TEXT, series_id TEXT, ordered_by TEXT NOT NULL,
  design TEXT NOT NULL,                 -- JSON: type, size, finish, colours, engraving lines, logo key
  engrave_mode TEXT NOT NULL,           -- 'after_night' | 'tonight'
  price_cents INTEGER NOT NULL, gst_cents INTEGER NOT NULL, delivery_cents INTEGER NOT NULL,
  ship_to TEXT NOT NULL, status TEXT NOT NULL,
  razorpay_order_id TEXT UNIQUE, razorpay_payment_id TEXT, vendor_ref TEXT,
  deliver_by TEXT, presented_to TEXT, presented_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
```

### Changes to the coin code a shop needs (Phase 3)

- **`spendCoins()`** in `d1-store.ts`: a balance-gated update plus a ledger row
  (`reason = 'PURCHASE'`, negative amount, `reference_id = item id`) plus the
  unlock, all in one `db.batch()`. That's the same pattern `deductWallet`
  already uses. `awardCoins` rejects amounts ≤ 0, so this has to be its own
  path.
- **`coinsEarnedToday` / `coinsEarnedTodayFor`: add `AND amount > 0`.**
  Without it, every purchase reopens that day's cap by its price.
- **The coin leaderboard and `titleFor` read `lifetime`, not `balance`.**
  Otherwise spending drops a player down the table. These are the calls at
  `index.ts` lines 4673, 4693, 4740 and 4842.
- `COIN_RULES` gets `spendableOn: "cosmetics"`, and the "never deducted"
  wording in `coins.ts` is narrowed to "never deducted on a loss and never
  staked". That stays true.

---

## 9. API and frontend

| Route | Purpose |
|---|---|
| `GET /api/progression/me` | Level, XP to next, ranks per track, tier, floor, owned items, loadout, unseen unlocks. Grants overdue honours and level unlocks lazily, which also backfills existing players. |
| `GET /api/progression/catalog` | Every item, its price or how it's earned. |
| `PUT /api/progression/loadout` | Equip a border, sticker, ≤3 showcase items, ≤8 emotes; every id must be owned. |
| `GET /api/user/profile` (changed) | Adds `coins {balance, lifetime}`, level, ranks and avatar. Drops `walletBalance` while stakes are off. |
| `PUT /api/progression/avatar` | Save the avatar config; every part must be owned. |
| `GET /api/players/:id` | Public profile: hero, stats, showcase, ranks, trophies. Never email or ledger. |
| `GET /api/players/banners?ids=` | Batched badge + rank + showcase for leaderboard and standings rows. |
| `GET /api/shop` · `POST /api/shop/buy` · `POST /api/shop/undo` | Today's rotation; buy; 10-minute undo. 404 when `stakesEnabled`. |
| `POST /api/online/start` · result folded into `/api/coins/claim-online` | Rated online games. |
| `GET /api/ratings/leaderboard?track=` | Rank ladders, per track and season. |
| `POST /api/nights/:id/emotes` · `GET …?since=` | Live emotes. |
| `POST /api/trophies/quote` · `/orders` · `/orders/:id/pay` · `GET /orders/:id` | Design, price, pay, track. |
| `POST /api/admin/trophies/:id/status` | Fulfilment queue. |
| `POST /api/trophies/:id/presented` | Host marks it given; grants the digital twin. |

Frontend: `app/locker` (owned items and loadout), `app/shop`, rank and level
badges in `components/player-banner.tsx`, a rank change on the frame result
("+14 · Pocket"). The rank change goes into the existing `coin-toast.tsx`,
so a frame shows coins and points together. Plus `components/trophy-designer.tsx`
with the SVG preview on the night and series pages, and a trophy queue tab in
`app/admin`.

Pure logic goes in its own testable files, the way `coins.ts` and
`frame-confirmation.ts` are: `lib/rating.ts`, `lib/progression.ts`,
`lib/shop.ts`, `lib/trophies.ts` (pricing and lead time).

---

## 10. Phases

| Phase | Ships | Key tests |
|---|---|---|
| **1. Level + names + badges** | XP, level bands, badge on profile and leaderboard; titles move to lifetime | curve monotonic; never decreases |
| **1b. Profile revamp + avatars** | new profile layout (§7b), coins actually shown, transfer and fake status removed, avatar builder with free parts, `/players/[id]` | profile never leaks email; avatar rejects unowned parts; default avatar stable per user |
| **2. Trophies, offline** *(built)* | trophy tables, settle on frame, arenas, floors, first-arena protection, walk-in and same-pair rules, ladders per track, trophies on profile | idempotent re-settle; walk-in weight and cap; same-pair decay; floor holds |
| **3. Shop** *(after legal view, §2.5)* | catalogue, `spendCoins`, daily rotation, locker, cap and leaderboard fixes | can't overspend under concurrency; cap ignores purchases; shop 404 with stakes on |
| **4. Emotes live** | `NightEmotes` DO, bar + TV bubbles | rate limit; non-participant rejected |
| **5. Trophies, online** *(built)* | server-issued games, abandon = loss, daily gain cap, stakes shown before the break | abandonment settles once as a loss; a game can't be claimed by another account |
| **6. Trophies** *(after refund endpoint, R2, vendor)* | designer, quote, Razorpay, admin queue, digital twin | price maths; webhook idempotent; "tonight" blocked past lead time |
| **7. Seasons** | monthly soft reset, peak honours | reset formula; peak kept |

Phases 1, 1b and 2 need no legal sign-off and no vendor. The only art they
need is the badges and the starter avatar parts. They're the place to start
while Q1–Q7 are being settled. Phase 1b also fixes three things that are wrong
on the live profile today, so it's worth doing first even on its own.
