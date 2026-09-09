"use client";

import { useEffect, useState } from "react";
import { getApiUrl, readJsonResponse } from "@/lib/api-config";
import { BroadcastClient } from "../../broadcast/[arenaId]/[matchId]/BroadcastClient";
import "@/components/tournament-engine.css";

type Resolved = {
  arenaId: string;
  matchId: string;
  token: string;
};

/** Exchanges the short QR code for the signed broadcast grant it stands for. */
export function ShortBroadcastClient({ code }: { code: string }) {
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const base = process.env.NEXT_PUBLIC_API_URL || getApiUrl();
        const res = await fetch(
          `${base}/api/stream/broadcast-code/${encodeURIComponent(code)}`,
          { cache: "no-store" }
        );
        const data = await readJsonResponse(res);
        if (cancelled) return;

        if (!res.ok || !data.ok) {
          setError(data.message || "This broadcast link is no longer valid.");
          return;
        }
        // Drop the code from the address bar once it has been redeemed, so a
        // reload lands on the entry form rather than silently re-authorising.
        // A camera should go back on air deliberately, not because someone
        // pulled to refresh.
        try {
          window.history.replaceState({}, "", "/b");
        } catch {
          /* history unavailable */
        }

        setResolved({ arenaId: data.arenaId, matchId: data.matchId, token: data.token });
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Could not reach the server.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <main className="page animate-in">
        <div className="shell" style={{ maxWidth: "560px", margin: "0 auto" }}>
          <div
            className="panel page-card slide-in text-center"
            style={{
              padding: "2.5rem",
              background: "rgba(9, 9, 22, 0.55)",
              borderRadius: "16px",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ fontSize: "2.5rem" }}>⚠️</div>
            <h2 className="glow-text mt-2">CAN'T START THIS STREAM</h2>
            <p className="muted mt-2" style={{ fontSize: "0.9rem" }}>
              {error}
            </p>
            <a
              href="/b"
              className="button button-gold mt-6"
              style={{ display: "inline-block" }}
            >
              ENTER A STREAM CODE
            </a>
          </div>
        </div>
      </main>
    );
  }

  if (!resolved) {
    return (
      <main className="page animate-in">
        <div className="shell" style={{ maxWidth: "560px", margin: "0 auto" }}>
          <div className="empty-state text-center" style={{ padding: "4rem 0" }}>
            <div className="empty-icon loading-spin">📷</div>
            <h3 className="glow-text mt-4">PREPARING BROADCAST…</h3>
          </div>
        </div>
      </main>
    );
  }

  return (
    <BroadcastClient
      arenaId={resolved.arenaId}
      matchId={resolved.matchId}
      token={resolved.token}
    />
  );
}
