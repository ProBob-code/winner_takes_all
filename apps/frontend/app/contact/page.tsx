"use client";
import React from "react";

export default function ContactPage() {
  return (
    <main className="page" style={{ padding: "100px 6% 80px" }}>
      <div className="shell" style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <header style={{ textAlign: "center", marginBottom: "5rem" }}>
          <h1 style={{ fontSize: "clamp(3rem, 7vw, 5rem)", fontWeight: 950, marginBottom: "1.5rem", letterSpacing: "-2px" }}>
            GET IN <span className="text-gradient" style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>TOUCH.</span>
          </h1>
          <p className="muted" style={{ fontSize: "1.2rem", maxWidth: "600px", margin: "0 auto" }}>
            Whether you're a player, an organizer, or a potential partner, we're here to help you scale.
          </p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "2.5rem" }}>
          <div className="panel" style={{ padding: "3rem", border: "1px solid rgba(139, 92, 246, 0.2)", background: "rgba(139, 92, 246, 0.02)" }}>
            <div style={{ background: "rgba(139, 92, 246, 0.1)", width: "60px", height: "60px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", marginBottom: "2rem" }}>✉️</div>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1rem" }}>Technical Support</h3>
            <p className="muted" style={{ marginBottom: "2rem", lineHeight: 1.6 }}>Our engineering team is available for technical queries and platform support.</p>
            <a href="mailto:support@wta-arena.com" style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--accent-light)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              support@wta-arena.com <span>→</span>
            </a>
          </div>

          <div className="panel" style={{ padding: "3rem", border: "1px solid rgba(6, 182, 212, 0.2)", background: "rgba(6, 182, 212, 0.02)" }}>
            <div style={{ background: "rgba(6, 182, 212, 0.1)", width: "60px", height: "60px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", marginBottom: "2rem" }}>🤝</div>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1rem" }}>Partnerships</h3>
            <p className="muted" style={{ marginBottom: "2rem", lineHeight: 1.6 }}>For enterprise solutions, white-label requests, and strategic collaborations.</p>
            <a href="mailto:biz@wta-arena.com" style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--accent-secondary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              biz@wta-arena.com <span>→</span>
            </a>
          </div>

          <div className="panel" style={{ padding: "3rem", border: "1px solid rgba(255, 183, 0, 0.2)", background: "rgba(255, 183, 0, 0.02)" }}>
            <div style={{ background: "rgba(255, 183, 0, 0.1)", width: "60px", height: "60px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", marginBottom: "2rem" }}>🏢</div>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1rem" }}>Headquarters</h3>
            <p className="muted" style={{ marginBottom: "2rem", lineHeight: 1.6 }}>WTA Platform Operations. Located in the heart of India's tech hub.</p>
            <address style={{ fontStyle: "normal", color: "var(--text-secondary)", lineHeight: 1.8 }}>
              123 Esports Avenue, Tech Hub<br />
              Bangalore, Karnataka 560001<br />
              India
            </address>
          </div>
        </div>

        <div className="panel" style={{ marginTop: "5rem", padding: "4rem", textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "4px", background: "linear-gradient(90deg, #8b5cf6, #06b6d4, #f59e0b)" }}></div>
          <h2 style={{ fontSize: "2rem", fontWeight: 900, marginBottom: "1rem" }}>Host Your Own Tournament?</h2>
          <p className="muted" style={{ maxWidth: "600px", margin: "0 auto 2.5rem", lineHeight: 1.6 }}>
            Our infrastructure is ready for your next big event. Join hundreds of organizers who trust Winner.Takes.All for their competitive operations.
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
            <a href="/signup" className="button" style={{ padding: "1rem 2.5rem" }}>Start Organizing</a>
            <a href="/tournaments" className="button button-secondary" style={{ padding: "1rem 2.5rem" }}>Explore Events</a>
          </div>
        </div>
      </div>
    </main>
  );
}
