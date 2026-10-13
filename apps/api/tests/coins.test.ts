import { describe, it, expect } from "vitest";
import {
  COIN_AWARDS,
  COIN_UNIT,
  COIN_RULES,
  COIN_TITLES,
  DAILY_COIN_CAP,
  MIN_REAL_PLAYERS_FOR_COINS,
  applyDailyCap,
  awardsForFrame,
  awardsForNight,
  awardsForSeason,
  titleFor,
  nextTitle,
  totalOf,
} from "../src/lib/coins";

/**
 * The properties in this block are the ones that keep the WTA Coin outside the
 * Online Gaming Act 2025, which prohibits a game played for "money or other
 * stakes" and defines other stakes to include "credits, coins, and tokens
 * equivalent or convertible to money". If any of these ever fails, the coin
 * has become a stake and the product has become an offence.
 */
describe("the boundary that keeps a coin from being a stake", () => {
  it("cannot be bought, withdrawn, transferred or wagered", () => {
    expect(COIN_RULES.purchasable).toBe(false);
    expect(COIN_RULES.withdrawable).toBe(false);
    expect(COIN_RULES.transferable).toBe(false);
    expect(COIN_RULES.wagerable).toBe(false);
  });

  it("has no cash value at all", () => {
    expect(COIN_RULES.cashValue).toBe(0);
  });

  it("never awards a negative amount, so a frame can never cost coins", () => {
    // A coin that can be lost is a coin that was staked.
    for (const amount of Object.values(COIN_AWARDS)) {
      expect(amount).toBeGreaterThan(0);
    }
  });

  it("pays a loser for playing, so losing costs nothing", () => {
    const lost = awardsForFrame({ won: false, firstOfNight: false });
    expect(totalOf(lost)).toBe(COIN_AWARDS.FRAME_PLAYED);
    expect(totalOf(lost)).toBeGreaterThan(0);
  });

  it("never produces an award below zero, whatever it is handed", () => {
    const cases = [
      awardsForFrame({ won: false, firstOfNight: false }),
      awardsForFrame({ won: true, firstOfNight: true, clearance: true }),
      awardsForNight(),
      awardsForSeason(),
    ];
    for (const awards of cases) {
      for (const award of awards) expect(award.amount).toBeGreaterThan(0);
    }
  });
});

describe("the award schedule rewards turning up, not just winning", () => {
  it("pays something for simply playing a frame", () => {
    expect(COIN_AWARDS.FRAME_PLAYED).toBeGreaterThan(0);
  });

  it("pays for turning up, on top of the first frame", () => {
    const first = awardsForFrame({ won: false, firstOfNight: true });
    const later = awardsForFrame({ won: false, firstOfNight: false });
    expect(totalOf(first) - totalOf(later)).toBe(COIN_AWARDS.NIGHT_PLAYED);
  });

  it("pays the attendance award only once a night", () => {
    const later = awardsForFrame({ won: false, firstOfNight: false });
    expect(later.some((a) => a.reason === "NIGHT_PLAYED")).toBe(false);
  });

  it("makes a whole losing night worth a meaningful fraction of a winning one", () => {
    // Four frames, all lost, against four frames all won. The ratio has to be
    // small enough that winning is worth chasing and large enough that a
    // regular who loses still accumulates. Three-ish, not thirty.
    const lost = COIN_AWARDS.NIGHT_PLAYED + 4 * COIN_AWARDS.FRAME_PLAYED;
    const won = COIN_AWARDS.NIGHT_PLAYED + 4 * (COIN_AWARDS.FRAME_PLAYED + COIN_AWARDS.FRAME_WON);
    expect(won / lost).toBeGreaterThan(2);
    expect(won / lost).toBeLessThan(5);
  });

  it("is worth more to win the night than to win a single frame", () => {
    expect(COIN_AWARDS.NIGHT_WON).toBeGreaterThan(COIN_AWARDS.FRAME_WON);
  });

  it("is worth more to win a season than a night", () => {
    expect(COIN_AWARDS.SEASON_WON).toBeGreaterThan(COIN_AWARDS.NIGHT_WON);
  });

  it("adds the clearance bonus only when asked", () => {
    const plain = awardsForFrame({ won: true, firstOfNight: false });
    const cleared = awardsForFrame({ won: true, firstOfNight: false, clearance: true });
    expect(totalOf(cleared) - totalOf(plain)).toBe(COIN_AWARDS.CLEARANCE);
  });

  it("names the tournament in the ledger line, so an award can be recognised", () => {
    const awards = awardsForFrame({ won: true, firstOfNight: true, tournamentName: "Friday league" });
    expect(awards.some((a) => a.description.includes("Friday league"))).toBe(true);
  });
});

describe("applyDailyCap", () => {
  it("pays in full when the cap is nowhere near", () => {
    const wanted = awardsForFrame({ won: true, firstOfNight: true });
    const { granted, withheld } = applyDailyCap(wanted, 0);
    expect(totalOf(granted)).toBe(totalOf(wanted));
    expect(withheld).toBe(0);
  });

  it("pays nothing once the cap is reached", () => {
    const wanted = awardsForFrame({ won: true, firstOfNight: true });
    const { granted, withheld } = applyDailyCap(wanted, DAILY_COIN_CAP);
    expect(granted).toEqual([]);
    expect(withheld).toBe(totalOf(wanted));
  });

  it("pays the part of an award the allowance still covers, rather than dropping it", () => {
    // A player three coins short of the cap gets those three, not nothing.
    const { granted, withheld } = applyDailyCap(
      [{ reason: "FRAME_PLAYED", amount: 10, description: "x" }],
      DAILY_COIN_CAP - 3
    );
    expect(totalOf(granted)).toBe(3);
    expect(withheld).toBe(7);
  });

  it("never pays more than the cap across a sequence of awards", () => {
    let earned = 0;
    for (let i = 0; i < 500; i++) {
      const { granted } = applyDailyCap(awardsForFrame({ won: true, firstOfNight: false }), earned);
      earned += totalOf(granted);
    }
    expect(earned).toBe(DAILY_COIN_CAP);
  });

  it("leaves a real league night well inside the cap", () => {
    // Sixteen frames, all won, plus the night: a heavy evening must not be
    // throttled by an anti-farming guard aimed at empty brackets.
    const night =
      COIN_AWARDS.NIGHT_PLAYED +
      16 * (COIN_AWARDS.FRAME_PLAYED + COIN_AWARDS.FRAME_WON) +
      COIN_AWARDS.NIGHT_WON;
    expect(night).toBeLessThan(DAILY_COIN_CAP);
  });

  it("treats a negative or silly running total as nothing earned", () => {
    const { granted } = applyDailyCap([{ reason: "FRAME_WON", amount: 15, description: "x" }], -50);
    expect(totalOf(granted)).toBe(15);
  });
});

describe("anti-farming", () => {
  it("needs more than one real account before anything pays", () => {
    // A bracket of one real person and seven typed-in names is practice.
    expect(MIN_REAL_PLAYERS_FOR_COINS).toBeGreaterThanOrEqual(2);
  });
});

describe("the denomination", () => {
  it("quotes every award in whole thousands", () => {
    // The schedule is written as a multiple of COIN_UNIT so a redenomination
    // cannot leave one award behind at the old scale.
    for (const [reason, amount] of Object.entries(COIN_AWARDS)) {
      expect(amount % COIN_UNIT, `${reason} is not a whole unit`).toBe(0);
    }
  });

  it("pays the figures the schedule promises", () => {
    expect(COIN_AWARDS.FRAME_PLAYED).toBe(5_000);
    expect(COIN_AWARDS.FRAME_WON).toBe(15_000);
    expect(COIN_AWARDS.NIGHT_PLAYED).toBe(10_000);
    expect(COIN_AWARDS.NIGHT_WON).toBe(100_000);
    expect(COIN_AWARDS.CLEARANCE).toBe(50_000);
    expect(COIN_AWARDS.STREAK).toBe(75_000);
    expect(COIN_AWARDS.SEASON_WON).toBe(500_000);
  });

  it("scales the cap and the titles with the awards", () => {
    expect(DAILY_COIN_CAP).toBe(1_000_000);
    expect(COIN_TITLES[COIN_TITLES.length - 1].at).toBe(20_000_000);
    for (const step of COIN_TITLES) {
      expect(step.at % COIN_UNIT).toBe(0);
    }
  });

  it("leaves every ratio exactly as it was before the rescale", () => {
    // A redenomination that changed a ratio would be a balance change wearing
    // a redenomination's clothes. These are the ratios from the original
    // schedule, and they must survive any future change to COIN_UNIT.
    expect(COIN_AWARDS.FRAME_WON / COIN_AWARDS.FRAME_PLAYED).toBe(3);
    expect(COIN_AWARDS.NIGHT_WON / COIN_AWARDS.FRAME_PLAYED).toBe(20);
    expect(COIN_AWARDS.SEASON_WON / COIN_AWARDS.NIGHT_WON).toBe(5);
    expect(DAILY_COIN_CAP / COIN_AWARDS.NIGHT_WON).toBe(10);
  });

  it("keeps a whole night comfortably inside the cap at the new scale", () => {
    const heavyNight =
      COIN_AWARDS.NIGHT_PLAYED +
      16 * (COIN_AWARDS.FRAME_PLAYED + COIN_AWARDS.FRAME_WON) +
      COIN_AWARDS.NIGHT_WON;
    expect(heavyNight).toBe(430_000);
    expect(heavyNight).toBeLessThan(DAILY_COIN_CAP);
  });
});

describe("titles", () => {
  it("starts everyone somewhere", () => {
    expect(titleFor(0)).toBe(COIN_TITLES[0].title);
  });

  it("climbs with the balance and never goes backwards", () => {
    let last = -1;
    const seen: string[] = [];
    for (const step of COIN_TITLES) {
      expect(step.at).toBeGreaterThan(last);
      last = step.at;
      seen.push(titleFor(step.at));
    }
    expect(new Set(seen).size).toBe(COIN_TITLES.length);
  });

  it("gives the top title to anyone past the last threshold", () => {
    const top = COIN_TITLES[COIN_TITLES.length - 1];
    expect(titleFor(top.at)).toBe(top.title);
    expect(titleFor(top.at * 10)).toBe(top.title);
  });

  it("says what is next and how far off it is", () => {
    const next = nextTitle(0);
    expect(next).not.toBeNull();
    expect(next!.toGo).toBe(next!.at);
    expect(next!.title).toBe(COIN_TITLES[1].title);
  });

  it("has nothing next once the top is reached", () => {
    const top = COIN_TITLES[COIN_TITLES.length - 1];
    expect(nextTitle(top.at)).toBeNull();
  });

  it("counts down as a balance grows", () => {
    const early = nextTitle(10)!;
    const later = nextTitle(COIN_TITLES[1].at - 1)!;
    expect(later.toGo).toBeLessThan(early.toGo);
    expect(later.toGo).toBe(1);
  });
});
