"use client";

import { useEffect, useMemo, useState } from "react";
import { getApiUrl, readJsonResponse } from "@/lib/api-config";
import { qrToSvg } from "@/lib/qr";

type Props = {
  arenaId: string;
  matchId: string;
  /** Arena PIN, required when the viewer is not the arena owner. */
  pin?: string | null;
  onClose?: () => void;
};

/**
 * Shows the scannable code that lets someone at the ground point their phone
 * at the match and start streaming. The link is signed and expires, so it
 * cannot be forwarded and reused after the match.
 */
export function BroadcastQr({ arenaId, matchId, pin, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const base = process.env.NEXT_PUBLIC_API_URL || getApiUrl();
        const res = await fetch(`${base}/api/stream/broadcast-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ arenaId, matchId, pin: pin || undefined }),
        });
        const data = await readJsonResponse(res);
        if (cancelled) return;

        if (!res.ok || !data.ok) {
          setError(data.message || "Could not create a broadcast link.");
        } else {
          setUrl(data.url);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Could not reach the server to create a broadcast link.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [arenaId, matchId, pin]);

  const svg = useMemo(() => (url ? qrToSvg(url, { size: 220 }) : null), [url]);

  return (
    <div className="broadcast-qr-panel" style={{ textAlign: "center" }}>
      <div className="section-label-v2 mb-2" style={{ letterSpacing: "2px" }}>
        📷 STREAM THIS MATCH
      </div>

      {loading && <p className="muted" style={{ fontSize: "0.85rem" }}>Generating secure link…</p>}

      {error && (
        <p style={{ color: "#ef4444", fontSize: "0.85rem", margin: "12px 0" }}>{error}</p>
      )}

      {svg && (
        <>
          <div
            style={{
              display: "inline-block",
              padding: "10px",
              background: "#fff",
              borderRadius: "12px",
              lineHeight: 0,
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className="muted" style={{ fontSize: "0.78rem", marginTop: "12px", lineHeight: 1.5 }}>
            Scan with a phone at the ground to open the camera and go live.
            <br />
            Anyone can stream their own angle — viewers pick which one to watch.
          </p>
          <p className="muted" style={{ fontSize: "0.72rem", marginTop: "8px", opacity: 0.7 }}>
            Nothing is recorded. The link expires and all feeds stop when the match ends.
          </p>
        </>
      )}

      {onClose && (
        <button className="button button-secondary button-sm mt-4" onClick={onClose}>
          CLOSE
        </button>
      )}
    </div>
  );
}
