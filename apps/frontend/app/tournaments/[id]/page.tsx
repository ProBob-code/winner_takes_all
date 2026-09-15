"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { readBackendJson, backendFetch } from "@/lib/backend";
import { JoinTournamentButton } from "@/components/join-tournament-button";
import { ShareTournament } from "@/components/share-tournament";
import { DeleteTournamentDialog } from "@/components/delete-tournament-dialog";
import { HostedArena, type ArenaMatch, type ArenaTeam } from "@/components/hosted-arena";
import "@/components/tournament-engine.css";

// --- Types ---

interface TournamentState {
  ok: boolean;
  phase: string;
  teams: ArenaTeam[];
  matches: ArenaMatch[];
  arenaId?: string;
  published?: boolean;
  matchesPerTeam?: number;
  /** Unix seconds on the server when the state was read. */
  serverTime?: number;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

// --- Main Page ---

export default function TournamentDetailPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [engineState, setEngineState] = useState<TournamentState | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(nowSeconds());
  const [startError, setStartError] = useState<string | null>(null);

  const routeParams = useParams<{ id: string }>();
  const routeId = routeParams?.id;

  // The match clock counts down against start_time, which is the server's
  // time. A device whose clock is off would show the wrong time left, so the
  // difference is measured on every read and the clock is shown in server time.
  const clockOffsetRef = useRef(0);

  // Only the most recent read may land. A poll that set off before a score was
  // recorded, and came back after, would otherwise put the old score back on
  // screen until the next poll.
  const fetchGenerationRef = useRef(0);

  const fetchTournamentData = useCallback(async () => {
    if (typeof window === "undefined") return;
    const generation = ++fetchGenerationRef.current;
    try {
      // Read the id from the route rather than by slicing the pathname: the
      // page used to live at /tournaments/view, where that slice produced
      // "view" and the page bailed, which is why every tournament link 404'd.
      const id = routeId;
      if (!id) return;

      const responses = await Promise.allSettled([
        readBackendJson<any>(`/tournaments/${id}`),
        readBackendJson<any>(`/tournaments/${id}/bracket`),
        readBackendJson<any>(`/tournaments/${id}/participants`),
        readBackendJson<any>("/user/profile"),
        readBackendJson<TournamentState>(`/engine/tournaments/${id}/state`),
      ]);
      if (generation !== fetchGenerationRef.current) return;

      setData({ responses, id });
      // A failure here used to leave engineState null and say nothing, so the
      // arena simply never appeared and there was no way to tell why.
      if (responses[4].status === "fulfilled") {
        const state = responses[4].value.payload;
        if (typeof state?.serverTime === "number") {
          clockOffsetRef.current = state.serverTime - nowSeconds();
          setCurrentTime(nowSeconds() + clockOffsetRef.current);
        }
        setEngineState(state);
        setEngineError(null);
      } else {
        const reason = responses[4].reason;
        setEngineError(reason instanceof Error ? reason.message : String(reason));
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    fetchTournamentData();
    const interval = setInterval(fetchTournamentData, 3000);
    const timeInterval = setInterval(() => setCurrentTime(nowSeconds() + clockOffsetRef.current), 1000);
    return () => {
      clearInterval(interval);
      clearInterval(timeInterval);
    };
  }, [fetchTournamentData]);

  /** Show a match the server just returned without waiting for the next poll. */
  const mergeMatch = useCallback((match: ArenaMatch) => {
    setEngineState((prev) =>
      prev ? { ...prev, matches: prev.matches.map((m) => (m.id === match.id ? { ...m, ...match } : m)) } : prev
    );
  }, []);

  if (error) return <div className="page"><div className="shell">Error loading tournament</div></div>;
  // A first read that was overtaken by a newer one leaves nothing to show yet.
  if (loading || !data) return <div className="page"><div className="shell">Loading...</div></div>;
  
  const { responses, id } = data;
  const tournamentRes = responses[0];
  if (tournamentRes.status === "rejected") throw tournamentRes.reason;
  
  const tournament = tournamentRes.value.payload.tournament;
  if (!tournament) return <div className="page"><div className="shell">Not Found</div></div>;

  const profileData = responses[3].status === "fulfilled" ? responses[3].value.payload : null;
  const isHost = profileData?.ok && profileData?.user?.id === tournament.hostId;

  // Who has actually joined. Distinct from engine teams, which only exist once
  // the tournament starts — this is the entry list.
  const participants: any[] =
    responses[2].status === "fulfilled" ? responses[2].value.payload?.participants || [] : [];
  const hasStarted = !!engineState && engineState.phase !== "open" && engineState.phase !== "SETUP";

  const hostEntry = participants.find((p) => p.userId === tournament.hostId);
  const hostName = hostEntry?.name || hostEntry?.teamName || null;

  const isFootball = tournament.sport === "FOOTBALL";
  const feePercent = tournament.platformFeePercent ?? 7;
  const pool = Number(tournament.prizePool?.amount ?? 0);
  // What the winner actually receives once the platform takes its cut.
  const winnerTakes = Math.max(0, Math.round(pool * (1 - feePercent / 100)));

  const formatLabel =
    ({
      single_elimination: "Single Elimination",
      double_elimination: "Double Elimination",
      round_robin: "Round Robin",
      group_knockout: "Group + Knockout",
    } as Record<string, string>)[tournament.bracketType] || tournament.bracketType;

  // The same rules Quick Tournament plays, which the engine now enforces.
  const rules = isFootball
    ? [
        "Every goal counts one. The higher score when the clock stops wins.",
        "The host records goals live as they happen.",
        "A level group match is a draw. A level knockout match goes to a golden goal.",
      ]
    : [
        "A potted ball scores 10. The black, after all seven of your balls, scores 30 and wins the match.",
        "Potting the black before your seven balls loses the match.",
        "A foul costs the player who commits it 5 points.",
        "If the clock runs out, the higher score wins. A level group match is a draw worth +50 to each side; a level knockout match goes to sudden death.",
      ];

  const startTournament = async () => {
    const res = await backendFetch(`/engine/tournaments/${id}/start`, { method: "POST" });
    if (!res.ok) {
      let message = "Could not start the tournament.";
      try {
        const body: any = await res.json();
        if (body?.message) message = body.message;
      } catch {
        /* non-JSON error */
      }
      setStartError(message);
      return;
    }
    setStartError(null);
    fetchTournamentData();
  };

  return (
    <main className="page">
      <div className="shell">
        
        {/* Tournament Header */}
        <div className="panel page-card slide-in" style={{ marginBottom: "1.5rem", position: "relative", overflow: "hidden" }}>
          {/* The prize is why anyone is here, so let it colour the header. */}
          <div
            aria-hidden
            style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: "radial-gradient(120% 140% at 100% 0%, rgba(245,158,11,0.10), transparent 60%)",
            }}
          />

          <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1.5rem" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                <span className={`status-badge ${tournament.status}`}>{tournament.status.toUpperCase()}</span>
                <span className="status-badge" style={{ background: "rgba(59,130,246,0.12)", color: "#60a5fa" }}>
                  {isFootball ? "FOOTBALL" : "8-BALL"}
                </span>
                <span className="status-badge" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}>
                  {formatLabel}
                </span>
                <span
                  className="status-badge"
                  style={
                    tournament.tournamentType === "offline"
                      ? { background: "rgba(245,158,11,0.12)", color: "var(--gold)" }
                      : { background: "rgba(16,185,129,0.12)", color: "#10b981" }
                  }
                >
                  {tournament.tournamentType === "offline" ? "📍 PLAYED OFFLINE" : "💻 PLAYED ONLINE"}
                </span>
                {tournament.isPrivate && (
                  <span className="status-badge" style={{ background: "rgba(239, 68, 68, 0.1)", color: "#ef4444" }}>PRIVATE</span>
                )}
              </div>

              {/* A week of a season should say so, and lead back to it. */}
              {tournament.seriesId && (
                <Link
                  href={`/series/${tournament.seriesId}`}
                  className="muted"
                  style={{ textDecoration: "none", fontSize: "0.78rem", fontWeight: 800, letterSpacing: "1px" }}
                >
                  ← WEEK {tournament.seriesWeek ?? "?"} OF THIS SERIES
                </Link>
              )}

              <h2 style={{ fontSize: "2.4rem", fontWeight: 900, lineHeight: 1.05, margin: 0 }}>{tournament.name}</h2>

              <p className="muted" style={{ marginTop: "0.6rem", fontSize: "0.88rem" }}>
                Hosted by <strong style={{ color: "var(--text)" }}>{hostName || "the organiser"}</strong>
                {isHost && <span style={{ color: "var(--gold)", fontWeight: 800 }}> &middot; that is you</span>}
              </p>
            </div>

            {/* What the winner receives is the headline, not the pool. */}
            <div
              style={{
                textAlign: "right", padding: "1rem 1.4rem", borderRadius: "14px", minWidth: "220px",
                background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.22)",
              }}
            >
              <div style={{ fontSize: "0.62rem", letterSpacing: "1.5px", opacity: 0.7, fontWeight: 800 }}>WINNER TAKES</div>
              <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "var(--gold)", lineHeight: 1.1 }}>
                ₹{winnerTakes.toLocaleString("en-IN")}
              </div>
              <div className="muted" style={{ fontSize: "0.72rem", marginTop: "2px" }}>
                from a ₹{pool.toLocaleString("en-IN")} pool
              </div>
            </div>
          </div>

          <div
            style={{
              position: "relative", display: "grid", gap: "1px", marginTop: "1.75rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "12px", overflow: "hidden",
            }}
          >
            {[
              { label: "ENTRY FEE", value: "₹" + Number(tournament.entryFee?.amount ?? 0).toLocaleString("en-IN") },
              { label: "PRIZE POOL", value: "₹" + pool.toLocaleString("en-IN"), gold: true },
              { label: "PLAYERS", value: `${tournament.joinedPlayers}/${tournament.maxPlayers}` },
              { label: "TEAM SIZE", value: tournament.teamSize > 1 ? `${tournament.teamSize} a side` : "Solo" },
              { label: "PLAYED", value: tournament.tournamentType === "offline" ? "Offline" : "Online" },
            ].map((f) => (
              <div key={f.label} style={{ padding: "0.9rem 1rem", background: "rgba(9,9,22,0.6)" }}>
                <div style={{ fontSize: "0.6rem", letterSpacing: "1px", opacity: 0.5, fontWeight: 800 }}>{f.label}</div>
                <div style={{ fontWeight: 900, marginTop: "3px", color: f.gold ? "var(--gold)" : undefined }}>{f.value}</div>
              </div>
            ))}
          </div>

          <div className="cta-row" style={{ marginTop: "2rem", display: "flex", gap: "1rem" }}>
            <JoinTournamentButton tournamentId={id} isPrivate={tournament.isPrivate} />
            <ShareTournament tournamentId={id} tournamentName={tournament.name} />
          </div>
        </div>

        {/* THE ARENA — the same one Quick Tournament runs, once play starts.
            It is shown to everyone; only the host is handed the controls. */}
        {engineError && (
          <div
            className="glass-morphism"
            style={{ padding: "1.25rem 1.5rem", marginBottom: "1.5rem", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            <strong style={{ color: "#ef4444" }}>The arena could not be loaded.</strong>
            <p className="muted" style={{ fontSize: "0.82rem", margin: "0.5rem 0 0" }}>{engineError}</p>
          </div>
        )}

        {hasStarted && engineState && (
          <HostedArena
            tournamentId={id}
            tournamentName={tournament.name}
            isHost={!!isHost}
            isFootball={isFootball}
            phase={engineState.phase}
            teams={engineState.teams}
            matches={engineState.matches}
            matchesPerTeam={engineState.matchesPerTeam ?? 2}
            arenaId={engineState.arenaId ?? ""}
            published={!!engineState.published}
            currentTime={currentTime}
            onMatchUpdate={mergeMatch}
            onRefresh={fetchTournamentData}
          />
        )}

        {/* Before the draw there is nothing to rank. Afterwards the arena's
            own standings tab carries it, so this does not repeat it. */}
        {!hasStarted && (
          <div className="panel page-card" style={{ marginBottom: "1.5rem" }}>
            <h2 className="section-heading">Standings</h2>
            <p className="muted" style={{ fontSize: '0.88rem', margin: 0 }}>
              Standings appear once the host starts the tournament and the first fixtures are drawn.
            </p>
          </div>
        )}

        {/* HOW IT WORKS — the rules and where the money goes */}
        <div
          style={{
            display: "grid", gap: "1.5rem", marginTop: "1.5rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          }}
        >
          <div className="glass-morphism" style={{ padding: "1.75rem" }}>
            <h2 className="section-heading">{isFootball ? "Football rules" : "8-Ball rules"}</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.8rem" }}>
              {rules.map((r) => (
                <li key={r} style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "0.88rem", lineHeight: 1.5 }}>
                  <span style={{ color: "var(--gold)", fontWeight: 900 }}>&bull;</span>
                  <span>{r}</span>
                </li>
              ))}
              <li style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "0.88rem", lineHeight: 1.5 }}>
                <span style={{ color: "var(--gold)", fontWeight: 900 }}>&bull;</span>
                <span>
                  {formatLabel}
                  {tournament.teamSize > 1 ? `, ${tournament.teamSize} a side.` : ", played solo."}
                </span>
              </li>
            </ul>
          </div>

          <div className="glass-morphism" style={{ padding: "1.75rem" }}>
            <h2 className="section-heading">Where the money goes</h2>

            {[
              { label: `Entry fee, per player`, value: "₹" + Number(tournament.entryFee?.amount ?? 0).toLocaleString("en-IN") },
              { label: `${tournament.joinedPlayers} joined so far`, value: "₹" + pool.toLocaleString("en-IN"), muted: true },
              { label: `Platform fee (${feePercent}%)`, value: "-₹" + (pool - winnerTakes).toLocaleString("en-IN"), muted: true },
            ].map((row) => (
              <div
                key={row.label}
                style={{
                  display: "flex", justifyContent: "space-between", gap: "1rem",
                  padding: "0.6rem 0", fontSize: "0.86rem",
                  color: row.muted ? "var(--text-muted)" : undefined,
                }}
              >
                <span>{row.label}</span>
                <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{row.value}</span>
              </div>
            ))}

            <div
              style={{
                display: "flex", justifyContent: "space-between", gap: "1rem",
                marginTop: "0.6rem", paddingTop: "0.9rem",
                borderTop: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <span style={{ fontWeight: 900 }}>Winner takes</span>
              <span style={{ fontWeight: 900, color: "var(--gold)", fontVariantNumeric: "tabular-nums" }}>
                ₹{winnerTakes.toLocaleString("en-IN")}
              </span>
            </div>

            <p className="muted" style={{ fontSize: "0.74rem", marginTop: "0.9rem", lineHeight: 1.5 }}>
              The pool grows as more players join, so this figure rises until entries close.
            </p>
          </div>
        </div>

        {/* ENTRY LIST — who has joined, before and after the draw */}
        <div className="glass-morphism" style={{ padding: '1.75rem', marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
            <h2 className="section-heading" style={{ margin: 0 }}>
              Players joined <span style={{ opacity: 0.6 }}>({participants.length}/{tournament.maxPlayers})</span>
            </h2>
            {isHost && !hasStarted && (
              <button
                className="button button-gold"
                onClick={startTournament}
                disabled={participants.length < 2}
                title={participants.length < 2 ? "At least two players must join" : "Close entries and draw the fixtures"}
              >
                START TOURNAMENT
              </button>
            )}
          </div>

          {startError && (
            <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem' }}>{startError}</p>
          )}

          {participants.length === 0 ? (
            <p className="muted" style={{ fontSize: '0.9rem' }}>
              Nobody has joined yet. Share the link above to fill the lobby.
            </p>
          ) : (
            <table className="leaderboard-table">
              <thead><tr><th>#</th><th>PLAYER</th><th>USER ID</th><th>STATUS</th></tr></thead>
              <tbody>
                {participants.map((p, i) => (
                  <tr key={p.userId}>
                    <td style={{ padding: '1rem' }}>{i + 1}</td>
                    <td style={{ fontWeight: 900 }}>
                      {p.teamName || p.name || "Player"}
                      {p.userId === tournament.hostId && (
                        <span
                          style={{
                            marginLeft: "8px", padding: "2px 8px", borderRadius: "5px",
                            fontSize: "0.6rem", fontWeight: 900, letterSpacing: "0.5px",
                            background: "rgba(245,158,11,0.15)", color: "var(--gold)",
                          }}
                        >
                          HOST
                        </span>
                      )}
                      {p.userId === profileData?.user?.id && (
                        <span
                          style={{
                            marginLeft: "6px", padding: "2px 8px", borderRadius: "5px",
                            fontSize: "0.6rem", fontWeight: 900, letterSpacing: "0.5px",
                            background: "rgba(59,130,246,0.15)", color: "#60a5fa",
                          }}
                        >
                          YOU
                        </span>
                      )}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', opacity: 0.7 }}>{p.userId}</td>
                    <td style={{ color: 'var(--accent-primary)' }}>{(p.status || 'joined').toUpperCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {isHost && !hasStarted && participants.length >= 2 && (
            <p className="muted" style={{ fontSize: '0.78rem', marginTop: '1rem' }}>
              Starting closes entries, turns everyone here into a competitor and draws the fixtures.
            </p>
          )}
        </div>

        {/* RESET BUTTON (Host Only) */}
        {isHost && (
          <div style={{ marginTop: '4rem', textAlign: 'center' }}>
            <DeleteTournamentDialog tournamentId={id} tournamentName={tournament.name} />
          </div>
        )}
      </div>
    </main>
  );
}
