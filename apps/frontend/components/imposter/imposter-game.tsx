"use client";

/**
 * Imposter, the party game: the screen.
 *
 * Ported from the WTA Imposter design (look, copy, flow, taunts). What changed
 * underneath: the design synced phones through a public relay and let the
 * host's browser deal the words, run the clock and hand out coins, so every
 * screen held every word. Here the room is a Durable Object on the API
 * (apps/api/src/durable-objects/imposter-rooms.ts). This screen sends what
 * its player does and draws the view the room sends back, which only ever
 * holds this player's own word until the result is in.
 *
 * Names are account names: you are signed in to play, so nobody types one.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiBaseUrl } from "@/lib/backend";
import { formatCoins } from "@/lib/format";
import { Icon, type ImpIconName } from "./icons";

// ── What the room sends ──────────────────────────────────────────────────────

type VPlayer = { id: string; n: string; b: 0 | 1; c: number; h: 0 | 1; k: number; on: 0 | 1 };
type VClue = { p: string; r: number; x: string; o: 0 | 1 };
type VResult = {
  counts: Record<string, number>;
  out: string[];
  innocentsWon: boolean;
  winners: string[];
  tiedAgain: boolean;
  revoted: boolean;
  settling: boolean;
  practice: boolean;
  paid: Record<string, number>;
  capped: string[];
  imposters: string[];
  rw: number;
  iw: string;
  mw: string;
};
type VGame = {
  gid: string;
  rd: number;
  tu: number;
  ord: string[];
  cl: VClue[];
  voted: string[];
  rv: { id: string; c: string[]; s: number } | null;
  canVote: boolean;
  myWord: string;
  amImp: boolean;
  res: VResult | null;
};
type RoomView = {
  code: string;
  me: string;
  ph: "lobby" | "reveal" | "describe" | "vote" | "result";
  imp: number;
  rds: number;
  ps: VPlayer[];
  g: VGame | null;
  bal: number | null;
};

// ── Fixed content ────────────────────────────────────────────────────────────

const COLORS = ["#f2c21b", "#ff8a5e", "#7fd6ff", "#c9a6ff", "#7ee08f", "#ff6aa8", "#ffd07a", "#9ab8ff", "#ff9f43", "#5ee3c8"];

type TauntItem = { k: string; label: string; icon?: ImpIconName; col?: string; img?: string };
const EMOTES: TauntItem[] = (
  [
    ["SUS", "detective-fill", "#8b6bff"],
    ["CAP", "baseball-cap-fill", "#ff6a5e"],
    ["DEAD", "skull-fill", "#e8e2ea"],
    ["COOKED", "fire-fill", "#ff8a2a"],
    ["I SEE YOU", "eye-fill", "#7fd6ff"],
    ["LIAR", "mask-happy-fill", "#ff6aa8"],
    ["NOOB", "baby-fill", "#ffd07a"],
    ["BYE BYE", "hand-waving-fill", "#7ee08f"],
    ["BOW DOWN", "crown-simple-fill", "#ffc21a"],
    ["SHHH", "speaker-slash-fill", "#c9a6ff"],
    ["NICE TRY", "smiley-wink-fill", "#ffb547"],
    ["GHOSTED", "ghost-fill", "#d9d0ff"],
  ] as const
).map(([label, icon, col], i) => ({ k: `e${i}`, label, icon, col }));

// The design's stickers are the same pictures the 8-ball game reacts with,
// byte for byte, so they are served from there rather than shipped twice.
const STICKERS: TauntItem[] = (
  [
    ["/8ball/assets/cats/cat1.gif", "NOT ME"],
    ["/8ball/assets/cats/cat2.gif", "I SAW THAT"],
    ["/8ball/assets/cats/cat3.gif", "SUS VIBES"],
    ["/8ball/assets/animals/dog1.jpg", "TRUST ME BRO"],
    ["/8ball/assets/animals/dog2.jpg", "CAUGHT"],
    ["/8ball/assets/animals/dog3.jpg", "IMPOSTER?"],
    ["/8ball/assets/animals/fox1.jpg", "SLY ONE"],
    ["/8ball/assets/animals/fox2.jpg", "LIES DETECTED"],
  ] as const
).map(([img, label], i) => ({ k: `s${i}`, img, label }));
const ITEM = (k: string) => [...EMOTES, ...STICKERS].find((x) => x.k === k);

/** Close codes after which reconnecting would only fail again. */
const FINAL_CLOSE = new Set([4000, 4001, 4401, 4403, 4404, 4409, 4503]);
const ROOM_KEY = "wta-imposter-room";

const ini = (n: string) => (n || "?").trim().slice(0, 1).toUpperCase();
const leaks = (word: string, text: string) => {
  const t = text.toLowerCase();
  const w = word.toLowerCase();
  return t.includes(w) || w.split(/\s+/).filter((p) => p.length >= 3).some((p) => t.includes(p));
};

// ── Styles ───────────────────────────────────────────────────────────────────
//
// The design is written as CSS strings; S() turns one into a style object so
// it can be carried over as written. Cached, since most are constant.

const FONT: Record<string, string> = {
  Montserrat: "var(--font-montserrat), Montserrat, system-ui, sans-serif",
  Inter: "var(--font-inter), Inter, system-ui, sans-serif",
};
const styleCache = new Map<string, React.CSSProperties>();
function S(css: string): React.CSSProperties {
  const hit = styleCache.get(css);
  if (hit) return hit;
  const out: Record<string, string> = {};
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    let value = decl.slice(i + 1).trim();
    if (!prop || !value) continue;
    if (prop === "font-family") value = FONT[value] ?? value;
    const key = prop.startsWith("-webkit-")
      ? "Webkit" + prop.slice(8).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      : prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = value;
  }
  if (styleCache.size < 2000) styleCache.set(css, out);
  return out;
}

const GOLD_BTN =
  "all:unset;cursor:pointer;box-sizing:border-box;background:linear-gradient(180deg,#ffe066,#ffc21a 55%,#f0a000);color:#5a0a10;font-family:Montserrat;font-style:italic;font-weight:900;text-align:center";
const SQ_BTN =
  "all:unset;cursor:pointer;width:44px;height:44px;border-radius:12px;background:rgba(10,2,5,.7);border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center";

function Avatar({ name, color, size, font }: { name: string; color: string; size: number; font: number }) {
  return (
    <div
      style={S(
        `flex:none;width:${size}px;height:${size}px;border-radius:50%;background:${color};color:#140d06;font-family:Montserrat;font-weight:900;font-size:${font}px;display:flex;align-items:center;justify-content:center`
      )}
    >
      {ini(name)}
    </div>
  );
}

// ── The game ─────────────────────────────────────────────────────────────────

type Pop = { id: number; item: TauntItem; from: string; to: string; atMe: boolean };
type FeedEntry = Pop;

export function ImposterGame({ name }: { name: string }) {
  const [w, setW] = useState(1200);
  const [mode, setMode] = useState<"home" | "connecting" | "room">("home");
  const [codeIn, setCodeIn] = useState("");
  const [err, setErr] = useState("");
  const [R, setR] = useState<RoomView | null>(null);
  const [draft, setDraft] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [sentKey, setSentKey] = useState(-1);
  const [voted, setVoted] = useState(false);
  const [tOpen, setTOpen] = useState(false);
  const [tTab, setTTab] = useState<"emotes" | "stickers">("emotes");
  const [tTo, setTTo] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [pop, setPop] = useState<Pop | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [net, setNet] = useState<"on" | "off" | "err">("off");
  const [connectingCode, setConnectingCode] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const codeRef = useRef<string>("");
  const joinedRef = useRef(false);
  const leavingRef = useRef(false);
  const retryRef = useRef(0);
  const retryTimer = useRef<number | undefined>(undefined);
  const pingTimer = useRef<number | undefined>(undefined);
  const deadlineRef = useRef(0);
  const totalRef = useRef(45_000);
  const prevRef = useRef<RoomView | null>(null);
  const tidRef = useRef(0);
  const popTimer = useRef<number | undefined>(undefined);
  const errTimer = useRef<number | undefined>(undefined);
  const RRef = useRef<RoomView | null>(null);
  RRef.current = R;

  // Width drives the layout, like the design's.
  useEffect(() => {
    const onR = () => setW(document.documentElement.clientWidth || window.innerWidth);
    onR();
    window.addEventListener("resize", onR);
    const clock = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      window.removeEventListener("resize", onR);
      window.clearInterval(clock);
    };
  }, []);

  const flashErr = useCallback((message: string) => {
    setErr(message);
    window.clearTimeout(errTimer.current);
    errTimer.current = window.setTimeout(() => setErr(""), 5000);
  }, []);

  const showTaunt = useCallback((k: string, fromId: string, toId: string) => {
    const room = RRef.current;
    if (!room) return;
    const f = room.ps.find((p) => p.id === fromId);
    const t = room.ps.find((p) => p.id === toId);
    const item = ITEM(k);
    if (!f || !t || !item) return;
    tidRef.current += 1;
    const e: Pop = { id: tidRef.current, item, from: f.n, to: t.n, atMe: t.id === room.me };
    setFeed((s) => [e, ...s].slice(0, 8));
    setPop(e);
    window.clearTimeout(popTimer.current);
    popTimer.current = window.setTimeout(() => setPop(null), 2600);
  }, []);

  const onState = useCallback((s: RoomView, rem: number, total: number) => {
    deadlineRef.current = rem > 0 ? Date.now() + rem : 0;
    totalRef.current = total || 45_000;
    const prev = prevRef.current;
    const newGame = !prev?.g || !s.g || prev.g.gid !== s.g.gid;
    if (newGame) {
      setSentKey(-1);
      setVoted(false);
      setSel([]);
      setDraft("");
    }
    const prevRv = prev?.g?.rv?.id ?? null;
    const rv = s.g?.rv?.id ?? null;
    if ((prev && prev.ph !== "vote" && s.ph === "vote") || prevRv !== rv) {
      setVoted(false);
      setSel([]);
    }
    prevRef.current = s;
    codeRef.current = s.code;
    try {
      sessionStorage.setItem(ROOM_KEY, s.code);
    } catch {
      /* rejoin after a refresh just won't happen */
    }
    joinedRef.current = true;
    retryRef.current = 0;
    setR(s);
    setMode("room");
  }, []);

  const closeSocket = useCallback(() => {
    window.clearInterval(pingTimer.current);
    window.clearTimeout(retryTimer.current);
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      try {
        ws.close(1000, "bye");
      } catch {
        /* already closed */
      }
    }
  }, []);

  const toHome = useCallback(
    (message: string) => {
      closeSocket();
      joinedRef.current = false;
      codeRef.current = "";
      prevRef.current = null;
      try {
        sessionStorage.removeItem(ROOM_KEY);
      } catch {
        /* nothing to forget */
      }
      setR(null);
      setFeed([]);
      setMode("home");
      setNet("off");
      setErr(message);
    },
    [closeSocket]
  );

  const connect = useCallback(
    (path: string, quiet = false) => {
      closeSocket();
      leavingRef.current = false;
      const base = getApiBaseUrl();
      const origin = base
        ? base.replace(/^http/, "ws")
        : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${origin}/api/imposter/${path}`);
      } catch {
        if (!joinedRef.current) toHome("Imposter is not reachable right now. Try again in a moment.");
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        setNet("on");
        window.clearInterval(pingTimer.current);
        pingTimer.current = window.setInterval(() => {
          try {
            ws.send('{"t":"ping"}');
          } catch {
            /* closing */
          }
        }, 25_000);
      };
      ws.onmessage = (event) => {
        let m: any;
        try {
          m = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (m.type === "state") onState(m.s, Number(m.rem) || 0, Number(m.total) || 0);
        else if (m.type === "taunt") showTaunt(m.k, m.f, m.to);
        else if (m.type === "error") {
          flashErr(String(m.message || "Something went wrong."));
          // A refused clue: let them try again.
          setSentKey(-1);
        } else if (m.type === "kicked") {
          leavingRef.current = true;
          toHome("You were removed from the room.");
        }
      };
      ws.onclose = (event) => {
        if (wsRef.current !== ws) return;
        window.clearInterval(pingTimer.current);
        wsRef.current = null;
        setNet("err");
        if (leavingRef.current) return;
        if (FINAL_CLOSE.has(event.code)) {
          toHome(quiet && !joinedRef.current ? "" : event.reason || "You left the room.");
          return;
        }
        // Dropped: come back to the same room, a few times, a little slower each time.
        if (codeRef.current && retryRef.current < 8) {
          retryRef.current += 1;
          const delay = Math.min(8000, 800 * retryRef.current);
          retryTimer.current = window.setTimeout(() => connect(`room/${codeRef.current}`, true), delay);
          return;
        }
        toHome(joinedRef.current ? "Lost the connection to the room." : "Couldn't reach the room. Check your connection and try again.");
      };
    },
    [closeSocket, flashErr, onState, showTaunt, toHome]
  );

  // Back in the same room after a refresh, quietly.
  useEffect(() => {
    let code = "";
    try {
      code = sessionStorage.getItem(ROOM_KEY) || "";
    } catch {
      /* no storage, no rejoin */
    }
    if (/^[A-HJ-NP-Z2-9]{5}$/.test(code)) {
      codeRef.current = code;
      setConnectingCode(code);
      setMode("connecting");
      connect(`room/${code}`, true);
    }
    return () => closeSocket();
  }, [connect, closeSocket]);

  // A phone that locked its screen comes back to a dead socket: reconnect now.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible" || wsRef.current || !codeRef.current || leavingRef.current) return;
      retryRef.current = 0;
      connect(`room/${codeRef.current}`, true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [connect]);

  const send = useCallback((m: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(m));
    return true;
  }, []);

  const createRoom = () => {
    setErr("");
    codeRef.current = "";
    joinedRef.current = false;
    setConnectingCode("");
    setMode("connecting");
    connect("create");
  };
  const joinRoom = () => {
    const code = codeIn.trim().toUpperCase();
    if (code.length < 5) return setErr("Enter the room code from the host.");
    if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) return setErr("That doesn't look like a room code.");
    setErr("");
    codeRef.current = code;
    joinedRef.current = false;
    setConnectingCode(code);
    setMode("connecting");
    connect(`room/${code}`);
  };
  const leave = () => {
    leavingRef.current = true;
    send({ t: "leave" });
    toHome("");
  };

  // ── Derived view, as the design's renderVals ──

  const g = R?.g ?? null;
  const ph = R?.ph ?? null;
  const me = R?.me ?? "";
  const P = (id: string | null | undefined) => R?.ps.find((p) => p.id === id);
  const meP = P(me);
  const amHost = !!meP?.h && mode === "room";
  const wide = w >= 760;
  const inRoom = mode === "room" && !!R;
  const inPlay = inRoom && (ph === "reveal" || ph === "describe" || ph === "vote");
  const rv = g?.rv ?? null;
  const need = rv ? rv.s : R?.imp ?? 1;
  const amImp = !!g?.amImp;
  const rem = deadlineRef.current ? Math.max(0, deadlineRef.current - now) : 0;
  const secs = Math.ceil(rem / 1000);
  const total = totalRef.current;
  const low = secs <= 5;
  const nR = R?.rds || 2;
  const host = R?.ps.find((p) => p.h);
  const hostName = host ? host.n : "the host";
  const curId = g && ph === "describe" ? g.ord[g.tu] : null;
  const curP = P(curId);
  const turnKey = g ? g.rd * 100 + g.tu : -2;
  const myTurn = curId === me && sentKey !== turnKey;
  const hasVoted = !!g?.voted.includes(me) || voted;
  const others = R ? R.ps.filter((p) => p.id !== me) : [];
  const toId = (others.find((p) => p.id === tTo) || others[0])?.id;
  const color = (p: VPlayer | undefined) => COLORS[(p?.c ?? 0) % COLORS.length];
  const stepIdx =
    ph === "reveal" ? 0 : ph === "describe" ? (g && g.rd >= nR ? 2 : 1) : ph === "vote" ? 3 : ph === "result" ? 4 : -1;

  const L = {
    maxW: wide ? "1280px" : "760px",
    pad: wide ? "18px 32px 48px" : "14px 16px 96px",
    cols: wide && inRoom ? (w >= 1100 ? "minmax(0,1fr) 360px" : "minmax(0,1fr) 300px") : "minmax(0,1fr)",
    homeCols: wide ? "minmax(0,1.25fr) minmax(0,1fr)" : "minmax(0,1fr)",
    homeAreas: wide ? '"art top" "art bot"' : '"top" "art" "bot"',
    homeMinH: wide ? "calc(100vh - 110px)" : "0",
    h1: wide ? "clamp(48px,5vw,72px)" : "clamp(40px,11vw,62px)",
    artMargin: wide ? "0" : "18px -16px 0",
    artRatio: wide ? "4/5" : "1086/580",
    artRadius: wide ? "28px" : "0",
    artMask: wide ? "none" : "linear-gradient(180deg,transparent 0,#000 12%,#000 80%,transparent 100%)",
    artShadow: wide ? "0 0 0 1.5px rgba(255,120,60,.35),0 0 60px rgba(255,40,80,.25),0 30px 80px rgba(0,0,0,.6)" : "none",
    boardCols: wide && w >= 1100 ? "repeat(2,minmax(0,1fr))" : "minmax(0,1fr)",
  };
  const A = wide
    ? { pos: "sticky", top: "16px", left: "auto", right: "auto", bottom: "auto", z: 1, maxH: "calc(100vh - 32px)", tf: "none", radius: "0", padIn: "0", bg: "transparent", shadow: "none" }
    : {
        pos: "fixed",
        top: "auto",
        left: "0",
        right: "0",
        bottom: "0",
        z: 30,
        maxH: "78vh",
        tf: tOpen ? "translateY(0)" : "translateY(105%)",
        radius: "22px 22px 0 0",
        padIn: "14px 14px 22px",
        bg: "#16040b",
        shadow: "0 -10px 40px rgba(0,0,0,.6),0 -1.5px 0 rgba(255,170,90,.5)",
      };

  const submitClue = () => {
    if (!g || ph !== "describe" || curId !== me) return;
    const t = draft.trim();
    if (t.length < 2) return flashErr("Write a short clue.");
    if (leaks(g.myWord, t)) return flashErr("Don't say the word — describe it.");
    if (!send({ t: "clue", text: t })) return flashErr("Reconnecting… try again in a second.");
    setSentKey(turnKey);
    setDraft("");
    setErr("");
  };
  const submitVote = () => {
    if (!g || ph !== "vote" || sel.length !== need) return;
    if (send({ t: "vote", sel })) setVoted(true);
  };
  const sendTaunt = (item: TauntItem) => {
    if (!toId) return;
    if (send({ t: "taunt", k: item.k, to: toId })) setTOpen(false);
  };

  const board = useMemo(() => {
    if (!g || !R) return [];
    return Array.from({ length: nR }, (_, i) => i + 1)
      .map((r) => ({
        label: `ROUND ${r}`,
        items: g.cl
          .filter((c) => c.r === r)
          .map((c, j) => {
            const p = R.ps.find((x) => x.id === c.p);
            return { key: `${r}-${j}`, name: (p?.n ?? "?") + (c.p === R.me ? " (you)" : ""), color: COLORS[(p?.c ?? 0) % COLORS.length], text: c.o ? "Ran out of time" : c.x, out: !!c.o };
          }),
      }))
      .filter((r) => r.items.length);
  }, [g, R, nR]);

  const res = g?.res && ph === "result" ? g.res : null;
  const resView = (() => {
    if (!res || !R) return null;
    const max = Math.max(1, ...Object.values(res.counts));
    const myRole = res.imposters.includes(me);
    const iWon = res.winners.includes(me);
    const myPaid = res.paid[me] ?? 0;
    const capped = res.capped.includes(me);
    const amount = formatCoins(res.rw);
    const meLine = !iWon
      ? `You were ${myRole ? "an imposter" : "innocent"} — no coins this time.`
      : res.settling
        ? `You were ${myRole ? "an imposter" : "innocent"} — you won! Paying out…`
        : res.practice
          ? `You were ${myRole ? "an imposter" : "innocent"} — you won this practice game.`
          : myPaid > 0
            ? `You were ${myRole ? "an imposter" : "innocent"} — you won +${formatCoins(myPaid)} WTA Coins${capped ? " (daily cap reached)" : ""}.`
            : capped
              ? `You were ${myRole ? "an imposter" : "innocent"} — you won, but today's coin cap is used up.`
              : `You were ${myRole ? "an imposter" : "innocent"} — you won. Coins need a clue of your own.`;
    const sub = res.practice
      ? `Practice game: coins need ${3} real players who each gave a clue. Bots never earn.`
      : res.innocentsWon
        ? `Every imposter was caught. Each innocent earns ${amount} WTA Coins.`
        : res.tiedAgain
          ? `Tied again on the revote — the imposters slip away. Each imposter earns ${amount} WTA Coins.`
          : `At least one imposter survived the vote. Each imposter earns ${amount} WTA Coins.`;
    const rows = [...R.ps]
      .sort((a, b) => (res.counts[b.id] ?? 0) - (res.counts[a.id] ?? 0))
      .map((p) => {
        const m = res.imposters.includes(p.id);
        const won = res.winners.includes(p.id);
        const paid = res.paid[p.id] ?? 0;
        const votes = res.counts[p.id] ?? 0;
        return {
          p,
          name: p.n + (p.id === me ? " (you)" : ""),
          votes,
          pct: `${(votes / max) * 100}%`,
          out: res.out.includes(p.id),
          role: m ? "IMPOSTER" : "INNOCENT",
          roleBg: m ? "rgba(255,74,61,.16)" : "rgba(126,224,143,.14)",
          roleFg: m ? "#ff6a5e" : "#7ee08f",
          bc: m ? "rgba(255,74,61,.4)" : "rgba(255,110,90,.2)",
          coinTxt: paid > 0 ? `+${formatCoins(paid)}` : won && res.settling ? "…" : "0",
          coinFg: paid > 0 ? "#ffc21a" : "#7d6870",
        };
      });
    return {
      title: res.innocentsWon ? "INNOCENTS WIN" : "IMPOSTERS WIN",
      icon: (res.innocentsWon ? "shield-check-fill" : "detective-fill") as ImpIconName,
      accent: res.innocentsWon ? "#7ee08f" : "#ff6a5e",
      bannerBg: res.innocentsWon
        ? "linear-gradient(180deg,rgba(16,38,26,.92),rgba(13,20,16,.92))"
        : "linear-gradient(180deg,rgba(60,10,16,.92),rgba(22,8,9,.92))",
      bannerBc: res.innocentsWon ? "rgba(126,224,143,.55)" : "rgba(255,74,61,.6)",
      me: meLine,
      sub,
      rows,
    };
  })();

  const canVote = ph === "vote" && !hasVoted && !!g?.canVote;
  const voters = R && g ? R.ps.filter((p) => p.on).length : 0;
  const votedN = g ? g.voted.length : 0;
  const voteOpts = R && ph === "vote" ? others.filter((p) => !rv || rv.c.includes(p.id)) : [];
  const timerPct = `${total ? ((rem / total) * 100).toFixed(1) : 0}%`;
  const timerColor = low ? "#ff6a5e" : "#ffc21a";
  const timerBar = low ? "linear-gradient(90deg,#ff3b4a,#ff6a5e)" : "linear-gradient(90deg,#ffc21a,#ff9f00)";
  const netDot = net === "on" ? "#7ee08f" : net === "err" ? "#ff6a5e" : "#ffc21a";
  const tItems = tTab === "emotes" ? EMOTES : STICKERS;
  const stageLabel =
    ph === "reveal" ? "WORDS" : ph === "describe" ? `ROUND ${g?.rd ?? 1}/${nR}` : ph === "vote" ? (rv ? "REVOTE" : "VOTE") : ph === "result" ? "RESULT" : "";
  const maxImp = (n: number) => Math.max(1, Math.floor((n - 1) / 2));
  const nPlayers = R?.ps.length ?? 0;
  const ready = nPlayers >= 3;

  return (
    <div className="imp-root" style={S("min-height:100vh;color:#f3eee6;font-family:Inter;-webkit-font-smoothing:antialiased;background:radial-gradient(1000px 560px at 50% -8%,#4a0d22 0%,transparent 62%),radial-gradient(800px 420px at 50% 112%,#5a1a08 0%,transparent 60%),radial-gradient(600px 600px at 0% 50%,rgba(140,20,60,.25),transparent 60%),radial-gradient(600px 600px at 100% 50%,rgba(140,20,60,.25),transparent 60%),#12040a")}>
      <style>{`
        .imp-root a{color:#f2c21b;text-decoration:none}
        .imp-root input::placeholder{color:#7d6870}
        .imp-root button:focus-visible,.imp-root a:focus-visible,.imp-root input:focus-visible{outline:2px solid #ffc21a !important;outline-offset:2px}
        .imp-bright:hover{filter:brightness(1.06)}
        .imp-titem:hover{border-color:rgba(255,190,60,.6) !important;background:rgba(60,14,24,.7) !important}
        @keyframes tauntPop{0%{transform:translate(-50%,30px) scale(.4);opacity:0}10%{transform:translate(-50%,0) scale(1.08);opacity:1}16%{transform:translate(-50%,0) scale(1)}85%{transform:translate(-50%,0) scale(1);opacity:1}100%{transform:translate(-50%,-30px) scale(.9);opacity:0}}
        @keyframes tauntWob{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
        @keyframes impBlink{0%,100%{opacity:.35}50%{opacity:1}}
        @keyframes impSpin{to{transform:rotate(360deg)}}
        @media (prefers-reduced-motion: reduce){.imp-root *{animation-duration:.01ms !important;animation-iteration-count:1 !important}}
      `}</style>
      <div style={S(`max-width:${L.maxW};margin:0 auto;padding:${L.pad};box-sizing:border-box;display:flex;flex-direction:column;gap:16px`)}>
        <header style={S("display:flex;align-items:center;gap:10px")}>
          <Link
            href="/games"
            aria-label="Back to Game Vault"
            onClick={() => {
              if (inRoom) leave();
            }}
            style={S("flex:none;width:40px;height:40px;border-radius:11px;background:rgba(30,6,14,.8);border:1px solid rgba(255,170,90,.4);display:flex;align-items:center;justify-content:center;color:#f2c21b")}
          >
            <Icon name="arrow-left-bold" size={18} />
          </Link>
          <div style={S("flex:1;display:flex;align-items:center;gap:8px")}>
            <Icon name="detective-fill" size={26} style={S("color:#8b6bff;filter:drop-shadow(0 0 8px rgba(139,107,255,.6))")} />
            <span style={S("font-family:Montserrat;font-style:italic;font-weight:900;font-size:22px;letter-spacing:.02em")}>IMPOSTER</span>
          </div>
          {mode !== "home" && (R?.code || connectingCode) && (
            <div style={S("display:flex;align-items:center;gap:7px;padding:7px 11px;border-radius:10px;background:rgba(30,6,14,.8);border:1px solid rgba(255,170,90,.35);font-family:Montserrat;font-weight:800;font-size:12px;letter-spacing:.14em")}>
              <span style={S(`width:8px;height:8px;border-radius:50%;background:${netDot};box-shadow:0 0 8px ${netDot}`)} />
              {R?.code || connectingCode}
            </div>
          )}
        </header>

        {inRoom && net !== "on" && (
          <div role="status" style={S("display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:14px;background:rgba(255,74,61,.12);border:1px solid rgba(255,74,61,.45);font-size:13.5px;color:#ffb3ab")}>
            <Icon name="wifi-slash-fill" size={18} />
            Reconnecting to the room…
          </div>
        )}

        <div style={S(`display:grid;grid-template-columns:${L.cols};gap:24px;align-items:start`)}>
          <div style={S("min-width:0;display:flex;flex-direction:column;gap:16px")}>
            {mode === "home" && (
              <section style={S(`display:grid;grid-template-columns:${L.homeCols};grid-template-areas:${L.homeAreas};column-gap:48px;align-items:center;text-align:center;min-height:${L.homeMinH}`)}>
                <div style={S("grid-area:top;display:flex;flex-direction:column;align-items:center;align-self:end")}>
                  <div style={S("display:flex;flex-direction:column;align-items:center;gap:2px")}>
                    <div style={S("display:flex;align-items:flex-start;font-family:Montserrat;font-style:italic;font-weight:900;font-size:30px;letter-spacing:-.02em;line-height:1")}>
                      WTA
                      <Icon name="star-fill" size={12} style={S("color:#ff2a3a;margin-left:1px")} />
                    </div>
                    <div style={S("font-family:Montserrat;font-weight:800;font-size:9.5px;letter-spacing:.14em;color:#f2c21b")}>WINNER TAKES ALL</div>
                  </div>
                  <div style={S("margin-top:14px;display:flex;align-items:center;gap:10px")}>
                    <Icon name="detective-fill" size={34} style={S("color:#8b6bff;filter:drop-shadow(0 0 10px rgba(139,107,255,.7))")} />
                    <span style={S("font-family:Montserrat;font-style:italic;font-weight:900;font-size:26px;letter-spacing:.02em")}>IMPOSTER</span>
                  </div>
                  <h1 style={S(`margin:12px 0 0;font-family:Montserrat;font-style:italic;font-weight:900;font-size:${L.h1};line-height:.98;letter-spacing:-.02em;text-transform:uppercase`)}>
                    <div style={S("background:linear-gradient(180deg,#ffffff 30%,#b9b4bd);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 0 rgba(0,0,0,.4))")}>One word.</div>
                    <div style={S("background:linear-gradient(180deg,#fff3a0,#ffcb1f 45%,#ff9f00);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 18px rgba(255,170,0,.45))")}>One liar.</div>
                  </h1>
                  <div style={S("margin-top:8px;width:min(80%,420px);height:5px;border-radius:50%;background:linear-gradient(90deg,transparent,#ff2a3a 20%,#ff5a4d 70%,transparent);box-shadow:0 0 14px rgba(255,42,58,.7)")} />
                  <div style={S("margin-top:14px;font-size:11.5px;font-weight:600;letter-spacing:.32em;color:#f3eee6")}>A GAME OF WORDS, WITS AND DECEPTION.</div>
                </div>
                <div style={S(`grid-area:art;position:relative;margin:${L.artMargin};aspect-ratio:${L.artRatio};border-radius:${L.artRadius};overflow:hidden;-webkit-mask-image:${L.artMask};mask-image:${L.artMask};box-shadow:${L.artShadow}`)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/imposter/hero.webp"
                    alt="Friends around a glowing table while a hooded imposter watches"
                    style={S("position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 30%;display:block")}
                  />
                </div>
                <div style={S("grid-area:bot;display:flex;flex-direction:column;align-items:center;align-self:start")}>
                  <p style={S("margin:16px 0 0;font-size:16px;line-height:1.55;color:#f3eee6;max-width:460px;text-wrap:pretty")}>
                    Everyone gets a secret word on their own phone, but the imposters&apos; word is slightly different. Describe yours in 45 seconds without saying it, then{" "}
                    <strong style={S("color:#ffc21a")}>vote out the imposters.</strong>
                  </p>
                  <div style={S("margin-top:34px;width:100%;max-width:520px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px")}>
                    {(
                      [
                        ["chat-text-fill", "Rounds of clues"],
                        ["hand-pointing-fill", "One secret vote"],
                        ["coins-fill", "Winners take coins"],
                      ] as const
                    ).map(([icon, label]) => (
                      <div key={label} style={S("position:relative;padding:28px 8px 14px;border-radius:14px;background:rgba(30,6,14,.7);border:1.5px solid rgba(255,170,90,.55);box-shadow:0 0 18px rgba(255,90,40,.18);display:flex;flex-direction:column;align-items:center")}>
                        <div style={S("position:absolute;top:-22px;width:42px;height:42px;border-radius:50%;background:#1a0509;border:1.5px solid #ffb547;box-shadow:0 0 14px rgba(255,170,40,.55);display:flex;align-items:center;justify-content:center")}>
                          <Icon name={icon} size={20} color="#ffc21a" />
                        </div>
                        <span style={S("font-size:12.5px;font-weight:500")}>{label}</span>
                      </div>
                    ))}
                  </div>
                  <div style={S("margin-top:26px;width:100%;max-width:420px;display:flex;flex-direction:column;gap:12px")}>
                    <div style={S("height:44px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;color:#d9d0c4")}>
                      Playing as <strong style={S("color:#fff")}>{name}</strong>
                    </div>
                    <button type="button" className="imp-bright" onClick={createRoom} style={S(`${GOLD_BTN};height:60px;border-radius:30px;font-size:22px;box-shadow:0 0 30px rgba(255,190,30,.45),inset 0 -3px 0 rgba(150,60,0,.35),inset 0 2px 0 rgba(255,255,255,.5)`)}>
                      CREATE ROOM
                    </button>
                    <div style={S("display:flex;align-items:center;gap:10px;font-size:11px;font-weight:700;letter-spacing:.2em;color:#a08890")}>
                      <div style={S("flex:1;height:1px;background:rgba(255,170,90,.25)")} />
                      OR JOIN A FRIEND
                      <div style={S("flex:1;height:1px;background:rgba(255,170,90,.25)")} />
                    </div>
                    <div style={S("display:flex;gap:8px")}>
                      <input
                        value={codeIn}
                        onChange={(e) => {
                          setCodeIn(e.target.value.toUpperCase());
                          setErr("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") joinRoom();
                        }}
                        maxLength={5}
                        autoCapitalize="characters"
                        autoComplete="off"
                        placeholder="ROOM CODE"
                        aria-label="Room code"
                        style={S("flex:1;min-width:0;height:52px;padding:0 18px;border-radius:26px;background:rgba(20,4,10,.8);border:1.5px solid rgba(255,170,90,.45);color:#fff;font-size:17px;font-family:Montserrat;font-weight:800;letter-spacing:.24em;text-transform:uppercase;outline:none;text-align:center;box-sizing:border-box")}
                      />
                      <button type="button" onClick={joinRoom} style={S("all:unset;cursor:pointer;flex:none;height:52px;padding:0 24px;border-radius:26px;border:1.5px solid rgba(255,190,60,.7);color:#ffc21a;font-family:Montserrat;font-style:italic;font-weight:900;font-size:16px;box-sizing:border-box")}>
                        JOIN
                      </button>
                    </div>
                    {err && <div role="alert" style={S("font-size:13px;color:#ff6a5e")}>{err}</div>}
                  </div>
                  <div style={S("margin-top:22px;width:min(90%,460px);height:26px;border-radius:50%;border:2px solid rgba(255,150,40,.55);box-shadow:0 0 22px rgba(255,120,30,.45),inset 0 0 16px rgba(255,120,30,.3)")} />
                </div>
              </section>
            )}

            {mode === "connecting" && (
              <section style={S("padding:40px 20px;border-radius:22px;background:rgba(30,6,14,.85);border:1.5px solid rgba(255,170,90,.5);display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center")}>
                <div style={S("width:44px;height:44px;border-radius:50%;border:3px solid rgba(255,190,60,.25);border-top-color:#ffc21a;animation:impSpin .9s linear infinite")} />
                <div style={S("font-family:Montserrat;font-weight:900;font-size:20px")}>{connectingCode ? `Joining room ${connectingCode}…` : "Opening a room…"}</div>
                <div style={S("font-size:13.5px;color:#a08890")}>{connectingCode ? "Finding the host's room." : "Getting you a room code to share."}</div>
                <button type="button" onClick={leave} style={S("all:unset;cursor:pointer;padding:10px 18px;border-radius:20px;border:1.5px solid rgba(255,170,90,.4);font-weight:700;font-size:13px")}>
                  Cancel
                </button>
              </section>
            )}

            {inRoom && ph === "lobby" && R && (
              <section style={S("display:flex;flex-direction:column;gap:14px")}>
                <div style={S("padding:18px;border-radius:18px;background:linear-gradient(180deg,rgba(60,12,24,.85),rgba(26,5,11,.85));border:1.5px solid rgba(255,170,90,.55);box-shadow:0 0 26px rgba(255,90,40,.18);display:flex;align-items:center;gap:14px")}>
                  <div style={S("flex:1")}>
                    <div style={S("font-size:11px;font-weight:700;letter-spacing:.16em;color:#a08890")}>ROOM CODE</div>
                    <div style={S("margin-top:4px;font-family:Montserrat;font-weight:900;font-size:38px;letter-spacing:.18em;color:#ffc21a")}>{R.code}</div>
                    <div style={S("margin-top:4px;font-size:12.5px;color:#d9d0c4")}>Friends open Games → Imposter on their phone and enter this code.</div>
                  </div>
                  <Icon name="devices-fill" size={44} color="rgba(255,194,26,.3)" />
                </div>
                <div style={S("font-size:12px;font-weight:700;letter-spacing:.14em;color:#a08890")}>
                  {`${nPlayers} IN THE ROOM · ${ready ? "READY TO LAUNCH" : `NEED ${3 - nPlayers} MORE`}`}
                </div>
                <div style={S("display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px")}>
                  {R.ps.map((p) => (
                    <div key={p.id} style={S(`display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;background:rgba(30,6,14,.72);border:1.5px solid ${p.id === me ? "rgba(255,190,60,.6)" : "rgba(255,110,90,.2)"};opacity:${p.on ? 1 : 0.55}`)}>
                      <Avatar name={p.n} color={color(p)} size={36} font={14} />
                      <div style={S("flex:1;min-width:0;display:flex;flex-direction:column;gap:2px")}>
                        <span style={S("font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{p.n}</span>
                        <span style={S("font-size:11.5px;color:#a08890")}>{p.h ? "Host" : p.b ? "Bot" : !p.on ? "Reconnecting…" : p.id === me ? "You" : "Connected"}</span>
                      </div>
                      <span title="WTA Coins won in this room" style={S("display:flex;align-items:center;gap:4px;color:#ffc21a;font-weight:700;font-size:13px")}>
                        <Icon name="coin-fill" />
                        {formatCoins(p.k)}
                      </span>
                      {amHost && !p.h && (
                        <button type="button" onClick={() => send({ t: "kick", pid: p.id })} aria-label={`Remove ${p.n}`} style={S("all:unset;cursor:pointer;width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#a08890")}>
                          <Icon name="x-bold" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {amHost ? (
                  <div style={S("display:flex;flex-direction:column;gap:12px")}>
                    <div style={S("padding:14px 16px;border-radius:16px;background:rgba(30,6,14,.72);border:1px solid rgba(255,110,90,.2);display:flex;align-items:center;gap:12px;flex-wrap:wrap")}>
                      <div style={S("flex:1;min-width:160px")}>
                        <div style={S("font-weight:700;font-size:15px")}>Imposters per game</div>
                        <div style={S("font-size:12px;color:#a08890;margin-top:2px")}>{`Up to ${maxImp(Math.max(nPlayers, 3))} with ${Math.max(nPlayers, 3)} players`}</div>
                      </div>
                      <button type="button" onClick={() => send({ t: "settings", imp: R.imp - 1 })} aria-label="Fewer imposters" style={S(SQ_BTN)}>
                        <Icon name="minus-bold" />
                      </button>
                      <div style={S("width:30px;text-align:center;font-family:Montserrat;font-weight:900;font-size:24px;color:#ff6a5e")}>{R.imp}</div>
                      <button type="button" onClick={() => send({ t: "settings", imp: R.imp + 1 })} aria-label="More imposters" style={S(SQ_BTN)}>
                        <Icon name="plus-bold" />
                      </button>
                      <div style={S("flex-basis:100%;height:1px;background:rgba(255,110,90,.15)")} />
                      <div style={S("flex:1;min-width:160px")}>
                        <div style={S("font-weight:700;font-size:15px")}>Rounds per game</div>
                        <div style={S("font-size:12px;color:#a08890;margin-top:2px")}>{`${nR} clue${nR > 1 ? "s" : ""} per player · up to 5`}</div>
                      </div>
                      <button type="button" onClick={() => send({ t: "settings", rds: nR - 1 })} aria-label="Fewer rounds" style={S(SQ_BTN)}>
                        <Icon name="minus-bold" />
                      </button>
                      <div style={S("width:30px;text-align:center;font-family:Montserrat;font-weight:900;font-size:24px;color:#ffc21a")}>{nR}</div>
                      <button type="button" onClick={() => send({ t: "settings", rds: nR + 1 })} aria-label="More rounds" style={S(SQ_BTN)}>
                        <Icon name="plus-bold" />
                      </button>
                      <div style={S("flex-basis:100%;height:1px;background:rgba(255,110,90,.15)")} />
                      <button type="button" onClick={() => send({ t: "addBot" })} disabled={nPlayers >= 10} style={S("all:unset;cursor:pointer;height:44px;padding:0 16px;border-radius:22px;border:1.5px solid rgba(255,170,90,.45);font-family:Montserrat;font-weight:800;font-size:13px;display:flex;align-items:center;gap:6px;box-sizing:border-box")}>
                        <Icon name="robot-bold" />
                        Add bot
                      </button>
                      <span style={S("font-size:12px;color:#a08890;flex:1;min-width:180px")}>Bots fill seats for fun. Coins need 3 real players.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => send({ t: "start" })}
                      disabled={!ready}
                      style={S(`all:unset;cursor:${ready ? "pointer" : "default"};height:58px;border-radius:29px;font-style:italic;background:${ready ? "linear-gradient(180deg,#ffe066,#ffc21a 55%,#f0a000)" : "rgba(40,10,18,.8)"};color:${ready ? "#5a0a10" : "#7d6870"};font-family:Montserrat;font-weight:900;font-size:17px;text-align:center;letter-spacing:.04em`)}
                    >
                      {ready ? "LAUNCH GAME" : `WAITING FOR PLAYERS (${nPlayers}/3)`}
                    </button>
                  </div>
                ) : (
                  <div style={S("padding:16px;border-radius:16px;background:rgba(30,6,14,.72);border:1px dashed rgba(255,170,90,.4);display:flex;align-items:center;gap:12px;font-size:14px;color:#d9d0c4")}>
                    <Icon name="hourglass-medium-fill" size={22} style={S("color:#ffc21a;animation:impBlink 1.4s ease-in-out infinite")} />
                    Waiting for {hostName} to launch the game…
                  </div>
                )}
                {err && <div role="alert" style={S("font-size:13px;color:#ff6a5e")}>{err}</div>}
              </section>
            )}

            {(inPlay || (inRoom && ph === "result")) && (
              <div style={S("display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px;border-radius:14px;background:rgba(30,6,14,.72);border:1px solid rgba(255,110,90,.2)")}>
                <span style={S("font-family:Montserrat;font-weight:900;font-size:12px;letter-spacing:.14em;color:#ffc21a")}>{stageLabel}</span>
                <div style={S("flex:1;min-width:120px;display:grid;grid-template-columns:repeat(4,1fr);gap:4px")}>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} style={S(`height:5px;border-radius:3px;background:${i < stepIdx ? "#f2c21b" : i === stepIdx ? "linear-gradient(90deg,#f2c21b,#ff6a5e)" : "rgba(255,255,255,.08)"}`)} />
                  ))}
                </div>
                {g?.myWord && (
                  <span style={S("display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:12px;background:rgba(255,190,60,.12);border:1px solid rgba(255,190,60,.4);font-size:12.5px")}>
                    <Icon name="lock-key-fill" color="#ffc21a" />
                    Your word: <strong style={S("color:#ffc21a;text-transform:uppercase")}>{g.myWord}</strong>
                  </span>
                )}
                {amImp && ph !== "result" && (
                  <span title="Only you can see this" style={S("display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:10px;background:rgba(255,42,58,.14);border:1px solid rgba(255,74,61,.55);color:#ff6a5e;font-size:11px;font-weight:800;letter-spacing:.1em")}>
                    <Icon name="mask-sad-fill" />
                    IMPOSTER
                  </span>
                )}
                <span title="Imposters this game" style={S("font-size:12px;color:#a08890;display:flex;align-items:center;gap:4px")}>
                  <Icon name="detective-fill" color="#ff6a5e" />
                  {R?.imp}
                </span>
              </div>
            )}

            {inRoom && ph === "reveal" && g && (
              <section style={S("padding:34px 20px;border-radius:22px;background:linear-gradient(180deg,rgba(60,14,20,.92),rgba(22,5,10,.92));border:1.5px solid rgba(255,190,60,.65);box-shadow:0 0 30px rgba(255,160,30,.22);display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px")}>
                <div style={S("font-size:12px;font-weight:700;letter-spacing:.18em;color:#d9d0c4")}>{(meP?.n ?? "").toUpperCase()}, YOUR SECRET WORD IS</div>
                <div style={S("font-family:Montserrat;font-style:italic;font-weight:900;font-size:clamp(40px,10vw,68px);line-height:1.05;text-transform:uppercase;background:linear-gradient(180deg,#fff3b0,#f2c21b 50%,#d58a00);-webkit-background-clip:text;background-clip:text;color:transparent")}>{g.myWord}</div>
                {amImp && (
                  <div style={S("display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:14px;background:rgba(255,42,58,.14);border:1px solid rgba(255,74,61,.6);color:#ff8a80;font-size:13.5px;font-weight:600")}>
                    <Icon name="mask-sad-fill" size={18} color="#ff6a5e" />
                    Psst… you&apos;re the imposter. Blend in.
                  </div>
                )}
                <div style={S("font-size:13.5px;color:#d9d0c4;max-width:360px;line-height:1.5")}>Keep your screen to yourself.</div>
                <div style={S("margin-top:8px;display:flex;align-items:center;gap:8px;padding:8px 16px;border-radius:20px;background:rgba(10,2,5,.6);font-family:Montserrat;font-weight:800;font-size:14px")}>
                  <Icon name="timer-fill" color="#ffc21a" />
                  Clues start in {secs}s
                </div>
              </section>
            )}

            {inRoom && ph === "describe" && g && (
              <section style={S(`padding:16px;border-radius:20px;background:rgba(30,6,14,.88);border:1.5px solid ${curId === me ? "rgba(255,190,60,.75)" : "rgba(255,110,90,.3)"};box-shadow:0 0 26px ${curId === me ? "rgba(255,170,30,.3)" : "transparent"};display:flex;flex-direction:column;gap:12px`)}>
                <div style={S("display:flex;align-items:center;gap:12px")}>
                  <Avatar name={curP?.n ?? "?"} color={curP ? color(curP) : "#333"} size={44} font={17} />
                  <div style={S("flex:1;min-width:0")}>
                    <div style={S("font-family:Montserrat;font-weight:900;font-size:18px")}>
                      {curP ? (curId === me ? (myTurn ? "Your turn — describe it!" : "Clue sent") : `${curP.n} is describing…`) : ""}
                    </div>
                    <div style={S("font-size:12.5px;color:#a08890")}>
                      {curId === me ? "45 seconds. Don't say the word." : curP && !curP.on ? "They dropped out. Skipping their turn…" : "Watch closely. Is their clue a little off?"}
                    </div>
                  </div>
                  <div aria-label={`${secs} seconds left`} style={S(`flex:none;font-family:Montserrat;font-weight:900;font-size:30px;color:${timerColor};min-width:52px;text-align:right`)}>{secs}</div>
                </div>
                <div style={S("height:7px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden")}>
                  <div style={S(`height:100%;width:${timerPct};background:${timerBar};border-radius:4px;transition:width .25s linear`)} />
                </div>
                {myTurn && (
                  <div style={S("display:flex;flex-direction:column;gap:10px")}>
                    <input
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        setErr("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitClue();
                      }}
                      maxLength={60}
                      autoFocus
                      enterKeyHint="send"
                      aria-label="Your clue"
                      placeholder="Describe your word without saying it…"
                      style={S("height:54px;padding:0 16px;border-radius:14px;background:rgba(14,3,7,.9);border:1.5px solid rgba(255,190,60,.6);color:#fff;font-size:17px;font-family:Inter;outline:none;box-sizing:border-box;width:100%")}
                    />
                    {err && <div role="alert" style={S("font-size:13px;color:#ff6a5e")}>{err}</div>}
                    <button type="button" onClick={submitClue} style={S(`${GOLD_BTN};height:52px;border-radius:26px;font-size:16px;box-shadow:0 0 22px rgba(255,190,30,.35)`)}>
                      SEND CLUE
                    </button>
                  </div>
                )}
              </section>
            )}

            {inRoom && g && g.cl.length > 0 && board.length > 0 && (
              <section style={S(`display:grid;grid-template-columns:${L.boardCols};gap:14px`)}>
                {board.map((rd) => (
                  <div key={rd.label} style={S("display:flex;flex-direction:column;gap:7px")}>
                    <div style={S("font-size:11px;font-weight:700;letter-spacing:.16em;color:#a08890")}>{rd.label}</div>
                    {rd.items.map((c) => (
                      <div key={c.key} style={S("display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:14px;background:rgba(30,6,14,.72);border:1px solid rgba(255,110,90,.2)")}>
                        <Avatar name={c.name} color={c.color} size={30} font={12} />
                        <div style={S("min-width:0;display:flex;flex-direction:column;gap:2px")}>
                          <span style={S("font-size:12px;font-weight:700;color:#a08890")}>{c.name}</span>
                          <span style={S(`font-size:15.5px;line-height:1.35;color:${c.out ? "#7d6870" : "#fff"};font-style:${c.out ? "italic" : "normal"};overflow-wrap:anywhere`)}>{c.text}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            )}

            {inRoom && ph === "vote" && g && (
              <section style={S("padding:16px;border-radius:20px;background:rgba(30,6,14,.88);border:1.5px solid rgba(255,74,61,.6);box-shadow:0 0 22px rgba(255,40,60,.2);display:flex;flex-direction:column;gap:12px")}>
                <div style={S("display:flex;align-items:center;gap:12px")}>
                  <div style={S("flex:1")}>
                    <div style={S("font-family:Montserrat;font-weight:900;font-size:19px")}>Who are the imposters?</div>
                    {rv && (
                      <div style={S("margin:4px 0 2px;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:10px;background:rgba(255,190,60,.14);border:1px solid rgba(255,190,60,.5);color:#ffc21a;font-size:12px;font-weight:800;letter-spacing:.06em")}>
                        <Icon name="scales-fill" />
                        REVOTE: {rv.c.map((id) => P(id)?.n ?? "?").join(" vs ")}
                      </div>
                    )}
                    <div style={S("font-size:13px;color:#a08890")}>
                      {rv
                        ? need === 1
                          ? "Tie! Pick one of them. Another tie and the imposters escape."
                          : `Tie! Pick ${need} (${sel.length}/${need}). Another tie and the imposters escape.`
                        : need === 1
                          ? "Pick the one player you think is the imposter."
                          : `Pick ${need} players (${sel.length}/${need} selected).`}
                    </div>
                  </div>
                  <div aria-label={`${secs} seconds left`} style={S(`font-family:Montserrat;font-weight:900;font-size:30px;color:${timerColor}`)}>{secs}</div>
                </div>
                <div style={S("height:7px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden")}>
                  <div style={S(`height:100%;width:${timerPct};background:${timerBar};border-radius:4px;transition:width .25s linear`)} />
                </div>
                {canVote && (
                  <div style={S("display:flex;flex-direction:column;gap:10px")}>
                    <div role="group" aria-label="Players" style={S("display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px")}>
                      {voteOpts.map((p) => {
                        const on = sel.includes(p.id);
                        return (
                          <button
                            type="button"
                            key={p.id}
                            aria-pressed={on}
                            onClick={() => setSel(on ? sel.filter((x) => x !== p.id) : need === 1 ? [p.id] : [...sel, p.id].slice(-need))}
                            style={S(`all:unset;cursor:pointer;box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:10px 12px;min-height:44px;border-radius:12px;background:${on ? "rgba(255,74,61,.14)" : "rgba(14,3,7,.9)"};border:1.5px solid ${on ? "#ff4a3d" : "rgba(255,255,255,.1)"}`)}
                          >
                            <Avatar name={p.n} color={color(p)} size={28} font={12} />
                            <span style={S("flex:1;min-width:0;font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{p.n}</span>
                            <Icon name={on ? "check-circle-fill" : "circle-regular"} color="#ff6a5e" />
                          </button>
                        );
                      })}
                    </div>
                    <button type="button" onClick={submitVote} disabled={sel.length !== need} style={S(`all:unset;cursor:pointer;height:52px;border-radius:26px;font-style:italic;background:${sel.length === need ? "linear-gradient(180deg,#ff5a4d,#c9231c)" : "#2a1a18"};color:#fff;font-family:Montserrat;font-weight:900;font-size:15px;text-align:center`)}>
                      LOCK IN VOTE
                    </button>
                  </div>
                )}
                {ph === "vote" && hasVoted && (
                  <div style={S("display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;background:rgba(10,2,5,.6);font-size:14px;color:#d9d0c4")}>
                    <Icon name="check-circle-fill" size={20} color="#7ee08f" />
                    {`Vote locked. Waiting for others (${votedN}/${voters}).`}
                  </div>
                )}
              </section>
            )}

            {inRoom && resView && res && (
              <section style={S("display:flex;flex-direction:column;gap:14px")}>
                <div style={S(`padding:26px 18px;border-radius:22px;background:${resView.bannerBg};border:1.5px solid ${resView.bannerBc};display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px`)}>
                  <Icon name={resView.icon} size={46} color={resView.accent} />
                  <div style={S(`font-family:Montserrat;font-style:italic;font-weight:900;font-size:clamp(30px,8vw,46px);line-height:1;color:${resView.accent}`)}>{resView.title}</div>
                  <div style={S("font-family:Montserrat;font-weight:800;font-size:16px;color:#fff")}>{resView.me}</div>
                  <div style={S("font-size:14px;color:#d9d0c4;max-width:420px")}>{resView.sub}</div>
                  <div style={S("margin-top:6px;display:flex;flex-wrap:wrap;justify-content:center;gap:8px;font-size:13px")}>
                    <span style={S("padding:6px 12px;border-radius:14px;background:rgba(255,255,255,.07)")}>
                      Innocent word: <strong style={S("color:#ffc21a")}>{res.iw}</strong>
                    </span>
                    <span style={S("padding:6px 12px;border-radius:14px;background:rgba(255,255,255,.07)")}>
                      Imposter word: <strong style={S("color:#ff6a5e")}>{res.mw}</strong>
                    </span>
                    {R?.bal != null && (
                      <span style={S("padding:6px 12px;border-radius:14px;background:rgba(255,190,60,.12);display:flex;align-items:center;gap:5px")}>
                        <Icon name="coin-fill" color="#ffc21a" />
                        Balance: <strong style={S("color:#ffc21a")}>{formatCoins(R.bal)}</strong>
                      </span>
                    )}
                  </div>
                </div>
                <div style={S("display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px")}>
                  {resView.rows.map((r) => (
                    <div key={r.p.id} style={S(`display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;background:rgba(30,6,14,.72);border:1.5px solid ${r.bc}`)}>
                      <Avatar name={r.p.n} color={color(r.p)} size={34} font={13} />
                      <div style={S("flex:1;min-width:0;display:flex;flex-direction:column;gap:5px")}>
                        <div style={S("display:flex;align-items:center;gap:8px;flex-wrap:wrap")}>
                          <span style={S("font-weight:700;font-size:14.5px")}>{r.name}</span>
                          <span style={S(`padding:2px 7px;border-radius:6px;font-size:10px;font-weight:800;letter-spacing:.1em;background:${r.roleBg};color:${r.roleFg}`)}>{r.role}</span>
                          {r.out && <span style={S("font-size:11px;font-weight:700;color:#ff6a5e")}>VOTED OUT</span>}
                        </div>
                        <div style={S("height:6px;border-radius:3px;background:rgba(255,255,255,.06);overflow:hidden")}>
                          <div style={S(`height:100%;width:${r.pct};background:linear-gradient(90deg,#ff6a5e,#ff3b4a);border-radius:3px`)} />
                        </div>
                      </div>
                      <div style={S("flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:3px")}>
                        <span style={S("font-size:12px;color:#a08890")}>{r.votes} votes</span>
                        <span style={S(`font-size:12.5px;font-weight:700;color:${r.coinFg};display:flex;align-items:center;gap:3px`)}>
                          <Icon name="coin-fill" />
                          {r.coinTxt}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {amHost ? (
                  <div style={S("display:grid;grid-template-columns:1fr 1fr;gap:10px")}>
                    <button type="button" onClick={() => send({ t: "start" })} style={S(`${GOLD_BTN};height:54px;border-radius:28px;font-size:15px;box-shadow:0 0 22px rgba(255,190,30,.35)`)}>
                      PLAY AGAIN
                    </button>
                    <button type="button" onClick={() => send({ t: "lobby" })} style={S("all:unset;cursor:pointer;box-sizing:border-box;height:54px;border-radius:28px;border:1.5px solid rgba(255,170,90,.5);font-family:Montserrat;font-style:italic;font-weight:900;font-size:15px;text-align:center")}>
                      BACK TO ROOM
                    </button>
                  </div>
                ) : (
                  <div style={S("text-align:center;font-size:13.5px;color:#a08890")}>Waiting for {hostName} to start the next game…</div>
                )}
                {err && <div role="alert" style={S("font-size:13px;color:#ff6a5e;text-align:center")}>{err}</div>}
              </section>
            )}
          </div>

          {inRoom && (
            <aside
              aria-label="Taunt zone"
              style={S(`position:${A.pos};top:${A.top};left:${A.left};right:${A.right};bottom:${A.bottom};z-index:${A.z};max-height:${A.maxH};overflow-y:auto;transform:${A.tf};transition:transform .3s cubic-bezier(.2,.8,.2,1);border-radius:${A.radius};padding:${A.padIn};background:${A.bg};box-shadow:${A.shadow};display:flex;flex-direction:column;gap:14px;box-sizing:border-box;scrollbar-width:none`)}
            >
              <div style={S("padding:16px;border-radius:18px;background:rgba(30,6,14,.85);border:1.5px solid rgba(255,170,90,.5);box-shadow:0 0 22px rgba(255,120,30,.15);display:flex;flex-direction:column;gap:12px")}>
                <div style={S("display:flex;align-items:center;gap:8px")}>
                  <Icon name="sticker-fill" size={20} color="#ffc21a" />
                  <span style={S("flex:1;font-family:Montserrat;font-style:italic;font-weight:900;font-size:16px;letter-spacing:.04em")}>TAUNT ZONE</span>
                  {!wide && (
                    <button type="button" onClick={() => setTOpen(false)} aria-label="Close" style={S("all:unset;cursor:pointer;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.06)")}>
                      <Icon name="x-bold" />
                    </button>
                  )}
                </div>
                <div style={S("display:flex;flex-direction:column;gap:6px")}>
                  <span style={S("font-size:10.5px;font-weight:700;letter-spacing:.16em;color:#a08890")}>TAG A PLAYER</span>
                  <div style={S("display:flex;flex-wrap:wrap;gap:6px")}>
                    {others.map((p) => (
                      <button type="button" key={p.id} onClick={() => setTTo(p.id)} aria-pressed={p.id === toId} style={S(`all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;padding:5px 10px 5px 5px;border-radius:18px;background:${p.id === toId ? "rgba(255,190,60,.16)" : "rgba(10,2,5,.6)"};border:1.5px solid ${p.id === toId ? "#ffc21a" : "rgba(255,255,255,.1)"};font-size:12.5px;font-weight:700`)}>
                        <span style={S(`width:22px;height:22px;border-radius:50%;background:${color(p)};color:#140d06;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center`)}>{ini(p.n)}</span>@{p.n}
                      </button>
                    ))}
                    {!others.length && <span style={S("font-size:12.5px;color:#a08890")}>Waiting for players to tag.</span>}
                  </div>
                </div>
                <div role="tablist" style={S("display:flex;gap:4px;padding:4px;border-radius:14px;background:rgba(10,2,5,.7);border:1px solid rgba(255,255,255,.08)")}>
                  {(
                    [
                      ["emotes", "EMOTES"],
                      ["stickers", "STICKERS"],
                    ] as const
                  ).map(([k, l]) => (
                    <button type="button" role="tab" aria-selected={tTab === k} key={k} onClick={() => setTTab(k)} style={S(`all:unset;cursor:pointer;flex:1;padding:9px 0;border-radius:10px;text-align:center;font-family:Montserrat;font-weight:900;font-size:11.5px;letter-spacing:.12em;background:${tTab === k ? "linear-gradient(180deg,#ffe066,#f0a000)" : "transparent"};color:${tTab === k ? "#5a0a10" : "#a08890"}`)}>
                      {l}
                    </button>
                  ))}
                </div>
                <div style={S("display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px")}>
                  {tItems.map((it) => (
                    <button type="button" key={it.k} className="imp-titem" onClick={() => sendTaunt(it)} aria-label={it.label} disabled={!toId} style={S("all:unset;cursor:pointer;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 4px;border-radius:12px;background:rgba(10,2,5,.6);border:1px solid rgba(255,255,255,.08)")}>
                      {it.img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.img} alt="" loading="lazy" style={S("width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:8px;background:#222")} />
                      ) : (
                        <Icon name={it.icon!} size={30} style={{ color: it.col, filter: `drop-shadow(0 0 8px ${it.col})` }} />
                      )}
                      <span style={S("font-family:Montserrat;font-weight:900;font-size:9.5px;letter-spacing:.04em;text-align:center;line-height:1.1")}>{it.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div style={S("padding:14px 16px;border-radius:18px;background:rgba(30,6,14,.72);border:1px solid rgba(255,110,90,.2);display:flex;flex-direction:column;gap:8px")}>
                <span style={S("font-size:10.5px;font-weight:700;letter-spacing:.16em;color:#a08890")}>TRASH TALK</span>
                {!feed.length && <span style={S("font-size:13px;color:#7d6870")}>No taunts yet. Be the first to throw shade.</span>}
                {feed.map((fd) => (
                  <div key={fd.id} style={S("display:flex;align-items:center;gap:10px")}>
                    {fd.item.img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fd.item.img} alt="" style={S("width:34px;height:34px;flex:none;object-fit:cover;border-radius:8px")} />
                    ) : (
                      <div style={S("width:34px;height:34px;flex:none;border-radius:8px;background:rgba(10,2,5,.7);display:flex;align-items:center;justify-content:center")}>
                        <Icon name={fd.item.icon!} size={20} color={fd.item.col} />
                      </div>
                    )}
                    <div style={S("min-width:0;font-size:13px;line-height:1.35")}>
                      <strong>{fd.from}</strong> <span style={S("color:#a08890")}>→</span>{" "}
                      <strong style={S("color:#ffc21a")}>@{fd.atMe ? "you" : fd.to}</strong> <span style={S("color:#d9d0c4")}>{fd.item.label}</span>
                    </div>
                  </div>
                ))}
              </div>
              {inRoom && (
                <button type="button" onClick={leave} style={S("all:unset;cursor:pointer;align-self:center;display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:18px;font-size:12.5px;font-weight:700;color:#a08890")}>
                  <Icon name="sign-out-bold" />
                  Leave room
                </button>
              )}
            </aside>
          )}
        </div>
      </div>

      {inRoom && !wide && !tOpen && (
        <button type="button" onClick={() => setTOpen(true)} aria-label="Open taunts" style={S(`${GOLD_BTN};position:fixed;right:16px;bottom:18px;z-index:28;height:56px;padding:0 18px;border-radius:28px;font-size:15px;display:flex;align-items:center;gap:8px;box-shadow:0 0 26px rgba(255,190,30,.5),0 10px 24px rgba(0,0,0,.5)`)}>
          <Icon name="sticker-fill" size={22} />
          TAUNT
        </button>
      )}
      {inRoom && !wide && tOpen && <div onClick={() => setTOpen(false)} style={S("position:fixed;inset:0;background:rgba(5,1,3,.55);z-index:29")} />}

      {pop && (
        <div key={`pop${pop.id}`} aria-live="polite" style={S(`position:fixed;left:50%;top:${wide ? "22%" : "16%"};z-index:40;pointer-events:none;animation:tauntPop 2.6s cubic-bezier(.2,.8,.2,1) forwards`)}>
          <div style={S(`display:flex;flex-direction:column;align-items:center;gap:10px;padding:16px 20px 14px;border-radius:22px;background:linear-gradient(180deg,rgba(60,12,24,.96),rgba(22,4,10,.96));border:2px solid ${pop.atMe ? "#ff4a3d" : "#ffc21a"};box-shadow:0 0 40px rgba(255,190,30,.4),0 20px 50px rgba(0,0,0,.6)`)}>
            {pop.item.img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pop.item.img} alt="" style={S("width:150px;height:150px;object-fit:cover;border-radius:14px;animation:tauntWob .5s ease-in-out infinite")} />
            ) : (
              <Icon name={pop.item.icon!} size={96} style={{ color: pop.item.col, filter: `drop-shadow(0 0 18px ${pop.item.col})`, animation: "tauntWob .5s ease-in-out infinite", display: "block" }} />
            )}
            <div style={S('font-family:Impact,"Arial Black",sans-serif;font-size:30px;color:#fff;-webkit-text-stroke:1.5px #000;text-shadow:3px 3px 0 #000;line-height:1')}>{pop.item.label}</div>
            <div style={S("font-size:14px;font-weight:700;color:#f3eee6")}>
              {pop.from}
              <span style={S("color:#a08890;margin:0 6px")}>→</span>
              <span style={S("color:#ffc21a")}>{pop.atMe ? "@you" : `@${pop.to}`}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
