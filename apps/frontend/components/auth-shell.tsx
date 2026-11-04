import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The frame around the login and signup forms.
 *
 * On a wide screen the pitch sits beside the form; on a phone the form comes
 * first, since getting to the Google button or the fields is the point, and
 * the pitch shrinks to a row of pills under it.
 *
 * What it promises is only what is true: coins have no cash value and
 * nothing costs money to enter (see the Online Gaming Act note in
 * app/signup/page.tsx's history).
 */

const PERKS = [
  { icon: "🏆", label: "A trophy ladder for every sport", detail: "Pool, football, tennis, badminton, pickleball, table tennis" },
  { icon: "🪙", label: "WTA Coins every game", detail: "Unlock frames, emotes and gear. No cash value." },
  { icon: "✅", label: "Wins verified at the table", detail: "Both phones check in, so every result is real" },
  { icon: "🎟️", label: "Free to play, always", detail: "No entry fees, no wallet, no top-ups" },
];

export function AuthShell({
  children,
  kicker,
  headline,
  switchText,
  switchHref,
  switchLabel,
}: {
  children: ReactNode;
  kicker: string;
  headline: ReactNode;
  switchText: string;
  switchHref: string;
  switchLabel: string;
}) {
  return (
    <main className="page auth-page">
      <div className="auth-grid">
        <section className="auth-pitch">
          <div className="auth-kicker">{kicker}</div>
          <h1 className="auth-headline">{headline}</h1>
          <ul className="auth-perks">
            {PERKS.map((p) => (
              <li key={p.label} data-icon={p.icon}>
                <span className="auth-perk-icon" aria-hidden>{p.icon}</span>
                <span>
                  <strong>{p.label}</strong>
                  <span className="muted">{p.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="auth-form-col">
          <section className="panel auth-card">{children}</section>
          <p className="auth-switch">
            {switchText}{" "}
            <Link href={switchHref}>{switchLabel}</Link>
          </p>
        </div>
      </div>

      <style>{`
        .auth-page { display: flex; align-items: center; justify-content: center; }
        .auth-grid {
          width: 100%;
          max-width: 980px;
          padding: 0 1rem;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 440px);
          gap: 3.5rem;
          align-items: center;
        }
        .auth-kicker {
          display: inline-block;
          font-size: 0.75rem; font-weight: 800; letter-spacing: 1.5px;
          color: var(--accent, var(--gold));
          background: color-mix(in oklab, var(--accent, #f5c518) 10%, transparent);
          border: 1px solid color-mix(in oklab, var(--accent, #f5c518) 22%, transparent);
          padding: 6px 12px; border-radius: 999px; margin-bottom: 1.1rem;
        }
        .auth-headline {
          font-size: clamp(2.2rem, 4.4vw, 3.4rem);
          font-weight: 900; line-height: 0.98; letter-spacing: -1px;
          margin: 0 0 1.75rem;
        }
        .auth-headline .auth-accent { display: block; color: var(--accent, var(--gold)); }
        .auth-perks { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 1rem; }
        .auth-perks li { display: flex; gap: 12px; align-items: flex-start; }
        .auth-perks strong { display: block; font-size: 0.95rem; }
        .auth-perks .muted { font-size: 0.82rem; }
        .auth-perk-icon {
          flex: none; width: 34px; height: 34px; border-radius: 10px;
          display: grid; place-items: center; font-size: 1.05rem;
          background: var(--glass-bg, rgba(255,255,255,0.05));
          border: 1px solid var(--glass-border-color, rgba(255,255,255,0.08));
        }
        .auth-card { padding: 2.25rem 2rem; }
        .auth-switch { text-align: center; margin: 1.25rem 0 0; color: var(--text-muted); font-size: 0.95rem; }
        .auth-switch a { color: var(--accent, var(--gold)); font-weight: 700; text-decoration: none; }

        /* A phone: the form first, then the perks as small pills. */
        @media (max-width: 860px) {
          .auth-grid { grid-template-columns: minmax(0, 1fr); max-width: 460px; gap: 1.5rem; }
          .auth-form-col { order: 1; }
          .auth-pitch { order: 2; text-align: center; }
          .auth-kicker, .auth-headline { display: none; }
          .auth-perks { flex-direction: row; flex-wrap: wrap; justify-content: center; gap: 0.5rem; }
          .auth-perks li {
            align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px;
            background: var(--glass-bg, rgba(255,255,255,0.05));
            border: 1px solid var(--glass-border-color, rgba(255,255,255,0.08));
          }
          .auth-perks strong { font-size: 0.78rem; font-weight: 700; }
          .auth-perks .muted, .auth-perk-icon { display: none; }
          .auth-perks li::before { content: attr(data-icon); }
          .auth-card { padding: 1.75rem 1.25rem; }
        }
      `}</style>
    </main>
  );
}
