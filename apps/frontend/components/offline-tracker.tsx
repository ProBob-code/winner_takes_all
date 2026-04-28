"use client";

import { useState, useEffect, useRef } from "react";
import "./offline-tracker.css";

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

      
    </div>
  );
}
