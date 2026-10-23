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
 * ── A PLANNED FEATURE THAT WOULD CROSS IT ──
 *
 * There is an intention to let players redeem coins for gifts or discounts
 * once the product is funded. Read against the test above, that is the case
 * the test exists to catch: a coin that takes ₹200 off a bill has an implied
 * exchange rate, and a token with an exchange rate is at least arguably
 * "convertible to money" within the Act's definition of other stakes — which
 * would make every tournament that awarded it an online money game.
 *
 * This is not a reason not to build it. It is a reason to get a written
 * opinion from an Indian gaming lawyer on that one narrow question *before*
 * building it rather than after, because the answer decides whether the
 * feature is a loyalty scheme or an offence, and the offence is non-bailable.
 *
 * The schema is already shaped to accommodate it either way: `balance` and
 * `lifetime` are stored separately, so a redemption can draw a balance down
 * while titles and history, which are computed from lifetime earnings,
 * survive untouched. Nothing here needs rewriting to add a sink — only
 * deciding.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WHAT THE ECONOMY IS FOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Two things, in this order. The night's winner should feel it: they take the
 * majority of the coins a night pays, as the name of the platform promises.
 * And everyone else should still leave with something — turning up and every
 * frame pay, win or lose — because the business problem is a venue's Thursday
 * habit, and a night that pays a loser nothing is a night they skip.
 *
 * Coins are never deducted on a loss and never staked; the champion's larger
 * share comes from an award, not from anyone else's balance. (The schedule
 * used to weight attendance over winning, with a flat 100k for the night; it
 * was rebalanced in October 2026 so the champion takes the majority.)
 */

/** One reason a coin was awarded. The ledger stores these verbatim. */
export type CoinReason =
  | "FRAME_PLAYED"
  | "FRAME_WON"
  | "NIGHT_PLAYED"
  | "NIGHT_WON"
  | "CLEARANCE"
  | "STREAK"
  | "SEASON_WON"
  /**
   * Won a game in the browser, against the AI or a friend on the sofa.
   *
   * There is deliberately no ONLINE_PLAYED to go with it. Turning up is worth
   * paying for at a venue; losing to a computer at home is not, and a
   * participation award there is just free currency for leaving a game
   * running. Browser play pays the winner and nobody else.
   */
  | "ONLINE_WON"
  /**
   * Signing in on a day you had not yet.
   *
   * The one award that is not for playing. It exists so somebody who creates
   * an account has a balance to look at before their first frame, and so that
   * coming back is worth something on a week nobody ran a night. Paid once a
   * day, whatever else happens that day.
   */
  | "DAILY_VISIT";

/**
 * The unit the schedule is denominated in.
 *
 * Purely presentational. Everything below is quoted in thousands because a
 * five-figure balance reads as a currency worth accumulating where a
 * two-figure one reads as a tally — the same instinct every mobile game
 * follows. It changes no ratio and no fairness property: multiplying every
 * award, the cap and every title threshold by the same constant leaves the
 * economy mathematically identical to the one before it.
 *
 * If this ever changes again, change it *here* and nowhere else. Every figure
 * in this file is expressed as a multiple of it, so a redenomination cannot
 * leave one award or one title behind at the old scale.
 */
export const COIN_UNIT = 1_000;

/**
 * The award schedule.
 *
 * Small coins for every match, the majority for the champion. Everyone who
 * plays still earns — turning up and every frame pay, win or lose, so a losing
 * night is never worth nothing — but a match win is a small top-up, and the
 * night's winner takes more than everyone else in the room put together.
 *
 * The champion's award scales with the field (see `nightWinAmount`), because a
 * flat figure cannot hold a majority: at 50k per player it does at every size.
 * With eight players the champion takes about 73% of the night's coins, with
 * sixteen about 69%, with thirty-two about 66%.
 */
export const COIN_AWARDS: Record<CoinReason, number> = {
  /** Playing a frame at all, win or lose. Never negative. */
  FRAME_PLAYED: 5 * COIN_UNIT,
  /** On top of FRAME_PLAYED, so a match win is worth 15k in total. Small. */
  FRAME_WON: 10 * COIN_UNIT,
  /** Turning up: paid once per night, on a player's first frame. */
  NIGHT_PLAYED: 10 * COIN_UNIT,
  /**
   * Taking the night, PER PLAYER in it. The award is this times the field —
   * see `nightWinAmount` — so the champion's share stays a majority however
   * many play.
   */
  NIGHT_WON: 50 * COIN_UNIT,
  /** Clearing all seven and the black in one frame, 8-ball only. */
  CLEARANCE: 50 * COIN_UNIT,
  /** Three league nights in a row at the same venue. */
  STREAK: 75 * COIN_UNIT,
  /** Topping a season's table. */
  SEASON_WON: 500 * COIN_UNIT,

  // Small on purpose. It should feel like a greeting rather than a reason to
  // open the app and close it again: one visit is worth a fifth of playing a
  // single frame, so the schedule still says that playing is the point.
  DAILY_VISIT: 1 * COIN_UNIT,

  // ── Online play ──
  //
  // Paid only to the winner, and deliberately an order of magnitude below the
  // offline awards. Three reasons that happen to point the same way.
  //
  // The first is commercial: the product is sold on league nights in rooms,
  // and the coin schedule should say so. A night at a venue is worth more
  // than an evening on the sofa because the night is the thing being built.
  //
  // The second is that an offline result is trustworthy and an online one is
  // not. A frame in a venue is recorded by the engine from a host's taps; a
  // browser game is reported by the player's own device, and nothing stops
  // someone forging that report. Small awards and a tight cap are the honest
  // response to a number we cannot verify.
  //
  // The third is that there is no participation award here at all. Turning up
  // is the thing worth paying for at a venue, which is why a losing frame
  // still earns there. Losing to a computer at home is not the same act, and
  // paying for it would mint coins for leaving a game running.
  // Three units, not two. With the participation award gone, a one-unit
  // difficulty step against a two-unit base made beating the hardest AI
  // worth exactly double the easiest — a multiplier, not a step, which
  // makes the easy setting pointless. Three keeps the step meaningful and
  // the spread sane at roughly two thirds.
  ONLINE_WON: 3 * COIN_UNIT,
};

/**
 * The most that can be earned from browser play in one day.
 *
 * Separate from, and far below, DAILY_COIN_CAP. Roughly ten wins — enough
 * that practising between league nights counts for something, little enough
 * that a bot playing the AI overnight cannot out-earn one real evening at a
 * venue. A single league night is worth more than two weeks of this.
 */
export const ONLINE_DAILY_CAP = 25 * COIN_UNIT;

/**
 * The reasons that count against ONLINE_DAILY_CAP rather than the main one.
 *
 * Typed as plain strings rather than CoinReason because ONLINE_PLAYED no
 * longer exists as an award but still exists in the ledger, where it was paid
 * before browser play became winner-only. It has to keep counting against the
 * cap or an account that earned it could exceed the ceiling for the day.
 */
export const ONLINE_REASONS: string[] = ["ONLINE_PLAYED", "ONLINE_WON"];

/**
 * The shortest a browser game can be and still count.
 *
 * A "game" that finished in four seconds was not played. Paired with a
 * minimum number of shots, this is what stops the obvious script.
 */
export const MIN_ONLINE_SECONDS = 30;
export const MIN_ONLINE_SHOTS = 4;

/**
 * How many league nights in a row at one venue earn the streak bonus.
 *
 * Three, and it pays again at six, nine and so on rather than every night
 * after the third — a bonus that fires every week is not a streak bonus, it
 * is a higher attendance award wearing the name. Counted over the nights that
 * venue actually ran, so a venue skipping a week does not break anybody's run.
 */
export const STREAK_NIGHTS = 3;

/** What an unbroken run of nights earns, when it lands on a multiple. */
export function awardsForStreak(nights: number, venueName?: string): CoinAward[] {
  if (nights <= 0 || nights % STREAK_NIGHTS !== 0) return [];
  return [
    {
      reason: "STREAK",
      amount: COIN_AWARDS.STREAK,
      description: venueName
        ? `${nights} nights running at ${venueName}`
        : `${nights} league nights running`,
    },
  ];
}

/**
 * What a coin is explicitly not, kept as data so the UI and the policy page
 * state the same thing and cannot drift apart from each other.
 */
export const COIN_RULES = {
  purchasable: false,
  withdrawable: false,
  transferable: false,
  wagerable: false,
  /**
   * What a coin can be spent on: cosmetics in the shop (lib/shop.ts), at
   * fixed prices, never random, owned for good and never sold on. Spending
   * lowers the balance and never the lifetime, so no title, level or place
   * on the coin table is lost by it.
   */
  spendableOn: "cosmetics",
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
 * frames plus the win is around 430k.
 */
export const DAILY_COIN_CAP = 1_000 * COIN_UNIT;

/**
 * The fewest competitors a tournament needs before it pays coins at all.
 *
 * Two, which is simply "a game happened". This deliberately counts players
 * rather than accounts: a real league night is one host with an account and
 * seven walk-ins who scanned a QR, and an accounts-based rule paid that night
 * nothing at all.
 *
 * The farming it still allows — a host playing frames against a name they
 * typed in — is bounded by DAILY_COIN_CAP and, more to the point, is not
 * worth doing: a coin cannot be bought, sold, transferred or cashed out, so
 * there is nothing at the end of it.
 */
export const MIN_PLAYERS_FOR_COINS = 2;

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

/**
 * What the champion of a night of `competitors` players is paid.
 *
 * Everyone else in a night earns at most 10k for turning up plus 15k a match,
 * and a knockout of n players has n − 1 matches, so the rest of the room takes
 * under 30k per player between them. 50k per player is therefore always more
 * than everyone else combined: the majority, at any size.
 *
 * Never less than a two-player night, so a short-handed bracket still pays.
 */
export function nightWinAmount(competitors: number): number {
  const field = Math.max(MIN_PLAYERS_FOR_COINS, Math.floor(competitors) || 0);
  return COIN_AWARDS.NIGHT_WON * field;
}

/** What taking the night earns. */
export function awardsForNight(tournamentName?: string, competitors = MIN_PLAYERS_FOR_COINS): CoinAward[] {
  return [
    {
      reason: "NIGHT_WON",
      amount: nightWinAmount(competitors),
      description: tournamentName
        ? `Won ${tournamentName} (${Math.max(MIN_PLAYERS_FOR_COINS, competitors)} players)`
        : "Won the night",
    },
  ];
}

/**
 * What one finished browser game earns.
 *
 * Nothing at all unless the player won it. If the machine takes the game, the
 * machine does not get paid and neither does the person it beat — only the
 * winner keeps the coins.
 *
 * Both modes pay the same on a win, and that is deliberate even though one has
 * an AI opponent and one has a friend on the same sofa: both are a single
 * device reporting its own result, so neither is any more verifiable than the
 * other. Beating a harder AI pays a little more, because difficulty is the one
 * thing the report does tell us truthfully, and rewarding the easiest setting
 * most would be the wrong incentive.
 */
export function awardsForOnlineGame(args: {
  won: boolean;
  /** 1 = vs AI, 2 = two players on one device. */
  mode: 1 | 2;
  /** The AI's difficulty, 1 upwards. Ignored outside AI mode. */
  aiRating?: number;
}): CoinAward[] {
  if (!args.won) return [];

  // A modest step per difficulty — one whole coin unit a level, so beating the
  // hardest AI is worth about half as much again as beating the easiest rather
  // than several times more. Kept in whole units like every other figure here.
  const difficulty = args.mode === 1 ? Math.min(Math.max(args.aiRating ?? 1, 1), 3) : 1;
  const bonus = (difficulty - 1) * COIN_UNIT;

  return [
    {
      reason: "ONLINE_WON",
      amount: COIN_AWARDS.ONLINE_WON + bonus,
      description:
        args.mode === 1
          ? `Beat the AI${difficulty > 1 ? ` (level ${difficulty})` : ""}`
          : "Won a game",
    },
  ];
}

/**
 * What signing in on a new day earns.
 *
 * The caller decides whether today has already been paid; this only says what
 * the day is worth. Keyed by date at the call site so the same day cannot pay
 * twice however many times the app is opened.
 */
export function awardsForDailyVisit(firstEver: boolean): CoinAward[] {
  return [
    {
      reason: "DAILY_VISIT",
      amount: COIN_AWARDS.DAILY_VISIT,
      description: firstEver ? "Welcome to Winner Takes All" : "Signed in today",
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
 * The title lifetime coins earn, shown beside a player's name.
 *
 * Titles rather than anything spendable: a title cannot be converted to
 * money, so it is a sink for status that does not create a sink for value.
 *
 * These are now the names of the level bands in lib/progression.ts, and each
 * figure is the lifetime coins at which that band's first level starts. They
 * are written out here rather than computed so the published ladder reads as
 * plain numbers; the progression test fails if the two ever disagree. Every
 * threshold sits at or below the one it replaced (Regular was 250k, Contender
 * 1M, Shark 3M, Hustler 8M, Legend 20M), so the move cost nobody a title.
 *
 * Pass LIFETIME coins, never the balance: a balance can one day be spent, and
 * spending must not take a title away.
 */
export const COIN_TITLES: Array<{ at: number; title: string }> = [
  { at: 0, title: "New in" },
  { at: 150 * COIN_UNIT, title: "Regular" },
  { at: 750 * COIN_UNIT, title: "Contender" },
  { at: 2_750 * COIN_UNIT, title: "Shark" },
  { at: 7_650 * COIN_UNIT, title: "Hustler" },
  { at: 18_900 * COIN_UNIT, title: "Legend" },
  { at: 61_250 * COIN_UNIT, title: "Hall of Fame" },
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
