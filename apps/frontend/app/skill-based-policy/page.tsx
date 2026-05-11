"use client";
import React from "react";

export default function SkillBasedPolicyPage() {
  return (
    <main className="page" style={{ padding: "80px 6%" }}>
      <div className="shell" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "3.5rem", fontWeight: 900, marginBottom: "2rem", textAlign: "center" }}>Skill-Based Competition Policy</h1>
        
        <div className="panel" style={{ padding: "2.5rem", marginBottom: "4rem", border: "2px solid var(--accent-subtle)", background: "rgba(139, 92, 246, 0.05)" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1rem", color: "var(--accent-light)" }}>Official Declaration</h2>
          <p style={{ fontSize: "1.2rem", lineHeight: 1.8, fontWeight: 500 }}>
            W.T.A does not facilitate betting or games of chance. Tournament outcomes are determined solely by player skill and organizer-defined rules. 
            This platform is strictly for the administration of skill-based esports competitions.
          </p>
        </div>

        <section className="stack" style={{ gap: "3rem" }}>
          <div>
            <h2 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "1rem" }}>Definition of Skill-Based Competition</h2>
            <p className="muted" style={{ lineHeight: 1.8, fontSize: "1.1rem" }}>
              A "Game of Skill" is a competition where the outcome is predominantly determined by the physical or mental skill of the participants, 
              rather than by chance. On W.T.A, this includes tactical decision-making, mechanical precision, strategic planning, 
              and deep knowledge of the game mechanics.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "1rem" }}>Legal Compliance</h2>
            <p className="muted" style={{ lineHeight: 1.8, fontSize: "1.1rem" }}>
              Our platform operates in full compliance with international and regional laws governing skill-based competitions. 
              In many jurisdictions, including India, games of skill are legally distinct from gambling and are protected under various 
              constitutional frameworks. W.T.A ensures that all events hosted on its infrastructure meet the criteria of a 
              skill-dominant competition.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "1rem" }}>Infrastructure Framing</h2>
            <p className="muted" style={{ lineHeight: 1.8, fontSize: "1.1rem" }}>
              As a SaaS provider, W.T.A provides the digital environment for organizers to host their events. 
              The platform facilitates the collection of participation fees and the distribution of rewards as a service 
              to the organizer. W.T.A is not the operator of the game itself, but the technology layer that 
              ensures the tournament runs smoothly and fairly.
            </p>
          </div>

          <div style={{ padding: "2rem", borderTop: "1px solid var(--glass-bg-hover)", marginTop: "2rem" }}>
            <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "1rem" }}>Prohibited Regions</h3>
            <p className="muted" style={{ fontSize: "0.95rem" }}>
              While skill-based gaming is legal in many areas, certain regional restrictions may apply. Users are responsible for 
              ensuring that their participation is compliant with local laws. W.T.A reserves the right to restrict 
              access in jurisdictions where skill-based competition rewards are regulated or prohibited.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
