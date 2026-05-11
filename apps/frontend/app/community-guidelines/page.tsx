"use client";
import React from "react";

export default function CommunityGuidelinesPage() {
  return (
    <main className="page" style={{ padding: "80px 6%" }}>
      <div className="shell" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "3.5rem", fontWeight: 900, marginBottom: "2rem", textAlign: "center" }}>Community Guidelines</h1>
        
        <p className="muted" style={{ textAlign: "center", marginBottom: "4rem", fontSize: "1.1rem" }}>
          To maintain a professional and fair environment for all participants and organizers on the WTA Arena platform.
        </p>

        <section className="stack" style={{ gap: "2.5rem" }}>
          <div className="panel" style={{ padding: "2.5rem" }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem", color: "var(--accent-light)" }}>1. Fair Play & Integrity</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              Integrity is the cornerstone of WTA Arena. Use of cheats, hacks, scripts, or any third-party software 
              that provides an unfair advantage is strictly prohibited. Any participant found violating these rules 
              will be permanently banned from the platform and forfeit all rewards.
            </p>
          </div>

          <div className="panel" style={{ padding: "2.5rem" }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem", color: "var(--accent-light)" }}>2. Respectful Conduct</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              Toxicity, harassment, hate speech, and discriminatory behavior will not be tolerated. Participants 
              and organizers are expected to treat each other with respect. Professionalism is required during 
              all tournament-related communications and match play.
            </p>
          </div>

          <div className="panel" style={{ padding: "2.5rem" }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem", color: "var(--accent-light)" }}>3. Organizer Responsibilities</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              Organizers are responsible for defining clear rules, maintaining accurate schedules, and ensuring 
              fair tournament administration. Mismanagement of events or deceptive practices by organizers 
              will result in immediate termination of their account and platform access.
            </p>
          </div>

          <div className="panel" style={{ padding: "2.5rem" }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem", color: "var(--accent-light)" }}>4. Skill-Based Demonstration</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              All participants acknowledge that tournaments on WTA Arena are tests of skill. Attempting to influence 
              outcomes via collusion or outside influence is a violation of these guidelines.
            </p>
          </div>
        </section>

        <div style={{ marginTop: "4rem", padding: "2rem", background: "rgba(139, 92, 246, 0.05)", borderRadius: "16px", border: "1px dashed var(--accent-subtle)" }}>
          <p className="muted" style={{ fontSize: "0.9rem", textAlign: "center" }}>
            Violation of these guidelines may result in account suspension, forfeiture of rewards, and legal action where applicable.
          </p>
        </div>
      </div>
    </main>
  );
}
