"use client";
import React from "react";

export default function AboutPage() {
  return (
    <main className="page" style={{ padding: "80px 6%" }}>
      <div className="shell" style={{ maxWidth: "800px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "3.5rem", fontWeight: 900, marginBottom: "2rem", textAlign: "center" }}>About WTA Arena</h1>
        
        <section style={{ marginBottom: "3rem" }}>
          <h2 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "1rem" }}>Our Mission</h2>
          <p className="muted" style={{ fontSize: "1.1rem", lineHeight: 1.8 }}>
            WTA Arena is dedicated to providing robust, professional-grade infrastructure for the global esports community. 
            We believe that competitive gaming should be accessible, organized, and transparent. Our platform empowers 
            tournament organizers with automated tools to host high-stakes, skill-based competitions with ease.
          </p>
        </section>

        <section style={{ marginBottom: "3rem" }}>
          <h2 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "1rem" }}>The Platform</h2>
          <p className="muted" style={{ fontSize: "1.1rem", lineHeight: 1.8 }}>
            Built by esports enthusiasts for the competitive community, WTA Arena focuses on the technical orchestration 
            of tournaments. From real-time bracket generation to automated result verification, we handle the 
            "heavy lifting" so organizers can focus on their communities and events.
          </p>
        </section>

        <section style={{ marginBottom: "3rem" }}>
          <h2 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "1rem" }}>Infrastructure Provider</h2>
          <p className="muted" style={{ fontSize: "1.1rem", lineHeight: 1.8 }}>
            WTA Arena operates strictly as a software-as-a-service (SaaS) provider. We do not operate games of chance 
            or facilitate betting. Our role is to provide the digital stadium where skill-based competition thrives 
            under the management of independent organizers.
          </p>
        </section>

        <div className="panel" style={{ padding: "2rem", marginTop: "4rem", textAlign: "center", border: "1px solid var(--accent-subtle)" }}>
          <h3 style={{ marginBottom: "1rem" }}>Join the Evolution</h3>
          <p className="muted">WTA Arena is the engine behind the next generation of esports events.</p>
        </div>
      </div>
    </main>
  );
}
