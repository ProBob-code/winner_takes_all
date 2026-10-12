"use client";

// Rendered per request, not prerendered. These pages read the router, the
// query string or the live tournament state at mount, and prerendering them
// trips Next's workUnitAsyncStorage invariant. The admin console already
// does this for the same reason.
export const dynamic = "force-dynamic";

/**
 * The big screen.
 *
 * Full bleed, no chrome, readable from across a room: the live frame with both
 * scores and the clock, the table beside it, and the join QR so a walk-in can
 * enter without asking anyone.
 *
 * TWO THINGS THE BUYER PANEL CHANGED ABOUT THIS
 * Two of the twenty said the wall TV is already showing cricket, so this does
 * not assume a free screen: every size scales with the viewport rather than
 * being set for 1080p, and it works propped on a tablet or a spare monitor and
 * degrades to a phone. Nothing is positioned absolutely against an assumed
 * aspect ratio.
 *
 * Read-only by design. There is nothing to tap, so it can be left on a screen
 * nobody is guarding, and no control can be nudged by a passer-by.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { backendFetch } from "@/lib/backend";
import { qrToSvg } from "@/lib/qr";

interface Team {
  id: string;
  name: string;
  matches_played: number;
  group_points: number;
  total_score: number;
}

interface Match {
  id: string;
  phase: string;
  team_a_id: string;
  team_b_id: string;
  status: string;
  sudden_death: boolean;
  score_team_a: number;
  score_team_b: number;
  winner_id: string | null;
  start_time: number | null;
  duration: number;
  match_order: number;
  awaiting_confirmation?: boolean;
}

interface State {
  ok: boolean;
  phase: string;
  teams: Team[];
  matches: Match[];
  joinCode: string | null;
  joinUrl: string | null;
  serverTime?: number;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

const clock = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
};

const phaseLabel = (phase: string) =>
  phase === "SEMI" ? "SEMI-FINAL" : phase === "FINAL" ? "GRAND FINAL" : "GROUP STAGE";

export default function DisplayPage() {
  const params = useParams<{ id: string }>();
  const tournamentId = params?.id;

  const [state, setState] = useState<State | null>(null);
  const [name, setName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(nowSeconds());

  /**
   * The difference between this device's clock and the server's.
   *
   * A display left on a bar's spare tablet can be minutes out, and a clock
   * counted down against a wrong "now" is wrong by that much for the whole
   * night. The offset is measured once per poll and the countdown uses it.
   */
  const skewRef = useRef(0);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const [stateRes, metaRes] = await Promise.all([
        backendFetch(`/engine/tournaments/${tournamentId}/state`),
        backendFetch(`/tournaments/${tournamentId}`),
      ]);

      const payload: any = await stateRes.json();
      if (!stateRes.ok || payload?.ok === false) {
        setError(payload?.message || "This tournament could not be read.");
        return;
      }
      if (typeof payload.serverTime === "number") {
        skewRef.current = payload.serverTime - nowSeconds();
      }
      setState(payload);
      setError(null);

      const meta: any = await metaRes.json().catch(() => null);
      if (meta?.tournament?.name) setName(meta.tournament.name);
    } catch {
      // A display is left running unattended for hours. A failed poll keeps
      // the last good picture on the screen rather than blanking it; the next
      // poll will fix it.
      setError("Reconnecting…");
    }
  }, [tournamentId]);

  useEffect(() => {
    void load();
    // Three seconds. A score on a wall needs to look live; a minute's delay
    // makes the screen look broken while the game is being played in front of
    // it.
    const poll = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(poll);
  }, [load]);

  useEffect(() => {
    const ticker = window.setInterval(() => setTick(nowSeconds()), 500);
    return () => window.clearInterval(ticker);
  }, []);

  const liveMatch = useMemo(
    () => state?.matches.find((m) => m.status === "LIVE") ?? null,
    [state]
  );

  const nextMatch = useMemo(
    () =>
      state?.matches
        .filter((m) => m.status === "CREATED")
        .sort((a, b) => a.match_order - b.match_order)[0] ?? null,
    [state]
  );

  const ranked = useMemo(
    () =>
      [...(state?.teams ?? [])].sort(
        (a, b) =>
          b.group_points - a.group_points ||
          b.total_score - a.total_score ||
          a.matches_played - b.matches_played
      ),
    [state]
  );

  const teamName = useCallback(
    (id: string | null) => state?.teams.find((t) => t.id === id)?.name ?? "TBC",
    [state]
  );

  const remaining = useMemo(() => {
    if (!liveMatch?.start_time) return null;
    const serverNow = tick + skewRef.current;
    return Math.max(0, liveMatch.start_time + liveMatch.duration - serverNow);
  }, [liveMatch, tick]);

  const joinQr = useMemo(() => {
    if (!state?.joinUrl) return null;
    try {
      return qrToSvg(state.joinUrl, { size: 148, margin: 2 });
    } catch {
      // The encoder covers the short URLs this app produces; anything it
      // cannot encode falls back to the code in text, which a player can type.
      return null;
    }
  }, [state?.joinUrl]);

  if (!state) {
    return (
      <main className="display">
        <div style={{ margin: "auto", textAlign: "center" }}>
          <div className="display-title">{error ?? "Opening the screen…"}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="display">
      <header className="display-head">
        <div style={{ minWidth: 0 }}>
          <div className="display-title">{name || "League night"}</div>
          <div
            style={{
              color: "#9ca3af",
              letterSpacing: "0.18em",
              fontSize: "clamp(0.7rem, 1.2vw, 1rem)",
              textTransform: "uppercase",
              marginTop: "0.35rem",
            }}
          >
            {liveMatch ? phaseLabel(liveMatch.phase) : state.phase === "COMPLETED" ? "FINISHED" : "UP NEXT"}
            {liveMatch?.sudden_death && " · SUDDEN DEATH"}
          </div>
        </div>
        {error && (
          <span className="chip warn" style={{ background: "transparent" }}>
            {error}
          </span>
        )}
      </header>

      {liveMatch ? (
        <section className="display-live">
          <div
            className={`display-team a${
              liveMatch.score_team_a > liveMatch.score_team_b ? " winning" : ""
            }`}
          >
            <div className="name">{teamName(liveMatch.team_a_id)}</div>
            <div className="score">{liveMatch.score_team_a}</div>
          </div>

          <div>
            {remaining !== null && (
              <div className={`display-clock${remaining <= 30 ? " low" : ""}`}>
                {clock(remaining)}
              </div>
            )}
          </div>

          <div
            className={`display-team b${
              liveMatch.score_team_b > liveMatch.score_team_a ? " winning" : ""
            }`}
          >
            <div className="name">{teamName(liveMatch.team_b_id)}</div>
            <div className="score">{liveMatch.score_team_b}</div>
          </div>
        </section>
      ) : (
        <section className="display-live" style={{ gridTemplateColumns: "1fr" }}>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "var(--text-display)",
                fontWeight: 900,
                fontFamily: "var(--font-outfit), system-ui, sans-serif",
              }}
            >
              {state.phase === "COMPLETED"
                ? ranked[0]
                  ? `${ranked[0].name} wins`
                  : "Finished"
                : nextMatch
                  ? `${teamName(nextMatch.team_a_id)} v ${teamName(nextMatch.team_b_id)}`
                  : "Waiting for the next frame"}
            </div>
            {state.phase !== "COMPLETED" && nextMatch && (
              <div style={{ color: "#9ca3af", marginTop: "var(--space-3)" }}>
                {phaseLabel(nextMatch.phase)} · up next
              </div>
            )}
          </div>
        </section>
      )}

      <footer className="display-foot">
        <div>
          <table className="display-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>P</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {ranked.slice(0, 8).map((team, i) => (
                <tr key={team.id}>
                  <td>
                    <span style={{ color: "#6b7280", marginRight: "0.6em" }}>{i + 1}</span>
                    {team.name}
                  </td>
                  <td>{team.matches_played}</td>
                  <td style={{ fontWeight: 900 }}>{team.group_points}</td>
                </tr>
              ))}
              {ranked.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ color: "#9ca3af" }}>
                    Nobody has entered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {state.joinCode && (
          <div className="display-join">
            {joinQr && (
              <div className="qr" dangerouslySetInnerHTML={{ __html: joinQr }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: "#9ca3af",
                  fontSize: "clamp(0.7rem, 1.2vw, 0.95rem)",
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                }}
              >
                Scan to play — free
              </div>
              <div className="code">{state.joinCode}</div>
              <div style={{ color: "#9ca3af", fontSize: "clamp(0.7rem, 1.1vw, 0.9rem)" }}>
                No account needed
              </div>
            </div>
          </div>
        )}
      </footer>
    </main>
  );
}
