import Link from "next/link";

export default function GamesPage() {
  return (
    <main className="page">
      <div className="shell">
        <div className="panel page-card slide-in" style={{ marginBottom: "1.5rem" }}>
          <h2>🕹️ Games Arena</h2>
          <p className="muted">Play free web games, hone your skills, and get ready for the premium tournaments.</p>
        </div>

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
      </div>
    </main>
  );
}
