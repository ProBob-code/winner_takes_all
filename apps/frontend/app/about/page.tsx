"use client";
import React from "react";
import Image from "next/image";

export default function AboutPage() {
  return (
    <main className="page" style={{ padding: "0 0 100px 0" }}>
      {/* Hero Section */}
      <section className="hero-banner" style={{ height: "500px", borderRadius: "0 0 60px 60px" }}>
        <Image 
          src="/about_hero_esports_1778566263935.png" 
          alt="About Hero" 
          fill 
          style={{ objectFit: "cover" }}
          priority
        />
        <div className="hero-banner-overlay" style={{ background: "linear-gradient(to bottom, transparent, var(--bg-primary))" }}></div>
        <div className="hero-banner-content reveal-text">
          <span className="hero-chip" style={{ background: "rgba(187, 134, 252, 0.2)", color: "#bb86fc", padding: "8px 20px", borderRadius: "99px", fontSize: "0.9rem", fontWeight: 700, marginBottom: "1.5rem", display: "inline-block" }}>OUR STORY</span>
          <h1 style={{ fontSize: "clamp(3rem, 7vw, 5.5rem)", fontWeight: 950, lineHeight: 0.9, letterSpacing: "-3px" }}>
            CRAFTING THE FUTURE OF <br />
            <span className="text-gradient">COMPETITIVE PLAY.</span>
          </h1>
        </div>
      </section>

      <div className="shell" style={{ maxWidth: "1100px" }}>
        {/* Core Pillars */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem", marginBottom: "8rem" }}>
          <div className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(187, 134, 252, 0.1)", color: "#bb86fc" }}>⚡</div>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1rem" }}>Automated Precision</h3>
            <p className="muted" style={{ lineHeight: 1.8 }}>We replace manual errors with algorithmic perfection. Our platform handles brackets, scoring, and settlements with high-frequency precision.</p>
          </div>
          <div className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(3, 218, 198, 0.1)", color: "#03dac6" }}>🛡️</div>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1rem" }}>Uncompromising Integrity</h3>
            <p className="muted" style={{ lineHeight: 1.8 }}>Trust is our currency. We build infrastructure that ensures every outcome is earned through skill, not chance.</p>
          </div>
          <div className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(255, 183, 0, 0.1)", color: "#ffb700" }}>💎</div>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1rem" }}>Organizer First</h3>
            <p className="muted" style={{ lineHeight: 1.8 }}>Designed by developers for community leaders. We provide the enterprise-grade tools you need to grow your esports empire.</p>
          </div>
        </section>

        {/* Founder Section */}
        <section className="glass-panel glowing-border" style={{ padding: "0", overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 1.2fr" }}>
          <div style={{ background: "linear-gradient(135deg, rgba(187, 134, 252, 0.2), transparent)", position: "relative", minHeight: "400px" }}>
             <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" }}>
                <div style={{ fontSize: "5rem", marginBottom: "1rem" }}>👨‍💻</div>
                <h4 style={{ fontSize: "1.5rem", fontWeight: 900 }}>ProBob</h4>
                <span className="muted" style={{ fontSize: "0.8rem", letterSpacing: "2px" }}>FOUNDER & LEAD ARCHITECT</span>
             </div>
          </div>
          <div style={{ padding: "5rem 4rem" }}>
            <h2 style={{ fontSize: "2.5rem", fontWeight: 900, marginBottom: "2rem" }}>The Architect's Vision</h2>
            <p className="muted" style={{ fontSize: "1.1rem", lineHeight: 2, marginBottom: "2rem" }}>
              Winner.Takes.All was born out of a simple observation: while esports was growing exponentially, the tools to manage it were stuck in the past. 
              With a background in high-frequency trading and AI, ProBob engineered W.T.A to be more than just a platform—it's a high-performance engine for competitive integrity.
            </p>
            <div style={{ display: "flex", gap: "2rem" }}>
                <div className="stat-item" style={{ flex: 1 }}>
                    <span className="stat-value">150+</span>
                    <span className="stat-label">Events Powered</span>
                </div>
                <div className="stat-item" style={{ flex: 1 }}>
                    <span className="stat-value">99.9%</span>
                    <span className="stat-label">Uptime</span>
                </div>
            </div>
          </div>
        </section>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          section { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
