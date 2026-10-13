"use client";
import React from "react";

/**
 * Formerly the "skill-based policy": a page arguing that skill-based contests
 * are legally distinct from gambling. India's Promotion and Regulation of
 * Online Gaming Act 2025, in force since 1 May 2026, prohibits games played
 * for a stake whether they turn on skill or on chance — so that argument is
 * not a defence, and publishing it only evidenced which defence was relied on.
 *
 * The route is kept so existing links and footers do not break; what it says
 * is now the position actually taken: no stakes at all.
 */
export default function NoStakesPolicyPage() {
  const sections = [
    {
      title: "No stakes are accepted",
      content:
        "Winner Takes All does not accept entry fees, deposits, or any other payment from players. Tournaments hosted on this platform are free to enter. There is no wallet, no top-up, and no means by which a player can stake money through this service.",
    },
    {
      title: "No prize pool is formed from players",
      content:
        "No prize is funded by pooling money from entrants. Where a tournament carries a prize, it is provided by the organising venue or a sponsor, and is awarded by them directly. The platform neither holds nor distributes prize money.",
    },
    {
      title: "WTA Coins are not money",
      content:
        "Players earn WTA Coins for turning up and playing. A coin has no cash value and no exchange rate. It cannot be bought, sold, transferred to another player, withdrawn, redeemed for money or goods, or staked on the outcome of anything. Losing a frame never costs a coin — a frame can only ever earn them. A balance is a record of what somebody has played, in the same way a league table is, and it is deliberately held in a separate ledger that is never joined to any record of money.",
    },
    {
      title: "Why the coin is built that way",
      content:
        "The Promotion and Regulation of Online Gaming Act, 2025 prohibits a game played for money or other stakes, and defines other stakes to include credits, coins and tokens equivalent or convertible to money. A coin that could be purchased, cashed out or wagered would therefore be a stake, whatever it was called. So this one is none of those things: there is no route in this service that turns money into coins or coins into money, and no way to risk a coin on a result.",
    },
    {
      title: "What the platform actually does",
      content:
        "Winner Takes All is tournament software. It draws brackets, keeps score for the games it supports, maintains league tables across a series, and displays all of this on a screen. It is sold to venues and organisers as business software, on a subscription.",
    },
    {
      title: "Why this page changed",
      content:
        "This page previously argued that skill-based competitions are legally distinct from games of chance. The Promotion and Regulation of Online Gaming Act, 2025, which came into force on 1 May 2026, prohibits online money games irrespective of whether they turn on skill or on chance. That argument is therefore no longer a defence, and the platform no longer relies on it: it has stopped taking stakes altogether rather than attempting to characterise them.",
    },
    {
      title: "Organisers remain responsible for their own events",
      content:
        "Anything a venue collects at its own counter, and any prize it chooses to award, is that venue's own activity and its own responsibility. Organisers should satisfy themselves as to the law that applies to them. Nothing on this page is legal advice.",
    },
  ];

  return (
    <main className="page" style={{ padding: "100px 6% 80px" }}>
      <div className="shell" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <header style={{ marginBottom: "5rem" }}>
          <h1
            style={{
              fontSize: "clamp(2rem, 5vw, 4rem)",
              fontWeight: 950,
              marginBottom: "1rem",
              letterSpacing: "-2px",
            }}
          >
            NO-STAKES{" "}
            <span
              className="text-gradient"
              style={{
                background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              POLICY.
            </span>
          </h1>
          <p className="muted" style={{ fontSize: "1.1rem" }}>
            No entry fees. No wallet. No pooled prize money. WTA Coins have no cash
            value.
          </p>
        </header>

        <div className="stack" style={{ gap: "2rem" }}>
          {sections.map((section, idx) => (
            <section
              key={section.title}
              className="panel"
              style={{ padding: "2.5rem", display: "flex", gap: "2rem", alignItems: "flex-start", flexWrap: "wrap" }}
            >
              <div
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 900,
                  color: "var(--gold)",
                  opacity: 0.3,
                  fontFamily: "var(--font-outfit)",
                  minWidth: "40px",
                }}
              >
                {(idx + 1).toString().padStart(2, "0")}
              </div>
              <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                <h2 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: "1rem" }}>{section.title}</h2>
                <p className="muted" style={{ lineHeight: 1.8 }}>{section.content}</p>
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
