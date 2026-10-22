import { describe, it, expect } from "vitest";
import {
  COIN_AWARDS,
  COIN_UNIT,
  COIN_RULES,
  COIN_TITLES,
  DAILY_COIN_CAP,
  MIN_PLAYERS_FOR_COINS,
  applyDailyCap,
  awardsForFrame,
  awardsForNight,
  nightWinAmount,
  awardsForOnlineGame,
  awardsForDailyVisit,
  ONLINE_DAILY_CAP,
  ONLINE_REASONS,
  MIN_ONLINE_SECONDS,
  MIN_ONLINE_SHOTS,
  awardsForSeason,
  awardsForStreak,
  STREAK_NIGHTS,
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
    // Sixteen frames, all won: a heavy evening must not be throttled by an
    // anti-farming guard aimed at empty brackets. The champion's award is
    // paid outside the cap, so it is not counted here.
    const night =
      COIN_AWARDS.NIGHT_PLAYED +
      16 * (COIN_AWARDS.FRAME_PLAYED + COIN_AWARDS.FRAME_WON);
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
    expect(MIN_PLAYERS_FOR_COINS).toBeGreaterThanOrEqual(2);
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
    expect(COIN_AWARDS.FRAME_WON).toBe(10_000);
    expect(COIN_AWARDS.NIGHT_PLAYED).toBe(10_000);
    // Per player in the night; see nightWinAmount.
    expect(COIN_AWARDS.NIGHT_WON).toBe(50_000);
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

  it("pins the ratios of the schedule", () => {
    // A redenomination that changed a ratio would be a balance change wearing
    // a redenomination's clothes. These must survive any change to COIN_UNIT.
    expect(COIN_AWARDS.FRAME_WON / COIN_AWARDS.FRAME_PLAYED).toBe(2);
    expect(COIN_AWARDS.NIGHT_WON / COIN_AWARDS.FRAME_PLAYED).toBe(10);
    expect(DAILY_COIN_CAP / COIN_AWARDS.NIGHT_WON).toBe(20);
  });

  it("keeps a whole night of frames comfortably inside the cap", () => {
    const heavyNight =
      COIN_AWARDS.NIGHT_PLAYED +
      16 * (COIN_AWARDS.FRAME_PLAYED + COIN_AWARDS.FRAME_WON);
    expect(heavyNight).toBe(250_000);
    expect(heavyNight).toBeLessThan(DAILY_COIN_CAP);
  });
});

describe("online play earns, but offline is clearly worth more", () => {
  it("pays nothing at all when the machine wins", () => {
    // Only the winner keeps the coins. A participation award here would mint
    // currency for leaving a game running against the computer.
    expect(awardsForOnlineGame({ won: false, mode: 1 })).toEqual([]);
    expect(totalOf(awardsForOnlineGame({ won: false, mode: 1 }))).toBe(0);
  });

  it("pays nothing when a friend on the same sofa wins either", () => {
    expect(awardsForOnlineGame({ won: false, mode: 2 })).toEqual([]);
  });

  it("pays the winner", () => {
    expect(totalOf(awardsForOnlineGame({ won: true, mode: 1 }))).toBeGreaterThan(0);
  });

  it("is worth a fraction of the same result at a venue", () => {
    // The product is league nights in rooms, and the schedule should say so.
    const onlineWin = totalOf(awardsForOnlineGame({ won: true, mode: 1 }));
    const venueWin = COIN_AWARDS.FRAME_PLAYED + COIN_AWARDS.FRAME_WON;
    expect(onlineWin).toBeLessThan(venueWin);
    expect(venueWin / onlineWin).toBeGreaterThanOrEqual(5);
  });

  it("still pays a venue frame that was lost, unlike a browser game", () => {
    // The distinction the whole schedule turns on: turning up to a room is
    // worth paying for, losing to a computer at home is not.
    expect(totalOf(awardsForFrame({ won: false, firstOfNight: false }))).toBeGreaterThan(0);
    expect(totalOf(awardsForOnlineGame({ won: false, mode: 1 }))).toBe(0);
  });

  it("caps a whole day of browser play below a single league night", () => {
    // The sharpest statement of the same priority: grinding the AI all day
    // cannot beat turning up once.
    const oneNight =
      COIN_AWARDS.NIGHT_PLAYED +
      8 * (COIN_AWARDS.FRAME_PLAYED + COIN_AWARDS.FRAME_WON);
    expect(ONLINE_DAILY_CAP).toBeLessThan(oneNight);
  });

  it("keeps the online ceiling far below the overall one", () => {
    expect(ONLINE_DAILY_CAP).toBeLessThan(DAILY_COIN_CAP / 10);
  });

  it("pays a little more for beating a harder AI", () => {
    const easy = totalOf(awardsForOnlineGame({ won: true, mode: 1, aiRating: 1 }));
    const hard = totalOf(awardsForOnlineGame({ won: true, mode: 1, aiRating: 3 }));
    expect(hard).toBeGreaterThan(easy);
    // A step, not a multiplier: the hardest is worth half as much again, not
    // ten times, or the easy setting becomes pointless.
    expect(hard / easy).toBeLessThan(2);
  });

  it("does not let a silly difficulty inflate the award", () => {
    const absurd = totalOf(awardsForOnlineGame({ won: true, mode: 1, aiRating: 99 }));
    const hard = totalOf(awardsForOnlineGame({ won: true, mode: 1, aiRating: 3 }));
    expect(absurd).toBe(hard);
  });

  it("pays two players on one device the same as the AI, since neither is verifiable", () => {
    const vsAi = totalOf(awardsForOnlineGame({ won: true, mode: 1, aiRating: 1 }));
    const vsFriend = totalOf(awardsForOnlineGame({ won: true, mode: 2 }));
    expect(vsFriend).toBe(vsAi);
  });

  it("never pays a negative amount, so an online loss costs nothing either", () => {
    for (const mode of [1, 2] as const) {
      for (const won of [true, false]) {
        for (const award of awardsForOnlineGame({ won, mode })) {
          expect(award.amount).toBeGreaterThan(0);
        }
      }
    }
  });

  it("keeps ONLINE_PLAYED counting against the cap, though nothing awards it", () => {
    // It was paid before browser play became winner-only, and those ledger
    // rows still have to count or an account that earned them could exceed
    // the day's ceiling.
    expect(ONLINE_REASONS).toContain("ONLINE_PLAYED");
  });

  it("counts only the online reasons against the online ceiling", () => {
    expect(ONLINE_REASONS).toContain("ONLINE_PLAYED");
    expect(ONLINE_REASONS).toContain("ONLINE_WON");
    expect(ONLINE_REASONS).not.toContain("FRAME_WON");
    expect(ONLINE_REASONS).not.toContain("NIGHT_WON");
  });

  it("requires a game to have lasted and taken shots before it can count", () => {
    expect(MIN_ONLINE_SECONDS).toBeGreaterThan(0);
    expect(MIN_ONLINE_SHOTS).toBeGreaterThan(0);
  });

  it("holds the online ceiling to a sane number of wins a day", () => {
    const perWin = totalOf(awardsForOnlineGame({ won: true, mode: 1, aiRating: 1 }));
    const winsToCap = ONLINE_DAILY_CAP / perWin;
    expect(winsToCap).toBeGreaterThan(5);
    expect(winsToCap).toBeLessThan(30);
  });
});

describe("the streak bonus", () => {
  it("pays nothing before the run is long enough", () => {
    for (let n = 0; n < STREAK_NIGHTS; n++) {
      expect(awardsForStreak(n)).toEqual([]);
    }
  });

  it("pays on the third night", () => {
    const awards = awardsForStreak(STREAK_NIGHTS);
    expect(totalOf(awards)).toBe(COIN_AWARDS.STREAK);
  });

  it("pays again every third night, not every night after the third", () => {
    // A bonus that fires every week is not a streak bonus, it is a higher
    // attendance award wearing the name.
    const paid: number[] = [];
    for (let n = 1; n <= 12; n++) {
      if (awardsForStreak(n).length > 0) paid.push(n);
    }
    expect(paid).toEqual([3, 6, 9, 12]);
  });

  it("never pays for a negative or nonsense run", () => {
    expect(awardsForStreak(-3)).toEqual([]);
    expect(awardsForStreak(0)).toEqual([]);
  });

  it("names the venue when it knows it", () => {
    const [award] = awardsForStreak(STREAK_NIGHTS, "The Corner Pocket");
    expect(award.description).toContain("The Corner Pocket");
    expect(award.description).toContain(String(STREAK_NIGHTS));
  });

  it("still reads sensibly with no venue name", () => {
    const [award] = awardsForStreak(STREAK_NIGHTS);
    expect(award.description.length).toBeGreaterThan(5);
    expect(award.amount).toBeGreaterThan(0);
  });

  it("is worth less than winning a night, and more than winning a frame", () => {
    // Turning up repeatedly should beat a single good result, without
    // outranking actually taking a tournament.
    expect(COIN_AWARDS.STREAK).toBeGreaterThan(COIN_AWARDS.FRAME_WON);
    // The smallest night there is: two players.
    expect(COIN_AWARDS.STREAK).toBeLessThan(nightWinAmount(2));
  });
});

describe("the daily visit award", () => {
  it("pays something for signing in", () => {
    expect(totalOf(awardsForDailyVisit(false))).toBe(COIN_AWARDS.DAILY_VISIT);
    expect(totalOf(awardsForDailyVisit(false))).toBeGreaterThan(0);
  });

  it("welcomes a brand new account differently", () => {
    const [first] = awardsForDailyVisit(true);
    const [returning] = awardsForDailyVisit(false);
    expect(first.description).not.toBe(returning.description);
    // Same coins either way: the wording changes, the award does not.
    expect(first.amount).toBe(returning.amount);
  });

  it("is worth less than playing a single frame", () => {
    // It is a greeting, not a reason to open the app and close it again. The
    // schedule has to keep saying that playing is the point.
    expect(COIN_AWARDS.DAILY_VISIT).toBeLessThan(COIN_AWARDS.FRAME_PLAYED);
  });

  it("is a whole unit like every other figure", () => {
    expect(COIN_AWARDS.DAILY_VISIT % COIN_UNIT).toBe(0);
  });

  it("could not reach the daily cap on its own in a lifetime", () => {
    // A sanity check on the ratio: if signing in ever approached the cap, the
    // award would have stopped being a greeting.
    expect(DAILY_COIN_CAP / COIN_AWARDS.DAILY_VISIT).toBeGreaterThan(100);
  });

  it("never pays a negative amount", () => {
    for (const first of [true, false]) {
      for (const award of awardsForDailyVisit(first)) {
        expect(award.amount).toBeGreaterThan(0);
      }
    }
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

describe("the champion takes the majority", () => {
  /** Every coin a single-elimination night of n players pays, and the champion's. */
  function night(n: number) {
    const rounds = Math.log2(n);
    const matches = n - 1;
    const everyone =
      n * COIN_AWARDS.NIGHT_PLAYED +
      matches * (2 * COIN_AWARDS.FRAME_PLAYED + COIN_AWARDS.FRAME_WON) +
      nightWinAmount(n);
    const champion =
      COIN_AWARDS.NIGHT_PLAYED +
      rounds * (COIN_AWARDS.FRAME_PLAYED + COIN_AWARDS.FRAME_WON) +
      nightWinAmount(n);
    return { everyone, champion };
  }

  for (const n of [2, 4, 8, 16, 32, 64]) {
    it(`gives the champion of a ${n}-player night more than everyone else combined`, () => {
      const { everyone, champion } = night(n);
      expect(champion / everyone).toBeGreaterThan(0.5);
    });
  }

  it("scales the champion's award with the field", () => {
    expect(nightWinAmount(8)).toBe(400_000);
    expect(nightWinAmount(16)).toBe(800_000);
    expect(nightWinAmount(16)).toBe(2 * nightWinAmount(8));
  });

  it("never pays less than a two-player night", () => {
    expect(nightWinAmount(0)).toBe(nightWinAmount(2));
    expect(nightWinAmount(1)).toBe(nightWinAmount(2));
    expect(nightWinAmount(Number.NaN)).toBe(nightWinAmount(2));
  });

  it("keeps a match win small next to the night", () => {
    const matchWin = COIN_AWARDS.FRAME_PLAYED + COIN_AWARDS.FRAME_WON;
    expect(matchWin).toBe(15_000);
    expect(nightWinAmount(4) / matchWin).toBeGreaterThan(10);
  });

  it("names the field in the ledger line", () => {
    const [award] = awardsForNight("Friday league", 8);
    expect(award.amount).toBe(400_000);
    expect(award.description).toContain("8 players");
  });
});
