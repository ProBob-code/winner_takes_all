"use client";
import React from "react";

export default function CommunityGuidelinesPage() {
  return (
    <main className="page" style={{ padding: "100px 6% 80px" }}>
      <div className="shell" style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <header style={{ textAlign: "center", marginBottom: "5rem" }}>
          <h1 style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", fontWeight: 950, marginBottom: "1.5rem", letterSpacing: "-3px" }}>
            ELITE <span className="text-gradient" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CONDUCT.</span>
          </h1>
          <p className="muted" style={{ fontSize: "1.2rem", maxWidth: "700px", margin: "0 auto" }}>
            The W.T.A community is built on competition, integrity, and mutual respect.
          </p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "2rem" }}>
          {[
            {
              icon: "⚖️",
              title: "Fair Play & Integrity",
              content: "Use of cheats, scripts, or any 3rd-party software providing an unfair advantage is strictly prohibited. Violators will face permanent hardware-level bans and forfeiture of all rewards."
            },
            {
              icon: "🤝",
              title: "Professional Conduct",
              content: "Toxicity, harassment, and hate speech have no place here. Treat all participants, organizers, and staff with the respect expected in a professional sporting environment."
            },
            {
              icon: "🛡️",
              title: "Organizer Authority",
              content: "Organizers are the final authority in their specific events. While WTA provides the orchestration tools, the rules defined by the organizer must be followed implicitly."
            },
            {
              icon: "🎯",
              title: "Skill-Based Only",
              content: "Collusion, match-fixing, or any attempt to artificially influence results is a violation of our core technical philosophy. Success must be earned through mechanical skill."
            }
          ].map((item, idx) => (
            <div key={idx} className="panel" style={{ padding: "3rem", display: "flex", flexDirection: "column", gap: "1.5rem", position: "relative", overflow: "hidden" }}>
               <div style={{ fontSize: "2rem" }}>{item.icon}</div>
               <h3 style={{ fontSize: "1.6rem", fontWeight: 800 }}>{item.title}</h3>
               <p className="muted" style={{ lineHeight: 1.8 }}>{item.content}</p>
            </div>
          ))}
        </div>

        <div className="panel" style={{ marginTop: "4rem", padding: "2.5rem", textAlign: "center", border: "1px dashed var(--accent-subtle)", background: "rgba(139, 92, 246, 0.02)" }}>
           <p className="muted" style={{ fontSize: "0.95rem" }}>
             Failure to adhere to these guidelines results in immediate account review and potential termination of all Platform access.
           </p>
        </div>
      </div>
    </main>
  );
}
