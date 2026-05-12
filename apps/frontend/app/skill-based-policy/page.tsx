"use client";
import React from "react";

export default function SkillBasedPolicyPage() {
  return (
    <main className="page" style={{ padding: "80px 6%" }}>
      <div className="shell" style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "5rem" }}>
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 950, marginBottom: "1rem" }}>Skill-Based <span className="text-gradient">Policy</span></h1>
          <p className="muted" style={{ fontSize: "1.1rem" }}>Defining the boundary between chance and expertise.</p>
        </div>

        <div className="glass-panel glowing-border" style={{ padding: "3.5rem", marginBottom: "4rem", textAlign: "center" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1.5rem", color: "var(--accent-light)" }}>Official Declaration</h2>
          <p style={{ fontSize: "1.2rem", lineHeight: 1.8, fontWeight: 500, maxWidth: "800px", margin: "0 auto" }}>
            Winner.Takes.All is a Tournament Infrastructure SaaS. We do not facilitate betting or games of chance. 
            All outcomes are determined solely by player skill and mechanical execution.
          </p>
        </div>

        <div className="terms-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(450px, 1fr))", gap: "2.5rem" }}>
          <section className="glass-panel" style={{ padding: "3rem" }}>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1.25rem" }}>Definition of Skill</h3>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              On W.T.A, "Skill" includes tactical decision-making, mechanical precision, strategic planning, 
              and deep knowledge of game mechanics. Every event is a test of expertise.
            </p>
          </section>

          <section className="glass-panel" style={{ padding: "3rem" }}>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1.25rem" }}>Legal Framework</h3>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              Our platform operates within international laws governing skill-based competitions, 
              which are legally distinct from gambling and protected under constitutional frameworks in many regions.
            </p>
          </section>

          <section className="glass-panel" style={{ padding: "3rem" }}>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1.25rem" }}>Infrastructure Role</h3>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              W.T.A provides the digital environment for organizers. We are the technology layer that 
              ensures tournaments run smoothly, fairly, and transparently.
            </p>
          </section>

          <section className="glass-panel" style={{ padding: "3rem" }}>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1.25rem" }}>Regional Compliance</h3>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              Users are responsible for local compliance. W.T.A reserves the right to restrict access 
              in jurisdictions where skill-based rewards are regulated or prohibited.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
