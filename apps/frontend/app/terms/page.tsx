export default function TermsPage() {
  return (
    <div className="container" style={{ paddingTop: "120px", paddingBottom: "60px", maxWidth: "800px", margin: "0 auto", color: "var(--text-primary)" }}>
      <h1 style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>Terms & Conditions</h1>
      <p className="muted" style={{ marginBottom: "2rem" }}>Last updated: May 2026</p>
      <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem", lineHeight: 1.6 }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>1. Introduction</h2>
          <p>Welcome to Stadium Arena. By accessing our esports community platform, you agree to these Terms & Conditions. This platform is strictly a skill-based tournament organizer and social competition app.</p>
        </div>
        <div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>2. Skill-Based Gaming</h2>
          <p>Stadium Arena is not a gambling platform. All competitions require skill, and outcomes are determined solely by the players' abilities and performance. Chance plays no material role in determining the outcome of any tournament.</p>
        </div>
        <div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>3. Platform Fees and Rewards</h2>
          <p>Users may be required to pay a platform hosting fee to participate in certain club tournaments. Winners may receive reward credits or sponsored prizes. These are not cash jackpots or pooled wagers.</p>
        </div>
        <div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>4. Eligibility</h2>
          <p>You must be at least 18 years of age to use this platform. By registering, you confirm that you meet this age restriction (18+).</p>
        </div>
      </section>
    </div>
  );
}
