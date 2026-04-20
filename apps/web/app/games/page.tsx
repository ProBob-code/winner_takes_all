"use client";

import Link from "next/link";
import { useState } from "react";
import { OfflineTracker } from "@/components/offline-tracker";

export default function GamesPage() {
  const [activeTab, setActiveTab] = useState<"arena" | "offline">("arena");

  return (
    <main className="page">
      <div className="shell">
        <div className="panel page-card slide-in" style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h2>🕹️ Games Arena</h2>
              <p className="muted">Play free web games, hone your skills, and get ready for the premium tournaments.</p>
            </div>
            <div className="tab-switcher">
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
        </div>

        {activeTab === "arena" ? (
          <div className="tournament-grid">
            <a href="/8ball/index.html" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="tournament-card slide-in">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div className="tournament-name">🎱 8-Ball Pool</div>
                  <span className="tournament-status status-OPEN">PLAY NOW</span>
                </div>

                <div className="tournament-meta">
                  <div className="tournament-meta-item">
                    <span>Classic 8-Ball pool game to hone your aiming skills offline.</span>
                  </div>
                </div>
              </div>
            </a>
          </div>
        ) : (
          <OfflineTracker />
        )}
      </div>

      <style jsx>{`
        .tab-switcher {
          display: flex;
          background: rgba(0,0,0,0.3);
          padding: 0.4rem;
          border-radius: 12px;
          border: 1px solid var(--glass-border-color);
        }

        .tab-btn {
          padding: 0.6rem 1.5rem;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-weight: 700;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .tab-btn.active {
          background: var(--primary-color);
          color: white;
          box-shadow: 0 4px 12px rgba(var(--primary-color-rgb), 0.3);
        }

        .tab-btn:hover:not(.active) {
          color: white;
          background: rgba(255,255,255,0.05);
        }
      `}</style>
    </main>
  );
}
