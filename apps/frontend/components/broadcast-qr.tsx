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
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // The QR carries the short URL because a smaller symbol scans far more
  // reliably; sharing hands over whichever the server produced.
  const [url, setUrl] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const [code, setCode] = useState<string | null>(null);
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
          setCode(data.code || null);
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

  // Physical size on screen is the biggest factor in whether a phone can read
  // a code, so offer a fullscreen rendering rather than only the inline one.
  const bigSvg = useMemo(() => {
    if (!qrUrl || !enlarged) return null;
    try {
      return qrToSvg(qrUrl, { size: 640 });
    } catch {
      return null;
    }
  }, [qrUrl, enlarged]);

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
            role="button"
            tabIndex={0}
            title="Tap to enlarge for easier scanning"
            onClick={() => setEnlarged(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setEnlarged(true);
            }}
            style={{
              display: "inline-block",
              padding: "16px",
              background: "#fff",
              borderRadius: "12px",
              lineHeight: 0,
              maxWidth: "100%",
              cursor: "zoom-in",
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className="muted" style={{ fontSize: "0.7rem", marginTop: "6px" }}>
            Tap the code to enlarge it
          </p>

          {/* The typed route matters as much as the scanned one: a camera that
              will not read the QR should not stop someone filming. */}
          {code && (
            <div
              style={{
                marginTop: "14px",
                padding: "12px",
                borderRadius: "10px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <p className="muted" style={{ fontSize: "0.7rem", marginBottom: "6px" }}>
                Can't scan? Go to <strong>{origin}/b</strong> and enter
              </p>
              <div
                style={{
                  fontSize: "1.9rem",
                  fontWeight: 900,
                  letterSpacing: "0.45rem",
                  fontFamily: "monospace",
                  color: "var(--gold)",
                }}
              >
                {code}
              </div>
              <p className="muted" style={{ fontSize: "0.68rem", marginTop: "4px" }}>
                No account needed
              </p>
            </div>
          )}
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

      {enlarged && bigSvg && (
        <div
          onClick={() => setEnlarged(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100001,
            background: "#ffffff",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            cursor: "zoom-out",
          }}
        >
          <div dangerouslySetInnerHTML={{ __html: bigSvg }} />
          <p style={{ color: "#111", fontSize: "0.85rem", fontWeight: 700 }}>
            Point a phone camera at this code
          </p>
          {code && (
            <p style={{ color: "#111", fontSize: "1rem", fontWeight: 700, textAlign: "center" }}>
              or go to {origin.replace(/^https?:\/\//, "")}/b and enter
              <br />
              <span style={{ fontSize: "2rem", letterSpacing: "0.4rem", fontFamily: "monospace" }}>
                {code}
              </span>
            </p>
          )}
          <p style={{ color: "#555", fontSize: "0.75rem" }}>Tap anywhere to close</p>
        </div>
      )}
    </div>
  );
}
