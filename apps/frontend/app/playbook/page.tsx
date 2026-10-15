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
import { FlipCard } from "@/components/flip-card";

const WEEKS = [
  {
    no: "0",
    kicker: "Before you start",
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
    kicker: "Week one",
    title: "Eight people. That is the whole job.",
    points: [
      "Walk up to someone already playing pool in your venue and ask them. “We’re starting a knockout on Thursday at eight, free to enter, winner gets a free bar tab — are you in?” Do that twenty times and you have your eight.",
      "Posters tell people something is happening; they do not make anyone commit. Use them to support the asking, not to replace it.",
      "Six will turn up instead of eight. Run a six-player bracket. The night happening beats the night being tidy.",
    ],
  },
  {
    no: "2",
    kicker: "Week two",
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
    kicker: "Weeks three and four",
    title: "Give people a reason to come back after losing",
    points: [
      "Start a running league table across weeks. 3 points for entering, 1 per frame won, 5 for winning the night. Do not over-engineer it — it exists to give someone knocked out in round one a reason to return.",
      "Give the season an end. Eight weeks, then a champion, then start again. An open-ended table is a table nobody can win; a season has a run-in, and a run-in has drama.",
      "Watch for the signals it has caught: someone asks the start time without you mentioning it, a player brings a friend, two people who met here play on another night.",
    ],
  },
  {
    no: "5–8",
    kicker: "Weeks five to eight",
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
      <div className="shell guide" style={{ maxWidth: "64rem" }}>
        {/* The cover. */}
        <header className="wta-card gold guide-hero tilt-l" style={{ marginTop: "var(--space-4)" }}>
          <span className="sticker">Free · no account needed</span>
          <h1>The league-night playbook</h1>
          <p>
            How to start a weekly competition in a room that has never had one. Nothing
            here needs Winner Takes All — we would rather you ran a league on paper than
            not at all.
          </p>
          <span className="guide-hero-art" aria-hidden="true">🎱</span>
        </header>

        {/* Why this exists, and the habit it builds. */}
        <div className="guide-split">
          <section className="wta-card red guide-quote tilt-r">
            <p style={{ fontSize: "var(--text-sm)", lineHeight: 1.7, opacity: 0.9 }}>
              We asked twenty venue owners about this product. Ten would buy it. Of the ten
              who would not, three said the same thing, and one put it best:
            </p>
            <span className="quote-mark" aria-hidden="true">“</span>
            <blockquote>I would be buying a scoreboard for an event that does not exist yet.</blockquote>
            <p style={{ fontSize: "var(--text-sm)", lineHeight: 1.7, opacity: 0.85 }}>
              No feature answers that. So this was written before the offline scoring, the
              big screen and the QR entry — all of which are useless to a room with nothing
              on the calendar.
            </p>
          </section>

          <section className="wta-card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <span className="sticker gold" style={{ alignSelf: "flex-start" }}>The whole idea</span>
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 900, lineHeight: 1.2 }}>
              You are not building a tournament. You are building a habit.
            </h2>
            <div className="guide-versus" aria-label="Eight regulars beats forty people once">
              <div>
                <span className="big-num" style={{ color: "var(--gold)" }}>8</span>
                <small>regulars, most weeks</small>
              </div>
              <span className="vs">BEATS</span>
              <div>
                <span className="big-num" style={{ color: "var(--text-muted)", textDecoration: "line-through", textDecorationColor: "var(--wta-red)", textDecorationThickness: "6px" }}>40</span>
                <small>people, once</small>
              </div>
            </div>
            <p className="muted" style={{ lineHeight: 1.8, fontSize: "var(--text-sm)" }}>
              A one-off brings people in once and tells you nothing. A weekly night, same
              day, same time, for six weeks, does something different: by week four people
              arrange their Thursday around it. That is the asset — it survives a bad week,
              a broken table and a staff change. Eight is enough for a bracket, enough for
              atmosphere, and small enough that they all know each other by week three —
              which is what makes them come back.
            </p>
          </section>
        </div>

        {/* The weeks, as levels. */}
        <section>
          <div className="section-head">
            <span className="sticker ink">5 levels</span>
            <h2>Eight weeks, <em>level by level</em></h2>
          </div>
          <div className="level-track wta-deal">
            {WEEKS.map((week) => (
              <article key={week.no} className="wta-card level-card">
                <span className="level-no" aria-hidden="true">{week.no}</span>
                <span className="level-kicker">{week.kicker}</span>
                <h3>{week.title}</h3>
                <ul>
                  {week.points.map((point) => (
                    <li key={point}>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* What to do if it has not caught. */}
        <section>
          <div className="section-head">
            <span className="sticker">Week six check</span>
            <h2>If it has not caught, <em>flip a card</em></h2>
            <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
              Be honest about which of these it is. It costs six evenings to find out, which
              is cheap.
            </p>
          </div>
          <div className="flip-grid wta-deal">
            {DIAGNOSIS.map(([symptom, cause, fix], i) => (
              <FlipCard
                key={symptom}
                frontTone={i % 2 === 0 ? "ink" : "gold"}
                label={`${symptom}. Usually means: ${cause}. Do this: ${fix}`}
                front={
                  <>
                    <span className="label">Symptom {i + 1}</span>
                    <span className="flip-title">{symptom}</span>
                  </>
                }
                back={
                  <>
                    <span>
                      <span className="label">Usually means</span>
                      <span className="flip-text">{cause}</span>
                    </span>
                    <span>
                      <span className="label">Do this</span>
                      <span className="flip-text" style={{ color: "var(--gold-fill)", fontSize: "1.1rem" }}>{fix}</span>
                    </span>
                  </>
                }
              />
            ))}
          </div>
        </section>

        {/* The prize. */}
        <section>
          <div className="section-head">
            <span className="sticker gold">The prize</span>
            <h2>What the winner <em>takes</em></h2>
          </div>
          <div className="guide-split">
            <div className="wta-card gold rule-card tilt-l">
              <span className="sticker">Do</span>
              <h3>Free entry. A prize you already sell.</h3>
              <ul>
                <li>A bar tab for the winner</li>
                <li>A free round for the winner&apos;s table</li>
                <li>A month of free table hire</li>
                <li>A trophy on your shelf with their name on it</li>
              </ul>
              <p>A bar tab comes back to your till anyway, which makes it better business as well as simpler.</p>
            </div>
            <div className="wta-card red rule-card tilt-r">
              <span className="sticker gold">Don&apos;t</span>
              <h3>Never pool entry fees.</h3>
              <ul>
                <li>Collecting money from each player and paying it to the winner is a stake, however it is described.</li>
              </ul>
              <p>
                India&apos;s Promotion and Regulation of Online Gaming Act 2025, in force since
                1 May 2026, prohibits games played for a stake whether they turn on skill or on
                chance.
              </p>
              <p style={{ opacity: 0.75 }}>
                What a venue does at its own counter is its own affair, and nothing here is
                legal advice. If you are unsure how the law applies to you, ask someone who can
                advise you properly.
              </p>
            </div>
          </div>
        </section>

        {/* The way in. */}
        <section className="wta-card gold ticket">
          <span className="sticker ink">Admit one · week six</span>
          <h2 style={{ marginTop: "1rem" }}>When the whiteboard starts to hurt</h2>
          <p style={{ marginTop: "0.75rem", fontWeight: 600, lineHeight: 1.7, maxWidth: "38rem" }}>
            Around week six, with sixteen players and forty people watching, three jobs get
            annoying. That is what the software is for — and not before.
          </p>
          <div className="ticket-actions">
            <Link className="ink-button" href="/run">Run a night now →</Link>
            <Link className="ink-button ghost" href="/coins">What players earn</Link>
          </div>
          <div className="perforation" aria-hidden="true" />
          <p style={{ fontSize: "var(--text-sm)", lineHeight: 1.7, fontWeight: 600 }}>
            Entry is free on Winner Takes All and always will be — no entry fees, no
            wallet, no pooled prize money. Players earn WTA Coins for turning up and
            playing, which have no cash value and cannot be bought or withdrawn.
          </p>
        </section>
      </div>
    </main>
  );
}
