import Link from "next/link";
import type { ReactNode } from "react";

export const SUPPORT_EMAIL = "support@wta-arena.com";

export type LegalSection = { id: string; title: string; body: ReactNode };

/**
 * The shared frame for Terms and Privacy: a heading, the date it took effect,
 * a short summary, a contents list, then numbered sections.
 */
export function LegalPage({
  title,
  accent,
  effective,
  summary,
  sections,
}: {
  title: string;
  accent: string;
  effective: string;
  summary: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <main className="page" style={{ padding: "clamp(32px, 6vw, 80px) 6% 80px" }}>
      <div className="shell" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <header style={{ marginBottom: "2.5rem" }}>
          <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 3.6rem)", fontWeight: 950, marginBottom: "1rem", letterSpacing: "-1.5px", lineHeight: 1.05 }}>
            {title}{" "}
            <span style={{ background: "var(--gradient-fill)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {accent}
            </span>
          </h1>
          <p className="muted" style={{ fontSize: "0.9rem" }}>In effect from {effective}</p>
        </header>

        <section className="panel" style={{ padding: "1.75rem 2rem", marginBottom: "2rem", borderLeft: "3px solid var(--gold)" }}>
          <h2 style={{ fontSize: "1.05rem", fontWeight: 800, marginBottom: "0.75rem" }}>The short version</h2>
          <div className="muted legal-body" style={{ lineHeight: 1.75 }}>{summary}</div>
        </section>

        <nav aria-label="Contents" className="panel" style={{ padding: "1.5rem 2rem", marginBottom: "2rem" }}>
          <ol style={{ margin: 0, paddingLeft: "1.25rem", columns: "2 16rem", columnGap: "2rem", lineHeight: 1.9 }}>
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} style={{ color: "var(--text-secondary)", textDecoration: "none", fontWeight: 600 }}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="stack" style={{ gap: "1.25rem" }}>
          {sections.map((s, idx) => (
            <section key={s.id} id={s.id} className="panel" style={{ padding: "2rem", display: "flex", gap: "1.5rem", alignItems: "flex-start", scrollMarginTop: "96px" }}>
              <div aria-hidden style={{ fontSize: "1.4rem", fontWeight: 900, color: "var(--gold)", opacity: 0.45, fontFamily: "var(--font-outfit)", minWidth: "36px" }}>
                {(idx + 1).toString().padStart(2, "0")}
              </div>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 800, marginBottom: "0.75rem" }}>{s.title}</h2>
                <div className="muted legal-body" style={{ lineHeight: 1.75 }}>{s.body}</div>
              </div>
            </section>
          ))}
        </div>

        <p className="muted" style={{ marginTop: "2.5rem", fontSize: "0.9rem", textAlign: "center" }}>
          Questions? Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or use the{" "}
          <Link href="/contact">contact page</Link>.
        </p>
      </div>
      <style>{`
        .legal-body p { margin: 0 0 0.75rem; }
        .legal-body p:last-child, .legal-body ul:last-child { margin-bottom: 0; }
        .legal-body ul { margin: 0 0 0.75rem; padding-left: 1.2rem; }
        .legal-body li { margin: 0.3rem 0; }
        .legal-body strong { color: var(--text-primary); }
        .legal-body a { color: var(--gold); }
      `}</style>
    </main>
  );
}
