export default function PrivacyPage() {
  return (
    <div className="container" style={{ paddingTop: "120px", paddingBottom: "60px", maxWidth: "800px", margin: "0 auto", color: "var(--text-primary)" }}>
      <h1 style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>Privacy Policy</h1>
      <p className="muted" style={{ marginBottom: "2rem" }}>Last updated: May 2026</p>
      <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem", lineHeight: 1.6 }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>1. Data Collection</h2>
          <p>We collect necessary information to manage your account, facilitate skill-based tournaments, and ensure a secure environment. This includes email addresses, usernames, and payment details for platform fees and reward distribution.</p>
        </div>
        <div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>2. Data Usage</h2>
          <p>Your data is used strictly to provide our services, prevent fraud, and comply with KYC/AML regulations. We do not sell your personal data to third parties.</p>
        </div>
      </section>
    </div>
  );
}
