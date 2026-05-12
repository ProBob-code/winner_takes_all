"use client";
import React from "react";

export default function PrivacyPage() {
  return (
    <main className="page" style={{ padding: "80px 6%" }}>
      <div className="shell" style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "5rem" }}>
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 950, marginBottom: "1rem" }}>Data <span className="text-gradient">Privacy</span></h1>
          <p className="muted" style={{ fontSize: "1.1rem" }}>Your data security is our top priority.</p>
        </div>

        <div className="terms-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "2.5rem" }}>
          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(187, 134, 252, 0.1)", color: "#bb86fc" }}>📁</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1.5rem" }}>1. Information We Collect</h2>
            <ul className="muted" style={{ paddingLeft: "1.2rem", lineHeight: 1.8 }}>
              <li>Personal identifiers (Name, Email, Username)</li>
              <li>Financial information for transactions</li>
              <li>Device and usage data for security</li>
            </ul>
          </section>

          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(3, 218, 198, 0.1)", color: "#03dac6" }}>🛠️</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1.5rem" }}>2. How We Use Data</h2>
            <ul className="muted" style={{ paddingLeft: "1.2rem", lineHeight: 1.8 }}>
              <li>Manage your platform account</li>
              <li>Process rewards and fees securely</li>
              <li>Ensure anti-cheat integrity</li>
            </ul>
          </section>

          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(255, 183, 0, 0.1)", color: "#ffb700" }}>🤝</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1.5rem" }}>3. Data Sharing</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              We share data with payment processors (Razorpay) and tournament organizers only when necessary to fulfill event participation.
            </p>
          </section>

          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(139, 92, 246, 0.1)", color: "#8b5cf6" }}>🔒</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1.5rem" }}>4. Security Measures</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              We implement enterprise-grade encryption and security protocols to protect your information at every stage.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
