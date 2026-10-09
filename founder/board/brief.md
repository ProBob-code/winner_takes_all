# Winner Takes All (WTA)

- **What it is:** an online tournament platform where players pay an entry fee in
  rupees, are drawn into a bracket, play 8-ball pool or a turn-based football
  scoring game, and the pooled entry fees are paid out to the winners. The
  platform keeps a 7% rake on the pot, plus a 1% charge on withdrawals.
- **Who it is for:** casual competitive players in India. In practice so far:
  friends and small local groups, plus gaming cafés and community organisers who
  host brackets. Five registered accounts at the time of writing.
- **What it sells, at what price:** entry to a tournament. Observed entry fees
  ₹100 per player, pots of ₹372–₹500. Revenue is the 7% rake, so a ₹400 pot
  earns the platform ₹28. Top-ups are taken by Razorpay; payouts go back to UPI.
- **Where and how:** web app at winner-takes-all.pages.dev, India, INR only.
  Distribution so far is word of mouth. Hosts can create public or private
  (password-protected) tournaments and weekly series.
- **Budget and constraints:** solo founder, building it personally. Running cost
  is near zero (Cloudflare Workers, D1, KV, Pages free tiers; Razorpay charges
  per transaction). No outside funding mentioned. No staff.

## What is actually built (verified in the repository, not claimed)

- 68 API routes, 30 frontend pages, ~23,000 lines of TypeScript.
- Auth: PBKDF2-SHA256 passwords, opaque KV session tokens, rotating refresh.
- Money: Razorpay top-ups with webhook verification; wallet ledger where every
  mutation is a balance-gated single-transaction SQL update; prize settlement;
  as of this week, member-initiated payouts with an admin approval queue.
- Tournaments: brackets, a live scoring engine for 8-ball and football, weekly
  series with standings, live camera streaming via Cloudflare Realtime, QR-code
  broadcast tokens, public "arenas" for local score tracking, rankings.
- An admin console: payout queue, member list, full ledger, tournament/win view.
- CI gates typecheck and 119 tests on every push; deploys are automated.

## The constraint that defines the business

India's **Promotion and Regulation of Online Gaming Act, 2025** came into force
on **1 May 2026**. It prohibits "online money games" — games where users pay a
fee or stake with the expectation of monetary gain — **irrespective of whether
the game is one of skill or of chance**. Penalties reach three years'
imprisonment and ₹1 crore. Banks are barred from processing payments for them,
and all advertising of them is banned.

The Act does carve out **e-sports**, which it actively promotes. E-sports may
charge a registration or participation fee to cover the costs of running the
competition, and may award performance-based prize money. But e-sports must be
recognised under the National Sports Governance Act 2025, registered with the
new Online Gaming Authority, and must involve **no betting, wagering or staking
by participants**.

WTA's present model — players stake an entry fee, the stakes form the pot, the
house takes 7% and pays the rest to the winner — is the pooled-stakes structure
the Act bans. The product is literally named after it.

The site currently carries a disclaimer that it "does not facilitate betting,
gambling, or games of chance" and that "outcomes are determined solely by
participant skill". That is the game-of-skill defence, and the 2025 Act
specifically removed it.

## Notes for the board

You cannot see the conversation this came from. Everything you need is above.

The founder has asked for an assessment of the product and the business. Judge
the business as it stands and as it could be restructured. Do not soften the
regulatory finding, and do not assume it away — but do consider whether a
lawful version of this business exists and whether the asset already built
would be worth anything in it.

The skill directory containing lenses.md is:
.claude/skills/founder-board/lenses.md
