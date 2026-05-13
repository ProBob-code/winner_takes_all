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

export const ScorersList = ({ goals, teamId }: { goals: any[], teamId: string }) => {
  const teamGoals = goals.filter(g => g.teamId === teamId).sort((a, b) => a.minute - b.minute);
  if (teamGoals.length === 0) return null;
  return (
    <div className="scorers-list">
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
  teamId: string;
  onGoalClick?: () => void;
  onUndoGoal?: () => void;
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
  teamId,
  onGoalClick,
  onUndoGoal,
  isLocked,
  onClick
}: FootballTeamPodProps) => {
  const hexColor = color === "red" ? "#ef4444" : "#3b82f6";
  
  return (
    <div className={`team-pod football ${color} ${isActive ? 'active' : ''}`} onClick={onClick}>
      <div className="pod-inner">
        <div className="pod-header">
          <div className="team-initials">{teamName.substring(0, 2).toUpperCase()}</div>
          <div className="team-title-stack">
            <h3 className="team-name">{teamName}</h3>
          </div>
        </div>
        <div className="pod-score-large">{score}</div>
        
        <div className="football-stats">
          <StatBar label="POSSESSION" value={possession} color={hexColor} />
          <StatBar label="PASSING ACC." value={passing} color={hexColor} />
        </div>

        <ScorersList goals={goals} teamId={teamId} />

        {!isLocked && (
          <div className="pod-actions mt-4">
            <button className="pod-btn goal-btn" onClick={(e) => { e.stopPropagation(); onGoalClick?.(); }}>+ GOAL</button>
            {score > 0 && <button className="pod-btn undo-btn" onClick={(e) => { e.stopPropagation(); onUndoGoal?.(); }}>UNDO</button>}
          </div>
        )}
      </div>
      <div className="active-glow" style={{ background: hexColor, opacity: 0.2 }}></div>
    </div>
  );
};
