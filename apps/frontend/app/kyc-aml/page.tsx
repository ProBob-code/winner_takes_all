"use client";
import React from "react";

export default function KycAmlPage() {
  return (
    <main className="page" style={{ padding: "100px 6% 80px" }}>
      <div className="shell" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <header style={{ marginBottom: "5rem" }}>
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 950, marginBottom: "1rem", letterSpacing: "-2px" }}>
            KYC & <span className="text-gradient" style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>AML POLICY.</span>
          </h1>
          <p className="muted" style={{ fontSize: "1.1rem" }}>Ensuring platform integrity and regulatory compliance.</p>
        </header>

        <div className="stack" style={{ gap: "2rem" }}>
          {[
            {
              title: "Know Your Customer (KYC)",
              content: "To ensure a safe esports community platform, we verify the identity of our users. You may be asked to provide government-issued identification before withdrawing reward credits to prevent fraud and ensure compliance with age restrictions."
            },
            {
              title: "Anti-Money Laundering (AML)",
              content: "We strictly prohibit the use of our platform for money laundering or illegal activities. We actively monitor transactions and will report any suspicious activity to the relevant authorities."
            },
            {
              title: "Verification Process",
              content: "Identity verification is performed by our secure compliance partners. Your sensitive documents are encrypted and used only for verification purposes in accordance with our Privacy Policy."
            }
          ].map((section, idx) => (
            <section key={idx} className="panel" style={{ padding: "2.5rem", display: "flex", gap: "2rem", alignItems: "flex-start" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--accent-light)", opacity: 0.3, fontFamily: "var(--font-outfit)", minWidth: "40px" }}>
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
