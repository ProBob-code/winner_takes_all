"use client";

/**
 * The three links a league night is actually run from, plus the QR players
 * scan.
 *
 * A host sets up on a laptop, props a screen on the wall, hands a phone to
 * whoever is scoring, and needs walk-ins to be able to enter without asking.
 * Those are four different devices, and before this they were four things to
 * find. Here they are one panel.
 *
 * The join code is issued on demand rather than with the tournament, and the
 * server hands back the one already on screen if there is one — so a QR the
 * room has already scanned keeps working, and reopening this panel does not
 * invalidate it.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { backendFetch } from "@/lib/backend";
import { qrToSvg } from "@/lib/qr";

interface NightLinksProps {
  tournamentId: string;
  /** The code already on the screen, from the tournament state. */
  joinCode: string | null;
  isHost: boolean;
  onIssued: () => void;
}

export function NightLinks({ tournamentId, joinCode, isHost, onIssued }: NightLinksProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const joinUrl = joinCode ? `${origin}/join/${joinCode}` : null;

  const qr = useMemo(() => {
    if (!joinUrl) return null;
    try {
      return qrToSvg(joinUrl, { size: 132, margin: 2 });
    } catch {
      // The encoder covers the short URLs this app produces. Anything it
      // cannot encode falls back to the code in text, which is typeable.
      return null;
    }
  }, [joinUrl]);

  const issue = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await backendFetch(`/tournaments/${tournamentId}/join-code`, {
        method: "POST",
      });
      const payload: any = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        setError(payload?.message || "Could not put a code on the screen.");
        return;
      }
      onIssued();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Copying was blocked by the browser. Long-press the link instead.");
    }
  };

  return (
    <div className="panel v-stack" style={{ marginBottom: "var(--space-4)" }}>
      <div>
        <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>Running the night</h3>
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          Open these on the right screens. Staff mode keeps scoring with no connection.
        </p>
      </div>

      <div className="auto-grid">
        <div className="v-stack" style={{ gap: "var(--space-2)" }}>
          <Link
            className="button"
            href={`/display/${tournamentId}`}
            style={{ textDecoration: "none", textAlign: "center" }}
          >
            Big screen
          </Link>
          <button
            type="button"
            className="button-secondary button-sm"
            onClick={() => void copy("display", `${origin}/display/${tournamentId}`)}
          >
            {copied === "display" ? "Copied" : "Copy the link"}
          </button>
          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
            For a TV, a tablet or a spare monitor. Nothing to tap.
          </span>
        </div>

        <div className="v-stack" style={{ gap: "var(--space-2)" }}>
          <Link
            className="button"
            href={`/staff/${tournamentId}`}
            style={{ textDecoration: "none", textAlign: "center" }}
          >
            Staff mode
          </Link>
          <button
            type="button"
            className="button-secondary button-sm"
            onClick={() => void copy("staff", `${origin}/staff/${tournamentId}`)}
          >
            {copied === "staff" ? "Copied" : "Copy the link"}
          </button>
          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
            Send this to whoever is on the table. Scoring only.
          </span>
        </div>

        <div className="v-stack" style={{ gap: "var(--space-2)" }}>
          {joinCode ? (
            <>
              <div className="h-stack tight" style={{ alignItems: "center" }}>
                {qr && (
                  <div
                    style={{
                      background: "#fff",
                      padding: "var(--space-2)",
                      borderRadius: "var(--radius-sm)",
                      lineHeight: 0,
                      flexShrink: 0,
                    }}
                    dangerouslySetInnerHTML={{ __html: qr }}
                  />
                )}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-outfit), system-ui, sans-serif",
                      fontSize: "var(--text-xl)",
                      fontWeight: 900,
                      letterSpacing: "0.12em",
                    }}
                  >
                    {joinCode}
                  </div>
                  <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                    free · no account
                  </span>
                </div>
              </div>
              {joinUrl && (
                <button
                  type="button"
                  className="button-secondary button-sm"
                  onClick={() => void copy("join", joinUrl)}
                >
                  {copied === "join" ? "Copied" : "Copy the join link"}
                </button>
              )}
            </>
          ) : isHost ? (
            <>
              <button
                type="button"
                className="button-secondary"
                onClick={() => void issue()}
                disabled={busy}
              >
                {busy ? "Putting it up…" : "Put a join code up"}
              </button>
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                Walk-ins scan it off the big screen and type a name. Nothing to pay.
              </span>
            </>
          ) : (
            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
              No join code is up yet.
            </span>
          )}
        </div>
      </div>

      {error && <p style={{ color: "#f87171", fontSize: "var(--text-sm)" }}>{error}</p>}
    </div>
  );
}
