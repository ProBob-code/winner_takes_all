"use client";

/**
 * Both players agree the frame before it counts.
 *
 * This exists to answer one objection, quoted almost word for word by the
 * buyer panel: *"a screen doesn't referee a frame — someone still types the
 * result."* On a bar table that someone is usually the owner, whose word is
 * exactly what is in dispute when a frame is close. So the frame is decided,
 * the clock stops, and then it waits: each player confirms on their own phone,
 * and only then does the result go on the table.
 *
 * WHAT CHANGED AFTER A NIGHT OF IT
 * Hosts could not tell what this panel was asking them to do. "Agree the
 * frame" did not say that the table was frozen until they did, and "Settle it
 * myself" did not say what settling actually means or what it costs. Both were
 * read as optional, so frames sat unagreed and the standings stayed on zero
 * while everybody assumed the app was broken.
 *
 * So it now says, in order: the scoreline, that nothing counts until both taps
 * land, who it is still waiting on, and — for the host only — what settling it
 * does and what it records. The override takes two taps, because it writes the
 * host's word in place of a player's and that should not happen by brushing
 * past a button.
 */

import { useState } from "react";
import { backendFetch } from "@/lib/backend";

export interface FrameConfirmation {
  matchId: string;
  teamId: string;
  agreedWinnerId: string | null;
  at: string;
}

interface FrameConfirmProps {
  matchId: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  winnerId: string | null;
  /** The frame as it finished, so the panel can show what is being agreed. */
  scoreA?: number;
  scoreB?: number;
  /** Everything confirmed so far, from the tournament state. */
  confirmations: FrameConfirmation[];
  /** The team this viewer is playing for, if any. */
  myTeamId: string | null;
  isHost: boolean;
  onConfirmed: () => void;
}

export function FrameConfirm({
  matchId,
  teamAId,
  teamBId,
  teamAName,
  teamBName,
  winnerId,
  scoreA,
  scoreB,
  confirmations,
  myTeamId,
  isHost,
  onConfirmed,
}: FrameConfirmProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The override is two taps. This is whether the second one is showing. */
  const [settleArmed, setSettleArmed] = useState(false);

  const forThisFrame = confirmations.filter((fc) => fc.matchId === matchId);
  const confirmed = new Set(forThisFrame.map((fc) => fc.teamId));
  const bothAgreed = confirmed.has(teamAId) && confirmed.has(teamBId);

  const winnerName =
    winnerId === teamAId ? teamAName : winnerId === teamBId ? teamBName : null;
  const haveScore = typeof scoreA === "number" && typeof scoreB === "number";

  // Deliberately NOT queued through the outbox. A confirmation is a statement
  // about a disputed fact, and a player must see it land rather than be told it
  // is saved on a device the other player cannot see.
  const confirm = async (teamId: string) => {
    setBusy(teamId);
    setError(null);
    try {
      const res = await backendFetch(`/engine/matches/${matchId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, winnerId }),
      });
      const payload: any = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        setError(payload?.message || "That confirmation did not go through.");
        return;
      }
      onConfirmed();
    } catch {
      setError("Could not reach the server. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  };

  const override = async () => {
    setBusy("override");
    setError(null);
    try {
      const res = await backendFetch(`/engine/matches/${matchId}/confirm-override`, {
        method: "POST",
      });
      const payload: any = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        setError(payload?.message || "That did not go through.");
        return;
      }
      setSettleArmed(false);
      onConfirmed();
    } catch {
      setError("Could not reach the server. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  };

  const side = (teamId: string, name: string, otherName: string) => {
    const done = confirmed.has(teamId);
    const mine = myTeamId === teamId;
    const mayConfirm = !done && (mine || isHost);

    return (
      <div key={teamId} className={`confirm-side${done ? " done" : ""}`}>
        <span className="who">
          {name}
          {winnerId === teamId && (
            <span className="chip gold" style={{ marginLeft: "var(--space-2)" }}>
              won
            </span>
          )}
        </span>
        {done ? (
          <span className="chip good">agreed</span>
        ) : mayConfirm ? (
          <button
            type="button"
            className="button button-sm"
            onClick={() => void confirm(teamId)}
            disabled={busy !== null}
          >
            {busy === teamId ? "…" : mine ? "Yes, that's right" : `Agree for ${name}`}
          </button>
        ) : (
          // Say who the hold-up is, not just that there is one.
          <span className="chip warn">waiting on {name}</span>
        )}
      </div>
    );
  };

  if (bothAgreed) {
    return (
      <div className="confirm-panel">
        <div className="h-stack between">
          <strong>
            Agreed by both players
            {winnerName ? ` — ${winnerName} won` : " — drawn"}. It is on the table.
          </strong>
          <span className="chip good">counted</span>
        </div>
      </div>
    );
  }

  const stillWaiting = [
    confirmed.has(teamAId) ? null : teamAName,
    confirmed.has(teamBId) ? null : teamBName,
  ].filter(Boolean) as string[];

  return (
    <div className="confirm-panel">
      <div className="v-stack">
        <div>
          <strong style={{ fontSize: "var(--text-lg)" }}>
            {winnerName ? `${winnerName} won this frame` : "This frame was drawn"}
            {haveScore ? ` — ${scoreA}–${scoreB}` : ""}
          </strong>
          <p
            className="muted"
            style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}
          >
            Nothing goes on the table until both players agree it. Until then the standings
            and the coins for this frame are on hold.
          </p>
        </div>

        <div className="confirm-sides">
          {side(teamAId, teamAName, teamBName)}
          {side(teamBId, teamBName, teamAName)}
        </div>

        {stillWaiting.length > 0 && (
          <p className="muted" style={{ fontSize: "var(--text-sm)", margin: 0 }}>
            {stillWaiting.length === 1
              ? `Waiting on ${stillWaiting[0]} to tap agree on their phone.`
              : `Waiting on ${stillWaiting.join(" and ")} to tap agree on their phones.`}
          </p>
        )}

        {error && <p style={{ color: "#ef4444", fontSize: "var(--text-sm)" }}>{error}</p>}

        {/* The host's way out of a frame that will never be agreed — a player
            who has gone home, a flat phone, a walk-in with no account. Spelled
            out, because the old one-line hint read as a shortcut rather than as
            putting your own name to the result. */}
        {isHost && (
          <div className="confirm-settle">
            <strong style={{ fontSize: "var(--text-sm)" }}>
              Can&apos;t get both taps?
            </strong>
            <p className="muted" style={{ fontSize: "var(--text-sm)", margin: 0 }}>
              Settling it puts the result on the table now, exactly as shown above
              {winnerName ? `, with ${winnerName} as the winner` : " as a draw"}. The frame is
              recorded as settled by you rather than agreed by the players, and the coins are
              paid. Use it when someone has left or their phone is dead — not to skip a
              disagreement.
            </p>
            {settleArmed ? (
              <div className="h-stack tight">
                <button
                  type="button"
                  className="button button-sm"
                  onClick={() => void override()}
                  disabled={busy !== null}
                >
                  {busy === "override"
                    ? "Settling…"
                    : winnerName
                      ? `Settle it — ${winnerName} won`
                      : "Settle it — drawn"}
                </button>
                <button
                  type="button"
                  className="button-secondary button-sm"
                  onClick={() => setSettleArmed(false)}
                  disabled={busy !== null}
                >
                  Keep waiting
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="button-secondary button-sm"
                onClick={() => setSettleArmed(true)}
                disabled={busy !== null}
                style={{ alignSelf: "flex-start" }}
              >
                Settle it with my word
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
