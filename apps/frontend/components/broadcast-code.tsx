"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiUrl, readJsonResponse } from "@/lib/api-config";

type Props = {
  arenaId: string;
  matchId: string;
  /** Arena PIN, required when the viewer is not the arena owner. */
  pin?: string | null;
  onClose?: () => void;
};

/** How often the displayed code is replaced. */
const ROTATE_MS = 60_000;

/**
 * The host's panel for putting a camera on a match.
 *
 * A code is issued for a minute at a time and then replaced. Anyone reading
 * the screen right now can use it; a photograph of it is worthless shortly
 * after. Rotation never interrupts a camera already streaming — the broadcast
 * grant a code stands for outlives the code itself.
 */
export function BroadcastCode({ arenaId, matchId, pin, onClose }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(ROTATE_MS / 1000);

  const cancelledRef = useRef(false);

  const issueCode = useCallback(async () => {
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || getApiUrl();
      const res = await fetch(`${base}/api/stream/broadcast-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ arenaId, matchId, pin: pin || undefined }),
      });
      const data = await readJsonResponse(res);
      if (cancelledRef.current) return;

      if (!res.ok || !data.ok) {
        setError(data.message || "Could not create a stream code.");
        return;
      }
      setError(null);
      setCode(data.code || null);
      setUrl(data.shortUrl || data.url || null);
      setSecondsLeft(ROTATE_MS / 1000);
    } catch (err: any) {
      if (!cancelledRef.current) {
        setError(err?.message || "Could not reach the server to create a stream code.");
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [arenaId, matchId, pin]);

  useEffect(() => {
    cancelledRef.current = false;
    void issueCode();

    const rotate = setInterval(() => void issueCode(), ROTATE_MS);
    const tick = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => {
      cancelledRef.current = true;
      clearInterval(rotate);
      clearInterval(tick);
    };
  }, [issueCode]);

  const host = typeof window !== "undefined" ? window.location.host : "";

  return (
    <div style={{ textAlign: "center" }}>
      <div className="section-label-v2 mb-2" style={{ letterSpacing: "2px" }}>
        📷 PUT A CAMERA ON THIS MATCH
      </div>

      {loading && !code && (
        <p className="muted" style={{ fontSize: "0.85rem" }}>Generating a stream code…</p>
      )}

      {error && (
        <p style={{ color: "#ef4444", fontSize: "0.85rem", margin: "12px 0" }}>{error}</p>
      )}

      {code && (
        <>
          <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "10px" }}>
            On the phone that will film, open
          </p>
          <div
            style={{
              fontSize: "1.05rem",
              fontWeight: 800,
              color: "#fff",
              marginBottom: "16px",
              wordBreak: "break-all",
            }}
          >
            {host}/broadcast
          </div>

          <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "6px" }}>
            and enter this code
          </p>
          <div
            style={{
              fontSize: "2.9rem",
              fontWeight: 900,
              letterSpacing: "0.7rem",
              fontFamily: "monospace",
              color: "var(--gold)",
              lineHeight: 1.15,
              // The trailing letter-space would otherwise push it off-centre.
              textIndent: "0.7rem",
            }}
          >
            {code}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              marginTop: "6px",
            }}
          >
            <div
              aria-hidden
              style={{
                width: "120px",
                height: "3px",
                borderRadius: "2px",
                background: "rgba(255,255,255,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(secondsLeft / (ROTATE_MS / 1000)) * 100}%`,
                  height: "100%",
                  background: "var(--gold)",
                  transition: "width 1s linear",
                }}
              />
            </div>
            <span className="muted" style={{ fontSize: "0.7rem" }}>
              new code in {secondsLeft}s
            </span>
          </div>

          {url && (
            <button
              className="button button-gold button-sm mt-4"
              style={{ padding: "8px 14px", fontSize: "0.78rem" }}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "✓ LINK COPIED" : "🔗 COPY DIRECT LINK"}
            </button>
          )}

          <p className="muted" style={{ fontSize: "0.72rem", marginTop: "12px", lineHeight: 1.5 }}>
            No account needed. Anyone can add their own angle — viewers pick which to watch.
            <br />
            Nothing is recorded, and all cameras stop when the match ends.
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
