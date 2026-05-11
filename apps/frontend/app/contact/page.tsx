"use client";
import React from "react";

export default function ContactPage() {
  return (
    <main className="page" style={{ padding: "80px 6%" }}>
      <div className="shell" style={{ maxWidth: "800px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "3.5rem", fontWeight: 900, marginBottom: "2rem", textAlign: "center" }}>Contact Us</h1>
        
        <p className="muted" style={{ textAlign: "center", marginBottom: "4rem", fontSize: "1.1rem" }}>
          Have questions about our platform or interested in hosting an event? Get in touch with our team.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" }}>
          <div className="panel" style={{ padding: "2.5rem", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>✉️</div>
            <h3 style={{ marginBottom: "0.5rem" }}>Email Support</h3>
            <p className="muted" style={{ marginBottom: "1.5rem" }}>For technical queries and general support.</p>
            <a href="mailto:support@wta-arena.com" style={{ fontWeight: 700, color: "var(--accent-light)" }}>support@wta-arena.com</a>
          </div>

          <div className="panel" style={{ padding: "2.5rem", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🏢</div>
            <h3 style={{ marginBottom: "0.5rem" }}>Business Office</h3>
            <p className="muted" style={{ marginBottom: "1.5rem" }}>WTA Platform Operations</p>
            <address style={{ fontStyle: "normal", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              123 Esports Avenue, Tech Hub<br />
              Bangalore, Karnataka 560001<br />
              India
            </address>
          </div>
        </div>

        <section style={{ marginTop: "5rem", textAlign: "center" }}>
          <h2 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "1.5rem" }}>Organizer Inquiries</h2>
          <p className="muted" style={{ maxWidth: "600px", margin: "0 auto 2rem", lineHeight: 1.6 }}>
            For enterprise-level tournament infrastructure and custom event management solutions, please contact our business development team.
          </p>
          <a href="mailto:biz@wta-arena.com" className="button">Contact Partnerships</a>
        </section>
      </div>
    </main>
  );
}
