import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The frame around the login and signup forms.
 *
 * On a wide screen the pitch sits beside the form: a headline, a sample
 * final showing what a finished game looks like, the six sports and four
 * perks. On a phone the form comes first, since getting to the Google
 * button or the fields is the point, and the pitch follows it.
 *
 * Nothing here animates. The page is somewhere to type, so it holds still.
 *
 * What it promises is only what is true: coins have no cash value and
 * nothing costs money to enter (see the Online Gaming Act note in
 * app/signup/page.tsx's history). The scorecard is labelled as a sample.
 */

const SPORTS = [
  { icon: "🎱", label: "Pool" },
  { icon: "⚽", label: "Football" },
  { icon: "🎾", label: "Tennis" },
  { icon: "🏸", label: "Badminton" },
  { icon: "🥒", label: "Pickleball" },
  { icon: "🏓", label: "Table tennis" },
];

const PERKS = [
  { icon: "🏆", label: "A trophy ladder", detail: "One for every sport you play" },
  { icon: "🪙", label: "WTA Coins every game", detail: "Frames, emotes and gear. No cash value." },
  { icon: "✅", label: "Verified wins", detail: "Both phones check in at the table" },
  { icon: "🎟️", label: "Free, always", detail: "No entry fees, no wallet, no top-ups" },
];

function SampleFinal() {
  return (
    <div className="auth-final" aria-label="A sample final, for illustration">
      <div className="auth-final-top">
        <span className="auth-final-tag">🎱 POOL · FINAL</span>
        <span className="auth-final-sample">SAMPLE</span>
      </div>
      <div className="auth-final-row is-winner">
        <span className="auth-avatar" aria-hidden>A</span>
        <span className="auth-final-name">Ava <span aria-hidden>👑</span></span>
        <span className="auth-final-score">5</span>
      </div>
      <div className="auth-final-row">
        <span className="auth-avatar is-alt" aria-hidden>R</span>
        <span className="auth-final-name">Rohan</span>
        <span className="auth-final-score">3</span>
      </div>
      <div className="auth-final-foot">
        <span className="auth-stamp">✓ Verified at the table</span>
        <span className="auth-coins">🪙 +120 coins</span>
      </div>
    </div>
  );
}

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

          <SampleFinal />

          <ul className="auth-sports" aria-label="Sports on WTA">
            {SPORTS.map((s) => (
              <li key={s.label}>
                <span aria-hidden>{s.icon}</span> {s.label}
              </li>
            ))}
          </ul>

          <ul className="auth-perks">
            {PERKS.map((p) => (
              <li key={p.label}>
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
          <div className="auth-card-wrap">
            <div className="auth-emblem" aria-hidden>👑</div>
            <section className="panel auth-card">{children}</section>
          </div>
          <p className="auth-switch">
            {switchText}{" "}
            <Link href={switchHref}>{switchLabel}</Link>
          </p>
        </div>
      </div>

      <style>{`
        .auth-page {
          display: flex; align-items: center; justify-content: center;
          position: relative; overflow: hidden;
          /* A still glow and a faint dot grid, so the page is not a flat void. */
          background:
            radial-gradient(600px 420px at 78% 40%, color-mix(in oklab, var(--accent, #f5c518) 14%, transparent), transparent 70%),
            radial-gradient(520px 380px at 12% 80%, color-mix(in oklab, #ef4444 9%, transparent), transparent 70%),
            radial-gradient(circle, color-mix(in oklab, var(--text-primary, #fff) 7%, transparent) 1px, transparent 1.5px) 0 0 / 22px 22px;
        }
        .auth-grid {
          width: 100%;
          max-width: 1040px;
          padding: 2rem 1rem 3rem;
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
          margin: 0 0 1.5rem;
        }
        .auth-headline .auth-accent { display: block; color: var(--accent, var(--gold)); }

        /* The sample final: a scorecard, tilted a touch like a card on a table. */
        .auth-final {
          max-width: 360px;
          padding: 14px 16px;
          border-radius: 16px;
          background: var(--bg-card, #16161c);
          border: 1px solid var(--glass-border-color, rgba(255,255,255,0.08));
          box-shadow: 6px 6px 0 color-mix(in oklab, var(--accent, #f5c518) 55%, transparent);
          transform: rotate(-1.5deg);
          margin-bottom: 1.5rem;
        }
        .auth-final-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .auth-final-tag { font-size: 0.7rem; font-weight: 800; letter-spacing: 1px; color: var(--text-muted); }
        .auth-final-sample {
          font-size: 0.6rem; font-weight: 800; letter-spacing: 1px; color: var(--text-muted);
          border: 1px dashed var(--glass-border-color, rgba(255,255,255,0.2)); border-radius: 6px; padding: 2px 6px;
        }
        .auth-final-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; border-radius: 10px;
        }
        .auth-final-row + .auth-final-row { margin-top: 4px; }
        .auth-final-row.is-winner { background: color-mix(in oklab, var(--accent, #f5c518) 13%, transparent); }
        .auth-avatar {
          flex: none; width: 30px; height: 30px; border-radius: 50%;
          display: grid; place-items: center; font-weight: 900; font-size: 0.85rem;
          background: var(--accent, #f5c518); color: #16150f;
        }
        .auth-avatar.is-alt { background: color-mix(in oklab, #ef4444 75%, #fff); color: #fff; }
        .auth-final-name { flex: 1; font-weight: 800; }
        .auth-final-row:not(.is-winner) .auth-final-name { color: var(--text-muted); font-weight: 700; }
        .auth-final-score { font-size: 1.35rem; font-weight: 900; font-variant-numeric: tabular-nums; }
        .auth-final-row:not(.is-winner) .auth-final-score { color: var(--text-muted); }
        .auth-final-foot {
          display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap;
          margin-top: 12px; padding-top: 10px;
          border-top: 1px dashed var(--glass-border-color, rgba(255,255,255,0.12));
          font-size: 0.75rem; font-weight: 800;
        }
        .auth-stamp { color: #22c55e; }
        .auth-coins { color: var(--accent, var(--gold)); }

        .auth-sports { list-style: none; padding: 0; margin: 0 0 1.5rem; display: flex; flex-wrap: wrap; gap: 6px; }
        .auth-sports li {
          font-size: 0.78rem; font-weight: 700; padding: 5px 11px; border-radius: 999px;
          background: var(--glass-bg, rgba(255,255,255,0.05));
          border: 1px solid var(--glass-border-color, rgba(255,255,255,0.08));
        }

        .auth-perks { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .auth-perks li {
          display: flex; gap: 10px; align-items: flex-start;
          padding: 12px; border-radius: 12px;
          background: var(--glass-bg, rgba(255,255,255,0.04));
          border: 1px solid var(--glass-border-color, rgba(255,255,255,0.08));
        }
        .auth-perks strong { display: block; font-size: 0.88rem; }
        .auth-perks .muted { display: block; font-size: 0.76rem; line-height: 1.35; margin-top: 2px; }
        .auth-perk-icon {
          flex: none; width: 32px; height: 32px; border-radius: 9px;
          display: grid; place-items: center; font-size: 1rem;
          background: color-mix(in oklab, var(--accent, #f5c518) 12%, transparent);
        }

        .auth-card-wrap { position: relative; padding-top: 26px; }
        .auth-emblem {
          position: absolute; top: 0; left: 50%; transform: translateX(-50%); z-index: 2;
          width: 54px; height: 54px; border-radius: 50%;
          display: grid; place-items: center; font-size: 1.6rem;
          background: var(--bg-card, #16161c);
          border: 2px solid var(--accent, #f5c518);
          box-shadow: 0 6px 20px color-mix(in oklab, var(--accent, #f5c518) 30%, transparent);
        }
        .auth-card { padding: 2.6rem 2rem 2.25rem; }
        .auth-switch { text-align: center; margin: 1.25rem 0 0; color: var(--text-muted); font-size: 0.95rem; }
        .auth-switch a { color: var(--accent, var(--gold)); font-weight: 700; text-decoration: none; }

        /* A phone: the form first, then the scorecard, sports and perks. */
        @media (max-width: 860px) {
          .auth-grid { grid-template-columns: minmax(0, 1fr); max-width: 460px; gap: 2rem; padding-top: 1rem; }
          .auth-form-col { order: 1; }
          .auth-pitch { order: 2; }
          .auth-kicker, .auth-headline { display: none; }
          .auth-final { margin: 0 auto 1.25rem; transform: none; }
          .auth-sports { justify-content: center; }
          .auth-card { padding: 2.4rem 1.25rem 1.75rem; }
        }
        @media (max-width: 420px) {
          .auth-perks { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}
