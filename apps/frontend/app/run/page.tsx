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

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { backendFetch } from "@/lib/backend";

const SIZES = [4, 8, 16, 32];

/**
 * How many frames each player gets in the group stage.
 *
 * This was never a question the host was asked, and the column behind it was
 * read in six places as "or 2" and written in none — so every night ever run
 * was two frames each, whatever the night was for. A quick knockout and a
 * proper league were the same evening.
 */
const FRAMES_EACH = [1, 2, 3, 4];

/**
 * Roughly how many frames the group stage comes to.
 *
 * Each frame uses up one of two players' allowances, so it is half the total,
 * rounded down — an odd field leaves one player short and takes a bye.
 */
const groupFrames = (players: number, each: number) =>
  Math.floor((players * each) / 2);

interface Ready {
  tournamentId: string;
  /** Unknown when the night is restored rather than just created. */
  teams?: number;
  /** Null if the code could not be fetched; the big screen still shows it. */
  joinCode: string | null;
  name?: string;
  finished?: boolean;
}

/** A night this host started and has not finished, for picking back up. */
interface OpenNight {
  id: string;
  name: string;
  sport: string;
}

/**
 * The night being shown lives in the address bar, not only in memory.
 *
 * It used to be React state alone, so a refresh — or a phone that dropped the
 * tab while it sat in a pocket — lost the night: it was still running on the
 * server, but the host had no way back to its links. With the id in the URL a
 * refresh lands on the same night, and the list on the form finds any other.
 */
const NIGHT_PARAM = "night";

function nightInUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(NIGHT_PARAM);
}

export default function RunNightPage() {
  const router = useRouter();

  const [sport, setSport] = useState<"8BALL" | "FOOTBALL">("8BALL");
  const [size, setSize] = useState(8);
  const [framesEach, setFramesEach] = useState(2);
  const [name, setName] = useState("");
  const [requireConfirm, setRequireConfirm] = useState(false);
  const [namesText, setNamesText] = useState("");
  const [showNames, setShowNames] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  // False on the first render on both server and client, so they agree; the
  // effect below turns it on when there is a night in the URL to restore.
  const [restoring, setRestoring] = useState(false);
  const [openNights, setOpenNights] = useState<OpenNight[]>([]);

  /** Bring a night back from the server by id: the tournament, then its code. */
  const restore = useCallback(
    async (id: string) => {
      setRestoring(true);
      setError(null);
      try {
        const res = await backendFetch(`/tournaments/${encodeURIComponent(id)}`);
        const payload: any = await res.json().catch(() => ({}));
        if (!res.ok || !payload?.tournament) {
          setError("That night could not be found. It may have been deleted.");
          router.replace("/run");
          return;
        }
        const t = payload.tournament;

        // Reissuing hands back the code already on the screen rather than a new
        // one, so anyone who scanned it earlier is not locked out.
        let joinCode: string | null = null;
        const codeRes = await backendFetch(`/tournaments/${encodeURIComponent(id)}/join-code`, {
          method: "POST",
        });
        if (codeRes.status === 401) {
          router.push("/login");
          return;
        }
        if (codeRes.ok) {
          const codePayload: any = await codeRes.json().catch(() => ({}));
          joinCode = codePayload?.code ?? null;
        }

        setReady({
          tournamentId: t.id,
          teams: t.joinedPlayers > 0 ? t.joinedPlayers : undefined,
          joinCode,
          name: t.name,
          finished: t.status === "COMPLETED" || !!t.completedAt,
        });
      } catch {
        setError("Could not reach the server to load that night. Refresh to try again.");
      } finally {
        setRestoring(false);
      }
    },
    [router]
  );

  // A refresh, or a link someone kept: open the night named in the URL.
  useEffect(() => {
    const id = nightInUrl();
    if (id) void restore(id);
  }, [restore]);

  // Nights this host started and has not finished, so one is never lost.
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    (async () => {
      try {
        const [meRes, listRes] = await Promise.all([
          backendFetch("/user/profile"),
          backendFetch("/tournaments"),
        ]);
        if (!meRes.ok || !listRes.ok) return;
        const me: any = await meRes.json().catch(() => ({}));
        const list: any = await listRes.json().catch(() => ({}));
        const myId = me?.user?.id;
        if (!myId || !Array.isArray(list?.tournaments)) return;
        const mine = list.tournaments
          .filter((t: any) => t.hostId === myId && t.status !== "COMPLETED" && !t.completedAt)
          .slice(0, 6)
          .map((t: any) => ({ id: t.id, name: t.name, sport: t.sport }));
        if (!cancelled) setOpenNights(mine);
      } catch {
        /* the list is a convenience; the form works without it */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const openNight = (id: string) => {
    router.replace(`/run?${NIGHT_PARAM}=${encodeURIComponent(id)}`);
    void restore(id);
  };

  const runAnother = () => {
    setReady(null);
    router.replace("/run");
  };

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
          matchesPerTeam: framesEach,
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
      setReady({
        tournamentId: payload.tournamentId,
        teams: payload.teams,
        joinCode: payload.joinCode ?? null,
        name: name.trim() || undefined,
      });
      // Written to the address bar so a refresh comes back to this night.
      router.replace(`/run?${NIGHT_PARAM}=${encodeURIComponent(payload.tournamentId)}`);
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
          <span className={ready.finished ? "chip" : "chip good"}>
            {ready.finished ? "finished" : "live now"}
          </span>
          <h1
            style={{
              fontSize: "var(--text-3xl)",
              fontWeight: 900,
              margin: "var(--space-3) 0 var(--space-2)",
            }}
          >
            {ready.finished ? "This night has finished." : "The night is running."}
          </h1>
          <p className="muted">
            {ready.name ? <strong style={{ color: "var(--text-primary)" }}>{ready.name}. </strong> : null}
            {ready.finished
              ? "The results are on the full controls page."
              : ready.teams
                ? `${ready.teams} playing, first frames drawn. Open these on the right screens.`
                : "Open these on the right screens."}
          </p>

          {/* Dealt as three cards: the wall, the scorer, the door. */}
          <div className="auto-grid" style={{ marginTop: "var(--space-6)", gap: "1.75rem" }}>
            <div className="wta-card tilt-l v-stack">
              <span className="sticker ink" style={{ alignSelf: "flex-start" }}>1 · The wall</span>
              <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 900 }}>On the wall</h2>
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

            <div className="wta-card red tilt-r v-stack">
              <span className="sticker gold" style={{ alignSelf: "flex-start" }}>2 · The table</span>
              <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 900 }}>Whoever is scoring</h2>
              <p style={{ fontSize: "var(--text-sm)", flex: 1, opacity: 0.9 }}>
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

            <div className="wta-card gold tilt-l v-stack">
              <span className="sticker" style={{ alignSelf: "flex-start" }}>3 · The door</span>
              <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 900 }}>Anyone walking in</h2>
              <p style={{ fontSize: "var(--text-sm)", flex: 1, fontWeight: 600 }}>
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
                {ready.joinCode ?? "On the big screen"}
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
            <button type="button" className="button-secondary" onClick={runAnother}>
              Run another
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (restoring) {
    return (
      <main className="page">
        <div className="shell" style={{ maxWidth: "40rem" }}>
          <p className="muted">Bringing your night back…</p>
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

        {openNights.length > 0 && (
          <section className="panel" style={{ marginTop: "var(--space-5)" }}>
            <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>Your nights in progress</h2>
            <p className="muted" style={{ fontSize: "var(--text-sm)", margin: "var(--space-1) 0 var(--space-3)" }}>
              Pick one up where you left it.
            </p>
            <div className="v-stack" style={{ gap: "var(--space-2)" }}>
              {openNights.map((night) => (
                <button
                  key={night.id}
                  type="button"
                  className="button-secondary"
                  onClick={() => openNight(night.id)}
                  style={{ justifyContent: "space-between", width: "100%" }}
                >
                  <span>{night.name}</span>
                  <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                    {night.sport === "FOOTBALL" ? "Football" : "8-ball"} · reopen →
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

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
                  onClick={() => {
                    setSize(option);
                    // Shrinking the field can leave a frame count that cannot
                    // be drawn selected. Bring it down with the field.
                    setFramesEach((f) => Math.max(1, Math.min(f, option - 1)));
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
            <span className="hint">
              Anyone who turns up later can scan the code on the screen and join.
            </span>
          </div>

          {/* The question that decides whether this is a quick knockout or a
              league. It was never asked, and the answer was always two. */}
          <div className="field">
            <label>How many frames each</label>
            <div className="h-stack tight">
              {FRAMES_EACH.map((option) => {
                // You cannot be drawn against more opponents than turned up,
                // so four players is three frames each at most. Shown as
                // unavailable rather than silently clamped after the fact.
                const tooMany = option > size - 1;
                return (
                  <button
                    key={option}
                    type="button"
                    className={framesEach === option ? "button" : "button-secondary"}
                    onClick={() => setFramesEach(option)}
                    disabled={tooMany}
                    title={tooMany ? `Only ${size} playing, so ${size - 1} frames each at most` : undefined}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <span className="hint">
              {framesEach === 1
                ? `One frame each — ${groupFrames(size, 1)} frames, then straight into the knockout.`
                : `${groupFrames(size, Math.min(framesEach, size - 1))} frames in the group stage, then the knockout. Everyone plays ${Math.min(framesEach, size - 1)}.`}
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
