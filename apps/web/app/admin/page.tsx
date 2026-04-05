const controls = [
  "Create and publish tournaments",
  "Monitor payments and webhook health",
  "Inspect wallet adjustments and refunds",
  "Force-complete or cancel matches",
  "Review user bans and fraud flags"
];

export default function AdminPage() {
  return (
    <main className="page">
      <div className="shell page-grid">
        <section className="panel page-card">
          <h2>Admin control room</h2>
          <div className="list">
            {controls.map((item) => (
              <div className="list-item" key={item}>
                {item}
              </div>
            ))}
          </div>
        </section>

        <aside className="panel page-card">
          <h2>High-risk operations</h2>
          <p className="muted">
            Refunds, force-complete actions, and wallet adjustments should require
            reason codes, actor tracking, and immutable audit logs.
          </p>
        </aside>
      </div>
    </main>
  );
}
