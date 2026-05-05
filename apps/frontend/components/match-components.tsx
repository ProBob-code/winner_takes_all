"use client";

import React from "react";

export const Ticker = ({ balls, black, color }: { balls: number, black: boolean, color: string }) => (
  <div className="ticker-row">
    {[...Array(7)].map((_, i) => (
      <div key={i} className={`ball-slot ${i < balls ? 'filled' : ''}`} style={{ '--accent-primary': color } as any}>{i + 1}</div>
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
  onBallClick?: () => void;
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
  onBallClick,
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
                  onClick={(e) => { e.stopPropagation(); onFoulClick?.(); }}
                  disabled={isLocked || !onFoulClick}
                >
                  FOUL: {fouls}
                </button>
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
        <Ticker balls={ballsPotted} black={blackPotted} color={hexColor} />
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
