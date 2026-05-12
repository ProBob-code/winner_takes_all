"use client";
import React from "react";
import Image from "next/image";

export default function ContactPage() {
  return (
    <main className="page" style={{ padding: "0 0 100px 0" }}>
      {/* Hero Section */}
      <section className="hero-banner" style={{ height: "400px", borderRadius: "0 0 60px 60px" }}>
        <Image 
          src="/contact_hero_gaming_1778566284443.png" 
          alt="Contact Hero" 
          fill 
          style={{ objectFit: "cover" }}
          priority
        />
        <div className="hero-banner-overlay"></div>
        <div className="hero-banner-content reveal-text">
          <h1 style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", fontWeight: 950, letterSpacing: "-2px" }}>
            LET'S <span className="text-gradient">CONNECT.</span>
          </h1>
          <p className="muted" style={{ fontSize: "1.2rem", maxWidth: "600px", margin: "1rem auto 0" }}>
            Questions about the platform? Custom tournament needs? Our team is standing by.
          </p>
        </div>
      </section>

      <div className="shell" style={{ maxWidth: "1100px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "4rem", marginTop: "-50px" }}>
          {/* Info Side */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div className="glass-panel glowing-border" style={{ padding: "2.5rem" }}>
               <div className="card-icon" style={{ background: "rgba(187, 134, 252, 0.1)", color: "#bb86fc" }}>✉️</div>
               <h3 style={{ fontSize: "1.25rem", fontWeight: 800, marginBottom: "0.5rem" }}>Email Support</h3>
               <p className="muted" style={{ marginBottom: "1.5rem" }}>Direct line to our technical engineering team.</p>
               <a href="mailto:support@wta-arena.com" style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--accent-light)" }}>support@wta-arena.com</a>
            </div>

            <div className="glass-panel" style={{ padding: "2.5rem" }}>
               <div className="card-icon" style={{ background: "rgba(3, 218, 198, 0.1)", color: "#03dac6" }}>🏢</div>
               <h3 style={{ fontSize: "1.25rem", fontWeight: 800, marginBottom: "0.5rem" }}>Main Hub</h3>
               <p className="muted" style={{ marginBottom: "1.5rem" }}>Winner.Takes.All Platform Operations</p>
               <address style={{ fontStyle: "normal", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                 123 Esports Avenue, Tech Hub<br />
                 Bangalore, Karnataka 560001<br />
                 India
               </address>
            </div>
          </div>

          {/* Form Mockup Side */}
          <div className="glass-panel" style={{ padding: "3.5rem", background: "rgba(3, 0, 20, 0.4)" }}>
            <h2 style={{ fontSize: "1.75rem", fontWeight: 900, marginBottom: "2rem" }}>Send a Quick Transmission</h2>
            <div className="stack" style={{ gap: "1.5rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                    <div className="input-group">
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.5rem", textTransform: "uppercase" }}>Your Name</label>
                        <div style={{ height: "50px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--glass-border-color)", borderRadius: "12px" }}></div>
                    </div>
                    <div className="input-group">
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.5rem", textTransform: "uppercase" }}>Email Address</label>
                        <div style={{ height: "50px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--glass-border-color)", borderRadius: "12px" }}></div>
                    </div>
                </div>
                <div className="input-group">
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.5rem", textTransform: "uppercase" }}>Inquiry Type</label>
                    <div style={{ height: "50px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--glass-border-color)", borderRadius: "12px" }}></div>
                </div>
                <div className="input-group">
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.5rem", textTransform: "uppercase" }}>Message</label>
                    <div style={{ height: "150px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--glass-border-color)", borderRadius: "12px" }}></div>
                </div>
                <button className="button" style={{ width: "100%", marginTop: "1rem", height: "60px", fontSize: "1rem" }}>DISPATCH MESSAGE →</button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          div { grid-template-columns: 1fr !important; gap: 2rem !important; margin-top: 2rem !important; }
        }
      `}</style>
    </main>
  );
}
