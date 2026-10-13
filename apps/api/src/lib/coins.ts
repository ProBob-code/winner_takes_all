/**
 * The WTA Coin: what a player earns for turning up and playing.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * THE BOUNDARY, AND WHY IT IS SHAPED EXACTLY LIKE THIS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * India's Promotion and Regulation of Online Gaming Act 2025 prohibits an
 * "online money game" — a game involving a user paying money *or other stakes*
 * in expectation of monetary *or other enrichment*. The Act then defines other
 * stakes to include, in terms, "credits, coins, and tokens equivalent or
 * convertible to money". Offering one is punishable by up to three years and
 * ₹1 crore, and the offence is cognisable and non-bailable.
 *
 * So a coin is only lawful here if it is neither *equivalent to money* nor
 * *convertible to money*, and is never *staked*. Three properties follow, and
 * all three are enforced by this file rather than by policy:
 *
 *   1. COINS CANNOT BE BOUGHT. There is no purchase path, no order, no
 *      gateway, and no route that turns rupees into coins. The only way a coin
 *      comes into existence is `awardFor()`, below, from a match the engine
 *      itself recorded.
 *
 *   2. COINS CANNOT BE CASHED OUT OR TRANSFERRED. There is no withdrawal, no
 *      transfer between players and no redemption for money or goods. A
 *      balance is a running total of what someone has done, like a league
 *      table, not a holding of value.
 *
 *   3. COINS ARE NEVER WAGERED. This is the one people miss. Even a coin with
 *      no cash value becomes "other stakes" the moment it is risked on an
 *      outcome in expectation of winning more. So coins are *awarded* for
 *      playing and winning — never put at risk, never deducted on a loss, and
 *      never used as an entry fee. Losing a frame earns fewer coins; it never
 *      costs any.
 *
 * The practical test to apply to any future feature: if a change would let
 * someone turn coins into money, goods, or a larger number of coins by
 * risking them, it crosses the line. See COIN_RULES below.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WHAT THE ECONOMY IS FOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Not to identify the best player — the league table already does that, better.
 * The business problem is a venue's Thursday habit, so the award schedule pays
 * far more for *turning up repeatedly* than for *winning*. A regular who loses
 * every week still accumulates steadily; a visiting shark who wins once and
 * never returns does not out-earn them. That is deliberate, and it is the whole
 * reason the schedule looks "unfair" as a measure of skill.
 */

/** One reason a coin was awarded. The ledger stores these verbatim. */
export type CoinReason =
  | "FRAME_PLAYED"
  | "FRAME_WON"
  | "NIGHT_PLAYED"
  | "NIGHT_WON"
  | "CLEARANCE"
  | "STREAK"
  | "SEASON_WON";

/**
 * The award schedule.
 *
 * Weighted towards attendance over victory, for the reason above. The ratio
 * that matters: a player who turns up and loses all four of their frames takes
 * 10 + 4×5 = 30 coins, while a player who turns up and wins all four takes
 * 10 + 4×(5+15) = 90. Three times as much for winning everything, not thirty —
 * enough to be worth chasing, not enough to make a losing night pointless.
 */
export const COIN_AWARDS: Record<CoinReason, number> = {
  /** Playing a frame at all, win or lose. Never negative. */
  FRAME_PLAYED: 5,
  /** On top of FRAME_PLAYED, so a win is worth 20 in total. */
  FRAME_WON: 15,
  /** Turning up: paid once per night, on a player's first frame. */
  NIGHT_PLAYED: 10,
  /** Taking the night. */
  NIGHT_WON: 100,
  /** Clearing all seven and the black in one frame, 8-ball only. */
  CLEARANCE: 50,
  /** Three league nights in a row at the same venue. */
  STREAK: 75,
  /** Topping a season's table. */
  SEASON_WON: 500,
};

/**
 * What a coin is explicitly not, kept as data so the UI and the policy page
 * state the same thing and cannot drift apart from each other.
 */
export const COIN_RULES = {
  purchasable: false,
  withdrawable: false,
  transferable: false,
  wagerable: false,
  /** There is no exchange rate, because there is no exchange. */
  cashValue: 0,
} as const;

/**
 * The most a single account may earn in one day.
 *
 * Not an anti-cheat flourish — a necessary one. A host can create tournaments
 * freely, so without a cap an account could run empty brackets against itself
 * all night and mint an unbounded balance, which would make every leaderboard
 * meaningless. Set well above a real league night: a heavy night of sixteen
 * frames plus the win is around 430.
 */
export const DAILY_COIN_CAP = 1000;

/**
 * The fewest distinct signed-in accounts a tournament needs before it pays
 * coins at all.
 *
 * The other half of the anti-farming guard. A "tournament" of one real person
 * and seven typed-in names is a practice session, and practice does not pay.
 */
export const MIN_REAL_PLAYERS_FOR_COINS = 2;

export interface CoinAward {
  reason: CoinReason;
  amount: number;
  /** What this award was for, in words, for the ledger a player reads. */
  description: string;
}

/**
 * What one finished frame earns a player.
 *
 * `firstOfNight` adds the attendance award, which is why it is paid here
 * rather than on joining: a player who enters and never plays has not turned
 * up in any sense that helps a venue.
 */
export function awardsForFrame(args: {
  won: boolean;
  firstOfNight: boolean;
  clearance?: boolean;
  tournamentName?: string;
}): CoinAward[] {
  const where = args.tournamentName ? ` at ${args.tournamentName}` : "";
  const awards: CoinAward[] = [];

  if (args.firstOfNight) {
    awards.push({
      reason: "NIGHT_PLAYED",
      amount: COIN_AWARDS.NIGHT_PLAYED,
      description: `Turned up${where}`,
    });
  }

  awards.push({
    reason: "FRAME_PLAYED",
    amount: COIN_AWARDS.FRAME_PLAYED,
    description: "Played a frame",
  });

  if (args.won) {
    awards.push({
      reason: "FRAME_WON",
      amount: COIN_AWARDS.FRAME_WON,
      description: "Won a frame",
    });
  }

  if (args.clearance) {
    awards.push({
      reason: "CLEARANCE",
      amount: COIN_AWARDS.CLEARANCE,
      description: "Cleared the table",
    });
  }

  return awards;
}

/** What taking the night earns. */
export function awardsForNight(tournamentName?: string): CoinAward[] {
  return [
    {
      reason: "NIGHT_WON",
      amount: COIN_AWARDS.NIGHT_WON,
      description: tournamentName ? `Won ${tournamentName}` : "Won the night",
    },
  ];
}

/** What topping a season's table earns. */
export function awardsForSeason(seriesName?: string): CoinAward[] {
  return [
    {
      reason: "SEASON_WON",
      amount: COIN_AWARDS.SEASON_WON,
      description: seriesName ? `Won the ${seriesName} season` : "Won the season",
    },
  ];
}

/**
 * Trim a set of awards to what the daily cap still allows.
 *
 * Partial rather than all-or-nothing: a player who hits the cap mid-night
 * keeps what they have earned up to it, and the rest simply does not accrue.
 * Returns the awards to write and what the cap left unpaid, so the ledger can
 * be honest about it rather than silently dropping coins.
 */
export function applyDailyCap(
  awards: CoinAward[],
  earnedToday: number,
  cap: number = DAILY_COIN_CAP
): { granted: CoinAward[]; withheld: number } {
  let remaining = Math.max(0, cap - earnedToday);
  const granted: CoinAward[] = [];
  let withheld = 0;

  for (const award of awards) {
    if (remaining <= 0) {
      withheld += award.amount;
      continue;
    }
    if (award.amount <= remaining) {
      granted.push(award);
      remaining -= award.amount;
    } else {
      // Pay what is left of the allowance rather than dropping the award.
      granted.push({ ...award, amount: remaining });
      withheld += award.amount - remaining;
      remaining = 0;
    }
  }

  return { granted, withheld };
}

export function totalOf(awards: CoinAward[]): number {
  return awards.reduce((sum, a) => sum + a.amount, 0);
}

/**
 * The rank a balance earns, shown beside a player's name.
 *
 * Titles rather than anything spendable: a title cannot be converted to
 * money, so it is a sink for status that does not create a sink for value.
 */
export const COIN_TITLES: Array<{ at: number; title: string }> = [
  { at: 0, title: "New in" },
  { at: 250, title: "Regular" },
  { at: 1_000, title: "Contender" },
  { at: 3_000, title: "Shark" },
  { at: 8_000, title: "Hustler" },
  { at: 20_000, title: "Legend" },
];

export function titleFor(balance: number): string {
  let title = COIN_TITLES[0].title;
  for (const step of COIN_TITLES) {
    if (balance >= step.at) title = step.title;
  }
  return title;
}

/** The next title and how far off it is, for the progress a player sees. */
export function nextTitle(balance: number): { title: string; at: number; toGo: number } | null {
  const next = COIN_TITLES.find((step) => balance < step.at);
  return next ? { title: next.title, at: next.at, toGo: next.at - balance } : null;
}
