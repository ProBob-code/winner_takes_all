"use client";

import { useState, useEffect, useRef } from "react";

type BallType = "solids" | "stripes" | "black";

interface PlayerState {
  name: string;
  balls: number[];
  score: number;
}

interface OfflineTrackerProps {
  player1Name?: string;
  player2Name?: string;
  isTournamentMatch?: boolean;
  matchId?: string;
  player1Id?: string;
  player2Id?: string;
}

export function OfflineTracker({
  player1Name,
  player2Name,
  isTournamentMatch,
  matchId,
  player1Id,
  player2Id
}: OfflineTrackerProps = {}) {
  const [player1, setPlayer1] = useState<PlayerState>({ name: player1Name || "Player 1", balls: [], score: 0 });
  const [player2, setPlayer2] = useState<PlayerState>({ name: player2Name || "Player 2", balls: [], score: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignedType, setAssignedType] = useState<{ player1?: "solids" | "stripes"; player2?: "solids" | "stripes" }>({});
  const [remainingBalls, setRemainingBalls] = useState<number[]>(Array.from({ length: 15 }, (_, i) => i + 1));
  const [timer, setTimer] = useState(600);
  const [initialTimer, setInitialTimer] = useState(600);
  const [isRunning, setIsRunning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<1 | 2>(1);
  const [history, setHistory] = useState<any[]>([]);
  const [showResetBanner, setShowResetBanner] = useState(false);
  const alarmRef = useRef<HTMLAudioElement | null>(null);

  // Load state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem("wta_offline_pool_state");
    if (savedState) {
      const parsed = JSON.parse(savedState);
      setPlayer1(parsed.player1);
      setPlayer2(parsed.player2);
      setRemainingBalls(parsed.remainingBalls);
      setAssignedType(parsed.assignedType);
      setTimer(parsed.timer);
      setInitialTimer(parsed.initialTimer);
      setCurrentPlayer(parsed.currentPlayer);
      setWinner(parsed.winner);
    }
    
    // Initialize audio on mount
    alarmRef.current = new Audio("/sounds/ding.wav");
    if (alarmRef.current) {
        alarmRef.current.loop = true;
    }
  }, []);

  // Save state to localStorage on change
  useEffect(() => {
    const state = {
      player1,
      player2,
      remainingBalls,
      assignedType,
      timer,
      initialTimer,
      currentPlayer,
      winner
    };
    localStorage.setItem("wta_offline_pool_state", JSON.stringify(state));
  }, [player1, player2, remainingBalls, assignedType, timer, initialTimer, currentPlayer, winner]);

  // Timer logic
  useEffect(() => {
    if (!isRunning || winner) return;

    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          playAlarm();
          handleEndGame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, winner]);

  // Handle sudden winner (8-ball) to stop alarm if it was somehow running
  useEffect(() => {
    if (winner && winner !== "Draw" && timer > 0) {
        // Not a timer end, so no alarm needed yet? 
        // User said "time buzer should be loud and continuous"
        // I'll keep it simple: alarm is for timer end.
    }
  }, [winner]);

  const playAlarm = () => {
    if (alarmRef.current) {
        alarmRef.current.currentTime = 0;
        alarmRef.current.volume = 1.0;
        alarmRef.current.play().catch(e => console.error("Audio play failed:", e));
    }
  };

  const stopAlarm = () => {
    if (alarmRef.current) {
        alarmRef.current.pause();
        alarmRef.current.currentTime = 0;
    }
  };

  const handleBallClick = (ball: number) => {
    if (!remainingBalls.includes(ball) || winner) return;

    // Special Rule: 8-ball pots
    if (ball === 8) {
        setWinner(currentPlayer === 1 ? player2.name : player1.name);
        setIsRunning(false);
        setRemainingBalls(remainingBalls.filter(b => b !== ball));
        const newBalls = currentPlayer === 1 ? [...player1.balls, 8] : [...player2.balls, 8];
        if (currentPlayer === 1) setPlayer1({ ...player1, balls: newBalls, score: newBalls.length });
        else setPlayer2({ ...player2, balls: newBalls, score: newBalls.length });
        return;
    }

    const ballType: BallType = ball <= 7 ? "solids" : "stripes";
    
    setHistory([...history, { 
      player1: { ...player1 }, 
      player2: { ...player2 }, 
      remainingBalls: [...remainingBalls],
      assignedType: { ...assignedType }
    }]);

    let newP1 = { ...player1 };
    let newP2 = { ...player2 };
    let newAssigned = { ...assignedType };

    if (!newAssigned.player1 && !newAssigned.player2) {
      if (currentPlayer === 1) {
        newAssigned.player1 = ballType;
        newAssigned.player2 = ballType === "solids" ? "stripes" : "solids";
      } else {
        newAssigned.player2 = ballType;
        newAssigned.player1 = ballType === "solids" ? "stripes" : "solids";
      }
    }

    if (currentPlayer === 1) {
      newP1.balls.push(ball);
      newP1.score = newP1.balls.length;
      setPlayer1(newP1);
    } else {
      newP2.balls.push(ball);
      newP2.score = newP2.balls.length;
      setPlayer2(newP2);
    }

    setAssignedType(newAssigned);
    setRemainingBalls(remainingBalls.filter(b => b !== ball));

    if (remainingBalls.length === 1) {
        handleEndGame();
    }
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setPlayer1(last.player1);
    setPlayer2(last.player2);
    setRemainingBalls(last.remainingBalls);
    setAssignedType(last.assignedType);
    setHistory(history.slice(0, -1));
  };

  const handleReset = () => {
    setShowResetBanner(true);
  };

  const confirmReset = () => {
    const initialState = {
      player1: { name: "Player 1", balls: [], score: 0 },
      player2: { name: "Player 2", balls: [], score: 0 },
      remainingBalls: Array.from({ length: 15 }, (_, i) => i + 1),
      assignedType: {},
      timer: initialTimer,
      isRunning: false,
      winner: null,
      currentPlayer: 1,
      history: []
    };
    setPlayer1(initialState.player1);
    setPlayer2(initialState.player2);
    setRemainingBalls(initialState.remainingBalls);
    setAssignedType(initialState.assignedType);
    setTimer(initialState.timer);
    setIsRunning(initialState.isRunning);
    setWinner(initialState.winner);
    setCurrentPlayer(initialState.currentPlayer as 1 | 2);
    setHistory(initialState.history);
    stopAlarm();
    setShowResetBanner(false);
    localStorage.removeItem("wta_offline_pool_state");
  };

  const handleEndGame = async () => {
    setIsRunning(false);
    let winningPlayerName = "Draw";
    let winnerIdToSubmit = null;

    if (player1.score > player2.score) {
      winningPlayerName = player1.name;
      winnerIdToSubmit = player1Id;
    } else if (player2.score > player1.score) {
      winningPlayerName = player2.name;
      winnerIdToSubmit = player2Id;
    }

    setWinner(winningPlayerName);

    if (isTournamentMatch && matchId) {
      setIsSubmitting(true);
      try {
        await fetch(`/api/matches/${matchId}/submit-score`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            player1Score: player1.score, 
            player2Score: player2.score,
            winnerId: winnerIdToSubmit 
          }),
        });
        // Also auto-approve if possible, or wait for host.
        // For now, just submit scores.
      } catch (err) {
        console.error("Failed to submit tournament scores:", err);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getBallColor = (num: number) => {
    const colors = [
      "", "#ffcc00", "#0066cc", "#cc0000", "#660099", "#ff6600", "#009933", "#993300", 
      "#000000", "#ffcc00", "#0066cc", "#cc0000", "#660099", "#ff6600", "#009933", "#993300"
    ];
    return colors[num];
  };

  return (
    <div className="ultimate-tracker-deck animate-in">
      <div className="arena-background">
        <div className="felt-texture"></div>
        <div className="table-glare"></div>
      </div>

      {showResetBanner && (
        <div className="reset-banner slide-down">
          <span className="banner-text">RESET ENTIRE MATCH SESSION?</span>
          <div className="banner-actions">
            <button className="banner-btn confirm" onClick={confirmReset}>RESET</button>
            <button className="banner-btn cancel" onClick={() => setShowResetBanner(false)}>CANCEL</button>
          </div>
        </div>
      )}

      {winner && (
        <div className="winner-overlay">
          <div className="winner-content slide-up">
            <div className="victory-glow"></div>
            <div className="winner-icon">🏆</div>
            <h2 className="winner-title">{winner === "Draw" ? "IT'S A DRAW!" : `${winner} WINS!`}</h2>
            <div className="winner-actions">
                {!isTournamentMatch && <button className="button button-primary" onClick={confirmReset}>REMATCH</button>}
                <button className="button button-secondary" onClick={() => { setWinner(null); stopAlarm(); }}>{isTournamentMatch ? "VIEW BRACKET" : "EXIT"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Holographic HUD */}
      <div className="holographic-hud">
        <div className="hud-panel timer-hud">
          <div className="hud-label">
            <span className="scanline"></span>
            SESSION_CLOCK
          </div>
          <div className="hud-value timer-value">{formatTime(timer)}</div>
          <div className="hud-controls">
            <button className={`hud-btn ${isRunning ? "pause" : "start"}`} onClick={() => setIsRunning(!isRunning)}>
                {isRunning ? "PAUSE_SYSTEM" : "START_ENGINE"}
            </button>
            <div className="hud-input-group">
                <input 
                  type="number" 
                  className="hud-input"
                  value={initialTimer / 60}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) * 60;
                    if (!isNaN(val)) { setTimer(val); setInitialTimer(val); }
                  }}
                  disabled={isRunning}
                />
                <span className="hud-unit">M</span>
            </div>
          </div>
        </div>

        <div className="hud-panel action-hud">
            <button className="hud-util-btn" onClick={handleUndo} disabled={history.length === 0}>
                UNDO_MOVE
            </button>
            <button className="hud-util-btn danger" onClick={handleReset}>
                RESET_CORE
            </button>
        </div>
      </div>

      {/* New Player Arena Console */}
      <div className="player-arena-console">
          <div className={`player-pod p1 ${currentPlayer === 1 ? "focused" : ""}`} onClick={() => !winner && setCurrentPlayer(1)}>
              <div className="pod-header">
                  <div className="player-tag">{assignedType.player1 || "UNASSIGNED"}</div>
                  <input 
                    className="player-name-field" 
                    value={player1.name} 
                    onChange={e => !isTournamentMatch && setPlayer1({...player1, name: e.target.value})} 
                    readOnly={isTournamentMatch}
                  />
              </div>
              <div className="pod-score">{player1.score}</div>
              <div className="pod-status">{currentPlayer === 1 ? "ACTIVE_POD" : "STANDBY"}</div>
          </div>

          <div className="console-divider">
              <div className="divider-orb">VS</div>
              <div className="divider-line"></div>
          </div>

          <div className={`player-pod p2 ${currentPlayer === 2 ? "focused" : ""}`} onClick={() => !winner && setCurrentPlayer(2)}>
              <div className="pod-header">
                  <div className="player-tag">{assignedType.player2 || "UNASSIGNED"}</div>
                  <input 
                    className="player-name-field" 
                    value={player2.name} 
                    onChange={e => !isTournamentMatch && setPlayer2({...player2, name: e.target.value})} 
                    readOnly={isTournamentMatch}
                  />
              </div>
              <div className="pod-score">{player2.score}</div>
              <div className="pod-status">{currentPlayer === 2 ? "ACTIVE_POD" : "STANDBY"}</div>
          </div>
      </div>

      <div className="arena-floor">
        <div className="ball-tray-container">
          <div className="tray-emboss">
            <div className="rack-triangle">
               {[
                 [1],
                 [2, 9],
                 [3, 8, 10],
                 [4, 11, 15, 5],
                 [6, 12, 14, 13, 7]
               ].map((row, idx) => (
                 <div key={idx} className="rack-row">
                   {row.map(num => {
                     const isPotted = !remainingBalls.includes(num);
                     return (
                       <div 
                          key={num}
                          className={`hyper-ball ${isPotted ? "potted" : ""} ${num > 8 ? "striped" : ""}`}
                          style={{ "--ball-color": getBallColor(num) } as any}
                          onClick={() => handleBallClick(num)}
                       >
                         <div className="ball-surface"></div>
                         <div className="ball-reflections"></div>
                         <div className="ball-core">{num}</div>
                         <div className="ball-shadow"></div>
                       </div>
                     );
                   })}
                 </div>
               ))}
            </div>
          </div>
        </div>

        <div className="collection-aisle">
            <div className="collector-dock p1">
                <div className="dock-label">{player1.name} POD</div>
                <div className="docked-balls">
                    {player1.balls.map(num => (
                        <div key={num} className={`dock-ball ${num > 8 ? "striped" : ""}`} style={{ "--ball-color": getBallColor(num) } as any}>
                            {num}
                        </div>
                    ))}
                </div>
            </div>
            <div className="collector-dock p2">
                <div className="dock-label">{player2.name} POD</div>
                <div className="docked-balls">
                    {player2.balls.map(num => (
                        <div key={num} className={`dock-ball ${num > 8 ? "striped" : ""}`} style={{ "--ball-color": getBallColor(num) } as any}>
                            {num}
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>

      <style jsx>{`
        .ultimate-tracker-deck {
          position: relative;
          min-height: 800px;
          background: #05050a;
          border-radius: 40px;
          margin: 2rem auto;
          max-width: 1300px;
          padding: 3rem;
          overflow: hidden;
          box-shadow: 0 50px 100px rgba(0,0,0,0.8);
          font-family: 'Inter', sans-serif;
          perspective: 1000px;
        }

        /* Part 1: Arena Base */
        .arena-background {
          position: absolute;
          inset: 0;
          z-index: 0;
        }

        .felt-texture {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, #0a4d3c 0%, #05261e 100%);
          opacity: 0.9;
        }

        .felt-texture::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3%3Cfilter id='noiseFilter'%3%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3%3C/filter%3%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3%3C/svg%3");
          opacity: 0.05;
          mix-blend-mode: overlay;
        }

        .table-glare {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 50%);
          pointer-events: none;
        }

        /* Part 2: Holographic HUD */
        .holographic-hud {
          position: relative;
          z-index: 10;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          margin-bottom: 2rem;
          width: 100%;
        }

        .hud-panel {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 1.5rem;
          position: relative;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0,0,0,0.4);
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        /* Part 3: Player Arena Console */
        .player-arena-console {
          position: relative;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 2rem;
          margin-bottom: 3rem;
          width: 100%;
        }

        .player-pod {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 30px;
          padding: 2rem;
          width: 320px;
          transition: 0.5s cubic-bezier(0.23, 1, 0.32, 1);
          cursor: pointer;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
        }

        .player-pod::after {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, var(--glow-color, transparent) 0%, transparent 70%);
          opacity: 0;
          transition: 0.5s;
        }

        .player-pod.focused {
          background: rgba(255, 255, 255, 0.05);
          border-color: var(--accent-color, #fff);
          transform: translateY(-10px);
          box-shadow: 0 20px 50px rgba(0,0,0,0.4), 0 0 30px var(--glow-color);
        }

        .player-pod.focused::after { opacity: 0.2; }

        .player-pod.p1 { --accent-color: #00ffcc; --glow-color: rgba(0, 255, 204, 0.2); }
        .player-pod.p2 { --accent-color: #ff00ff; --glow-color: rgba(255, 0, 255, 0.2); }

        .pod-header {
          text-align: center;
          z-index: 5;
        }

        .pod-score {
          font-family: 'Outfit', sans-serif;
          font-size: 5rem;
          font-weight: 900;
          color: white;
          line-height: 1;
          text-shadow: 0 0 30px rgba(255,255,255,0.2);
          z-index: 5;
        }

        .pod-status {
          font-size: 0.6rem;
          font-weight: 900;
          letter-spacing: 3px;
          color: var(--accent-color, rgba(255,255,255,0.3));
          text-transform: uppercase;
          z-index: 5;
        }

        .console-divider {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
          opacity: 0.3;
        }

        .divider-orb {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          border: 1px solid white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          font-weight: 900;
          color: white;
        }

        .divider-line {
          width: 2px;
          height: 80px;
          background: linear-gradient(to bottom, transparent, white, transparent);
        }

        .hud-panel::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(0, 255, 204, 0.5), transparent);
          animation: slideX 3s infinite;
        }

        @keyframes slideX {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        .hud-label {
          font-size: 0.6rem;
          font-weight: 900;
          color: rgba(0, 255, 204, 0.6);
          letter-spacing: 3px;
          margin-bottom: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .scanline {
          width: 10px;
          height: 2px;
          background: #00ffcc;
          box-shadow: 0 0 10px #00ffcc;
        }

        .hud-value {
          font-family: 'Outfit', sans-serif;
          font-size: 3.5rem;
          font-weight: 800;
          color: white;
          text-shadow: 0 0 20px rgba(255,255,255,0.2);
          line-height: 1;
          margin-bottom: 1.5rem;
        }

        .hud-controls {
          display: flex;
          gap: 1rem;
          align-items: center;
        }

        .hud-btn {
          flex: 1;
          padding: 0.75rem;
          border-radius: 12px;
          border: 1px solid rgba(0, 255, 204, 0.3);
          background: rgba(0, 255, 204, 0.1);
          color: #00ffcc;
          font-weight: 800;
          font-size: 0.7rem;
          cursor: pointer;
          transition: 0.3s;
          text-transform: uppercase;
        }

        .hud-btn:hover {
          background: #00ffcc;
          color: black;
          box-shadow: 0 0 20px rgba(0, 255, 204, 0.4);
        }

        .hud-input-group {
          position: relative;
          width: 80px;
        }

        .hud-input {
          width: 100%;
          background: rgba(0,0,0,0.4);
          border: 1px solid rgba(255,255,255,0.1);
          color: white;
          padding: 0.5rem;
          border-radius: 8px;
          font-weight: 800;
          text-align: center;
        }

        .hud-unit {
          position: absolute;
          right: 0.5rem;
          top: 50%;
          transform: translateY(-50%);
          font-size: 0.6rem;
          color: rgba(255,255,255,0.3);
        }

        /* Part 3: Scoreboard HUD */
        .scoreboard-hud {
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 1.5rem;
          gap: 1.5rem;
        }

        .player-box {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 1.5rem;
          padding: 0.75rem 1.25rem;
          border-radius: 15px;
          transition: 0.4s;
          cursor: pointer;
          border: 1px solid transparent;
          min-width: 200px;
        }

        .player-box.focused {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.1);
          box-shadow: 0 0 30px rgba(0, 255, 204, 0.05);
        }

        .player-box.p1.focused { border-color: rgba(0, 150, 255, 0.4); }
        .player-box.p2.focused { border-color: rgba(255, 0, 150, 0.4); }

        .player-tag {
          font-size: 0.55rem;
          text-transform: uppercase;
          letter-spacing: 2px;
          color: rgba(255,255,255,0.4);
          margin-bottom: 0.2rem;
        }

        .player-name-field {
          background: transparent;
          border: none;
          color: white;
          font-weight: 800;
          font-size: 1.25rem;
          width: 100%;
          min-width: 120px;
          outline: none;
        }

        .player-hud-score {
          font-size: 3.5rem;
          font-weight: 900;
          color: white;
          opacity: 0.2;
          transition: 0.3s;
          flex-shrink: 0;
        }

        .player-info {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          min-width: 0;
          flex: 1;
        }

        .focused .player-hud-score {
          opacity: 1;
          color: #00ffcc;
          text-shadow: 0 0 20px rgba(0, 255, 204, 0.5);
        }

        .hud-divider {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          opacity: 0.2;
        }

        .divider-line { width: 1px; height: 30px; background: white; }
        .divider-text { font-size: 0.5rem; font-weight: 900; letter-spacing: 3px; }

        .action-hud {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          justify-content: center;
          padding: 0 1rem;
        }

        .hud-util-btn {
          width: 100%;
          padding: 1rem;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.1);
          color: white;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 2px;
          cursor: pointer;
          transition: 0.3s;
        }
        
        .hud-util-btn:hover:not(:disabled) {
          background: rgba(255,255,255,0.1);
          border-color: #00ffcc;
          box-shadow: 0 0 15px rgba(0, 255, 204, 0.2);
        }
        .hud-util-btn.danger:hover { color: #ff4444; border-color: #ff4444; }

        /* Part 4: Arena Floor & Recessed Tray */
        .arena-floor {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3rem;
          position: relative;
          z-index: 5;
          width: 100%;
        }

        .ball-tray-container {
          position: relative;
          padding: clamp(1.5rem, 5vw, 3rem);
          background: rgba(0,0,0,0.2);
          border-radius: 50px;
          box-shadow: 
            inset 0 10px 40px rgba(0,0,0,0.6),
            0 1px 0 rgba(255,255,255,0.05);
          display: flex;
          justify-content: center;
          width: 100%;
          max-width: 900px;
        }

        .tray-emboss {
          padding: 2.5rem;
          border: 1px solid rgba(255,255,255,0.02);
          border-radius: 40px;
          background: rgba(0,0,0,0.1);
          width: 100%;
          display: flex;
          justify-content: center;
        }

        /* Part 5: Hyper Ball CSS */
        .rack-triangle {
          display: flex;
          flex-direction: column;
          gap: clamp(0.5rem, 1vw, 1.25rem);
          align-items: center;
          width: fit-content;
        }

        .rack-row {
          display: flex;
          gap: 1rem;
        }

        .hyper-ball {
          width: clamp(55px, 6vw, 75px);
          height: clamp(55px, 6vw, 75px);
          background: var(--ball-color);
          border-radius: 50%;
          position: relative;
          cursor: pointer;
          transition: 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          box-shadow: 
            inset -6px -6px 15px rgba(0,0,0,0.7),
            inset 6px 6px 15px rgba(255,255,255,0.2),
            0 15px 30px rgba(0,0,0,0.6);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .hyper-ball::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.2) 0%, transparent 60%);
        }

        .hyper-ball:hover:not(.potted) {
          transform: translateY(-15px) rotate(15deg) scale(1.1);
          box-shadow: 
            inset -6px -6px 15px rgba(0,0,0,0.7),
            inset 6px 6px 15px rgba(255,255,255,0.2),
            0 25px 50px rgba(0,0,0,0.8),
            0 0 30px var(--ball-color);
        }

        .hyper-ball.potted {
          opacity: 0.1;
          scale: 0.8;
          filter: grayscale(1) blur(1px);
          pointer-events: none;
        }

        .ball-core {
          width: 45%;
          height: 45%;
          background: #eee;
          color: #111;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 1.1rem;
          box-shadow: 
            inset 0 2px 5px rgba(0,0,0,0.5),
            0 2px 2px rgba(255,255,255,0.5);
          z-index: 5;
        }

        .hyper-ball.striped::after {
          content: '';
          position: absolute;
          width: 100%;
          height: 44%;
          background: #fff;
          top: 28%;
          left: 0;
          opacity: 0.95;
          mask-image: radial-gradient(circle, transparent 24%, black 25%);
          z-index: 1;
        }

        .ball-reflections {
          position: absolute;
          inset: 10%;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%);
          pointer-events: none;
        }

        /* Collection Dock */
        .collection-aisle {
          display: flex;
          flex-direction: row;
          justify-content: center;
          gap: 2rem;
          width: 100%;
          max-width: 1000px;
        }

        .collector-dock {
          flex: 1;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 30px;
          padding: 1.5rem;
          min-height: 140px;
        }

        .dock-label {
          font-size: 0.65rem;
          font-weight: 900;
          letter-spacing: 3px;
          color: rgba(255,255,255,0.3);
          margin-bottom: 1.5rem;
          text-transform: uppercase;
        }

        .docked-balls {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .dock-ball {
          width: 32px;
          height: 32px;
          background: var(--ball-color);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 900;
          color: white;
          box-shadow: 0 5px 15px rgba(0,0,0,0.4);
        }

        .dock-ball.striped { border: 2px solid white; }

        /* Victory Overlay */
        .winner-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.95);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .victory-glow {
          position: absolute;
          width: 800px;
          height: 800px;
          background: radial-gradient(circle, rgba(0, 255, 204, 0.15) 0%, transparent 70%);
          animation: pulse 4s infinite;
        }

        .winner-content { text-align: center; position: relative; }
        .winner-icon { font-size: 10rem; margin-bottom: 1rem; }
        .winner-title { font-size: 5rem; font-weight: 900; color: white; margin-bottom: 3rem; letter-spacing: -2px; }

        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }

        /* Reset Banner Styles */
        .reset-banner {
          position: absolute;
          top: 1rem;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(255, 68, 68, 0.15);
          backdrop-filter: blur(15px);
          border: 1px solid rgba(255, 68, 68, 0.3);
          border-radius: 12px;
          padding: 0.75rem 1.5rem;
          z-index: 2000;
          display: flex;
          align-items: center;
          gap: 2rem;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }

        .banner-text {
          font-size: 0.7rem;
          font-weight: 800;
          color: #ff4444;
          letter-spacing: 2px;
        }

        .banner-actions {
          display: flex;
          gap: 0.75rem;
        }

        .banner-btn {
          padding: 0.4rem 1rem;
          border-radius: 6px;
          border: none;
          font-size: 0.65rem;
          font-weight: 900;
          cursor: pointer;
          transition: 0.2s;
        }

        .banner-btn.confirm { background: #ff4444; color: white; }
        .banner-btn.cancel { background: rgba(255,255,255,0.1); color: white; }
        .banner-btn:hover { transform: translateY(-1px); filter: brightness(1.1); }

        /* Mobile Optimization */
        @media (max-width: 1200px) {
          .holographic-hud { grid-template-columns: 1fr; gap: 1rem; }
          .player-arena-console { flex-direction: column; gap: 1.5rem; margin-bottom: 2rem; }
          .player-pod { width: 100%; max-width: 400px; padding: 1.5rem; }
          .pod-score { font-size: 4rem; }
          .console-divider { flex-direction: row; width: 100%; justify-content: center; }
          .divider-line { width: 60px; height: 1px; background: linear-gradient(to right, transparent, white, transparent); }
          .arena-floor { grid-template-columns: 1fr; gap: 2rem; }
          .collection-aisle { flex-direction: column; }
          .ultimate-tracker-deck { padding: 1rem; border-radius: 0; margin: 0; width: 100%; max-width: 100vw; }
          .scoreboard-hud { flex-direction: column; gap: 1.5rem; padding: 1.5rem; }
          .hud-value { font-size: 4rem; text-align: center; }
          .hud-controls { justify-content: center; }
          .hud-label { justify-content: center; }
          .ball-tray-container { padding: 1.5rem; border-radius: 30px; }
          .tray-emboss { padding: 1.5rem; border-radius: 20px; }
          .player-name-field { text-align: center; }
          .player-box { flex-direction: column; text-align: center; gap: 1rem; }
        }

        @media (max-width: 600px) {
          .rack-triangle { transform: scale(0.85); }
          .hyper-ball { width: 60px; height: 60px; }
          .winner-title { font-size: 3rem; }
          .player-name-field { font-size: 1.1rem; width: 100px; }
          .player-hud-score { font-size: 2.5rem; }
        }
      `}</style>
    </div>
  );
}
