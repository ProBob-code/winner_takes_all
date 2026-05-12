"use client";
import React from "react";

export default function PrivacyPage() {
  return (
    <main className="page" style={{ padding: "100px 6% 80px" }}>
      <div className="shell" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <header style={{ marginBottom: "5rem" }}>
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 950, marginBottom: "1rem", letterSpacing: "-2px" }}>
            PRIVACY <span className="text-gradient" style={{ background: "linear-gradient(135deg, #10b981, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>POLICY.</span>
          </h1>
          <p className="muted" style={{ fontSize: "1.1rem" }}>Your data security is our top technical priority.</p>
        </header>

        <div className="stack" style={{ gap: "2rem" }}>
          {[
            {
              title: "Information We Collect",
              content: "We collect information to provide better services to our users. This includes personal identifiers (Name, Email, Username), financial information for participation fees and rewards, and device data for security and anti-cheat purposes."
            },
            {
              title: "How We Use Information",
              content: "We use your data to manage your account, facilitate tournament entry, process rewards securely, and ensure platform integrity via anti-cheat verification. We also use it for critical updates and support."
            },
            {
              title: "Data Sharing & Disclosure",
              content: "We do not sell your personal information. We may share data with payment processors (e.g., Razorpay), tournament organizers to facilitate participation, and law enforcement when required by valid legal process."
            },
            {
              title: "Security Measures",
              content: "We implement industry-standard encryption and security protocols to protect your data. While we strive for absolute security, no method of transmission over the internet is 100% secure."
            }
          ].map((section, idx) => (
            <section key={idx} className="panel" style={{ padding: "2.5rem", display: "flex", gap: "2rem", alignItems: "flex-start" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--team-blue)", opacity: 0.3, fontFamily: "var(--font-outfit)", minWidth: "40px" }}>
                {(idx + 1).toString().padStart(2, '0')}
              </div>
              <div>
                <h2 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: "1rem" }}>{section.title}</h2>
                <p className="muted" style={{ lineHeight: 1.8 }}>{section.content}</p>
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
