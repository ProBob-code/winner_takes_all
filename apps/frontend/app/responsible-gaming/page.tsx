"use client";
import React from "react";

export default function ResponsibleGamingPage() {
  return (
    <main className="page" style={{ padding: "80px 6%" }}>
      <div className="shell" style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "5rem" }}>
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 950, marginBottom: "1rem" }}>Responsible <span className="text-gradient">Competition</span></h1>
          <p className="muted" style={{ fontSize: "1.1rem" }}>Encouraging healthy habits and fair play.</p>
        </div>

        <div className="terms-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "2.5rem" }}>
          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(187, 134, 252, 0.1)", color: "#bb86fc" }}>🍏</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1rem" }}>1. Healthy Habits</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              W.T.A is a skill-based tournament provider. We encourage players to engage in healthy social competition and take regular breaks.
            </p>
          </section>

          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(3, 218, 198, 0.1)", color: "#03dac6" }}>🛑</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1rem" }}>2. Self-Exclusion</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              If you feel you are spending too much time on the platform, you can set account limits or opt for temporary self-exclusion via support.
            </p>
          </section>

          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(255, 183, 0, 0.1)", color: "#ffb700" }}>🛡️</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1rem" }}>3. Skill Integrity</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              We reiterate that this is NOT a gambling site. Success depends entirely on your mechanical and tactical skill in the game.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
