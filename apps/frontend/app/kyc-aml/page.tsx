"use client";
import React from "react";

export default function KycAmlPage() {
  return (
    <main className="page" style={{ padding: "80px 6%" }}>
      <div className="shell" style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "5rem" }}>
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 950, marginBottom: "1rem" }}>KYC & <span className="text-gradient">AML</span></h1>
          <p className="muted" style={{ fontSize: "1.1rem" }}>Ensuring a secure and compliant tournament ecosystem.</p>
        </div>

        <div className="terms-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "2.5rem" }}>
          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(187, 134, 252, 0.1)", color: "#bb86fc" }}>🆔</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1rem" }}>1. Know Your Customer</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              To ensure a safe esports environment, we verify user identities. 
              You may be asked for government-issued ID before high-value reward withdrawals.
            </p>
          </section>

          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(3, 218, 198, 0.1)", color: "#03dac6" }}>🕵️</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1rem" }}>2. Anti-Money Laundering</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              We strictly prohibit money laundering. Our platform monitors transactions 
              and reports suspicious activity to the relevant authorities.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
