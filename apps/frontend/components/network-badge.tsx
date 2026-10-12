"use client";

/**
 * What the host needs to know about the connection, and nothing else.
 *
 * The badge only appears when there is something to say. A host running a
 * league night does not need to be told the internet is working; they need to
 * be told, unmistakably, when it is not — and reassured that the scores they
 * have already tapped are safe, because the alternative is that they re-tap
 * everything and double-count the frame.
 *
 * It also registers the service worker. That belongs here rather than in the
 * layout because this is the component that exists to make offline survivable,
 * and keeping the two together means neither can be added without the other.
 */

import { useEffect, useState } from "react";
import {
  startOutbox,
  subscribeToOutbox,
  flushOutbox,
  type OutboxStatus,
} from "@/lib/outbox";

export function NetworkBadge() {
  const [status, setStatus] = useState<OutboxStatus | null>(null);

  useEffect(() => {
    startOutbox();
    return subscribeToOutbox(setStatus);
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // Registration failing is not worth surfacing: everything here still works
    // without it, the app simply will not load from a cold start with no
    // signal. A console line is the right weight for that.
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => console.warn("The offline helper could not be installed:", err));
  }, []);

  if (!status) return null;

  const { pending, online, sending, lastError } = status;

  // Nothing to report. The common case, and it shows nothing at all.
  if (online && pending === 0 && !lastError) return null;

  let tone = "syncing";
  let message: string;

  if (!online) {
    tone = "offline";
    message =
      pending > 0
        ? `Offline — ${pending} ${pending === 1 ? "score" : "scores"} saved on this device`
        : "Offline — scoring still works";
  } else if (lastError && pending > 0) {
    tone = "problem";
    message = `${pending} waiting to send`;
  } else if (lastError) {
    tone = "problem";
    message = lastError;
  } else if (pending > 0) {
    message = sending
      ? `Sending ${pending}…`
      : `${pending} ${pending === 1 ? "score" : "scores"} to send`;
  } else {
    return null;
  }

  return (
    <div className={`net-badge ${tone}`} role="status" aria-live="polite">
      <span className="dot" aria-hidden="true" />
      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{message}</span>
      {online && pending > 0 && !sending && (
        <button
          type="button"
          onClick={() => void flushOutbox()}
          className="button-sm"
          style={{
            background: "transparent",
            border: "1px solid currentColor",
            color: "inherit",
            borderRadius: "999px",
            padding: "0.2rem 0.6rem",
            cursor: "pointer",
            fontSize: "0.75rem",
            flexShrink: 0,
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
