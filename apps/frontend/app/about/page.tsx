import Link from "next/link";

const SPORTS = ["Pool", "Football", "Tennis", "Badminton", "Pickleball", "Table tennis"];

const HOW = [
  {
    n: "01",
    title: "Set it up in a minute",
    body: "Pick the game, how many are playing and how many frames each. Names are optional: anyone who turns up later scans the code on the screen and types their name.",
  },
  {
    n: "02",
    title: "Score it from your phone",
    body: "Big buttons, or just say the score out loud. It keeps working when the wifi drops and catches up when it comes back, so the board never waits.",
  },
  {
    n: "03",
    title: "Show the room",
    body: "The live table goes on any spare screen, the draw and results go to the group chat in one tap, and a series carries the standings from one week to the next.",
  },
];

const FOR_PLAYERS = [
  { title: "A trophy ladder for every sport", body: "Win to climb. Every sport keeps its own ladder and its own champion." },
  { title: "Coins every game you play", body: "Win or lose, every game pays WTA Coins. Spend them on frames, emotes and artifacts to show off." },
  { title: "Wins verified at the table", body: "Both players check in with the code on the scorer's screen, so a win on W.T.A is a win that happened." },
];

const PROMISES = [
  { title: "Free, always", body: "No entry fees, no pot, nothing to cash out. Any prize at a night comes from the venue running it." },
  { title: "Coins are for bragging", body: "WTA Coins have no cash value. They can't be bought, withdrawn, transferred or bet." },
  { title: "Built for real rooms", body: "Bad wifi, a crowded bar, a walk-in with no account: W.T.A was built for the night as it really goes." },
];

export default function AboutPage() {
  return (
    <main className="page" style={{ padding: "clamp(32px, 6vw, 80px) 6% 80px" }}>
      <div className="shell" style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <header style={{ marginBottom: "4rem", textAlign: "center" }}>
          <div style={{ display: "inline-block", padding: "0.45rem 1.2rem", borderRadius: "999px", border: "1.5px solid color-mix(in oklab, var(--gold) 60%, transparent)", color: "var(--gold)", fontSize: "0.85rem", fontWeight: 700, marginBottom: "1.75rem" }}>
            Real tables. Real rivals. Real bragging rights.
          </div>
          <h1 style={{ fontSize: "clamp(2.6rem, 7vw, 4.8rem)", fontWeight: 950, lineHeight: 0.95, letterSpacing: "-2px", marginBottom: "1.5rem", textTransform: "uppercase", fontStyle: "italic" }}>
            Play the night.<br />
            <span style={{ background: "var(--gradient-fill)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>Take the crown.</span>
          </h1>
          <p className="muted" style={{ maxWidth: "640px", margin: "0 auto", fontSize: "1.15rem", lineHeight: 1.65 }}>
            Winner Takes All (W.T.A) runs game nights for the places that host them — pool rooms, clubs, bars and gaming
            cafés — and gives every player a record worth playing for.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center", marginTop: "1.75rem" }}>
            {SPORTS.map((s) => (
              <span key={s} className="panel" style={{ padding: "0.4rem 0.9rem", borderRadius: "999px", fontSize: "0.85rem", fontWeight: 700 }}>{s}</span>
            ))}
          </div>
        </header>

        <section style={{ marginBottom: "4.5rem" }}>
          <h2 style={{ fontSize: "1.9rem", fontWeight: 900, marginBottom: "1.5rem", textAlign: "center" }}>How a night runs</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: "1.25rem" }}>
            {HOW.map((h) => (
              <div key={h.n} className="panel" style={{ padding: "2rem", position: "relative", overflow: "hidden" }}>
                <div aria-hidden style={{ position: "absolute", top: "-0.6rem", right: "0.5rem", fontSize: "5rem", fontWeight: 900, opacity: 0.07 }}>{h.n}</div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 800, marginBottom: "0.75rem" }}>{h.title}</h3>
                <p className="muted" style={{ lineHeight: 1.7, margin: 0 }}>{h.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: "4.5rem" }}>
          <h2 style={{ fontSize: "1.9rem", fontWeight: 900, marginBottom: "1.5rem", textAlign: "center" }}>Why players keep coming back</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: "1.25rem" }}>
            {FOR_PLAYERS.map((p) => (
              <div key={p.title} className="panel" style={{ padding: "2rem", borderTop: "3px solid var(--gold)" }}>
                <h3 style={{ fontSize: "1.15rem", fontWeight: 800, marginBottom: "0.6rem" }}>{p.title}</h3>
                <p className="muted" style={{ lineHeight: 1.7, margin: 0 }}>{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" style={{ padding: "2.5rem", marginBottom: "4.5rem" }}>
          <h2 style={{ fontSize: "1.6rem", fontWeight: 900, marginBottom: "1rem" }}>Who&apos;s behind it</h2>
          <p className="muted" style={{ lineHeight: 1.8, margin: 0 }}>
            W.T.A is built by <strong style={{ color: "var(--text-primary)" }}>ProBob</strong>, a developer from Bangalore who
            works in AI and trading systems, and who wanted a league night where the draw, the scoring and the table keep
            themselves, so the people running the room can get back to the room.
          </p>
        </section>

        <section style={{ marginBottom: "4rem" }}>
          <h2 style={{ fontSize: "1.9rem", fontWeight: 900, marginBottom: "1.5rem", textAlign: "center" }}>What we promise</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: "1.25rem" }}>
            {PROMISES.map((p) => (
              <div key={p.title} className="panel" style={{ padding: "2rem" }}>
                <h3 style={{ fontSize: "1.15rem", fontWeight: 800, marginBottom: "0.6rem" }}>{p.title}</h3>
                <p className="muted" style={{ lineHeight: 1.7, margin: 0 }}>{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ textAlign: "center" }}>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/tournaments" style={{ background: "var(--gradient-fill)", color: "var(--on-gold)", padding: "1rem 2rem", borderRadius: "14px", textDecoration: "none", fontWeight: 800 }}>FIND A GAME →</Link>
            <Link href="/run" className="panel" style={{ padding: "1rem 2rem", borderRadius: "14px", textDecoration: "none", fontWeight: 800, color: "var(--text-primary)" }}>HOST A NIGHT</Link>
          </div>
          <p className="muted" style={{ marginTop: "1.5rem" }}>
            Running a venue, or want W.T.A at yours? <Link href="/contact">Get in touch</Link>.
          </p>
        </section>
      </div>
    </main>
  );
}
