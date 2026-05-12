"use client";
import React from "react";

export default function SkillBasedPolicyPage() {
  return (
    <main className="page" style={{ padding: "100px 6% 80px" }}>
      <div className="shell" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <header style={{ marginBottom: "5rem" }}>
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 950, marginBottom: "1rem", letterSpacing: "-2px" }}>
            SKILL-BASED <span className="text-gradient" style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>POLICY.</span>
          </h1>
          <p className="muted" style={{ fontSize: "1.1rem" }}>Defining the technical boundary between chance and expertise.</p>
        </header>

        <div className="stack" style={{ gap: "2rem" }}>
          {[
            {
              title: "Definition of Skill",
              content: "A game of skill is one where the outcome is determined predominantly by mental or physical expertise, rather than chance. W.T.A only supports titles where mechanical skill, strategic planning, and knowledge of game mechanics are the primary factors in success."
            },
            {
              title: "Randomness & RNG",
              content: "While many modern games contain elements of randomness (RNG), we only support titles where such elements are balanced and controllable by skilled players. Titles that rely primarily on luck or random outcomes are strictly prohibited from utilizing our reward infrastructure."
            },
            {
              title: "Legal Declaration",
              content: "Winner.Takes.All operates as a B2B tournament infrastructure provider. We facilitate skill-based competitions which are legally distinct from gambling in most jurisdictions. Users and organizers are responsible for verifying the specific legality of skill-based rewards in their region."
            },
            {
               title: "Infrastructure Framing",
               content: "As a SaaS provider, W.T.A provides the digital environment for organizers to host their events. The platform facilitates the collection of participation fees and the distribution of rewards as a service to the organizer."
            }
          ].map((section, idx) => (
            <section key={idx} className="panel" style={{ padding: "2.5rem", display: "flex", gap: "2rem", alignItems: "flex-start" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--gold)", opacity: 0.3, fontFamily: "var(--font-outfit)", minWidth: "40px" }}>
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
