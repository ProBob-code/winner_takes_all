"use client";

// Rendered per request, not prerendered. These pages read the router, the
// query string or the live tournament state at mount, and prerendering them
// trips Next's workUnitAsyncStorage invariant. The admin console already
// does this for the same reason.
export const dynamic = "force-dynamic";

/**
 * The page the service worker falls back to when the app is opened with no
 * connection.
 *
 * It exists so that a host who reloads mid-night gets something useful instead
 * of the browser's error page, and it leads with the one fact that stops them
 * doing the damaging thing: the scores already tapped are safe on the device,
 * so there is no need to re-tap anything. Re-tapping is how a frame gets
 * double-counted.
 *
 * Precached on install by public/sw.js, which is why it has no data of its
 * own: anything it fetched would be the thing that is unavailable.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  startOutbox,
  subscribeToOutbox,
  flushOutbox,
  type OutboxStatus,
} from "@/lib/outbox";

export default function OfflinePage() {
  const [status, setStatus] = useState<OutboxStatus | null>(null);

  useEffect(() => {
    startOutbox();
    return subscribeToOutbox(setStatus);
  }, []);

  const pending = status?.pending ?? 0;
  const online = status?.online ?? false;

  return (
    <main className="page">
      <div className="shell" style={{ maxWidth: "34rem" }}>
        <span className={`chip ${online ? "good" : "warn"}`}>
          {online ? "back online" : "no connection"}
        </span>

        <h1
          style={{
            fontSize: "var(--text-3xl)",
            fontWeight: 900,
            margin: "var(--space-4) 0 var(--space-3)",
          }}
        >
          {online ? "You are back." : "No connection."}
        </h1>

        {pending > 0 ? (
          <p className="muted" style={{ lineHeight: 1.8 }}>
            <strong style={{ color: "var(--text-primary)" }}>
              {pending} {pending === 1 ? "score is" : "scores are"} saved on this device
            </strong>{" "}
            and will be sent as soon as there is a connection. Nothing has been lost, and
            there is no need to tap anything again.
          </p>
        ) : (
          <p className="muted" style={{ lineHeight: 1.8 }}>
            Nothing is waiting to be sent. Scoring keeps working with no connection — taps
            are saved here and sent when the signal returns.
          </p>
        )}

        <div className="h-stack" style={{ marginTop: "var(--space-6)" }}>
          {online && pending > 0 && (
            <button type="button" className="button" onClick={() => void flushOutbox()}>
              Send them now
            </button>
          )}
          <button type="button" className="button-secondary" onClick={() => location.reload()}>
            Try again
          </button>
          {online && (
            <Link className="button-secondary" href="/" style={{ textDecoration: "none" }}>
              Back to the app
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
