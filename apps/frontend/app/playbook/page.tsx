"use client";

// Rendered per request, not prerendered. These pages read the router, the
// query string or the live tournament state at mount, and prerendering them
// trips Next's workUnitAsyncStorage invariant. The admin console already
// does this for the same reason.
export const dynamic = "force-dynamic";

/**
 * The league-night playbook, in the app.
 *
 * Phase 1.1, and the first thing the implementation plan asks for. Three of
 * the twenty venues on the buyer panel passed not because of the price or the
 * product but because they had no competition night to score — *"I would be
 * buying a scoreboard for an event that does not exist yet."* No feature
 * answers that. A guide to starting one from nothing might.
 *
 * Deliberately public and deliberately useful without the software: the
 * fastest way to sell a scoreboard to a room with no league is to help it
 * start a league. The full document lives at founder/league-night-playbook.md
 * and this is the part a venue owner reads on their phone behind the bar.
 */

import Link from "next/link";

const WEEKS = [
  {
    no: "Before",
    title: "Four decisions, made once",
    points: [
      "Pick your second-quietest night — not the deadest one, and never move it afterwards. “League night is Thursday” is a sentence your regulars can repeat to someone else.",
      "Start at 8pm or later. People eat first; a 7pm start means a trickle until 7.40 and a bracket that never fills.",
      "Single elimination, best of one frame, eight players. Seven frames, about two hours, finishes before anyone wants to leave.",
      "Make the prize a bar tab or a trophy — never pooled entry money. Pooling stakes is prohibited under the Online Gaming Act 2025, and a tab comes back to your till anyway.",
    ],
  },
  {
    no: "1",
    title: "Eight people. That is the whole job.",
    points: [
      "Walk up to someone already playing pool in your venue and ask them. “We’re starting a knockout on Thursday at eight, free to enter, winner gets a Rs 500 tab — are you in?” Do that twenty times and you have your eight.",
      "Posters tell people something is happening; they do not make anyone commit. Use them to support the asking, not to replace it.",
      "Six will turn up instead of eight. Run a six-player bracket. The night happening beats the night being tidy.",
    ],
  },
  {
    no: "2",
    title: "Prove it is real",
    points: [
      "Message last week’s eight individually — not a group blast. Ten minutes of work, and the highest-return ten minutes in the whole plan.",
      "Ask the winner to defend. People turn up to defend something.",
      "Put last week’s result somewhere visible. That whiteboard is the first brick of the league table.",
      "Change nothing else. Not the day, not the format, not the prize. Week two’s only job is to happen.",
    ],
  },
  {
    no: "3–4",
    title: "Give people a reason to come back after losing",
    points: [
      "Start a running league table across weeks. 3 points for entering, 1 per frame won, 5 for winning the night. Do not over-engineer it — it exists to give someone knocked out in round one a reason to return.",
      "Give the season an end. Eight weeks, then a champion, then start again. An open-ended table is a table nobody can win; a season has a run-in, and a run-in has drama.",
      "Watch for the signals it has caught: someone asks the start time without you mentioning it, a player brings a friend, two people who met here play on another night.",
    ],
  },
  {
    no: "5–8",
    title: "Make it worth money",
    points: [
      "Count three things weekly: players in the bracket, heads in the room at 9pm, and till take against the same weekday a month earlier. Only the third answers whether this was worth doing.",
      "Get a bracket onto a screen. Once there are spectators, people watch, people know when they are up, and nobody has to ask.",
      "Train one member of staff to run it without you. If they cannot pick it up in ninety seconds, the way you are running it is too complicated.",
    ],
  },
];

const DIAGNOSIS = [
  ["Fewer than four turning up", "Not enough asking", "Back to week one. Twenty people, in person."],
  ["They come once, not twice", "The night overran, or there was nothing to return for", "Shorten the format. Start the table."],
  ["Same four every week", "Too closed", "Ask each of the four to bring one person."],
  ["Nobody at all", "Wrong night", "Move it once — and only once — then commit again."],
];

export default function PlaybookPage() {
  return (
    <main className="page">
      <div className="shell" style={{ maxWidth: "52rem" }}>
        <header>
          <span className="chip gold">free · no account needed</span>
          <h1
            style={{
              fontSize: "var(--text-3xl)",
              fontWeight: 900,
              margin: "var(--space-4) 0 var(--space-3)",
              letterSpacing: "-0.02em",
            }}
          >
            The league-night playbook
          </h1>
          <p className="muted" style={{ fontSize: "var(--text-lg)", lineHeight: 1.8 }}>
            How to start a weekly competition in a room that has never had one. Nothing
            here needs Winner Takes All — we would rather you ran a league on paper than
            not at all.
          </p>
        </header>

        <div
          className="panel"
          style={{ marginTop: "var(--space-6)", borderColor: "var(--gold-subtle)" }}
        >
          <p style={{ lineHeight: 1.9 }}>
            We asked twenty venue owners about this product. Ten would buy it. Of the ten
            who would not, three said the same thing, and one put it best:
          </p>
          <blockquote
            style={{
              margin: "var(--space-4) 0 0",
              paddingLeft: "var(--space-4)",
              borderLeft: "3px solid var(--gold)",
              fontStyle: "italic",
              fontSize: "var(--text-lg)",
            }}
          >
            “I would be buying a scoreboard for an event that does not exist yet.”
          </blockquote>
          <p className="muted" style={{ marginTop: "var(--space-4)", fontSize: "var(--text-sm)" }}>
            No feature answers that. So this was written before the offline scoring, the
            big screen and the QR entry — all of which are useless to a room with nothing
            on the calendar.
          </p>
        </div>

        <section style={{ marginTop: "var(--space-7)" }}>
          <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 800 }}>
            You are not building a tournament. You are building a habit.
          </h2>
          <p className="muted" style={{ marginTop: "var(--space-3)", lineHeight: 1.9 }}>
            A one-off brings people in once and tells you nothing. A weekly night, same
            day, same time, for six weeks, does something different: by week four people
            arrange their Thursday around it. That is the asset — it survives a bad week,
            a broken table and a staff change.
          </p>
          <p style={{ marginTop: "var(--space-4)", fontWeight: 700, fontSize: "var(--text-lg)" }}>
            Eight regulars who come most weeks beats forty people once.
          </p>
          <p className="muted" style={{ marginTop: "var(--space-2)", lineHeight: 1.8 }}>
            Eight is enough for a bracket, enough for atmosphere, and small enough that
            they all know each other by week three — which is what makes them come back.
          </p>
        </section>

        <div className="playbook" style={{ marginTop: "var(--space-7)" }}>
          {WEEKS.map((week) => (
            <article key={week.no} className="playbook-week">
              <div className="no">{week.no}</div>
              <div className="body">
                <h3>{week.title}</h3>
                <ul>
                  {week.points.map((point) => (
                    <li key={point}>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>

        <section className="panel" style={{ marginTop: "var(--space-7)" }}>
          <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 800 }}>
            If it has not caught by week six
          </h2>
          <p className="muted" style={{ fontSize: "var(--text-sm)", margin: "var(--space-2) 0 var(--space-4)" }}>
            Be honest about which of these it is. It costs six evenings to find out, which
            is cheap.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>What you see</th>
                  <th>Usually means</th>
                  <th>Do this</th>
                </tr>
              </thead>
              <tbody>
                {DIAGNOSIS.map(([symptom, cause, fix]) => (
                  <tr key={symptom}>
                    <td>{symptom}</td>
                    <td className="muted">{cause}</td>
                    <td>{fix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel" style={{ marginTop: "var(--space-5)" }}>
          <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 800 }}>About the prize</h2>
          <p style={{ marginTop: "var(--space-3)", lineHeight: 1.9 }}>
            Make entry free and make the prize something you already sell: a Rs 500 bar tab,
            a free round for the winner&apos;s table, a month of free table hire, or a
            trophy that lives on your shelf with the winner&apos;s name on it.
          </p>
          <p className="muted" style={{ marginTop: "var(--space-3)", lineHeight: 1.8 }}>
            Do not pool entry fees. India&apos;s Promotion and Regulation of Online Gaming
            Act 2025, in force since 1 May 2026, prohibits games played for a stake whether
            they turn on skill or on chance — collecting Rs 100 a head and paying the winner
            Rs 700 is that structure, however it is described. A bar tab comes back to your
            till anyway, which makes it better business as well as simpler.
          </p>
          <p className="muted" style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)" }}>
            What a venue does at its own counter is its own affair, and nothing here is
            legal advice. If you are unsure how the law applies to you, ask someone who can
            advise you properly.
          </p>
        </section>

        <section style={{ marginTop: "var(--space-7)" }}>
          <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 800 }}>
            When the whiteboard starts to hurt
          </h2>
          <p className="muted" style={{ marginTop: "var(--space-3)", lineHeight: 1.9 }}>
            Around week six, with sixteen players and forty people watching, three jobs get
            annoying. That is what the software is for — and not before.
          </p>
          <div className="h-stack" style={{ marginTop: "var(--space-5)" }}>
            <Link className="button" href="/run" style={{ textDecoration: "none" }}>
              Run a night now
            </Link>
            <Link className="button-secondary" href="/coins" style={{ textDecoration: "none" }}>
              What players earn
            </Link>
          </div>
          <p className="muted" style={{ marginTop: "var(--space-4)", fontSize: "var(--text-sm)" }}>
            Entry is free on Winner Takes All and always will be — no entry fees, no
            wallet, no pooled prize money. Players earn WTA Coins for turning up and
            playing, which have no cash value and cannot be bought or withdrawn.
          </p>
        </section>
      </div>
    </main>
  );
}
