"use client";
import React from "react";

export default function TermsPage() {
  return (
    <main className="page" style={{ padding: "100px 6% 80px" }}>
      <div className="shell" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <header style={{ marginBottom: "5rem" }}>
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 950, marginBottom: "1rem", letterSpacing: "-2px" }}>
            TERMS & <span className="text-gradient" style={{ background: "linear-gradient(135deg, #8b5cf6, #06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CONDITIONS.</span>
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span style={{ padding: "0.4rem 1rem", borderRadius: "8px", background: "rgba(139, 92, 246, 0.1)", color: "var(--accent-light)", fontSize: "0.75rem", fontWeight: 700 }}>v2.4.0</span>
            <p className="muted" style={{ fontSize: "0.9rem" }}>Effective Date: May 11, 2026</p>
          </div>
        </header>

        <div className="stack" style={{ gap: "2rem" }}>
          {[
            {
              title: "Agreement to Terms",
              content: "By accessing or using the Winner.Takes.All platform (\"the Platform\"), you agree to be bound by these Terms & Conditions. The Platform is operated as a Tournament Infrastructure SaaS, providing tools for organizers to manage competitive esports events."
            },
            {
              title: "Nature of the Platform",
              content: "W.T.A is NOT a gambling platform. We do not facilitate betting, wagering, or games of chance. All tournaments hosted on the Platform are strictly competitions of skill. The outcome of any match is determined solely by the participants' performance, strategy, and mechanical skill."
            },
            {
              title: "User Eligibility",
              content: "You must be at least 18 years of age to register an account. Participation in tournaments may be restricted in certain jurisdictions where skill-based competition rewards are regulated. It is your responsibility to ensure compliance with your local laws."
            },
            {
              title: "Participation Fees & Rewards",
              content: "Organizers may require a \"Participation Fee\" to enter an event. This fee covers platform infrastructure costs and event administration. \"Championship Rewards\" are sponsored by organizers and are distributed based on verified tournament results."
            },
            {
              title: "Intellectual Property",
              content: "All content on the Platform, including software, design, logos, and text, is the property of W.T.A or its licensors. You may not reproduce, distribute, or create derivative works without explicit written permission."
            },
            {
              title: "Limitation of Liability",
              content: "W.T.A provides infrastructure services \"as is\". We are not liable for match outcomes, organizer mismanagement, technical interruptions, or game-client failures. Our liability is limited to the maximum extent permitted by law."
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
