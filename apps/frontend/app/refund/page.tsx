"use client";
import React from "react";

export default function RefundPage() {
  return (
    <main className="page" style={{ padding: "100px 6% 80px" }}>
      <div className="shell" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <header style={{ marginBottom: "5rem" }}>
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 950, marginBottom: "1rem", letterSpacing: "-2px" }}>
            REFUND & <span className="text-gradient" style={{ background: "linear-gradient(135deg, #ef4444, #f97316)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CANCELLATION.</span>
          </h1>
          <p className="muted" style={{ fontSize: "1.1rem" }}>Transparent policies for a fair competition ecosystem.</p>
        </header>

        <div className="stack" style={{ gap: "2rem" }}>
          {[
            {
              title: "Event Cancellations",
              content: "If an event is cancelled by the organizer before the scheduled start time, 100% of the Participation Fee paid by the user will be refunded to their Organizer Account Balance. Refunds are typically processed automatically within 24-48 hours of the cancellation."
            },
            {
              title: "Participation Fee Refunds",
              content: "Participation Fees are non-refundable once the tournament has commenced. If a user chooses to withdraw from an event after registration but before the event starts, a refund may be granted at the sole discretion of the organizer, minus any platform service fees."
            },
            {
              title: "Technical Failures",
              content: "W.T.A is not responsible for technical issues originating from the user's side. In the event of a Platform-wide technical failure that prevents the completion of an event, W.T.A will work with organizers to ensure fair resolution, which may include a full refund of Participation Fees."
            },
            {
              title: "Processing Time",
              content: "Refunds to your Platform Balance are immediate once approved. Payout requests for your withdrawable balance are subject to verification and typically take 3-5 business days to process via our payment partners."
            }
          ].map((section, idx) => (
            <section key={idx} className="panel" style={{ padding: "2.5rem", display: "flex", gap: "2rem", alignItems: "flex-start" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--team-red)", opacity: 0.3, fontFamily: "var(--font-outfit)", minWidth: "40px" }}>
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
