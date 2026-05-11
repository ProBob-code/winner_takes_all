"use client";
import React from "react";

export default function RefundPage() {
  return (
    <main className="page" style={{ padding: "80px 6%" }}>
      <div className="shell" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "3rem", fontWeight: 900, marginBottom: "1rem" }}>Refund & Cancellation Policy</h1>
        <p className="muted" style={{ marginBottom: "3rem" }}>Last updated: May 11, 2026</p>

        <div className="stack" style={{ gap: "2.5rem", lineHeight: 1.8 }}>
          <section>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>1. Event Cancellations</h2>
            <p className="muted">
              If an event is cancelled by the organizer before the scheduled start time, 100% of the 
              Participation Fee paid by the user will be refunded to their Organizer Account Balance. 
              Refunds are typically processed automatically within 24-48 hours of the cancellation.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>2. Participation Fee Refunds</h2>
            <p className="muted">
              Participation Fees are non-refundable once the tournament has commenced. If a user chooses 
              to withdraw from an event after registration but before the event starts, a refund may 
              be granted at the sole discretion of the organizer, minus any platform service fees.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>3. Technical Failures</h2>
            <p className="muted">
              WTA Arena is not responsible for technical issues originating from the user's side 
              (e.g., internet disconnection, hardware failure, game client crashes). In the event of 
              a Platform-wide technical failure that prevents the completion of an event, WTA Arena 
              will work with organizers to ensure fair resolution, which may include a full refund of 
              Participation Fees.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>4. Disputed Results</h2>
            <p className="muted">
              Decisions regarding match results and disqualifications are made by the respective 
              tournament organizers. WTA Arena provides the infrastructure for these decisions but 
              does not override organizer rulings unless a technical error in the Platform's 
              automation is identified.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>5. Processing Time</h2>
            <p className="muted">
              Refunds to your Platform Balance are immediate once approved. Payout requests for your 
              withdrawable balance are subject to verification and typically take 3-5 business days 
              to process via our payment partners.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
