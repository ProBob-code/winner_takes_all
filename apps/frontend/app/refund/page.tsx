"use client";
import React from "react";

export default function RefundPage() {
  return (
    <main className="page" style={{ padding: "80px 6%" }}>
      <div className="shell" style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "5rem" }}>
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 950, marginBottom: "1rem" }}>Refund <span className="text-gradient">Policy</span></h1>
          <p className="muted" style={{ fontSize: "1.1rem" }}>Fair and transparent cancellation guidelines.</p>
        </div>

        <div className="terms-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "2.5rem" }}>
          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(187, 134, 252, 0.1)", color: "#bb86fc" }}>🔄</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1.5rem" }}>1. Event Cancellations</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              If an event is cancelled by the organizer before the start time, 100% of the fee will be refunded to your account balance within 24-48 hours.
            </p>
          </section>

          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(3, 218, 198, 0.1)", color: "#03dac6" }}>🚫</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1.5rem" }}>2. Participation Fees</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              Fees are non-refundable once the tournament has commenced. Withdrawals before the start are subject to organizer approval.
            </p>
          </section>

          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(255, 183, 0, 0.1)", color: "#ffb700" }}>🔧</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1.5rem" }}>3. Technical Failures</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              In the event of a Platform-wide failure that prevents completion, we will work with organizers to provide fair fee resolutions.
            </p>
          </section>

          <section className="glass-panel" style={{ padding: "3rem" }}>
            <div className="card-icon" style={{ background: "rgba(139, 92, 246, 0.1)", color: "#8b5cf6" }}>⏱️</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1.5rem" }}>4. Processing Time</h2>
            <p className="muted" style={{ lineHeight: 1.8 }}>
              Internal balance refunds are immediate. Payout requests for withdrawable credits typically take 3-5 business days.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
