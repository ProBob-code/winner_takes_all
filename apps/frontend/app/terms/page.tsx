"use client";
import React from "react";

export default function TermsPage() {
  return (
    <main className="page" style={{ padding: "80px 6%" }}>
      <div className="shell" style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "5rem" }}>
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 950, marginBottom: "1rem" }}>Platform <span className="text-gradient">Terms</span></h1>
          <p className="muted" style={{ fontSize: "1.1rem" }}>Last updated: May 12, 2026 • Version 2.1</p>
        </div>

        <div className="terms-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "2.5rem" }}>
          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(187, 134, 252, 0.1)", color: "#bb86fc" }}>⚖️</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1rem" }}>1. Agreement to Terms</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              By accessing the Winner.Takes.All platform, you agree to be bound by these Terms & Conditions. 
              The platform is operated as a Tournament Infrastructure SaaS provider.
            </p>
          </section>

          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(3, 218, 198, 0.1)", color: "#03dac6" }}>🎯</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1rem" }}>2. Nature of Competition</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              W.T.A is NOT a gambling platform. All tournaments are strictly competitions of skill. 
              Match outcomes are determined solely by participant performance and mechanical execution.
            </p>
          </section>

          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(255, 183, 0, 0.1)", color: "#ffb700" }}>🔞</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1rem" }}>3. User Eligibility</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              Users must be at least 18 years of age. Participation may be restricted in specific 
              jurisdictions. You are responsible for ensuring compliance with your local laws.
            </p>
          </section>

          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(139, 92, 246, 0.1)", color: "#8b5cf6" }}>💳</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1rem" }}>4. Participation & Fees</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              Fees cover infrastructure costs and event administration. Rewards are sponsored by 
              organizers and distributed based on verified, skill-dominant results.
            </p>
          </section>
        </div>

        <div className="glass-panel" style={{ marginTop: "4rem", padding: "3rem", textAlign: "center", border: "1px dashed var(--glass-border-color)" }}>
           <h3 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Full Legal Documentation</h3>
           <p className="muted" style={{ maxWidth: "700px", margin: "0 auto 2rem" }}>For enterprise-level infrastructure agreements or specific regional compliance inquiries, please contact our legal department.</p>
           <button className="button button-secondary">Download PDF Terms</button>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 600px) {
          .terms-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
