"use client";

import Link from "next/link";
import { useState } from "react";
import { OfflineTracker } from "@/components/offline-tracker";

export default function GamesPage() {
  const [activeTab, setActiveTab] = useState<"arena" | "offline">("arena");

  return (
    <main className="page">
      <div className="shell">
        <div className="app-header slide-in">
          <div className="header-info">
            <h1 className="glow-text">The Game Vault</h1>
            <p className="muted">Hone your skills in our professional training ground.</p>
          </div>
          <div className="tab-switcher-v2">
            <button 
              className={`tab-btn ${activeTab === "arena" ? "active" : ""}`}
              onClick={() => setActiveTab("arena")}
            >
              ARENA
            </button>
            <button 
              className={`tab-btn ${activeTab === "offline" ? "active" : ""}`}
              onClick={() => setActiveTab("offline")}
            >
              OFFLINE
            </button>
          </div>
        </div>

        {activeTab === "arena" ? (
          <div className="tournament-grid slide-in">
            <Link href="/play/8ball" className="premium-card">
              <div className="card-glass"></div>
              <div className="card-content">
                <div className="card-header">
                  <span className="status-badge OPEN">ONLINE</span>
                  <span className="player-count">SKILL GAME</span>
                </div>
                <div className="card-body">
                  <h3 className="tournament-title">🎱 8-Ball Pool</h3>
                  <div className="tournament-type">PRO CIRCUIT TRAINING</div>
                </div>
                <div className="card-footer">
                  <div className="entry-info">
                    <span className="label">GAME MODE</span>
                    {/* Free to play, and it earns — but a fraction of what a
                        league night does, which is the point. */}
                    <span className="value free">FREE · EARNS COINS</span>
                  </div>
                  <div className="action-circle">→</div>
                </div>
              </div>
            </Link>

            <Link href="/play/imposter" className="premium-card">
              <div className="card-glass"></div>
              <div className="card-content">
                <div className="card-header">
                  <span className="status-badge PARTY">NEW · PARTY</span>
                  <span className="player-count">SOCIAL DEDUCTION</span>
                </div>
                <div className="card-body">
                  <h3 className="tournament-title">
                    <svg className="title-icon" viewBox="0 0 256 256" width="1em" height="1em" fill="currentColor" aria-hidden="true">
                      <path d="M256,120a8,8,0,0,1-8,8H8a8,8,0,0,1,0-16H35.92l47.5-65.41a16,16,0,0,1,25.31-.72l12.85,14.9.2.23a7.95,7.95,0,0,0,12.44,0l.2-.23,12.85-14.9a16,16,0,0,1,25.31.72L220.08,112H248A8,8,0,0,1,256,120Zm-76,24a36,36,0,0,0-35.77,32H111.77a36,36,0,1,0-1.83,16h36.12A36,36,0,1,0,180,144Z" />
                    </svg>
                    Imposter
                  </h3>
                  <div className="tournament-type">ONE WORD. ONE LIAR.</div>
                </div>
                <div className="card-footer">
                  <div className="entry-info">
                    <span className="label">GAME MODE</span>
                    {/* Everyone on their own phone, in one room; winners earn. */}
                    <span className="value free">3–10 PLAYERS · EARNS COINS</span>
                  </div>
                  <div className="action-circle">→</div>
                </div>
              </div>
            </Link>
          </div>
        ) : (
          <div className="slide-in stadium-hub">
            <div className="hub-header">
              <h2 className="display-text-sm">8-Ball Scorekeeper</h2>
              <p className="muted">Record local matches and track player progress offline.</p>
            </div>
            <OfflineTracker />
          </div>
        )}
      </div>

      <style jsx>{`
        .app-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 3rem;
          flex-wrap: wrap;
          gap: 1.5rem;
        }
        .tab-switcher-v2 {
          display: flex;
          background: rgba(255, 255, 255, 0.05);
          padding: 4px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .tab-btn {
          padding: 0.6rem 1.5rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 1px;
          color: var(--text-muted);
          transition: all 0.3s ease;
          background: none;
          border: none;
          cursor: pointer;
        }
        .tab-btn.active {
          background: var(--gradient-primary);
          color: white;
          box-shadow: 0 4px 15px color-mix(in oklab, var(--accent) 30%, transparent);
        }
        .stadium-hub {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 32px;
          padding: 3rem;
          backdrop-filter: var(--glass-blur);
        }
        @media (max-width: 768px) {
          .stadium-hub {
            padding: 1.5rem;
            border-radius: 24px;
          }
          .display-text-sm {
            font-size: 1.5rem;
          }
          .app-header {
            margin-bottom: 2rem;
            text-align: center;
            justify-content: center;
          }
        }

        .hub-header {
          margin-bottom: 2.5rem;
          text-align: center;
        }
        .display-text-sm {
          font-size: 2rem;
          font-weight: 900;
          margin-bottom: 0.5rem;
        }

        .premium-card {
          position: relative;
          background: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: 24px;
          overflow: hidden;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          text-decoration: none;
          color: inherit;
        }
        .premium-card:hover {
          transform: translateY(-10px) scale(1.02);
          border-color: var(--gold);
          box-shadow: var(--shadow-lg);
        }
        .premium-card.locked { opacity: 0.6; cursor: not-allowed; }
        .card-content { padding: 1.5rem; position: relative; z-index: 2; }
        .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
        
        .status-badge {
          font-size: 0.6rem;
          font-weight: 900;
          letter-spacing: 1px;
          padding: 4px 10px;
          border-radius: 20px;
          background: var(--bg-surface-elevated);
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
        }
        .status-badge.OPEN { background: rgba(16, 185, 129, 0.1); color: var(--gold); border: 1px solid rgba(16, 185, 129, 0.2); }
        .status-badge.PARTY { background: rgba(255, 74, 61, 0.12); color: #ff6a5e; border: 1px solid rgba(255, 74, 61, 0.45); }
        .tournament-title { display: flex; align-items: center; gap: 0.5rem; }
        .title-icon { color: #8b6bff; filter: drop-shadow(0 0 6px rgba(139, 107, 255, 0.55)); flex: none; }

        .tournament-title { 
          font-size: 1.25rem; 
          font-weight: 800; 
          margin-bottom: 0.5rem; 
          color: var(--text-primary);
        }
        .tournament-type { font-size: 0.65rem; font-weight: 700; color: var(--text-muted); letter-spacing: 1px; }

        .card-footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 2rem; }
        .entry-info .label { display: block; font-size: 0.6rem; font-weight: 900; color: var(--text-muted); margin-bottom: 2px; }
        .entry-info .value { font-size: 1.1rem; font-weight: 900; color: var(--text-primary); }
        .entry-info .value.free { color: var(--gold); }

        .action-circle {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--bg-surface-elevated);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
          color: var(--text-primary);
          transition: all 0.3s ease;
          border: 1px solid var(--border-color);
        }
        .premium-card:hover .action-circle {
          background: var(--gold);
          color: black;
          transform: rotate(-45deg);
        }
      `}</style>
    </main>
  );
}
