"use client";

/**
 * The homepage hero: "Hall of G.O.A.T.s" (WTA Homepage v2 design export).
 *
 * Desktop: one illustrated stage drawn at 1360×775. The stage keeps that aspect
 * ratio and every size in it is a multiple of --u (one design pixel), so the
 * hotspots over each sport's ball stay on the ball at any width. Hovering a
 * ball (or focusing it) opens that sport's G.O.A.T. card beside it.
 *
 * Phone: the art splits into a strip above the copy and a strip below it;
 * tapping a ball slides that G.O.A.T. up in a bottom sheet.
 *
 * The site's theme toggle drives it: both themes' art is in the page, and the
 * one that is off slides out to the sides.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PhIcon } from "@/components/ph-icon";

type Key = "pool" | "football" | "badminton" | "tennis" | "tabletennis" | "pickleball" | "wta";
type Theme = "dark" | "light";
type Spot = { key: Key; l: string; t: string; w: string; h: string };
type CardPos = { left?: string; right?: string; top: string };

const GOATS: Record<Key, { sport: string; name: string; nick: string; stats: { v: string; l: string }[] }> = {
  pool: { sport: "Pool", name: "Efren Reyes", nick: "The Magician", stats: [{ v: "70+", l: "International titles" }, { v: "2", l: "World titles" }, { v: "1999", l: "WPA 9-ball champ" }, { v: "2004", l: "WPA 8-ball champ" }] },
  football: { sport: "Football", name: "Lionel Messi", nick: "La Pulga", stats: [{ v: "8", l: "Ballon d'Or" }, { v: "850+", l: "Career goals" }, { v: "4", l: "Champions Leagues" }, { v: "2022", l: "World Cup winner" }] },
  badminton: { sport: "Badminton", name: "Lin Dan", nick: "Super Dan", stats: [{ v: "2", l: "Olympic golds" }, { v: "5", l: "World titles" }, { v: "6", l: "All England titles" }, { v: "9/9", l: "Super Grand Slam" }] },
  tennis: { sport: "Tennis", name: "Novak Djokovic", nick: "Nole", stats: [{ v: "24", l: "Grand Slams" }, { v: "428", l: "Weeks at No. 1" }, { v: "100+", l: "Tour titles" }, { v: "2024", l: "Olympic gold" }] },
  tabletennis: { sport: "Table Tennis", name: "Ma Long", nick: "The Dragon", stats: [{ v: "6", l: "Olympic golds" }, { v: "3", l: "World singles titles" }, { v: "2", l: "Olympic singles" }, { v: "2×", l: "Career Grand Slam" }] },
  wta: { sport: "W.T.A. Champion", name: "TBD", nick: "To Be Decided", stats: [{ v: "TBD", l: "Season champion" }, { v: "#1", l: "Ladder spot open" }, { v: "7", l: "Sports to conquer" }, { v: "You?", l: "Next in line" }] },
  pickleball: { sport: "Pickleball", name: "Ben Johns", nick: "The King of the Kitchen", stats: [{ v: "100+", l: "Pro titles" }, { v: "#1", l: "Singles" }, { v: "#1", l: "Doubles" }, { v: "#1", l: "Mixed" }] },
};

const PHOTOS: Partial<Record<Key, [string, string]>> = {
  football: ["/goat/goat-messi.webp", "center 13%"],
  pool: ["/goat/goat-reyes.webp", "center 36%"],
  badminton: ["/goat/goat-lindan.webp", "center 2%"],
  tabletennis: ["/goat/goat-malong.webp", "center 30%"],
  pickleball: ["/goat/goat-johns.webp", "center 0%"],
  tennis: ["/goat/goat-djokovic.webp", "center 39%"],
};

const ART: Record<Theme, { hero: string; mTop: string; mBot: string }> = {
  dark: { hero: "/goat/hero-bg.webp", mTop: "/goat/m-top.webp", mBot: "/goat/m-bottom.webp" },
  light: { hero: "/goat/hero-bg-light.webp", mTop: "/goat/m-top-light.webp", mBot: "/goat/m-bottom-light.webp" },
};

// Hotspots and card placements, in percent of the stage, as drawn in the design.
const SPOTS: Record<Theme, { desk: (Spot & { card: CardPos })[]; top: Spot[]; bot: Spot[] }> = {
  dark: {
    desk: [
      { key: "pool", l: "0%", t: "15%", w: "20.5%", h: "47%", card: { left: "21.5%", top: "10%" } },
      { key: "football", l: "72.5%", t: "0%", w: "14.5%", h: "22%", card: { right: "28.5%", top: "3%" } },
      { key: "badminton", l: "86.3%", t: "21%", w: "13.5%", h: "20%", card: { right: "14.5%", top: "12%" } },
      { key: "tennis", l: "80.5%", t: "43.5%", w: "10.5%", h: "16.5%", card: { right: "20.5%", top: "22%" } },
      { key: "pickleball", l: "71%", t: "78.5%", w: "8.3%", h: "12.5%", card: { right: "29.5%", top: "36%" } },
      { key: "tabletennis", l: "79.5%", t: "64.5%", w: "20.5%", h: "31%", card: { right: "21%", top: "40%" } },
    ],
    top: [{ key: "pool", l: "0%", t: "20%", w: "36%", h: "80%" }, { key: "football", l: "58%", t: "12%", w: "27%", h: "50%" }, { key: "badminton", l: "76%", t: "48%", w: "24%", h: "52%" }],
    bot: [{ key: "tennis", l: "28%", t: "30%", w: "20%", h: "70%" }, { key: "tabletennis", l: "66%", t: "10%", w: "34%", h: "90%" }],
  },
  light: {
    desk: [
      { key: "pool", l: "0%", t: "3%", w: "28%", h: "31%", card: { left: "29%", top: "3%" } },
      { key: "badminton", l: "81.7%", t: "5.6%", w: "15.5%", h: "26%", card: { right: "19%", top: "3%" } },
      { key: "pickleball", l: "85.6%", t: "39%", w: "10%", h: "17.2%", card: { right: "15.5%", top: "20%" } },
      { key: "football", l: "0%", t: "52.8%", w: "21%", h: "33%", card: { left: "22%", top: "28%" } },
      { key: "tennis", l: "22.2%", t: "78%", w: "8.8%", h: "13%", card: { left: "32%", top: "36%" } },
      { key: "tabletennis", l: "76.4%", t: "62%", w: "23.6%", h: "28%", card: { right: "24.5%", top: "38%" } },
    ],
    top: [{ key: "pool", l: "0%", t: "10%", w: "49%", h: "90%" }, { key: "badminton", l: "63%", t: "3%", w: "35%", h: "75%" }],
    bot: [{ key: "football", l: "1%", t: "15%", w: "28%", h: "85%" }, { key: "tennis", l: "33%", t: "25%", w: "17%", h: "75%" }, { key: "tabletennis", l: "63%", t: "10%", w: "37%", h: "90%" }],
  },
};
const WTA_CARD: CardPos = { left: "64%", top: "10%" };
const KEYS = Object.keys(GOATS) as Key[];
const COPY =
  "Pool, football, tennis, badminton, pickleball and table tennis — every game you play counts. Win to climb your trophy ladder, earn WTA Coins every game, and unlock frames, emotes and artifacts to show off. Free to play, always.";

/** The site theme, read off <html data-theme> and kept in step with the toggle. */
function useSiteTheme(): Theme {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.getAttribute("data-theme") === "dark" ? "dark" : "light");
    read();
    const mo = new MutationObserver(read);
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

/** Both themes' art, each split down the middle so the outgoing one slides apart. */
function Layers({ art }: { art: "hero" | "mTop" | "mBot" }) {
  return (
    <>
      {(["dark", "light"] as Theme[]).flatMap((th) =>
        (["l", "r"] as const).map((side) => (
          <img key={th + side} src={ART[th][art]} alt="" decoding="async" className={`gh-layer gh-${th} gh-${side}`} />
        )),
      )}
    </>
  );
}

function Photo({ k }: { k: Key }) {
  const p = PHOTOS[k];
  if (p) return <img src={p[0]} alt={GOATS[k].name} loading="lazy" style={{ objectPosition: p[1] }} />;
  return (
    <div className="gh-crownart">
      <PhIcon name="crown-simple-fill" size={110} color="#ffc21a" />
    </div>
  );
}

function Stats({ k }: { k: Key }) {
  return (
    <div className="gh-stats">
      {GOATS[k].stats.map((st) => (
        <div key={st.l} className="gh-stat">
          <div className="gh-stat-v">{st.v}</div>
          <div className="gh-stat-l">{st.l}</div>
        </div>
      ))}
    </div>
  );
}

export function GoatHero() {
  const theme = useSiteTheme();
  const [d, setD] = useState<Key | null>(null);
  const [lastD, setLastD] = useState<Key>("football");
  const [m, setM] = useState<Key | null>(null);
  const [lastM, setLastM] = useState<Key>("football");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = (k: Key) => {
    clearTimeout(timer.current);
    setD(k);
    setLastD(k);
  };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setD(null), 260);
  };
  const keep = () => clearTimeout(timer.current);
  const tap = (k: Key) => {
    setM(k);
    setLastM(k);
  };

  useEffect(() => () => clearTimeout(timer.current), []);
  // The card is placed for the theme it opened in; a theme change closes it.
  useEffect(() => setD(null), [theme]);
  useEffect(() => {
    if (!m) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setM(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [m]);

  const pos = lastD === "wta" ? WTA_CARD : SPOTS[theme].desk.find((s) => s.key === lastD)?.card ?? SPOTS[theme].desk[0].card;
  const cur = GOATS[lastD];
  const mcur = GOATS[lastM];

  const spotBtn = (s: Spot, extra: React.ButtonHTMLAttributes<HTMLButtonElement>, cls: string) => (
    <button
      key={s.key}
      type="button"
      aria-label={`${GOATS[s.key].sport} G.O.A.T.: ${GOATS[s.key].name}`}
      className={cls}
      style={{ left: s.l, top: s.t, width: s.w, height: s.h }}
      {...extra}
    />
  );

  return (
    <section className="gh" aria-labelledby="gh-title">
      <style>{CSS}</style>

      {/* ── Desktop stage ── */}
      <div className="gh-d">
        <Layers art="hero" />

        <div className="gh-copy">
          <div className="gh-chip">Real tables. Real rivals. Real bragging rights.</div>
          <h1 id="gh-title" className="gh-title">
            <button
              type="button"
              className="gh-crown"
              aria-label="W.T.A. Champion"
              onMouseEnter={() => show("wta")}
              onMouseLeave={leave}
              onFocus={() => show("wta")}
              onBlur={leave}
            >
              <PhIcon name="crown-simple-bold" size="100%" />
            </button>
            <span className="gh-l1">Play the night.</span>
            <span className="gh-l2">Take the crown.</span>
          </h1>
          <p className="gh-desc">{COPY}</p>
          <div className="gh-btns">
            <Link href="/tournaments" className="gh-btn gh-btn-1">FIND A GAME →</Link>
            <Link href="/run" className="gh-btn gh-btn-2">HOST A NIGHT</Link>
          </div>
        </div>

        <ul className="gh-feats">
          <li><PhIcon name="trophy-fill" color="#ffb21f" className="gh-fi" />A trophy ladder for every sport</li>
          <li><PhIcon name="coin-fill" color="#ffb21f" className="gh-fi" />Coins every game you play</li>
          <li><PhIcon name="check-square-fill" color="#2ecf5a" className="gh-fi" />Wins verified at the table</li>
        </ul>

        {(["dark", "light"] as Theme[]).map((th) => (
          <div key={th} className={`gh-spots gh-only-${th}`}>
            {SPOTS[th].desk.map((s) =>
              spotBtn(s, { onMouseEnter: () => show(s.key), onMouseLeave: leave, onFocus: () => show(s.key), onBlur: leave, onClick: () => show(s.key) }, `gh-spot${d === s.key && th === theme ? " is-on" : ""}`),
            )}
          </div>
        ))}

        <div
          className={`gh-card${d ? " is-open" : ""}`}
          onMouseEnter={keep}
          onMouseLeave={leave}
          style={{ left: pos.left ?? "auto", right: pos.right ?? "auto", top: pos.top }}
          aria-hidden={!d}
        >
          <div className="gh-card-media">
            {KEYS.map((k) => (
              <div key={k} className="gh-card-photo" style={{ opacity: k === lastD ? 1 : 0 }}>
                <Photo k={k} />
              </div>
            ))}
            <div className="gh-card-fade" />
            <div className="gh-tag"><PhIcon name="crown-simple-fill" size="1.17em" />G.O.A.T. · {cur.sport.toUpperCase()}</div>
          </div>
          <div className="gh-card-body">
            <div className="gh-name">{cur.name}</div>
            <div className="gh-nick">“{cur.nick}”</div>
            <Stats k={lastD} />
          </div>
        </div>
      </div>

      {/* ── Phone ── */}
      <div className="gh-m">
        <div className="gh-strip gh-strip-top">
          <Layers art="mTop" />
          <div className="gh-strip-fade gh-fade-down" />
          {(["dark", "light"] as Theme[]).map((th) => (
            <div key={th} className={`gh-spots gh-only-${th}`}>
              {SPOTS[th].top.map((s) => spotBtn(s, { onClick: () => tap(s.key) }, "gh-spot gh-spot-m"))}
            </div>
          ))}
        </div>

        <div className="gh-mcopy">
          <div className="gh-chip">Real tables. Real rivals. Real bragging rights.</div>
          <div className="gh-mtitle" role="heading" aria-level={1}>
            <span className="gh-l1">Play the night.</span>
            <span className="gh-l2">Take the<br />crown.</span>
            <button type="button" className="gh-crown" aria-label="W.T.A. Champion" onClick={() => tap("wta")}>
              <PhIcon name="crown-simple-bold" size="100%" />
            </button>
          </div>
          <p className="gh-desc">{COPY}</p>
          <div className="gh-btns">
            <Link href="/tournaments" className="gh-btn gh-btn-1">FIND A GAME →</Link>
            <Link href="/run" className="gh-btn gh-btn-2">HOST A NIGHT</Link>
          </div>
        </div>

        <div className="gh-strip gh-strip-bot">
          <Layers art="mBot" />
          <div className="gh-strip-fade gh-fade-up" />
          {(["dark", "light"] as Theme[]).map((th) => (
            <div key={th} className={`gh-spots gh-only-${th}`}>
              {SPOTS[th].bot.map((s) => spotBtn(s, { onClick: () => tap(s.key) }, "gh-spot gh-spot-m"))}
            </div>
          ))}
        </div>

      </div>

      {/* The sheet is portalled to <body>: inside the hero it would be trapped
          under the bottom nav by the hero's stacking context. */}
      {mounted &&
        createPortal(
          <div className="gh gh-portal">
            <div className={`gh-scrim${m ? " is-open" : ""}`} onClick={() => setM(null)} />
            <div className={`gh-sheet${m ? " is-open" : ""}`} role="dialog" aria-modal={!!m} aria-hidden={!m} aria-label={`${mcur.sport} G.O.A.T.`}>
              <div className="gh-sheet-media">
                {KEYS.map((k) => (
                  <div key={k} className="gh-card-photo" style={{ opacity: k === lastM ? 1 : 0 }}>
                    <Photo k={k} />
                  </div>
                ))}
                <div className="gh-card-fade" />
                <div className="gh-tag"><PhIcon name="crown-simple-fill" size="1.2em" />G.O.A.T. · {mcur.sport.toUpperCase()}</div>
                <button type="button" className="gh-close" aria-label="Close" onClick={() => setM(null)} tabIndex={m ? 0 : -1}>
                  <PhIcon name="x-bold" size={18} />
                </button>
              </div>
              <div className="gh-sheet-body">
                <div className="gh-name">{mcur.name}</div>
                <div className="gh-nick">“{mcur.nick}”</div>
                <Stats k={lastM} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}

const CSS = `
.gh {
  /* light (the site's default palette) */
  --bg:#fbf7f8; --ink:#1a1418; --muted:#3d3438; --acc:#a3122a; --accBorder:rgba(163,18,42,.55); --tagBg:rgba(255,255,255,.8);
  --h1a:#45454c; --h1b:#0c0c10; --h1glow:rgba(0,0,0,.08); --h2a:#d22a44; --h2b:#a3122a; --h2c:#5e0815; --glow:rgba(163,18,42,.22);
  --btnA:#be1c36; --btnB:#7a0b1d; --btnInk:#ffffff; --btnGlow:rgba(163,18,42,.25);
  --btn2Bg:rgba(255,255,255,.9); --btn2Border:rgba(163,18,42,.45);
  --cardA:rgba(255,255,255,.98); --cardB:rgba(250,244,245,.98); --cardEdge:rgba(163,18,42,.35); --cardShadow:rgba(90,20,40,.22); --cardFade:#ffffff;
  --chipBg:rgba(163,18,42,.05); --chipBorder:rgba(163,18,42,.12);
  --featBg:rgba(255,255,255,.88); --featShadow:0 6px 24px rgba(90,20,40,.1);
  --spotGlow:radial-gradient(closest-side,rgba(163,18,42,.18),transparent);
  position:relative; z-index:2; container-type:inline-size; background:var(--bg); color:var(--ink);
  font-family:var(--font-inter),Inter,system-ui,sans-serif; -webkit-font-smoothing:antialiased; text-align:center;
  transition:background .6s;
}
[data-theme="dark"] .gh {
  --bg:#0d0a10; --ink:#f2eef0; --muted:#d9d3d8; --acc:#ffc93c; --accBorder:rgba(255,196,40,.75); --tagBg:rgba(20,10,14,.55);
  --h1a:#ffffff; --h1b:#a9a6b2; --h1glow:rgba(255,255,255,.25); --h2a:#fff2a0; --h2b:#ffcb1f; --h2c:#ff9f00; --glow:rgba(255,170,0,.55);
  --btnA:#ffd94d; --btnB:#ffb200; --btnInk:#8a1d0e; --btnGlow:rgba(255,180,20,.35);
  --btn2Bg:rgba(18,12,18,.7); --btn2Border:rgba(255,255,255,.28);
  --cardA:rgba(30,16,24,.96); --cardB:rgba(14,9,14,.97); --cardEdge:rgba(255,196,40,.55); --cardShadow:rgba(0,0,0,.7); --cardFade:rgba(18,10,16,1);
  --chipBg:rgba(255,255,255,.05); --chipBorder:rgba(255,255,255,.08);
  --featBg:transparent; --featShadow:none;
  --spotGlow:radial-gradient(closest-side,rgba(255,200,60,.28),rgba(255,170,0,.12) 60%,transparent);
}
:where(.gh) button { all:unset; box-sizing:border-box; cursor:pointer; }
:where(.gh) button:focus-visible { outline:2px solid var(--acc); outline-offset:2px; }
.gh a { text-decoration:none; }

/* Art: the live theme's halves sit together; the other theme's are pulled apart and faded. */
.gh-layer { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block; opacity:0;
  transition:transform .9s cubic-bezier(.2,.8,.2,1),opacity .6s ease; pointer-events:none; }
.gh-l.gh-layer { clip-path:inset(0 calc(50% - 1px) 0 0); transform:translateX(-9%) scale(1.04); }
.gh-r.gh-layer { clip-path:inset(0 0 0 50%); transform:translateX(9%) scale(1.04); }
:root:not([data-theme="dark"]) .gh-light.gh-layer,
[data-theme="dark"] .gh-dark.gh-layer { opacity:1; transform:translateX(0) scale(1); }
.gh-only-dark { display:none; }
[data-theme="dark"] .gh-only-dark { display:contents; }
[data-theme="dark"] .gh-only-light { display:none; }
.gh-spots { display:contents; }

.gh-l1 { display:block; background:linear-gradient(180deg,var(--h1a) 20%,var(--h1b) 100%); -webkit-background-clip:text; background-clip:text; color:transparent; filter:drop-shadow(0 0 18px var(--h1glow)); }
.gh-l2 { display:block; background:linear-gradient(180deg,var(--h2a) 0%,var(--h2b) 45%,var(--h2c) 100%); -webkit-background-clip:text; background-clip:text; color:transparent; filter:drop-shadow(0 0 22px var(--glow)); }
.gh-chip { border:1.5px solid var(--accBorder); color:var(--acc); background:var(--tagBg); font-weight:600; transition:color .6s,background .6s; }
.gh-desc { color:var(--muted); transition:color .6s; }
.gh-btn { display:flex; align-items:center; justify-content:center; box-sizing:border-box; font-family:var(--font-montserrat),Montserrat,sans-serif; font-weight:800; text-align:center; }
.gh-btn:hover { filter:brightness(1.08); }
.gh-btn-1 { background:linear-gradient(180deg,var(--btnA),var(--btnB)); color:var(--btnInk) !important; }
.gh-btn-2 { border:1.5px solid var(--btn2Border); background:var(--btn2Bg); color:var(--ink) !important; }
.gh-crown { color:#ffc21a; transform:rotate(12deg); }

.gh-card-photo { position:absolute; inset:0; transition:opacity .2s; }
.gh-card-photo img { width:100%; height:100%; object-fit:cover; display:block; }
.gh-crownart { width:100%; height:100%; display:flex; align-items:center; justify-content:center;
  background:radial-gradient(circle at 50% 60%,rgba(255,190,30,.35),transparent 60%),linear-gradient(160deg,#2a1420,#120a10); }
.gh-crownart svg { filter:drop-shadow(0 0 24px rgba(255,180,20,.7)); }
.gh-card-fade { position:absolute; inset:auto 0 0 0; height:90px; background:linear-gradient(0deg,var(--cardFade),transparent); pointer-events:none; }
.gh-tag { position:absolute; left:16px; top:14px; display:flex; align-items:center; gap:6px; padding:6px 10px; border-radius:20px;
  background:var(--tagBg); border:1px solid var(--accBorder); color:var(--acc); font-family:var(--font-montserrat),Montserrat,sans-serif; font-weight:800; letter-spacing:.08em; pointer-events:none; }
.gh-name { font-family:var(--font-montserrat),Montserrat,sans-serif; font-style:italic; font-weight:900; line-height:1.05; text-transform:uppercase; letter-spacing:-.01em; text-align:left; }
.gh-nick { color:var(--acc); font-weight:500; text-align:left; }
.gh-stats { display:grid; grid-template-columns:1fr 1fr; text-align:left; }
.gh-stat { padding:10px 12px; border-radius:12px; background:var(--chipBg); border:1px solid var(--chipBorder); }
.gh-stat-v { font-family:var(--font-montserrat),Montserrat,sans-serif; font-weight:900; font-style:italic; background:linear-gradient(180deg,var(--h2a),var(--btnB)); -webkit-background-clip:text; background-clip:text; color:transparent; }
.gh-stat-l { font-size:12px; color:var(--muted); margin-top:2px; }

/* ── Desktop: a 1360×775 stage; --u is one design pixel ── */
.gh-d { --u:calc(100cqw / 1360); position:relative; width:100%; aspect-ratio:1360/775; overflow:hidden; }
.gh-copy { position:absolute; left:50%; top:7.5%; transform:translateX(-50%); width:calc(820*var(--u)); display:flex; flex-direction:column; align-items:center; pointer-events:none; z-index:2; }
.gh-d .gh-chip { padding:calc(10*var(--u)) calc(18*var(--u)); border-radius:calc(24*var(--u)); font-size:calc(17*var(--u)); }
.gh-title { position:relative; margin:calc(30*var(--u)) 0 0; font-family:var(--font-montserrat),Montserrat,sans-serif; font-style:italic; font-weight:900; font-size:calc(84*var(--u));
  line-height:.98; letter-spacing:-.025em; text-transform:uppercase; white-space:nowrap; }
.gh-title .gh-crown { position:absolute; right:calc(30*var(--u)); top:calc(-48*var(--u)); width:calc(54*var(--u)); height:calc(54*var(--u)); padding:calc(6*var(--u));
  filter:drop-shadow(0 0 10px rgba(255,190,30,.6)); pointer-events:auto; }
.gh-d .gh-desc { margin:calc(26*var(--u)) 0 0; max-width:calc(720*var(--u)); font-size:calc(18.5*var(--u)); line-height:1.6; }
.gh-d .gh-btns { display:flex; gap:calc(28*var(--u)); margin-top:calc(34*var(--u)); pointer-events:auto; }
.gh-d .gh-btn { height:calc(66*var(--u)); border-radius:calc(14*var(--u)); font-size:calc(21*var(--u)); }
.gh-d .gh-btn-1 { width:calc(282*var(--u)); box-shadow:0 0 calc(28*var(--u)) var(--btnGlow); }
.gh-d .gh-btn-2 { width:calc(252*var(--u)); }
.gh-feats { position:absolute; left:50%; bottom:calc(18*var(--u)); transform:translateX(-50%); display:flex; gap:calc(44*var(--u)); margin:0; list-style:none;
  padding:calc(12*var(--u)) calc(28*var(--u)); border-radius:calc(30*var(--u)); background:var(--featBg); box-shadow:var(--featShadow);
  font-weight:600; font-size:calc(15.5*var(--u)); white-space:nowrap; pointer-events:none; transition:background .6s; z-index:2; }
.gh-feats li { display:flex; gap:calc(10*var(--u)); align-items:center; }
.gh-fi { width:calc(21*var(--u)); height:calc(21*var(--u)); }
.gh-spot { position:absolute; border-radius:50%; background:transparent; transition:background .25s; z-index:3; }
.gh-spot.is-on { background:var(--spotGlow); }
.gh-card { position:absolute; z-index:4; width:calc(330*var(--u)); min-width:300px; opacity:0; transform:translateY(8px) scale(.98); pointer-events:none;
  transition:opacity .22s ease,transform .22s ease; border-radius:20px; background:linear-gradient(180deg,var(--cardA),var(--cardB));
  box-shadow:0 0 0 1.5px var(--cardEdge),0 0 40px -6px var(--glow),0 30px 60px var(--cardShadow); overflow:hidden; text-align:left; }
.gh-card.is-open { opacity:1; transform:translateY(0) scale(1); pointer-events:auto; }
.gh-card-media { position:relative; height:230px; }
.gh-card .gh-tag { font-size:12px; }
.gh-card-body { padding:4px 20px 20px; }
.gh-card .gh-name { font-size:30px; }
.gh-card .gh-nick { font-size:14px; margin-top:4px; }
.gh-card .gh-stats { gap:10px; margin-top:16px; }
.gh-card .gh-stat-v { font-size:24px; }

/* ── Phone ── */
.gh-m { display:none; }
.gh.gh-portal { display:contents; }
@media (min-width: 768px) { .gh.gh-portal { display:none; } }
@media (max-width: 767px) {
  .gh-d { display:none; }
  .gh-m { display:flex; flex-direction:column; }
  .gh-strip { position:relative; overflow:hidden; }
  .gh-strip-top { aspect-ratio:368/166; }
  .gh-strip-bot { aspect-ratio:368/96; margin-top:16px; }
  .gh-strip-fade { position:absolute; left:0; right:0; pointer-events:none; z-index:1; }
  .gh-fade-down { bottom:0; height:40px; background:linear-gradient(0deg,var(--bg),transparent); }
  .gh-fade-up { top:0; height:30px; background:linear-gradient(180deg,var(--bg),transparent); }
  .gh-spot-m { z-index:2; }
  .gh-mcopy { display:flex; flex-direction:column; align-items:center; padding:0 18px; }
  .gh-m .gh-chip { padding:8px 14px; border-radius:18px; font-size:13px; max-width:210px; line-height:1.35; }
  .gh-mtitle { position:relative; margin-top:18px; font-family:var(--font-montserrat),Montserrat,sans-serif; font-style:italic; font-weight:900; font-size:38px; line-height:1; letter-spacing:-.02em; text-transform:uppercase; }
  .gh-mtitle .gh-l1 { font-size:30px; filter:none; }
  .gh-mtitle .gh-l2 { margin-top:4px; filter:drop-shadow(0 0 14px var(--glow)); }
  .gh-mtitle .gh-crown { position:absolute; right:-34px; bottom:0; width:44px; height:44px; padding:7px; }
  .gh-m .gh-desc { margin:14px 0 0; font-size:14.5px; line-height:1.5; }
  .gh-m .gh-btns { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:18px; width:100%; }
  .gh-m .gh-btn { height:48px; border-radius:12px; font-size:14px; }
  .gh-scrim { position:fixed; inset:0; z-index:10001; background:rgba(5,3,6,.5); opacity:0; pointer-events:none; transition:opacity .25s; }
  .gh-scrim.is-open { opacity:1; pointer-events:auto; }
  .gh-sheet { position:fixed; left:0; right:0; bottom:0; z-index:10002; transform:translateY(105%); transition:transform .3s cubic-bezier(.2,.8,.2,1);
    border-radius:26px 26px 0 0; background:linear-gradient(180deg,var(--cardA),var(--cardB)); box-shadow:0 -1.5px 0 var(--cardEdge),0 -20px 50px var(--glow);
    overflow:hidden; padding-bottom:calc(26px + env(safe-area-inset-bottom)); text-align:left; }
  .gh-sheet.is-open { transform:translateY(0); }
  .gh-sheet-media { position:relative; height:220px; }
  .gh-sheet .gh-tag { font-size:11px; }
  .gh-close { position:absolute; right:12px; top:10px; width:44px; height:44px; border-radius:50%; background:var(--tagBg); display:flex; align-items:center; justify-content:center; color:var(--ink); }
  .gh-sheet-body { padding:2px 18px 0; }
  .gh-sheet .gh-name { font-size:28px; }
  .gh-sheet .gh-nick { font-size:13px; margin-top:2px; }
  .gh-sheet .gh-stats { gap:8px; margin-top:14px; }
  .gh-sheet .gh-stat-v { font-size:22px; }
}
@media (prefers-reduced-motion: reduce) {
  .gh-layer, .gh-card, .gh-sheet, .gh-scrim { transition:none; }
}
`;
