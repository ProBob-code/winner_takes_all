"use client";
import React from "react";

export default function CommunityGuidelinesPage() {
  return (
    <main className="page" style={{ padding: "80px 6%" }}>
      <div className="shell" style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "5rem" }}>
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 950, marginBottom: "1rem" }}>Community <span className="text-gradient">Guidelines</span></h1>
          <p className="muted" style={{ fontSize: "1.1rem" }}>Building a professional and respectful esports environment.</p>
        </div>

        <div className="terms-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "2.5rem" }}>
          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(187, 134, 252, 0.1)", color: "#bb86fc" }}>⚔️</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1.5rem" }}>1. Fair Play</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>Integrity is paramount. Any use of cheats, scripts, or unfair advantages results in a permanent ban and forfeiture of rewards.</p>
          </section>

          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(3, 218, 198, 0.1)", color: "#03dac6" }}>🤝</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1.5rem" }}>2. Respectful Conduct</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>Toxicity and harassment have no place here. Treat every participant and organizer with professional respect.</p>
          </section>

          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(255, 183, 0, 0.1)", color: "#ffb700" }}>📋</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1.5rem" }}>3. Organizer Rules</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>Organizers are responsible for clear rules and fair administration. Platform tools must be used transparently.</p>
          </section>

          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(139, 92, 246, 0.1)", color: "#8b5cf6" }}>🏆</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1.5rem" }}>4. Skill Focus</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>Every tournament on W.T.A is a test of skill. Collusion or attempts to influence outcomes are strictly prohibited.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
