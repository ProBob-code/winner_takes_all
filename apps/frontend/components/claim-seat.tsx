"use client";

/**
 * "This seat is me", for a host who has no seat in their own night.
 *
 * A night set up with the host's name missing from the list, or before seats
 * were matched by name, leaves the host's account on no seat: their frames
 * and their night win pay nobody. Claiming a seat links it to the host's own
 * account and pays whatever it already earned (the API's claim-seat route).
 * Only ever the host's own account; other players link themselves by the
 * night's QR code.
 */

import { useState } from "react";
import { backendFetch } from "@/lib/backend";
import { formatCoins } from "@/lib/format";

interface Seat {
  id: string;
  name: string;
  user_id?: string | null;
}

export function ClaimSeat({
  tournamentId,
  teams,
  hostName,
  onClaimed,
}: {
  tournamentId: string;
  teams: Seat[];
  hostName?: string | null;
  onClaimed: () => void;
}) {
  const open = teams.filter((t) => !t.user_id);
  // The seat with the host's name first, as the likeliest one.
  const guess = open.find((t) => hostName && t.name.trim().toLowerCase() === hostName.trim().toLowerCase());
  const [seatId, setSeatId] = useState(guess?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  if (open.length === 0) return null;

  async function claim() {
    if (!seatId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await backendFetch(`/engine/tournaments/${encodeURIComponent(tournamentId)}/claim-seat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: seatId }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setMessage({ tone: "error", text: data?.message || "That did not go through. Try again." });
        return;
      }
      const parts = [`You are ${data.seatName} in this night.`];
      if (data.coinsPaid > 0) {
        parts.push(
          `Paid ${formatCoins(data.coinsPaid)} WTA Coins` +
            (data.framesCounted ? ` for ${data.framesCounted} frame${data.framesCounted === 1 ? "" : "s"}` : "") +
            (data.wonNight ? " and the night" : "") +
            "."
        );
      }
      setMessage({ tone: "ok", text: parts.join(" ") });
      onClaimed();
    } catch {
      setMessage({ tone: "error", text: "Could not reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="glass-morphism"
      aria-label="Claim your seat"
      style={{ padding: "1.25rem 1.5rem", marginBottom: "1.5rem", border: "1px solid var(--gold-subtle)" }}
    >
      <strong style={{ display: "block", marginBottom: "0.35rem" }}>Playing in this night? Claim your seat.</strong>
      <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 0.85rem" }}>
        Your account is not on any seat here, so your frames, trophies and any night win pay nobody. Pick
        your seat and everything it has already earned is paid to you, once.
      </p>
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={seatId}
          onChange={(e) => setSeatId(e.target.value)}
          aria-label="Your seat"
          style={{
            padding: "0.55rem 0.75rem", borderRadius: "10px", background: "var(--bg-inset)",
            color: "var(--text-primary)", border: "1px solid var(--border-color)", font: "inherit", minWidth: "12rem",
          }}
        >
          <option value="">Choose your seat…</option>
          {open.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button type="button" className="button" onClick={() => void claim()} disabled={!seatId || busy}>
          {busy ? "Claiming…" : "This seat is me"}
        </button>
      </div>
      {message && (
        <p
          role="status"
          style={{
            margin: "0.75rem 0 0", fontSize: "0.85rem", fontWeight: 700,
            color: message.tone === "ok" ? "var(--gold)" : "var(--red)",
          }}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
