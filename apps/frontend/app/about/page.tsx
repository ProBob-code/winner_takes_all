"use client";
import React from "react";

export default function AboutPage() {
  return (
    <main className="page" style={{ padding: "80px 6%" }}>
      <div className="shell" style={{ maxWidth: "850px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 950, marginBottom: "3rem", textAlign: "left", lineHeight: 1 }}>
          The Story Behind<br />
          <span className="gradient-text">W.T.A</span>
        </h1>
        
        <section style={{ marginBottom: "4rem" }}>
          <h2 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: "1.5rem", color: "var(--accent-secondary)" }}>Founder Profile: ProBob</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "2rem", lineHeight: 1.8 }}>
            <p className="muted" style={{ fontSize: "1.1rem" }}>
              W.T.A was founded and engineered by <strong>ProBob</strong>, a software developer with a deep background in high-frequency trading systems, Artificial Intelligence, and scalable backend architecture. 
              With years of experience building complex algorithmic platforms, ProBob set out to solve a specific problem in the esports world: the lack of robust, automated infrastructure for community-driven tournaments.
            </p>
            <p className="muted" style={{ fontSize: "1.1rem" }}>
              Our platform isn't just another gaming site—it's a technical solution to an operational challenge. By applying the same precision used in trading systems to tournament orchestration, 
              W.T.A provides organizers with a participation management system that is secure, transparent, and entirely automated.
            </p>
          </div>
        </section>

        <section style={{ marginBottom: "4rem" }}>
          <h2 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: "1.5rem" }}>Our Technical Philosophy</h2>
          <p className="muted" style={{ fontSize: "1.1rem", lineHeight: 1.8 }}>
            At its core, W.T.A is a Software-as-a-Service (SaaS) provider. We believe in "Skill First" competition. Every line of code in our platform is designed to facilitate 
            skill-based outcomes, removing chance from the equation and empowering organizers to host professional-grade events.
          </p>
        </section>

        <div className="panel" style={{ padding: "3rem", background: "rgba(139, 92, 246, 0.05)", borderRadius: "24px", border: "1px solid rgba(139, 92, 246, 0.1)", textAlign: "center" }}>
          <h3 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Infrastructure You Can Trust</h3>
          <p className="muted" style={{ maxWidth: "600px", margin: "0 auto" }}>
            From Bangalore to the global stage, W.T.A is built for the next generation of esports organizers who demand professional-grade tools.
          </p>
        </div>
      </div>
    </main>
  );
}
