# CFO: the unit economics of WTA

Every figure below traces to something in this repository or to the live
database, not to an assumption. Where an input is a guess, it says so.

## The unit

One tournament. Observed live: `wta-T1`, four players, ₹100 entry, ₹400 pot,
₹372 paid to the winner. That ₹372 confirms the rake exactly — `schema.sql`
sets `platform_fee_percent DEFAULT 7`, and 400 − 7% = 372.

| Line | Amount | Source |
|---|---|---|
| Pot (4 × ₹100 entry) | ₹400.00 | live tournament |
| Paid to winner | −₹372.00 | live tournament |
| **Gross revenue (7% rake)** | **₹28.00** | `prizeAfterFee()` |
| Razorpay on deposits (2% + 18% GST) | −₹9.44 | worst case: every rupee freshly deposited |
| Payout charge (1% of ₹372) | +₹3.72 | `PAYOUT_FEE_PERCENT` |
| **Net per tournament** | **₹22.28** | |

Infrastructure is effectively ₹0 — Cloudflare Workers, D1, KV and Pages all sit
inside free tiers at this volume. That is a genuine strength: there is no
monthly burn to outrun.

The ₹9.44 is the pessimistic case. Money that recirculates inside wallets is
raked again without a second Razorpay charge, so the real figure improves as
players leave winnings in. That is also, precisely, why real-money platforms
work so hard to keep money on the platform — and part of why the regulator took
the view it did.

## What volume this requires

| Target revenue | Tournaments / month | Per day | Player-entries / day |
|---|---|---|---|
| ₹25,000 | 1,122 | 37 | 150 |
| ₹1,00,000 | 4,488 | 150 | 598 |

Today there are **five registered accounts**. Reaching a single modest salary
means roughly 150 paid entries every day, every day. The gap is not 10× or
100×; from five users it is several orders of magnitude.

## The two numbers that break the model

**1. The rake is too thin for the risk it carries.** ₹28 of revenue sits on top
of ₹400 of other people's money that the platform is custodian of. Every rupee
of that ₹400 is a liability: it must be returned on demand. One disputed
payout, one chargeback, one bug that double-credits a wallet, and a single
incident costs more than dozens of tournaments earn. The admin console now
reports exactly this as "cash liability".

**2. GST, if the activity were lawful, exceeds all revenue.** Online money
gaming attracts 28% GST on the full face value of deposits, not on the rake. On
a ₹400 pot that is ₹112 of tax against ₹28 of revenue — **four times the entire
gross margin**. There is no volume at which that arithmetic turns positive. The
model would have to be restructured before it could be taxed, never mind scaled.

## Verdict

At the current entry fee and rake the business is not unprofitable so much as
*immaterial*: ₹22 a tournament against a near-zero cost base is a positive
margin on a number too small to matter, and the path to it mattering runs
through a volume the product has no distribution to reach — and through a legal
regime that currently forbids the transaction entirely.

The cost base being ~₹0 is the one genuinely good number here. It means nothing
is bleeding while the model is rethought.
