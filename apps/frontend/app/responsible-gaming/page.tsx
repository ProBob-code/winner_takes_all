export default function ResponsibleGamingPage() {
  return (
    <div className="container" style={{ paddingTop: "120px", paddingBottom: "60px", maxWidth: "800px", margin: "0 auto", color: "var(--text-primary)" }}>
      <h1 style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>Responsible Gaming</h1>
      <p className="muted" style={{ marginBottom: "2rem" }}>Last updated: May 2026</p>
      <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem", lineHeight: 1.6 }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>1. Healthy Competition</h2>
          <p>Stadium Arena is a skill-based tournament organizer. We encourage players to engage in healthy social competition and take breaks when needed.</p>
        </div>
        <div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>2. Limits & Self-Exclusion</h2>
          <p>If you feel you are spending too much time or money on platform fees, you can set limits on your account or opt for self-exclusion. Please contact support to implement these measures.</p>
        </div>
        <div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>3. Clear "Not Gambling" Explanation</h2>
          <p>We reiterate that this is not a gambling site. There are no "winner takes all" wagers or random chance games. Your success depends entirely on your skill in the chosen esports titles.</p>
        </div>
      </section>
    </div>
  );
}
