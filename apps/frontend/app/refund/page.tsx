export default function RefundPage() {
  return (
    <div className="container" style={{ paddingTop: "120px", paddingBottom: "60px", maxWidth: "800px", margin: "0 auto", color: "var(--text-primary)" }}>
      <h1 style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>Refund Policy</h1>
      <p className="muted" style={{ marginBottom: "2rem" }}>Last updated: May 2026</p>
      <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem", lineHeight: 1.6 }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>1. Tournament Cancellations</h2>
          <p>If a tournament is cancelled before it begins, all platform hosting fees paid will be fully refunded to your account.</p>
        </div>
        <div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>2. Disconnections & Technical Issues</h2>
          <p>Refunds due to technical issues are evaluated on a case-by-case basis. As a skill-based platform, we strive for fairness, but we cannot be held responsible for individual user connectivity issues or game client crashes.</p>
        </div>
      </section>
    </div>
  );
}
