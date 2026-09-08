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
  // The QR carries the short URL because a smaller symbol scans far more
  // reliably; sharing hands over whichever the server produced.
  const [url, setUrl] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

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
          setUrl(data.shortUrl || data.url);
          setQrUrl(data.shortUrl || data.url);
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
    if (!qrUrl) return { svg: null, encodeError: null as string | null };
    try {
      return { svg: qrToSvg(qrUrl, { size: 340 }), encodeError: null as string | null };
    } catch (err: any) {
      return {
        svg: null,
        encodeError: err?.message || "This broadcast link could not be encoded as a QR code.",
      };
    }
  }, [qrUrl]);

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
              padding: "16px",
              background: "#fff",
              borderRadius: "12px",
              lineHeight: 0,
              maxWidth: "100%",
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "14px", flexWrap: "wrap" }}>
            <button
              className="button button-gold button-sm"
              style={{ padding: "8px 14px", fontSize: "0.78rem" }}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "✓ COPIED" : "🔗 COPY LINK"}
            </button>
            {canShare && (
              <button
                className="button button-secondary button-sm"
                style={{ padding: "8px 14px", fontSize: "0.78rem" }}
                onClick={() => {
                  navigator
                    .share({ title: "Stream this match", url: url! })
                    .catch(() => { /* dismissed */ });
                }}
              >
                📤 SEND LINK
              </button>
            )}
          </div>

          <p className="muted" style={{ fontSize: "0.78rem", marginTop: "12px", lineHeight: 1.5 }}>
            Scan with a phone at the ground, or send the link to whoever is filming.
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
