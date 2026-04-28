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
            <Link href="/8ball/index.html" className="premium-card">
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
                    <span className="value free">FREE PLAY</span>
                  </div>
                  <div className="action-circle">→</div>
                </div>
              </div>
            </Link>

            <div className="premium-card locked">
              <div className="card-glass"></div>
              <div className="card-content">
                <div className="card-header">
                  <span className="status-badge">COMING SOON</span>
                </div>
                <div className="card-body">
                  <h3 className="tournament-title">🕶️ Mafia</h3>
                  <div className="tournament-type">SOCIAL DEDUCTION</div>
                </div>
                <div className="card-footer">
                  <div className="entry-info">
                    <span className="label">STATUS</span>
                    <span className="value">DEVELOPMENT</span>
                  </div>
                  <div className="action-circle">🔒</div>
                </div>
              </div>
            </div>
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
          box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
        }
        .stadium-hub {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 32px;
          padding: 3rem;
          backdrop-filter: var(--glass-blur);
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
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 24px;
          overflow: hidden;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          text-decoration: none;
          color: inherit;
        }
        .premium-card:hover {
          transform: translateY(-10px) scale(1.02);
          border-color: var(--gold-subtle);
          background: rgba(255, 255, 255, 0.04);
          box-shadow: 0 20px 40px rgba(0,0,0,0.4), 0 0 20px rgba(255, 183, 0, 0.1);
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
          background: rgba(255,255,255,0.05);
        }
        .status-badge.OPEN { background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); }

        .tournament-title { font-size: 1.25rem; font-weight: 800; margin-bottom: 0.5rem; background: linear-gradient(to right, #fff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .tournament-type { font-size: 0.65rem; font-weight: 700; color: var(--text-muted); letter-spacing: 1px; }

        .card-footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 2rem; }
        .entry-info .label { display: block; font-size: 0.6rem; font-weight: 900; color: var(--text-muted); margin-bottom: 2px; }
        .entry-info .value { font-size: 1.1rem; font-weight: 900; }
        .entry-info .value.free { color: #10b981; }

        .action-circle {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(255,255,255,0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
          transition: all 0.3s ease;
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
