"use client";
import React from "react";

export default function ResponsibleGamingPage() {
  return (
    <main className="page" style={{ padding: "100px 6% 80px" }}>
      <div className="shell" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <header style={{ marginBottom: "5rem" }}>
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 950, marginBottom: "1rem", letterSpacing: "-2px" }}>
            RESPONSIBLE <span className="text-gradient" style={{ background: "linear-gradient(135deg, #10b981, #059669)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>GAMING.</span>
          </h1>
          <p className="muted" style={{ fontSize: "1.1rem" }}>Promoting healthy competition and digital well-being.</p>
        </header>

        <div className="stack" style={{ gap: "2rem" }}>
          {[
            {
              title: "Healthy Competition",
              content: "W.T.A is a platform for skill-based esports. We encourage all participants to maintain a healthy balance between competitive gaming and their personal lives. Success should be pursued with passion but also with moderation."
            },
            {
              title: "Limits & Self-Exclusion",
              content: "If you feel you are spending excessive time or resources on the platform, we provide tools for self-exclusion and account limits. Please contact our support team to implement these measures on your profile."
            },
            {
              title: "Transparency & Skill",
              content: "We reiterate that Winner.Takes.All is not a gambling site. There are no wagers on random outcomes. Your performance depends entirely on your skill in the chosen titles. We advocate for a clear understanding of the 'Skill Dominance' model."
            }
          ].map((section, idx) => (
            <section key={idx} className="panel" style={{ padding: "2.5rem", display: "flex", gap: "2rem", alignItems: "flex-start" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--green-light)", opacity: 0.3, fontFamily: "var(--font-outfit)", minWidth: "40px" }}>
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
