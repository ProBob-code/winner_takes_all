/** Bracket generation engine for single-elimination tournaments. */

import type { D1Store } from "./d1-store";

const ROUND_THRESHOLDS: Record<number, number> = { 1: 40, 2: 50, 3: 60, 4: 60 };
const ROUND_NAMES: Record<string, string> = {
  "3,1": "Quarterfinals", "3,2": "Semifinals", "3,3": "Final",
  "2,1": "Semifinals", "2,2": "Final", "1,1": "Final",
  "4,1": "Round of 16", "4,2": "Quarterfinals", "4,3": "Semifinals", "4,4": "Final",
};

export function getRoundName(totalRounds: number, roundNumber: number): string {
  return ROUND_NAMES[`${totalRounds},${roundNumber}`] ?? `Round ${roundNumber}`;
}

export function getScoreThreshold(roundNumber: number): number {
  return ROUND_THRESHOLDS[roundNumber] ?? 60;
}

export async function generateBracket(
  store: D1Store, tournamentId: string, participantIds: string[]
): Promise<any> {
  const n = participantIds.length;
  if (n < 2) throw new Error("Need at least 2 participants");

  const totalRounds = Math.ceil(Math.log2(n));
  const bracketSize = 2 ** totalRounds;

  const padded: (string | null)[] = [...participantIds];
  while (padded.length < bracketSize) padded.push(null);

  const now = new Date();
  const roundsData: any[] = [];

  // Round 1
  const r1Matches: any[] = [];
  const numR1 = bracketSize / 2;

  for (let i = 0; i < numR1; i++) {
    const p1 = padded[i];
    const p2 = padded[bracketSize - 1 - i];
    if (p1 === null && p2 === null) continue;

    const isBye = p1 === null || p2 === null;
    const winner = p2 === null ? p1 : p1 === null ? p2 : null;
    const scheduled = new Date(now.getTime() + 5 * 60000 * (i + 1)).toISOString();

    const match = await store.createMatch({
      tournamentId, roundNum: 1, matchOrder: i,
      player1Id: p1, player2Id: p2,
      scoreThreshold: getScoreThreshold(1), scheduledAt: scheduled,
    });

    if (isBye && winner) {
      await store.updateMatch(match.id, {
        status: "completed", winner_id: winner, scores_approved: 1, completed_at: now.toISOString(),
      });
    }

    r1Matches.push({
      matchId: match.id, player1Id: p1, player2Id: p2,
      winnerId: winner, status: isBye ? "bye" : "pending",
      scoreThreshold: getScoreThreshold(1),
    });
  }

  roundsData.push({
    name: getRoundName(totalRounds, 1), roundNumber: 1,
    scoreThreshold: getScoreThreshold(1), matches: r1Matches,
  });

  // Subsequent rounds
  let prevCount = numR1;
  for (let r = 2; r <= totalRounds; r++) {
    const roundMatches: any[] = [];
    const numMatches = prevCount / 2;
    const threshold = getScoreThreshold(r);

    for (let i = 0; i < numMatches; i++) {
      const scheduled = new Date(now.getTime() + (r - 1) * 3600000 + 5 * 60000 * (i + 1)).toISOString();
      const match = await store.createMatch({
        tournamentId, roundNum: r, matchOrder: i,
        scoreThreshold: threshold, scheduledAt: scheduled,
      });
      roundMatches.push({
        matchId: match.id, player1Id: null, player2Id: null,
        winnerId: null, status: "waiting", scoreThreshold: threshold,
      });
    }

    roundsData.push({
      name: getRoundName(totalRounds, r), roundNumber: r,
      scoreThreshold: threshold, matches: roundMatches,
    });
    prevCount = numMatches;
  }

  // Advance BYE winners
  if (roundsData.length >= 2) {
    const r1 = roundsData[0];
    const r2 = roundsData[1];
    for (let i = 0; i < r1.matches.length; i++) {
      const m = r1.matches[i];
      if (m.status === "bye" && m.winnerId) {
        const tIdx = Math.floor(i / 2);
        if (tIdx < r2.matches.length) {
          const target = r2.matches[tIdx];
          if (i % 2 === 0) {
            await store.updateMatch(target.matchId, { player1_id: m.winnerId });
            target.player1Id = m.winnerId;
          } else {
            await store.updateMatch(target.matchId, { player2_id: m.winnerId });
            target.player2Id = m.winnerId;
          }
          if (target.player1Id && target.player2Id) {
            await store.updateMatch(target.matchId, { status: "pending" });
            target.status = "pending";
          }
        }
      }
    }
  }

  const bracketState = { rounds: roundsData, totalRounds };
  await store.updateTournamentBracketState(tournamentId, bracketState);
  return bracketState;
}

export async function advanceWinner(
  store: D1Store, tournamentId: string, matchId: string, winnerId: string
): Promise<any | null> {
  const tournament = await store.getTournament(tournamentId);
  if (!tournament?.bracket_state) return null;

  const bs = tournament.bracket_state;
  const rounds = bs.rounds ?? [];

  let ri: number | null = null, mi: number | null = null;
  for (let r = 0; r < rounds.length; r++) {
    for (let m = 0; m < rounds[r].matches.length; m++) {
      if (rounds[r].matches[m].matchId === matchId) {
        ri = r; mi = m;
        rounds[r].matches[m].winnerId = winnerId;
        rounds[r].matches[m].status = "completed";
        break;
      }
    }
    if (ri !== null) break;
  }

  if (ri === null || mi === null) return bs;

  const nextRi = ri + 1;
  if (nextRi >= rounds.length) return bs; // Final — tournament complete

  const nextRound = rounds[nextRi];
  const tIdx = Math.floor(mi / 2);

  if (tIdx < nextRound.matches.length) {
    const target = nextRound.matches[tIdx];
    if (mi % 2 === 0) {
      await store.updateMatch(target.matchId, { player1_id: winnerId });
      target.player1Id = winnerId;
    } else {
      await store.updateMatch(target.matchId, { player2_id: winnerId });
      target.player2Id = winnerId;
    }
    if (target.player1Id && target.player2Id) {
      await store.updateMatch(target.matchId, { status: "pending" });
      target.status = "pending";
    }
  }

  await store.updateTournamentBracketState(tournamentId, bs);
  return bs;
}

export function isTournamentComplete(bracketState: any): { complete: boolean; winnerId: string | null } {
  const rounds = bracketState?.rounds ?? [];
  if (!rounds.length) return { complete: false, winnerId: null };

  const finalRound = rounds[rounds.length - 1];
  for (const m of finalRound.matches) {
    if (m.status !== "completed" || !m.winnerId) return { complete: false, winnerId: null };
  }
  return { complete: true, winnerId: finalRound.matches[0]?.winnerId ?? null };
}
