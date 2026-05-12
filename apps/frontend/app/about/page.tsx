"use client";
import React from "react";

export default function AboutPage() {
  return (
    <main className="page" style={{ padding: "100px 6% 80px", position: "relative", overflow: "hidden" }}>
      {/* Background Glows */}
      <div style={{ position: "fixed", top: "-10%", right: "-10%", width: "500px", height: "500px", background: "radial-gradient(circle, rgba(139, 92, 246, 0.15), transparent 70%)", borderRadius: "50%", pointerEvents: "none", zIndex: 0 }}></div>
      <div style={{ position: "fixed", bottom: "-10%", left: "-10%", width: "400px", height: "400px", background: "radial-gradient(circle, rgba(6, 182, 212, 0.15), transparent 70%)", borderRadius: "50%", pointerEvents: "none", zIndex: 0 }}></div>

      <div className="shell" style={{ maxWidth: "1000px", margin: "0 auto", position: "relative", zIndex: 1 }}>
        <header style={{ marginBottom: "6rem", textAlign: "center" }}>
          <div style={{ display: "inline-block", padding: "0.5rem 1.5rem", borderRadius: "999px", background: "rgba(139, 92, 246, 0.1)", border: "1px solid rgba(139, 92, 246, 0.2)", color: "var(--accent-light)", fontSize: "0.85rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "2px", marginBottom: "2rem" }}>
            The Genesis
          </div>
          <h1 style={{ fontSize: "clamp(3rem, 8vw, 5.5rem)", fontWeight: 950, lineHeight: 0.9, letterSpacing: "-3px", marginBottom: "2rem" }}>
            BORN FROM <br />
            <span className="text-gradient" style={{ background: "linear-gradient(135deg, #8b5cf6, #06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>PURE PRECISION.</span>
          </h1>
          <p className="muted" style={{ maxWidth: "600px", margin: "0 auto", fontSize: "1.2rem", lineHeight: 1.6 }}>
            Winner.Takes.All (W.T.A) is the convergence of high-frequency engineering and competitive passion.
          </p>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2.5rem", marginBottom: "8rem" }}>
          <div className="panel" style={{ padding: "3rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div style={{ fontSize: "2.5rem" }}>⚡</div>
            <h2 style={{ fontSize: "1.8rem", fontWeight: 800 }}>Founder Story</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              W.T.A was engineered by <strong>ProBob</strong>, a developer with deep expertise in AI and high-frequency trading systems. 
              By applying the same sub-millisecond precision to tournament orchestration, we solved the operational bottleneck of esports.
            </p>
          </div>

          <div className="panel" style={{ padding: "3rem", display: "flex", flexDirection: "column", gap: "1.5rem", background: "rgba(139, 92, 246, 0.03)" }}>
            <div style={{ fontSize: "2.5rem" }}>💎</div>
            <h2 style={{ fontSize: "1.8rem", fontWeight: 800 }}>Technical Philosophy</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              We aren't just a gaming site—we are a <strong>SaaS infrastructure provider</strong>. 
              Every line of code is optimized for "Skill First" competition, removing chance and empowering organizers globally.
            </p>
          </div>
        </section>

        <section style={{ textAlign: "center" }}>
          <div className="panel" style={{ padding: "5rem 3rem", background: "linear-gradient(145deg, rgba(139, 92, 246, 0.1), rgba(6, 182, 212, 0.05))", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "40px" }}>
            <h2 style={{ fontSize: "2.5rem", fontWeight: 900, marginBottom: "1.5rem" }}>Global Infrastructure</h2>
            <p className="muted" style={{ maxWidth: "700px", margin: "0 auto 3rem", fontSize: "1.1rem", lineHeight: 1.8 }}>
              From Bangalore to the world, W.T.A provides the backbone for the next generation of professional organizers who demand elite tools.
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: "4rem", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "2.5rem", fontWeight: 900, color: "var(--accent-light)" }}>100%</div>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>Automated</div>
              </div>
              <div>
                <div style={{ fontSize: "2.5rem", fontWeight: 900, color: "var(--accent-secondary)" }}>SKILL</div>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>Dominant</div>
              </div>
              <div>
                <div style={{ fontSize: "2.5rem", fontWeight: 900, color: "var(--gold)" }}>24/7</div>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>Orchestration</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
