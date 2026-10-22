/**
 * The bracket, the results and the league table as plain text, ready to paste
 * into a WhatsApp group.
 *
 * WHY TEXT AND NOT AN INTEGRATION
 * Four of the twenty buyers on the panel asked for WhatsApp unprompted, and
 * every one of them already runs their tournament through a group chat. What
 * they want is the results *in that group*, not a second place to look. A
 * WhatsApp Business API integration would mean onboarding each venue onto a
 * Meta business account, a template approval queue and a per-message fee, to
 * deliver into a group the owner is already holding open on their phone.
 *
 * So the server builds the message and the client hands it to WhatsApp through
 * a `wa.me` link, which opens the share sheet with the text already written.
 * One tap, no onboarding, no per-message cost, and it works on the owner's
 * existing group. The text is built here rather than in the browser so every
 * device produces the same message and the formatting is tested once.
 *
 * Formatting is WhatsApp's own: *bold* between asterisks, no markdown tables
 * (they wrap unreadably on a phone), and no emoji beyond the three the results
 * use for places — a wall of emoji reads as spam in a group of regulars.
 */

export interface ShareTeam {
  id: string;
  name: string;
  matches_played: number;
  group_points: number;
  total_score: number;
}

export interface ShareMatch {
  id: string;
  phase: string;
  team_a_id: string;
  team_b_id: string;
  status: string;
  score_team_a: number;
  score_team_b: number;
  winner_id: string | null;
  match_order: number;
  awaiting_confirmation?: boolean;
}

export type ShareKind = "bracket" | "results" | "table";

const PHASE_LABEL: Record<string, string> = {
  GROUP: "Group stage",
  SEMI: "Semi-final",
  FINAL: "Grand final",
};

function phaseLabel(phase: string): string {
  return PHASE_LABEL[phase] ?? phase;
}

/** WhatsApp bolds text between single asterisks. */
function bold(text: string): string {
  return `*${text}*`;
}

/**
 * Trim a name to something that will not wrap on a phone.
 *
 * Twenty-two characters is about what fits beside a score on a narrow screen;
 * past that the line breaks and the column the eye was following disappears.
 */
function short(name: string, max = 22): string {
  const clean = (name || "").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function nameOf(teams: ShareTeam[], id: string | null): string {
  if (!id) return "TBC";
  return short(teams.find((t) => t.id === id)?.name ?? "Unknown");
}

/** The fixture list: who is playing whom, in the order they will play. */
export function bracketText(
  tournamentName: string,
  teams: ShareTeam[],
  matches: ShareMatch[],
  joinUrl?: string
): string {
  const lines: string[] = [bold(tournamentName), ""];

  const ordered = [...matches].sort((a, b) => a.match_order - b.match_order);
  const byPhase = new Map<string, ShareMatch[]>();
  for (const m of ordered) {
    const list = byPhase.get(m.phase) ?? [];
    list.push(m);
    byPhase.set(m.phase, list);
  }

  if (ordered.length === 0) {
    lines.push("The draw has not been made yet.");
  }

  for (const [phase, group] of byPhase) {
    lines.push(bold(phaseLabel(phase)));
    group.forEach((m, i) => {
      const a = nameOf(teams, m.team_a_id);
      const b = nameOf(teams, m.team_b_id);
      const played = m.status === "COMPLETED";
      const marker = played ? "✓" : m.status === "LIVE" ? "▶" : `${i + 1}.`;
      lines.push(`${marker} ${a} vs ${b}`);
    });
    lines.push("");
  }

  if (joinUrl) {
    lines.push(`Not entered yet? ${joinUrl}`);
    lines.push("Free to enter.");
  }

  return lines.join("\n").trim();
}

/**
 * What has been decided so far.
 *
 * A frame still waiting on both players to agree is shown as unconfirmed
 * rather than omitted: the group will have watched it finish, and a result
 * missing from the message reads as a bug rather than as pending.
 */
export function resultsText(
  tournamentName: string,
  teams: ShareTeam[],
  matches: ShareMatch[]
): string {
  const done = matches
    .filter((m) => m.status === "COMPLETED")
    .sort((a, b) => a.match_order - b.match_order);

  const lines: string[] = [bold(`${tournamentName} — results`), ""];

  if (done.length === 0) {
    lines.push("No frames have finished yet.");
    return lines.join("\n");
  }

  for (const m of done) {
    const a = nameOf(teams, m.team_a_id);
    const b = nameOf(teams, m.team_b_id);
    const winner = m.winner_id ? nameOf(teams, m.winner_id) : null;
    const score = `${m.score_team_a}-${m.score_team_b}`;
    const tail = m.awaiting_confirmation ? "  (awaiting confirmation)" : "";
    if (m.phase === "FINAL" && winner) {
      lines.push(`🏆 ${bold("Winner")}: ${winner}  (${score})${tail}`);
    } else if (winner) {
      lines.push(`${a} ${score} ${b} — ${winner}${tail}`);
    } else {
      lines.push(`${a} ${score} ${b} — drawn${tail}`);
    }
  }

  return lines.join("\n");
}

/**
 * The league table.
 *
 * Ranked on points, then total score, then fewest played — the same order the
 * engine ranks on, so the message and the screen never disagree.
 */
export function tableText(tournamentName: string, teams: ShareTeam[]): string {
  const lines: string[] = [bold(`${tournamentName} — table`), ""];

  const ranked = [...teams].sort(
    (a, b) =>
      b.group_points - a.group_points ||
      b.total_score - a.total_score ||
      a.matches_played - b.matches_played
  );

  if (ranked.length === 0) {
    lines.push("Nobody has entered yet.");
    return lines.join("\n");
  }

  // Nothing has counted yet, so there is no order to report. Medalling the
  // first three rows of an all-zero table crowns whoever happens to sort
  // first, which is how a group chat ends up congratulating someone who has
  // not played a frame. Say what is actually true instead.
  const anythingCounted = ranked.some((t) => t.matches_played > 0 || t.group_points > 0);
  if (!anythingCounted) {
    lines.push(`${ranked.length} entered. No frames have counted yet.`);
    lines.push("A frame counts once it is finished and both players agree it.");
    lines.push("");
    for (const t of ranked) lines.push(`· ${short(t.name)}`);
    return lines.join("\n");
  }

  // Players who are exactly level share a place, and a shared place takes no
  // medal. Three players on one win and a hundred points each were being sent
  // to the group chat as gold, silver and bronze, separated by nothing but the
  // order the rows came back in. This mirrors apps/frontend/lib/standings.ts,
  // which does the same job for the screens; tests/standings-mirror.test.ts
  // holds the two together.
  const level = (a: ShareTeam, b: ShareTeam) =>
    a.group_points === b.group_points &&
    a.total_score === b.total_score &&
    a.matches_played === b.matches_played;

  const medal = ["🥇", "🥈", "🥉"];
  let position = 0;
  ranked.forEach((t, i) => {
    if (i === 0 || !level(t, ranked[i - 1])) position = i + 1;
    const shared =
      (i > 0 && level(t, ranked[i - 1])) ||
      (i + 1 < ranked.length && level(t, ranked[i + 1]));

    // A medal is for a score, not for a position in a list of zeroes, and not
    // for a place two people are standing on.
    const earned = t.group_points > 0 || t.matches_played > 0;
    const place =
      earned && !shared
        ? medal[position - 1] ?? `${position}.`
        : shared
          ? `=${position}.`
          : `${position}.`;
    // "pts" was wrong twice over: group_points is frames won, and nobody
    // reading a bar's group chat knows what a point is here. Say "won".
    lines.push(
      `${place} ${short(t.name)} — ${t.group_points} won of ${t.matches_played} played`
    );
  });

  lines.push("");
  lines.push("Most frames won takes it.");
  if (ranked.some((t, i) => (i > 0 && level(t, ranked[i - 1])) || (i + 1 < ranked.length && level(t, ranked[i + 1])))) {
    lines.push("A place marked = is shared — nothing separates them yet.");
  }

  return lines.join("\n");
}

export function shareText(
  kind: ShareKind,
  tournamentName: string,
  teams: ShareTeam[],
  matches: ShareMatch[],
  joinUrl?: string
): string {
  if (kind === "results") return resultsText(tournamentName, teams, matches);
  if (kind === "table") return tableText(tournamentName, teams);
  return bracketText(tournamentName, teams, matches, joinUrl);
}

/**
 * The `wa.me` link that opens WhatsApp with this message already written.
 *
 * No recipient: WhatsApp then shows the share sheet, and the owner picks the
 * group. That is deliberate — we never hold a phone number, so there is
 * nothing to leak and nothing to consent to.
 */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
