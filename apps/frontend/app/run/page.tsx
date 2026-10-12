"use client";

// Rendered per request, not prerendered. These pages read the router, the
// query string or the live tournament state at mount, and prerendering them
// trips Next's workUnitAsyncStorage invariant. The admin console already
// does this for the same reason.
export const dynamic = "force-dynamic";

/**
 * Run a night, in under a minute.
 *
 * THE MEASURE THIS PAGE IS BUILT AGAINST
 * If a stranger cannot get from here to a live frame in ninety seconds, it is
 * not finished. That is the test the implementation plan sets, and it is why
 * this page asks three questions and no more: which game, how many playing,
 * and — optionally — their names. Everything else that a hosted tournament
 * normally wants (bracket type, matches per team, a password, a prize) is
 * either defaulted or does not exist here.
 *
 * It creates the tournament, seats the players, starts it and draws the
 * opening fixtures in a single request, then hands over three links: the
 * screen for the wall, staff mode for whoever is scoring, and the QR for
 * anyone who walks in later.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { backendFetch } from "@/lib/backend";

const SIZES = [4, 8, 16, 32];

interface Ready {
  tournamentId: string;
  teams: number;
  joinCode: string;
  joinUrl: string;
  staffUrl: string;
  displayUrl: string;
}

export default function RunNightPage() {
  const router = useRouter();

  const [sport, setSport] = useState<"8BALL" | "FOOTBALL">("8BALL");
  const [size, setSize] = useState(8);
  const [name, setName] = useState("");
  const [requireConfirm, setRequireConfirm] = useState(false);
  const [namesText, setNamesText] = useState("");
  const [showNames, setShowNames] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      // Blank lines are dropped rather than seated as empty players; the API
      // fills any remaining slot with "Player n".
      const players = namesText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, size);

      const res = await backendFetch("/engine/quick-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          sport,
          size,
          players: players.length > 0 ? players : undefined,
          requireFrameConfirmation: requireConfirm,
        }),
      });

      const payload: any = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok || payload?.ok === false) {
        setError(payload?.message || "That did not go through.");
        return;
      }
      setReady(payload);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (ready) {
    return (
      <main className="page">
        <div className="shell" style={{ maxWidth: "46rem" }}>
          <span className="chip good">live now</span>
          <h1
            style={{
              fontSize: "var(--text-3xl)",
              fontWeight: 900,
              margin: "var(--space-3) 0 var(--space-2)",
            }}
          >
            The night is running.
          </h1>
          <p className="muted">
            {ready.teams} playing, first frames drawn. Open these on the right screens.
          </p>

          <div className="auto-grid" style={{ marginTop: "var(--space-6)" }}>
            <div className="panel v-stack">
              <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>On the wall</h2>
              <p className="muted" style={{ fontSize: "var(--text-sm)", flex: 1 }}>
                The live score, the clock, the table and the join code. Nothing to tap, so
                it is safe to leave unattended.
              </p>
              <Link
                className="button"
                href={`/display/${ready.tournamentId}`}
                style={{ textDecoration: "none", textAlign: "center" }}
              >
                Open the big screen
              </Link>
            </div>

            <div className="panel v-stack">
              <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>Whoever is scoring</h2>
              <p className="muted" style={{ fontSize: "var(--text-sm)", flex: 1 }}>
                Big buttons, scoring only, and it keeps working if the wifi drops. Send
                this link to the member of staff on the table.
              </p>
              <Link
                className="button"
                href={`/staff/${ready.tournamentId}`}
                style={{ textDecoration: "none", textAlign: "center" }}
              >
                Open staff mode
              </Link>
            </div>

            <div className="panel v-stack">
              <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>Anyone walking in</h2>
              <p className="muted" style={{ fontSize: "var(--text-sm)", flex: 1 }}>
                The code is already on the big screen. They scan it, type a name and they
                are in — no account, free to enter.
              </p>
              <div
                style={{
                  fontFamily: "var(--font-outfit), system-ui, sans-serif",
                  fontSize: "var(--text-2xl)",
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                }}
              >
                {ready.joinCode}
              </div>
            </div>
          </div>

          <div className="h-stack" style={{ marginTop: "var(--space-6)" }}>
            <Link
              className="button-secondary"
              href={`/tournaments/${ready.tournamentId}`}
              style={{ textDecoration: "none" }}
            >
              Full controls
            </Link>
            <button type="button" className="button-secondary" onClick={() => setReady(null)}>
              Run another
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="shell" style={{ maxWidth: "40rem" }}>
        <h1 style={{ fontSize: "var(--text-3xl)", fontWeight: 900 }}>Run a night</h1>
        <p className="muted" style={{ marginTop: "var(--space-2)" }}>
          Three questions, then it is live. Free to enter, as every tournament here is.
        </p>

        <div className="v-stack" style={{ marginTop: "var(--space-6)", gap: "var(--space-5)" }}>
          <div className="field">
            <label>Which game</label>
            <div className="h-stack tight">
              <button
                type="button"
                className={sport === "8BALL" ? "button" : "button-secondary"}
                onClick={() => setSport("8BALL")}
              >
                8-ball
              </button>
              <button
                type="button"
                className={sport === "FOOTBALL" ? "button" : "button-secondary"}
                onClick={() => setSport("FOOTBALL")}
              >
                Football
              </button>
            </div>
          </div>

          <div className="field">
            <label>How many playing</label>
            <div className="h-stack tight">
              {SIZES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={size === option ? "button" : "button-secondary"}
                  onClick={() => setSize(option)}
                >
                  {option}
                </button>
              ))}
            </div>
            <span className="hint">
              Anyone who turns up later can scan the code on the screen and join.
            </span>
          </div>

          <div className="field">
            <label htmlFor="night-name">What to call it (optional)</label>
            <input
              id="night-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Friday league"
              maxLength={80}
            />
          </div>

          {/* Folded away, because typing eight names is exactly the thing that
              makes setup take longer than the regulars will wait. The default
              is Player 1..n, renamed later or never. */}
          <div className="field">
            <button
              type="button"
              className="button-secondary button-sm"
              onClick={() => setShowNames((v) => !v)}
              style={{ alignSelf: "flex-start" }}
            >
              {showNames ? "Skip the names" : "Type the names now"}
            </button>
            {showNames && (
              <>
                <textarea
                  className="textarea"
                  value={namesText}
                  onChange={(e) => setNamesText(e.target.value)}
                  placeholder={"One name per line\nRavi\nPriya\nArun"}
                  style={{ marginTop: "var(--space-2)" }}
                />
                <span className="hint">
                  Leave any out and they will be seated as Player 1, Player 2 and so on.
                </span>
              </>
            )}
          </div>

          <label className="h-stack tight" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={requireConfirm}
              onChange={(e) => setRequireConfirm(e.target.checked)}
              style={{ width: "1.25rem", height: "1.25rem", flexShrink: 0 }}
            />
            <span>
              <strong>Both players confirm each frame</strong>
              <br />
              <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
                The result waits for both players to agree before it counts. Turn this on
                for a night where the table matters.
              </span>
            </span>
          </label>

          {error && <p style={{ color: "#f87171" }}>{error}</p>}

          <button
            type="button"
            className="button"
            onClick={() => void go()}
            disabled={busy}
            style={{ minHeight: "56px", fontSize: "var(--text-lg)" }}
          >
            {busy ? "Setting it up…" : "Start the night"}
          </button>
        </div>
      </div>
    </main>
  );
}
