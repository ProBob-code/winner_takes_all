type MatchPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function MatchPage({ params }: MatchPageProps) {
  const { id } = await params;

  return (
    <main className="page">
      <div className="shell page-grid">
        <section className="panel page-card">
          <h2>Match Room {id}</h2>
          <p className="muted">
            This route is reserved for the realtime 8-ball surface, player presence,
            latency-sensitive state sync, and result confirmation.
          </p>
          <div className="list">
            <div className="list-item">WebSocket-authenticated room join</div>
            <div className="list-item">Disconnect and timeout handling</div>
            <div className="list-item">Server-authoritative result submission</div>
          </div>
        </section>

        <aside className="panel page-card">
          <h2>Expected APIs</h2>
          <div className="list">
            <div className="list-item">GET /matches/:id</div>
            <div className="list-item">POST /matches/:id/start</div>
            <div className="list-item">POST /matches/:id/result</div>
          </div>
        </aside>
      </div>
    </main>
  );
}
