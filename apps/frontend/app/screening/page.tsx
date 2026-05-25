"use client";

import { useEffect, useState } from "react";
import { getApiUrl } from "@/lib/api-config";
import Link from "next/link";
import "@/components/tournament-engine.css";

export default function ScreeningPage() {
  const [arenas, setArenas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sportFilter, setSportFilter] = useState<"ALL" | "FOOTBALL" | "8BALL">("ALL");
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));

  const fetchArenas = async () => {
    try {
      const finalApiUrl = process.env.NEXT_PUBLIC_API_URL || getApiUrl();
      const res = await fetch(`${finalApiUrl}/api/public-arenas`, {
        cache: "no-store",
        credentials: "include"
      });
      const data = await res.json();
      if (data.ok) {
        setArenas(data.arenas || []);
      }
    } catch (err: any) {
      console.error("Screening fetch error:", err);
      setError(err.message || "Failed to load ongoing multiplex screening");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArenas();
    const interval = setInterval(fetchArenas, 5000);
    const timer = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
      
      setArenas((prev: any[]) => {
        return prev.map((arena: any) => {
          if (!arena.state || !arena.state.matches) return arena;
          const updatedMatches = arena.state.matches.map((m: any) => {
            if (m.status !== 'LIVE' || !m.footballData) return m;
            const fd = m.footballData;
            if (fd.half === 1 && fd.timerSeconds >= Math.floor(m.duration / 2)) {
              return m; // paused
            }
            return {
              ...m,
              footballData: {
                ...fd,
                timerSeconds: fd.timerSeconds + 1
              }
            };
          });
          return {
            ...arena,
            state: {
              ...arena.state,
              matches: updatedMatches
            }
          };
        });
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, []);

  const getFootballTimeDisplay = (match: any) => {
    if (!match.footballData) return "0:00";
    const fd = match.footballData;
    const halfDuration = Math.floor(match.duration / 2);
    
    if (fd.half === 1) {
      if (fd.timerSeconds >= halfDuration) {
        return "HALF TIME";
      }
      const mins = Math.floor(fd.timerSeconds / 60);
      const secs = fd.timerSeconds % 60;
      return `${mins}:${String(secs).padStart(2, '0')}`;
    } else {
      const totalSeconds = halfDuration + fd.timerSeconds;
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return `${mins}:${String(secs).padStart(2, '0')}`;
    }
  };

  if (loading) {
    return (
      <main className="page animate-in">
        <div className="shell" style={{ maxWidth: '1200px' }}>
          <div className="empty-state">
            <div className="empty-icon loading-spin">📺</div>
            <h3 className="glow-text">INITIALIZING MULTIPLEX BROADCAST...</h3>
            <p className="muted mt-4">Tuning into all active spectator stadium feeds</p>
          </div>
        </div>
      </main>
    );
  }

  // Filter and extract all active live matches across all arenas
  const allLiveMatches: any[] = [];
  arenas.forEach((arena: any) => {
    const matches = arena.state?.matches || [];
    const teams = arena.state?.teams || [];
    const isArenaStarted = arena.state?.isStarted;
    if (!isArenaStarted) return;
    
    const activeMatches = matches.filter((m: any) => m.status === 'LIVE' || m.status === 'CREATED');
    
    activeMatches.forEach((m: any) => {
      const getTeamName = (tid: string) => teams.find((t: any) => t.id === tid)?.name || "Unknown Team";
      allLiveMatches.push({
        ...m,
        arenaId: arena.id,
        arenaName: arena.name,
        arenaSport: arena.state?.selectedSport || m.sport,
        teamAName: getTeamName(m.team_a_id),
        teamBName: getTeamName(m.team_b_id),
        teams
      });
    });
  });

  const filteredMatches = allLiveMatches.filter(m => {
    const matchesSport = sportFilter === "ALL" || m.sport === sportFilter;
    const matchesSearch = searchQuery === "" || 
      m.teamAName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      m.teamBName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.arenaName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSport && matchesSearch;
  });

  return (
    <main className="page animate-in">
      <div className="shell" style={{ maxWidth: "1200px", width: "100%", margin: "0 auto" }}>
        
        {/* Header Block */}
        <div className="panel page-card slide-in mb-8" style={{ padding: "2.5rem 3rem", background: "rgba(9, 9, 22, 0.45)", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "20px" }}>
            <div>
              <span className="section-label-v2 mb-2 block glow-text" style={{ fontSize: "0.85rem", letterSpacing: "2px" }}>📺 MULTIPLEX ARENA BROADCAST</span>
              <h1 className="glow-text mb-2" style={{ fontSize: "2.2rem", fontWeight: "900", background: "linear-gradient(to right, #fff, #b59f5b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>LIVE SCREENING</h1>
              <p className="muted" style={{ fontSize: "0.95rem" }}>Spectate ongoing tournaments, track live soccer scorelines, 8-ball clearances, lineups, and strategic pitches in real-time.</p>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <span className="live-pill" style={{ padding: "6px 14px", fontSize: "0.85rem" }}>
                <span className="live-pulse"></span> {allLiveMatches.length} ONGOING GAMES
              </span>
            </div>
          </div>
        </div>

        {/* Filters Panel */}
        <div className="glass-morphism mb-8 animate-in" style={{ padding: "20px 24px", borderRadius: "12px", background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: "15px", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button 
              className={`button ${sportFilter === "ALL" ? "button-gold" : "button-secondary"}`}
              style={{ padding: "8px 16px", fontSize: "0.85rem" }}
              onClick={() => setSportFilter("ALL")}
            >
              🌐 ALL SPORTS
            </button>
            <button 
              className={`button ${sportFilter === "FOOTBALL" ? "button-gold" : "button-secondary"}`}
              style={{ padding: "8px 16px", fontSize: "0.85rem" }}
              onClick={() => setSportFilter("FOOTBALL")}
            >
              ⚽ FOOTBALL
            </button>
            <button 
              className={`button ${sportFilter === "8BALL" ? "button-gold" : "button-secondary"}`}
              style={{ padding: "8px 16px", fontSize: "0.85rem" }}
              onClick={() => setSportFilter("8BALL")}
            >
              🎱 8-BALL
            </button>
          </div>

          <div style={{ position: "relative", minWidth: "300px" }}>
            <input 
              type="text"
              placeholder="Search by team or arena..."
              className="premium-input-v2"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%", padding: "10px 16px", borderRadius: "8px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff" }}
            />
          </div>
        </div>

        {/* Live Grid */}
        {filteredMatches.length > 0 ? (
          <div className="screening-grid animate-in" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "24px" }}>
            {filteredMatches.map((m: any) => {
              const isFootball = (m.sport === 'FOOTBALL') || (m.arenaSport === 'FOOTBALL');
              const isLive = m.status === 'LIVE';
              const timeStr = isLive 
                ? (isFootball ? getFootballTimeDisplay(m) : `${Math.max(0, Math.floor(((m.start_time || 0) + m.duration - currentTime) / 60))}:${String(Math.max(0, ((m.start_time || 0) + m.duration - currentTime) % 60)).padStart(2, '0')}`)
                : 'SCHEDULED';
              
              return (
                <div key={m.id} className="glass-morphism screening-card hover-glow" style={{ padding: '26px', borderRadius: '16px', background: 'rgba(9, 9, 22, 0.45)', border: '1px solid rgba(255,255,255,0.06)', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <span className={isLive ? "live-pill" : ""} style={{ fontSize: '0.75rem', padding: '3px 10px', background: isLive ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: isLive ? '#ef4444' : '#f59e0b', border: `1px solid ${isLive ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`, borderRadius: '6px', fontWeight: 'bold' }}>
                      {isLive && <span className="live-pulse"></span>} {isLive ? 'LIVE' : 'UPCOMING'}
                    </span>
                    <span className="sport-badge" style={{ background: isFootball ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)', color: isFootball ? '#10b981' : '#3b82f6', fontSize: '0.75rem', padding: '3px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)', fontWeight: 'bold' }}>
                      {isFootball ? '⚽ FOOTBALL' : '🎱 8-BALL'}
                    </span>
                  </div>

                  <div style={{ fontSize: "0.8rem", color: "#888", marginBottom: "15px", fontWeight: "bold" }}>
                    🏟️ ARENA: <span style={{ color: "#fff" }}>{m.arenaName}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', margin: '24px 0' }}>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.teamAName}</div>
                      <div style={{ fontSize: '3.2rem', fontWeight: 900, color: 'var(--red)', marginTop: '8px' }}>{m.score_team_a}</div>
                    </div>
                    <div style={{ fontSize: '1.2rem', color: '#555', fontWeight: 'bold', margin: '0 15px' }}>VS</div>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.teamBName}</div>
                      <div style={{ fontSize: '3.2rem', fontWeight: 900, color: 'var(--blue)', marginTop: '8px' }}>{m.score_team_b}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '18px' }}>
                    <span className="time-val" style={{ fontFamily: 'monospace', color: 'var(--gold)', fontWeight: 'bold', fontSize: '1.15rem' }}>⏱️ {timeStr}</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        className="button button-gold button-sm" 
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                        onClick={() => {
                          const specLink = `${window.location.origin}/arena/${m.arenaId}?matchId=${m.id}`;
                          navigator.clipboard.writeText(specLink);
                          alert("Copied specific live match spectator link to clipboard!");
                        }}
                      >
                        🔗 SHARE
                      </button>
                      <Link 
                        href={`/arena/${m.arenaId}?matchId=${m.id}`}
                        className="button button-secondary button-sm" 
                        style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}
                      >
                        🔍 SPECTATE
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="phase-transition-overlay animate-in" style={{ padding: '6rem 0', width: '100%' }}>
            <div className="phase-card glass-morphism text-center" style={{ width: '100%', maxWidth: '550px', margin: '0 auto', padding: "3rem" }}>
              <div className="p-icon" style={{ fontSize: '4rem', marginBottom: "1rem" }}>📺</div>
              <h3 className="glow-text">NO MATCHES LIVE CURRENTLY</h3>
              <p className="muted mt-2">There are no ongoing active tournament stadium broadcasts matches that match your filters.</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
