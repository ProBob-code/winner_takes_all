"use client";
import React from "react";

export default function TermsPage() {
  return (
    <main className="page" style={{ padding: "80px 6%" }}>
      <div className="shell" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "3rem", fontWeight: 900, marginBottom: "1rem" }}>Terms & Conditions</h1>
        <p className="muted" style={{ marginBottom: "3rem" }}>Last updated: May 11, 2026</p>

        <div className="stack" style={{ gap: "2.5rem", lineHeight: 1.8 }}>
          <section>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>1. Agreement to Terms</h2>
            <p className="muted">
              By accessing or using the WTA Arena platform ("the Platform"), you agree to be bound by these Terms & Conditions. 
              The Platform is operated as a Tournament Infrastructure SaaS, providing tools for organizers to manage 
              competitive esports events.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>2. Nature of the Platform</h2>
            <p className="muted">
              WTA Arena is NOT a gambling platform. We do not facilitate betting, wagering, or games of chance. 
              All tournaments hosted on the Platform are strictly competitions of skill. The outcome of any match 
              is determined solely by the participants' performance, strategy, and mechanical skill.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>3. User Eligibility</h2>
            <p className="muted">
              You must be at least 18 years of age to register an account. Participation in tournaments may be 
              restricted in certain jurisdictions where skill-based competition rewards are regulated. It is your 
              responsibility to ensure compliance with your local laws.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>4. Participation Fees & Rewards</h2>
            <p className="muted">
              Organizers may require a "Participation Fee" to enter an event. This fee covers platform infrastructure 
              costs and event administration. "Championship Rewards" are sponsored by organizers and are distributed 
              based on verified tournament results.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>5. Intellectual Property</h2>
            <p className="muted">
              All content on the Platform, including software, design, logos, and text, is the property of WTA Arena 
              or its licensors. You may not reproduce, distribute, or create derivative works without explicit 
              written permission.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>6. Limitation of Liability</h2>
            <p className="muted">
              WTA Arena provides infrastructure services "as is". We are not liable for match outcomes, 
              organizer mismanagement, technical interruptions, or game-client failures. Our liability is limited 
              to the maximum extent permitted by law.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>7. Governing Law</h2>
            <p className="muted">
              These terms are governed by the laws of India. Any disputes arising from the use of the Platform 
              shall be subject to the exclusive jurisdiction of the courts in Bangalore, Karnataka.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
