"use client";

/**
 * Emotes at a live night.
 *
 * NightEmoteBubbles shows what players fire: on the venue TV big, on the
 * night page small. It polls /api/nights/:id/emotes every two seconds, keeps
 * each bubble up for a few seconds, and can be muted per device.
 *
 * NightEmoteBar is the deck a seated player taps. Only a player with a seat
 * in this night can fire, only what is in their deck, one every few seconds;
 * the API holds all of that, this just says so nicely.
 */

import { useEffect, useRef, useState } from "react";
import { backendFetch } from "@/lib/backend";
import { EmoteArt } from "@/components/shop-art";

const MUTE_KEY = "wta-night-emotes-muted";
const SHOW_MS = 4500;
const POLL_MS = 2000;
const STARTERS = ["emote.gg", "emote.shot", "emote.unlucky", "emote.rack-em", "emote.respect", "emote.oops"];

interface Bubble {
  id: string;
  emoteId: string;
  name: string;
  shownAt: number;
}

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function NightEmoteBubbles({ tournamentId, size = "small" }: { tournamentId: string; size?: "small" | "big" }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [muted, setMuted] = useState(false);
  const sinceRef = useRef<string | null>(null);
  const seenRef = useRef(new Set<string>());

  useEffect(() => setMuted(readMuted()), []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const q = sinceRef.current ? `?since=${encodeURIComponent(sinceRef.current)}` : "";
        const res = await backendFetch(`/nights/${encodeURIComponent(tournamentId)}/emotes${q}`, { cache: "no-store" });
        const data: any = await res.json().catch(() => null);
        if (cancelled || !data?.ok) return;
        sinceRef.current = data.now;
        const fresh: Bubble[] = [];
        for (const e of data.emotes ?? []) {
          if (seenRef.current.has(e.id)) continue;
          seenRef.current.add(e.id);
          fresh.push({ id: e.id, emoteId: e.emoteId, name: e.name, shownAt: Date.now() });
        }
        setBubbles((prev) => [...prev.filter((b) => Date.now() - b.shownAt < SHOW_MS), ...fresh].slice(-6));
      } catch {
        // A missed poll is a missed emote, nothing more.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    const sweep = window.setInterval(
      () => setBubbles((prev) => prev.filter((b) => Date.now() - b.shownAt < SHOW_MS)),
      500
    );
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearInterval(sweep);
    };
  }, [tournamentId]);

  const toggle = () => {
    const next = !muted;
    setMuted(next);
    try {
      window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    } catch {
      // Muted for this visit only.
    }
  };

  const art = size === "big" ? 120 : 56;

  return (
    <>
      <button type="button" className={`ne-mute ${size}`} onClick={toggle} aria-pressed={muted} title={muted ? "Show emotes" : "Hide emotes"}>
        {muted ? "Emotes off" : "Emotes on"}
      </button>
      {!muted && (
        <div className={`ne-layer ${size}`} aria-live="polite">
          {bubbles.map((b) => (
            <div key={b.id} className="ne-bubble">
              <EmoteArt id={b.emoteId} size={art} />
              {b.name && <span className="ne-name">{b.name}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function NightEmoteBar({ tournamentId, deck }: { tournamentId: string; deck: string[] }) {
  const emotes = deck.length > 0 ? deck : STARTERS;
  const [coolUntil, setCoolUntil] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (coolUntil <= Date.now()) return;
    const t = window.setTimeout(() => setTick((n) => n + 1), coolUntil - Date.now() + 50);
    return () => window.clearTimeout(t);
  }, [coolUntil]);

  const cooling = coolUntil > Date.now();

  async function fire(emoteId: string) {
    if (cooling) return;
    setNote(null);
    setCoolUntil(Date.now() + 4000);
    try {
      const res = await backendFetch(`/nights/${encodeURIComponent(tournamentId)}/emotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoteId }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) setNote(data?.message ?? "That didn't send.");
      else if (data.cooldownSeconds) setCoolUntil(Date.now() + data.cooldownSeconds * 1000);
    } catch {
      setNote("Couldn't reach the server.");
    }
  }

  return (
    <section className="ne-bar" aria-label="Send an emote">
      <span className="ne-bar-label">Emotes</span>
      <div className="ne-bar-row">
        {emotes.map((id) => (
          <button key={id} type="button" className="ne-btn" disabled={cooling} onClick={() => void fire(id)}>
            <EmoteArt id={id} size={44} />
          </button>
        ))}
      </div>
      {note && <span className="ne-note">{note}</span>}
    </section>
  );
}
