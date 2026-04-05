import Link from "next/link";

const pillars = [
  {
    title: "Financial-Grade Entry Flow",
    body: "Wallet ledger, webhook verification, idempotent payment processing, and transaction-safe tournament joins."
  },
  {
    title: "Realtime Match Progression",
    body: "Bracket state, live match rooms, result propagation, and async matchmaking built around Redis-backed orchestration."
  },
  {
    title: "Operational Control",
    body: "Admin tooling for tournament creation, payouts, refunds, match overrides, and system visibility."
  }
];

const quickStats = [
  { label: "Core services", value: "6" },
  { label: "Primary user flows", value: "8" },
  { label: "Payment trust surface", value: "Backend-only" }
];

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div className="shell hero-grid">
          <div className="panel hero-card">
            <span className="eyebrow">Phase 1 foundation</span>
            <h1>Paid multiplayer tournaments, built for live play.</h1>
            <p>
              WTA combines secure payments, tournament automation, realtime match state,
              wallet accounting, and live progression for 8-ball competition.
            </p>
            <div className="cta-row">
              <Link className="button" href="/signup">
                Create account
              </Link>
              <Link className="button-secondary" href="/tournaments">
                Browse tournaments
              </Link>
            </div>
          </div>
          <div className="stack">
            {quickStats.map((item) => (
              <div className="panel stat-card" key={item.label}>
                <div className="label">{item.label}</div>
                <div className="stat">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell section-grid">
          {pillars.map((pillar) => (
            <article className="panel section-card" key={pillar.title}>
              <h3>{pillar.title}</h3>
              <p className="muted">{pillar.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
