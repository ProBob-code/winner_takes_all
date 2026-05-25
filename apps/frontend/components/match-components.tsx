"use client";

import React from "react";

export const Ticker = ({ balls, black, color, onBallClick }: { balls: number, black: boolean, color: string, onBallClick?: (idx: number) => void }) => (
  <div className="ticker-row">
    {[...Array(7)].map((_, i) => (
      <div 
        key={i} 
        className={`ball-slot ${i < balls ? 'filled' : ''} ${onBallClick ? 'clickable' : ''}`} 
        style={{ '--accent-primary': color } as any}
        onClick={(e) => {
          if (i < balls && onBallClick) {
            e.stopPropagation();
            onBallClick(i);
          }
        }}
      >
        {i + 1}
      </div>
    ))}
    <div className={`ball-slot black ${black ? 'filled' : ''}`}>8</div>
  </div>
);

export const VSCore = () => (
  <div className="vs-core">
    <div className="vs-ring"></div>
    <div className="vs-text">VS</div>
  </div>
);

export const StatBar = ({ label, value, color }: { label: string, value: number, color: string }) => (
  <div className="stat-bar-container">
    <div className="stat-bar-label">
      <span>{label}</span>
      <span>{value}%</span>
    </div>
    <div className="stat-bar-bg">
      <div 
        className="stat-bar-fill" 
        style={{ width: `${value}%`, background: color }}
      />
    </div>
  </div>
);

export const ScorersList = ({ goals, teamId, compact }: { goals: any[], teamId: string, compact?: boolean }) => {
  const teamGoals = goals.filter(g => g.teamId === teamId).sort((a, b) => a.minute - b.minute);
  if (teamGoals.length === 0) return null;
  return (
    <div className={`scorers-list ${compact ? 'compact' : ''}`}>
      {teamGoals.map((g, i) => (
        <div key={g.id || i} className="scorer-item">
          <span className="scorer-icon">⚽</span>
          <span className="scorer-name">{g.scorerName}</span>
          <span className="scorer-minute">{g.minute}'</span>
        </div>
      ))}
    </div>
  );
};

export const FootballScoreboard = ({ 
  teamAName, teamBName, scoreA, scoreB, time, status 
}: { 
  teamAName: string, teamBName: string, scoreA: number, scoreB: number, time: string, status: string 
}) => (
  <div className="football-scoreboard-premium">
    <div className="sb-content">
      <div className="sb-side left">
        <div className="sb-team-badge red">⚽</div>
        <span className="sb-team-name">{teamAName}</span>
      </div>
      
      <div className="sb-main">
        <div className="sb-digital-display">
          <span className="digit">{scoreA}</span>
          <span className="divider">:</span>
          <span className="digit">{scoreB}</span>
        </div>
        <div className="sb-meta">
          <span className={`sb-status ${status === 'LIVE' ? 'live' : ''}`}>
            {status === 'LIVE' ? '● LIVE' : status}
          </span>
          <span className="sb-timer">{time}</span>
        </div>
      </div>

      <div className="sb-side right">
        <span className="sb-team-name">{teamBName}</span>
        <div className="sb-team-badge blue">⚽</div>
      </div>
    </div>
    <div className="sb-bottom-glow" />
  </div>
);

const getFormationPositions = (count: number, isTeamB: boolean) => {
  const positions: { left: string, top: string }[] = [];
  
  if (count === 1) {
    positions.push({ left: '25%', top: '50%' });
  } else if (count === 2) {
    positions.push({ left: '10%', top: '50%' }); // GK
    positions.push({ left: '40%', top: '50%' }); // ST
  } else if (count === 3) {
    positions.push({ left: '10%', top: '50%' }); // GK
    positions.push({ left: '25%', top: '50%' }); // MID
    positions.push({ left: '40%', top: '50%' }); // ST
  } else if (count === 4) {
    positions.push({ left: '10%', top: '50%' }); // GK
    positions.push({ left: '25%', top: '30%' }); // MID L
    positions.push({ left: '25%', top: '70%' }); // MID R
    positions.push({ left: '40%', top: '50%' }); // ST
  } else {
    for (let i = 0; i < count; i++) {
      positions.push({ 
        left: `${10 + (i * 30 / count)}%`, 
        top: `${20 + (i * 60 / count)}%` 
      });
    }
  }
  
  if (isTeamB) {
    return positions.map(p => ({
      left: `${100 - parseFloat(p.left)}%`,
      top: p.top
    }));
  }
  
  return positions;
};

export const FootballPossessionPitch = ({ 
  posA, posB, teamAName, teamBName, onPossessionChange
}: { 
  posA: number, posB: number, teamAName: string, teamBName: string, onPossessionChange?: (value: number) => void
}) => {
  return (
    <div className="possession-pitch-premium" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <div className="pitch-surface" style={{ position: 'relative', overflow: 'hidden', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', background: 'linear-gradient(135deg, #0b1a0e, #050d07)' }}>
        <div className="pitch-markings">
          <div className="m-center-circle" />
          <div className="m-center-line" />
          <div className="m-penalty-area left" />
          <div className="m-penalty-area right" />
        </div>
        
        <div className="pos-overlay">
          <div className="pos-segment segment-a" style={{ width: `${posA}%` }}>
            <div className="pos-label">{posA}%</div>
          </div>
          <div className="pos-ball-tracker" style={{ left: `${posA}%` }}>
            <div className="ball-sprite">⚽</div>
            <div className="ball-flare" />
          </div>
          <div className="pos-segment segment-b" style={{ width: `${posB}%` }}>
            <div className="pos-label">{posB}%</div>
          </div>
        </div>
      </div>

      {onPossessionChange && (
        <div className="possession-slider-control" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#888' }}>
            <span>{teamAName} Possession</span>
            <span>{teamBName} Possession</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={posA} 
            onChange={(e) => onPossessionChange(Number(e.target.value))}
            style={{
              width: '100%',
              height: '6px',
              borderRadius: '3px',
              outline: 'none',
              cursor: 'pointer',
              background: `linear-gradient(to right, #ef4444 0%, #ef4444 ${posA}%, #3b82f6 ${posA}%, #3b82f6 100%)`,
              WebkitAppearance: 'none'
            }}
          />
        </div>
      )}

      <div className="pitch-footer">
        <span className="p-team">{teamAName}</span>
        <span className="p-title">FIELD DOMINANCE</span>
        <span className="p-team">{teamBName}</span>
      </div>
    </div>
  );
};

interface TeamPodProps {
  teamName: string;
  score: number;
  color: "red" | "blue";
  isActive?: boolean;
  fouls?: number;
  house?: "SOLID" | "STRIPES";
  ballsPotted?: number;
  blackPotted?: boolean;
  onFoulClick?: () => void;
  onFoulRemove?: () => void;
  onBallClick?: () => void;
  onBallRemove?: () => void;
  onBlackClick?: () => void;
  onHouseToggle?: (house: "SOLID" | "STRIPES") => void;
  isLocked?: boolean;
  onClick?: () => void;
}

export const TeamPod = ({
  teamName,
  score,
  color,
  isActive,
  fouls = 0,
  house,
  ballsPotted = 0,
  blackPotted = false,
  onFoulClick,
  onFoulRemove,
  onBallClick,
  onBallRemove,
  onBlackClick,
  onHouseToggle,
  isLocked,
  onClick
}: TeamPodProps) => {
  const hexColor = color === "red" ? "#ef4444" : "#3b82f6";
  
  return (
    <div className={`team-pod ${color} ${isActive ? 'active' : ''}`} onClick={onClick}>
      <div className="pod-inner">
        <div className="pod-header">
          <div className="team-initials">{teamName.substring(0, 2).toUpperCase()}</div>
          <div className="team-title-stack">
            <h3 className="team-name">{teamName}</h3>
            {(onFoulClick || fouls > 0) && (
              <div className="foul-group">
                <button 
                  className="foul-chip" 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (e.shiftKey && fouls > 0) onFoulRemove?.();
                    else onFoulClick?.(); 
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (fouls > 0) onFoulRemove?.();
                  }}
                  disabled={isLocked}
                >
                  FOUL: {fouls}
                </button>
                {!isLocked && onFoulRemove && fouls > 0 && (
                  <button className="foul-remove-btn" onClick={(e) => { e.stopPropagation(); onFoulRemove(); }}>-</button>
                )}
              </div>
            )}
          </div>
          {house && onHouseToggle && (
            <div className="house-selector" onClick={e => e.stopPropagation()}>
              <button 
                className={`house-opt ${house === 'SOLID' ? 'active' : ''}`} 
                onClick={() => onHouseToggle('SOLID')}
              >
                ●
              </button>
              <button 
                className={`house-opt ${house === 'STRIPES' ? 'active' : ''}`} 
                onClick={() => onHouseToggle('STRIPES')}
              >
                ◐
              </button>
            </div>
          )}
        </div>
        <div className="pod-score-large">{score}</div>
        <Ticker balls={ballsPotted} black={blackPotted} color={hexColor} onBallClick={onBallRemove} />
        {(onBallClick || onBlackClick) && (
          <div className="pod-actions">
            {onBallClick && <button className="pod-btn ball-btn" onClick={(e) => { e.stopPropagation(); onBallClick(); }}>+ BALL</button>}
            {onBlackClick && <button className="pod-btn black-btn" onClick={(e) => { e.stopPropagation(); onBlackClick(); }}>+ BLACK</button>}
          </div>
        )}
      </div>
      <div className="active-glow" style={{ background: hexColor, opacity: 0.2 }}></div>
    </div>
  );
};

interface FootballTeamPodProps {
  teamName: string;
  score: number;
  color: "red" | "blue";
  isActive?: boolean;
  possession: number;
  passing: number;
  goals: any[];
  subs?: any[];
  cards?: any[];
  teamId: string;
  players?: any[];
  captainId?: string;
  onSubClick?: (playerId: string) => void;
  onCardClick?: (playerId: string, cardType: 'YELLOW' | 'RED') => void;
  isLocked?: boolean;
  onClick?: () => void;
}

export const FootballTeamPod = ({
  teamName,
  score,
  color,
  isActive,
  possession,
  passing,
  goals,
  subs = [],
  cards = [],
  teamId,
  players = [],
  captainId,
  onSubClick,
  onCardClick,
  isLocked,
  onClick
}: FootballTeamPodProps) => {
  const hexColor = color === "red" ? "#ef4444" : "#3b82f6";
  
  return (
    <div className={`football-team-card ${color} ${isActive ? 'active' : ''}`} onClick={onClick}>
      <div className="card-top">
        <div className="team-kit">
          <div className="kit-base">👕</div>
          <div className="kit-glow" />
        </div>
        <div className="team-info">
          <h3 className="team-name">{teamName}</h3>
          <span className="team-tag">SQUAD: {players?.length || 0} ON FIELD</span>
        </div>
      </div>

      <div className="score-display-xl">
        <div className="score-num">{score}</div>
        <div className="score-sub">GOALS</div>
      </div>

      <div className="stats-dashboard">
        <div className="dashboard-item">
          <div className="d-label">POSSESSION</div>
          <div className="d-val">{possession}%</div>
          <div className="d-progress"><div className="d-fill" style={{ width: `${possession}%`, background: hexColor }} /></div>
        </div>
        <div className="dashboard-item">
          <div className="d-label">THREAT</div>
          <div className="d-val">{Math.round(possession * 0.8 + score * 5)}%</div>
          <div className="d-progress"><div className="d-fill" style={{ width: `${Math.min(100, possession * 0.8 + score * 5)}%`, background: '#f59e0b' }} /></div>
        </div>
      </div>

      <div className="player-list-section mt-4" style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
        <label className="section-label-v2">PLAYERS</label>
        <div className="player-list">
          {players.map(p => {
            const playerCards = cards.filter(c => c.playerId === p.id);
            return (
              <div key={p.id} className="player-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="player-name-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className="player-name" style={{ color: '#fff', fontWeight: 500 }}>{p.name}</span>
                  {p.id === captainId && <span className="captain-badge" style={{ color: '#f59e0b', fontSize: '0.8rem', fontWeight: 'bold' }}>[C]</span>}
                  <div className="player-cards" style={{ display: 'flex', gap: '2px', marginLeft: '4px' }}>
                    {playerCards.map((c, i) => (
                      <span key={i} title={c.type} style={{ fontSize: '0.75rem' }}>
                        {c.type === 'YELLOW' ? '🟨' : '🟥'}
                      </span>
                    ))}
                  </div>
                </div>
                {!isLocked && (
                  <div className="player-actions" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {onCardClick && (
                      <>
                        <button 
                          style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '4px', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', cursor: 'pointer' }}
                          onClick={(e) => { e.stopPropagation(); onCardClick(p.id, 'YELLOW'); }}
                          title="Yellow Card"
                        >
                          🟨
                        </button>
                        <button 
                          style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '4px', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', cursor: 'pointer' }}
                          onClick={(e) => { e.stopPropagation(); onCardClick(p.id, 'RED'); }}
                          title="Red Card"
                        >
                          🟥
                        </button>
                      </>
                    )}
                    {onSubClick && (
                      <button 
                        className="sub-btn" 
                        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '0.75rem', color: '#aaa', cursor: 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); onSubClick(p.id); }}
                      >
                        SUB
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="subs-list-section mt-4" style={{ background: 'rgba(0,0,0,0.1)', padding: '10px', borderRadius: '8px' }}>
        <label className="section-label-v2">SUBSTITUTIONS</label>
        <div className="subs-list">
          {subs
            .filter(s => s.teamId === teamId)
            .map(s => (
              <div key={s.id} className="sub-item" style={{ fontSize: '0.8rem', color: '#aaa', padding: '2px 0' }}>
                <span className="sub-time" style={{ color: '#f59e0b', fontWeight: 'bold' }}>{s.minute}'</span> 
                {s.playerOutName ? (
                  <>
                    <span className="sub-out" style={{ color: '#ef4444' }}>{s.playerOutName}</span> 
                    {s.playerInName && (
                      <>
                        <span className="sub-arrow"> ➔ </span> 
                        <span className="sub-in" style={{ color: '#10b981' }}>{s.playerInName}</span>
                      </>
                    )}
                  </>
                ) : (
                  <span style={{ color: '#ef4444', fontStyle: 'italic' }}>Sent Off</span>
                )}
              </div>
            ))}
        </div>
      </div>

      <div className="mt-4">
        <ScorersList goals={goals} teamId={teamId} compact />
      </div>

      <div className="card-pitch-texture" />
    </div>
  );
};
