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

  // Encoding runs during render, so an overflowing payload would otherwise
  // throw straight into the page's error boundary and blank the whole arena.
  const { svg, encodeError } = useMemo(() => {
    if (!url) return { svg: null, encodeError: null as string | null };
    try {
      return { svg: qrToSvg(url, { size: 220 }), encodeError: null as string | null };
    } catch (err: any) {
      return {
        svg: null,
        encodeError: err?.message || "This broadcast link could not be encoded as a QR code.",
      };
    }
  }, [url]);

  return (
    <div className="broadcast-qr-panel" style={{ textAlign: "center" }}>
      <div className="section-label-v2 mb-2" style={{ letterSpacing: "2px" }}>
        📷 STREAM THIS MATCH
      </div>

      {loading && <p className="muted" style={{ fontSize: "0.85rem" }}>Generating secure link…</p>}

      {(error || encodeError) && (
        <p style={{ color: "#ef4444", fontSize: "0.85rem", margin: "12px 0" }}>
          {error || encodeError}
        </p>
      )}

      {encodeError && url && (
        <>
          <p className="muted" style={{ fontSize: "0.75rem", marginBottom: "6px" }}>
            Share this link instead:
          </p>
          <code
            style={{
              display: "block",
              wordBreak: "break-all",
              fontSize: "0.7rem",
              padding: "8px",
              borderRadius: "6px",
              background: "rgba(255,255,255,0.04)",
            }}
          >
            {url}
          </code>
        </>
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
