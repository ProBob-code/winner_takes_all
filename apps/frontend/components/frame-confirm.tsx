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
 * The host can override, because a night cannot stop for a flat battery or a
 * player who has gone home. That is recorded as the host's own word for both
 * sides, which is the honest thing to show rather than hide.
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
  confirmations,
  myTeamId,
  isHost,
  onConfirmed,
}: FrameConfirmProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const forThisFrame = confirmations.filter((fc) => fc.matchId === matchId);
  const confirmed = new Set(forThisFrame.map((fc) => fc.teamId));
  const bothAgreed = confirmed.has(teamAId) && confirmed.has(teamBId);

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
      onConfirmed();
    } catch {
      setError("Could not reach the server. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  };

  const side = (teamId: string, name: string) => {
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
            {busy === teamId ? "…" : mine ? "I agree" : "Agree for them"}
          </button>
        ) : (
          <span className="chip warn">waiting</span>
        )}
      </div>
    );
  };

  if (bothAgreed) {
    return (
      <div className="confirm-panel">
        <div className="h-stack between">
          <strong>Both players agreed this frame.</strong>
          <span className="chip good">settled</span>
        </div>
      </div>
    );
  }

  return (
    <div className="confirm-panel">
      <div className="v-stack">
        <div>
          <strong style={{ fontSize: "var(--text-lg)" }}>Agree the frame</strong>
          <p className="muted" style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>
            {winnerId
              ? "The result is on the board but not on the table yet. Both players confirm, then it counts."
              : "This frame was drawn. Both players confirm, then it counts."}
          </p>
        </div>

        <div className="confirm-sides">
          {side(teamAId, teamAName)}
          {side(teamBId, teamBName)}
        </div>

        {error && (
          <p style={{ color: "#f87171", fontSize: "var(--text-sm)" }}>{error}</p>
        )}

        {isHost && (
          <div className="v-stack" style={{ gap: "var(--space-2)" }}>
            <button
              type="button"
              className="button-secondary button-sm"
              onClick={() => void override()}
              disabled={busy !== null}
              style={{ alignSelf: "flex-start" }}
            >
              {busy === "override" ? "Settling…" : "Settle it myself"}
            </button>
            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
              For a player who has left or whose phone is flat. Recorded as your word for
              both sides.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
