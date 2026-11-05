"use client";

// Reads the signed-in player's coin state at mount.
export const dynamic = "force-dynamic";

/**
 * The 8-ball game, hosted so that finishing one earns WTA Coins.
 *
 * The game is WTA's own, in /public/8ball (physics, rules, AI and the online
 * client; see its README). It runs full screen in a frame. This page:
 *   - sends anyone signed out to log in first: every game is on an account,
 *   - covers the frame with a loading screen until the game says it is ready,
 *   - tells the game who is playing, their balance and where the API is,
 *   - reports how many players are around for online play, every half minute,
 *   - claims the coins when a game ends and hands the server's answer back,
 *     which the game shows on its own result card.
 *
 * WHAT PAYS
 * vs System and vs Online pay the winner (the server decides; online, the
 * table refereed the game). Pass and play pays nothing: one person can play
 * both sides. Browser awards are small and capped, deliberately: the product
 * is league nights at venues.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { backendFetch, getApiBaseUrl } from "@/lib/backend";
import { TRACKS, signedTrophies } from "@/lib/trophies";

/** One id per game, so a result can only ever be claimed once. */
function newSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const b = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    /* fall through */
  }
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

type Auth = { state: "checking" } | { state: "in"; name: string | null; balance: number | null };

export default function PlayEightBallPage() {
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [auth, setAuth] = useState<Auth>({ state: "checking" });
  const [frameReady, setFrameReady] = useState(false);
  const sessionRef = useRef<string>(newSessionId());

  const toFrame = useCallback((msg: Record<string, unknown>) => {
    try {
      frameRef.current?.contentWindow?.postMessage({ wtaHost: true, ...msg }, window.location.origin);
    } catch {
      /* the frame is not up yet; it asks with "ready" */
    }
  }, []);

  // Signed in or off to the login page; no game is played without an account.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await backendFetch("/coins/me");
        if (res.status === 401) {
          router.replace("/login?next=/play/8ball");
          return;
        }
        const coins: any = await res.json().catch(() => ({}));
        const profile: any = await backendFetch("/user/profile")
          .then((r) => r.json())
          .catch(() => ({}));
        if (!live) return;
        setAuth({
          state: "in",
          name: profile?.ok && profile.user?.name ? String(profile.user.name) : null,
          balance: coins?.ok && typeof coins.balance === "number" ? coins.balance : null,
        });
      } catch {
        // Offline or the API is down: the login page says so better than a
        // table that cannot record anything.
        if (live) router.replace("/login?next=/play/8ball");
      }
    })();
    return () => {
      live = false;
    };
  }, [router]);

  const sendConfig = useCallback(() => {
    if (auth.state !== "in") return;
    toFrame({
      type: "config",
      apiBase: getApiBaseUrl() || null,
      signedIn: true,
      name: auth.name,
      balance: auth.balance,
    });
  }, [auth, toFrame]);

  useEffect(() => {
    if (frameReady) sendConfig();
  }, [frameReady, sendConfig]);

  // Who is around for online play: real heartbeats, counted by the lobby.
  useEffect(() => {
    if (auth.state !== "in" || !frameReady) return;
    let stop = false;
    const beat = async () => {
      try {
        const res = await backendFetch("/pool/presence", { method: "POST" });
        const p: any = await res.json().catch(() => ({}));
        if (!stop && p?.ok) toFrame({ type: "presence", online: p.online, searching: p.searching, playing: p.playing });
      } catch {
        /* the count just goes stale */
      }
    };
    void beat();
    const t = window.setInterval(beat, 25_000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [auth.state, frameReady, toFrame]);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      const data: any = event.data;
      if (!data || !data.wtaCoins) return;

      if (data.type === "exit") {
        window.location.href = "/games";
        return;
      }
      if (data.type === "ready") {
        setFrameReady(true);
        sendConfig();
        return;
      }
      if (auth.state !== "in") return;

      // A game against the AI has begun: on record before anyone knows how it
      // ends, so closing the tab while losing still counts as a loss.
      if (data.type === "game_start") {
        if (data.mode !== 1) return;
        await backendFetch("/online/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionRef.current, mode: 1, aiRating: data.aiRating }),
        }).catch(() => null);
        return;
      }

      if (data.type !== "game_over") return;
      // Pass and play earns nothing; the game already says so.
      if (data.mode === 2) {
        sessionRef.current = newSessionId();
        return;
      }

      const mode = data.mode === 3 ? 3 : 1;
      const claim = () =>
        backendFetch("/coins/claim-online", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionRef.current,
            mode,
            tableId: mode === 3 ? String(data.tableId || "") : undefined,
            won: !!data.won,
            aiRating: data.aiRating,
            seconds: Math.max(0, Math.round(Number(data.seconds) || 0)),
            shots: Math.max(0, Math.round(Number(data.shots) || 0)),
            combos: Math.max(0, Math.round(Number(data.combos) || 0)),
          }),
        });
      try {
        let res = await claim();
        let payload: any = await res.json().catch(() => ({}));
        // Online, the table may still be hearing from the other screen.
        for (let i = 0; mode === 3 && payload?.pending && i < 8; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          res = await claim();
          payload = await res.json().catch(() => ({}));
        }
        const trophies = Array.isArray(payload?.trophies)
          ? payload.trophies
              .map(
                (t: { track: string; delta: number }) =>
                  `${signedTrophies(t.delta)} ${TRACKS.find((x) => x.id === t.track)?.label ?? "trophies"}`
              )
              .join(" · ")
          : "";
        if (payload?.ok && !payload.pending) {
          toFrame({
            type: "result",
            awarded: Number(payload.awarded) || 0,
            combo: Array.isArray(payload?.awards)
              ? payload.awards
                  .filter((a: { reason: string }) => a.reason === "ONLINE_COMBO")
                  .reduce((n: number, a: { amount: number }) => n + (Number(a.amount) || 0), 0)
              : 0,
            balance: typeof payload.balance === "number" ? payload.balance : undefined,
            message: payload.message,
            trophies,
          });
          if (typeof payload.balance === "number") {
            toFrame({ type: "balance", balance: payload.balance });
            setAuth((a) => (a.state === "in" ? { ...a, balance: payload.balance } : a));
          }
        } else {
          toFrame({
            type: "result",
            awarded: 0,
            message: payload?.pending
              ? "The table has not confirmed the result yet. It will count once it does."
              : payload?.message || "That game could not be recorded.",
          });
        }
      } catch {
        toFrame({ type: "result", awarded: 0, message: "Could not reach the server. That game did not count." });
      } finally {
        sessionRef.current = newSessionId();
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [auth, sendConfig, toFrame]);

  const showLoader = auth.state !== "in" || !frameReady;

  return (
    <main style={{ position: "fixed", inset: 0, background: "#070504" }}>
      {/* The game, full screen: it has its own header, menu and result card.
          sandbox is narrow: scripts and its own origin, nothing else; the
          sign-in buttons navigate the top window, which same-origin allows. */}
      {auth.state === "in" && (
        <iframe
          ref={frameRef}
          src="/8ball/index.html?v=9"
          title="WTA Eight Ball"
          sandbox="allow-scripts allow-same-origin allow-top-navigation-by-user-activation"
          allow="autoplay; fullscreen"
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, display: "block" }}
        />
      )}

      {showLoader && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            textAlign: "center",
            background: "radial-gradient(ellipse at 50% 35%, #1d150c 0%, #070504 70%)",
            color: "#f3eee6",
            fontFamily: "Montserrat, Inter, system-ui, sans-serif",
          }}
        >
          <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true" style={{ filter: "drop-shadow(0 0 12px rgba(242,194,27,.55))" }}>
            <path fill="#f2c21b" d="M2.5 7.5 7 11l5-7 5 7 4.5-3.5L19.5 19h-15z" />
          </svg>
          <div style={{ marginTop: 4, fontWeight: 800, fontSize: 11, letterSpacing: ".5em", color: "#e2b437", paddingLeft: ".5em" }}>
            W.T.A
          </div>
          <div
            style={{
              marginTop: 8,
              fontStyle: "italic",
              fontWeight: 900,
              fontSize: 40,
              lineHeight: 1,
              background: "linear-gradient(180deg,#fff3b0,#f2c21b 50%,#d58a00)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            EIGHT BALL
          </div>
          <div style={{ marginTop: 26, width: "min(360px, 100%)", height: 6, borderRadius: 3, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
            <div className="wta8-load" />
          </div>
          <div style={{ marginTop: 12, fontSize: 12.5, color: "#9b9083", fontFamily: "Inter, system-ui, sans-serif" }}>
            {auth.state === "checking" ? "Checking your account…" : "Setting up the table…"}
          </div>
          <style>{`
            .wta8-load{height:100%;border-radius:3px;background:linear-gradient(90deg,#ffd94d,#ffb200);box-shadow:0 0 12px rgba(255,190,40,.6);animation:wta8Load 1.3s ease-in-out infinite}
            @keyframes wta8Load{0%{width:8%;margin-left:0}50%{width:45%;margin-left:30%}100%{width:8%;margin-left:92%}}
          `}</style>
        </div>
      )}
    </main>
  );
}
