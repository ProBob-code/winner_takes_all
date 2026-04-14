"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type GameRoomProps = {
  matchId: string;
  accessToken: string;
  userName: string;
  player1Name?: string;
  player2Name?: string;
  player1Id?: string;
  player2Id?: string;
};

type LifelineInfo = { type: string; label: string; icon: string; description: string };

const LIFELINE_META: Record<string, LifelineInfo> = {
  double_or_nothing: { type: "double_or_nothing", label: "Double or Nothing", icon: "🎲", description: "Next pot = 2× pts. Miss = opponent bonus turn (70% success)" },
  steal_turn: { type: "steal_turn", label: "Steal Turn", icon: "⚡", description: "Skip opponent's turn. 30% chance it backfires!" },
  ghost_ball: { type: "ghost_ball", label: "Ghost Ball", icon: "👻", description: "Hide guide lines for BOTH players for 1 shot" },
  pressure_shot: { type: "pressure_shot", label: "Pressure Shot", icon: "⏱️", description: "10s shot clock on opponent. If they pot, 1.5× points" },
  rerack_gambit: { type: "rerack_gambit", label: "Rerack Gambit", icon: "🔄", description: "Force rerack. 50% chance opponent gets break + 10 bonus pts" },
};

export function GameRoom({ 
  matchId, 
  accessToken, 
  userName,
  player1Name,
  player2Name,
  player1Id,
  player2Id
}: GameRoomProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"connecting" | "waiting" | "ready" | "playing" | "finished">("connecting");
  const [myScore, setMyScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [opponentName, setOpponentName] = useState(player2Name || "Opponent");
  const [displayName, setDisplayName] = useState(player1Name || userName);
  const [myLifelines, setMyLifelines] = useState<string[]>([]);
  const [usedLifelines, setUsedLifelines] = useState<string[]>([]);
  const [currentTurn, setCurrentTurn] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);

  // Connect WebSocket
  useEffect(() => {
    const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:8000/ws/match/${matchId}?token=${accessToken}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setStatus("waiting");

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleWsMessage(msg);
    };

    ws.onclose = () => {
      if (status !== "finished") setStatus("connecting");
    };

    return () => { ws.close(); };
  }, [matchId, accessToken]);

  // Sync names once myUserId is set
  useEffect(() => {
    if (myUserId && player1Id) {
      const isP1 = myUserId === player1Id;
      setDisplayName(isP1 ? (player1Name || userName) : (player2Name || userName));
      setOpponentName(isP1 ? (player2Name || "Opponent") : (player1Name || "Opponent"));
    }
  }, [myUserId, player1Id, player1Name, player2Name, userName]);

  // Listen for iframe messages
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || !data.wtaBridge) return;

      if (data.type === "shot_made" && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "shot_made", shotData: data.shotData }));
      } else if (data.type === "ball_potted" && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ball_potted", ballId: data.ballId }));
        setMyScore(data.totalScore);
      } else if (data.type === "turn_end" && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "turn_end" }));
      } else if (data.type === "game_over" && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "game_over", score: data.score }));
        setStatus("finished");
      } else if (data.type === "score_sync") {
        setMyScore(data.myScore);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const handleWsMessage = useCallback((msg: any) => {
    switch (msg.type) {
      case "connected":
        setMyUserId(msg.userId);
        break;

      case "player_joined":
        if (msg.userId !== myUserId) setOpponentName(msg.userName);
        break;

      case "room_ready":
        setStatus("ready");
        const isP1 = msg.player1.id === myUserId;
        setOpponentName(isP1 ? msg.player2.name : msg.player1.name);
        setDisplayName(isP1 ? msg.player1.name : msg.player2.name);
        setMyLifelines(isP1 ? msg.player1.lifelines : msg.player2.lifelines);
        setCurrentTurn(msg.currentTurn);
        // Init game bridge
        iframeRef.current?.contentWindow?.postMessage({
          wtaBridge: true,
          type: "init",
          matchId,
          userId: myUserId,
          playerNumber: isP1 ? 1 : 2,
          lifelines: isP1 ? msg.player1.lifelines : msg.player2.lifelines,
        }, "*");
        
        // AUTO START in tournament context (we are in a match room)
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "start_game" }));
          }
        }, 1000);
        break;

      case "game_started":
        setStatus("playing");
        setCurrentTurn(msg.currentTurn);
        break;

      case "opponent_shot":
        iframeRef.current?.contentWindow?.postMessage({
          wtaBridge: true,
          type: "opponent_shot",
          shotData: msg.shotData,
        }, "*");
        break;

      case "score_update":
        if (msg.userId === myUserId) {
          setMyScore(msg.userId === msg.player1Id ? msg.player1Score : msg.player2Score);
        }
        setOpponentScore(msg.userId !== myUserId ?
          (msg.userId === msg.player1Id ? msg.player1Score : msg.player2Score) : opponentScore);
        break;

      case "turn_change":
        setCurrentTurn(msg.currentTurn);
        break;

      case "lifeline_activated":
        showToast(msg.effect.description);
        if (msg.userId === myUserId) {
          setMyScore(prev => prev + (msg.effect.scoreModifier || 0));
        }
        iframeRef.current?.contentWindow?.postMessage({
          wtaBridge: true,
          type: "lifeline_effect",
          effect: msg.effect,
        }, "*");
        break;

      case "game_finished":
        setStatus("finished");
        setMyScore(msg.player1Score);
        setOpponentScore(msg.player2Score);
        break;

      case "opponent_disconnected":
        showToast("⚠️ Opponent disconnected");
        break;
    }
  }, [myUserId, matchId, opponentScore]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }

  function useLifeline(type: string) {
    if (usedLifelines.includes(type)) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "use_lifeline", lifelineType: type }));
      setUsedLifelines(prev => [...prev, type]);
      setMyLifelines(prev => prev.filter(l => l !== type));
    }
  }

  function startGame() {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "start_game" }));
    }
  }

  async function submitScore() {
    try {
      await fetch(`/api/matches/${matchId}/submit-score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: myScore }),
      });
      setScoreSubmitted(true);
      showToast("✅ Score submitted! Waiting for host approval.");
    } catch {
      showToast("❌ Failed to submit score");
    }
  }

  if (status === "connecting") {
    return (
      <div className="waiting-room">
        <div className="waiting-spinner" />
        <div className="waiting-text">Connecting to match server<span className="waiting-dots" /></div>
      </div>
    );
  }

  if (status === "waiting") {
    return (
      <div className="waiting-room">
        <div className="waiting-spinner" />
        <div className="waiting-text">Waiting for opponent to join<span className="waiting-dots" /></div>
        <p className="muted" style={{ marginTop: "1rem" }}>Match ID: {matchId}</p>
      </div>
    );
  }

  return (
    <div className="game-room">
      {toast && <div className="lifeline-effect-toast">{toast}</div>}

      <div className="game-frame-container">
        {status === "ready" && (
          <div className="waiting-room" style={{ position: "absolute", inset: 0, zIndex: 10, background: "rgba(10,14,26,.95)" }}>
            <h2 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>🎱 Match Ready!</h2>
            <p className="muted" style={{ marginBottom: "1rem" }}>{displayName} vs {opponentName}</p>
            <div className="waiting-spinner" style={{ marginBottom: "1rem" }} />
            <p className="muted">Game starting automatically...</p>
            <button className="button" onClick={startGame} style={{ marginTop: "1rem" }}>Click if not starting...</button>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src="/8ball/index.html"
          className="game-iframe"
          allow="autoplay"
          title="8-Ball Pool"
        />
      </div>

      <div className="game-sidebar">
        <div className="game-score-panel">
          <div style={{ fontSize: ".8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--accent-light)", marginBottom: ".5rem" }}>
            Live Score
          </div>
          <div className="score-display">
            <div className="score-player">
              <div className="score-player-name">{displayName}</div>
              <div className="score-player-value">{myScore}</div>
            </div>
            <div className="score-vs">VS</div>
            <div className="score-player">
              <div className="score-player-name">{opponentName}</div>
              <div className="score-player-value">{opponentScore}</div>
            </div>
          </div>
          {currentTurn && (
            <div className="score-threshold" style={{ color: currentTurn === myUserId ? "var(--green-light)" : "var(--text-muted)" }}>
              {currentTurn === myUserId ? "🟢 Your turn" : "⏳ Opponent's turn"}
            </div>
          )}
        </div>

        {status === "playing" && myLifelines.length > 0 && (
          <div className="lifelines-panel">
            <div className="lifelines-title">⚡ Lifelines</div>
            <div className="lifeline-buttons">
              {myLifelines.map(ll => {
                const meta = LIFELINE_META[ll];
                if (!meta) return null;
                return (
                  <button
                    key={ll}
                    className="lifeline-btn"
                    onClick={() => useLifeline(ll)}
                    title={meta.description}
                  >
                    <span className="lifeline-icon">{meta.icon}</span>
                    {meta.label}
                  </button>
                );
              })}
              {usedLifelines.map(ll => {
                const meta = LIFELINE_META[ll];
                if (!meta) return null;
                return (
                  <button key={`used-${ll}`} className="lifeline-btn used" disabled>
                    <span className="lifeline-icon">{meta.icon}</span>
                    {meta.label} (Used)
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {status === "finished" && (
          <div className="score-submit-panel">
            <h3>🏁 Game Over</h3>
            <div className="score-display">
              <div className="score-player">
                <div className="score-player-name">You</div>
                <div className="score-player-value">{myScore}</div>
              </div>
              <div className="score-vs">-</div>
              <div className="score-player">
                <div className="score-player-name">{opponentName}</div>
                <div className="score-player-value">{opponentScore}</div>
              </div>
            </div>
            {!scoreSubmitted ? (
              <button className="button-success" onClick={submitScore} style={{ marginTop: "1rem", width: "100%" }}>
                Submit Score ({myScore} pts)
              </button>
            ) : (
              <div className="score-status pending" style={{ marginTop: "1rem" }}>
                ⏳ Pending Host Approval
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
