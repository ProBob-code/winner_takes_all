export default function KycAmlPage() {
  return (
    <div className="container" style={{ paddingTop: "120px", paddingBottom: "60px", maxWidth: "800px", margin: "0 auto", color: "var(--text-primary)" }}>
      <h1 style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>KYC & AML Policy</h1>
      <p className="muted" style={{ marginBottom: "2rem" }}>Last updated: May 2026</p>
      <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem", lineHeight: 1.6 }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>1. Know Your Customer (KYC)</h2>
          <p>To ensure a safe esports community platform, we verify the identity of our users. You may be asked to provide government-issued identification before withdrawing reward credits to prevent fraud and ensure you meet the 18+ age restriction.</p>
        </div>
        <div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>2. Anti-Money Laundering (AML)</h2>
          <p>We strictly prohibit the use of our platform for money laundering. We actively monitor transactions and will report any suspicious activity to the relevant authorities.</p>
        </div>
      </section>
    </div>
  );
}
