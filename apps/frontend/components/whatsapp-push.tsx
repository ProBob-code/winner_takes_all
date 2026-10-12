"use client";

/**
 * Push the bracket, the results or the table into the venue's WhatsApp group.
 *
 * Four of the twenty buyers asked for this unprompted, and every one of them
 * already runs their tournament through a group chat. What they want is the
 * results in *that* group — not a second place for their regulars to look.
 *
 * So this does not send anything itself. It asks the server for the message,
 * then hands it to WhatsApp, which opens the share sheet and lets the owner
 * pick the group. One tap, no Meta business account, no template approval
 * queue, no per-message fee, and we never hold a phone number.
 *
 * Copying is offered beside it because a share sheet is not always what the
 * owner wants: sometimes the message goes into a notice board, a Telegram
 * group, or a reply they are already typing.
 */

import { useState } from "react";
import { backendFetch } from "@/lib/backend";

type Kind = "bracket" | "results" | "table";

const KINDS: Array<{ kind: Kind; label: string; hint: string }> = [
  { kind: "bracket", label: "Draw", hint: "Who is playing whom, and the join link" },
  { kind: "results", label: "Results", hint: "Every frame decided so far" },
  { kind: "table", label: "Table", hint: "The standings as they stand" },
];

export function WhatsappPush({ tournamentId }: { tournamentId: string }) {
  const [busy, setBusy] = useState<Kind | null>(null);
  const [preview, setPreview] = useState<{ kind: Kind; text: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const build = async (kind: Kind) => {
    setBusy(kind);
    setError(null);
    setCopied(false);
    try {
      const res = await backendFetch(`/tournaments/${tournamentId}/share?kind=${kind}`);
      const payload: any = await res.json();
      if (!res.ok || payload?.ok === false) {
        setError(payload?.message || "Could not build the message.");
        return;
      }
      setPreview({ kind, text: payload.text, url: payload.whatsappUrl });
    } catch {
      setError("Could not reach the server to build the message.");
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(preview.text);
      setCopied(true);
    } catch {
      // Clipboard access is refused in plenty of contexts. The text is on
      // screen and selectable, so say that rather than failing silently.
      setError("Copying was blocked. Select the text above instead.");
    }
  };

  return (
    <div className="v-stack">
      <div>
        <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>Send to the group</h3>
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          Opens WhatsApp with the message written. Pick your group from the share sheet.
        </p>
      </div>

      <div className="h-stack tight">
        {KINDS.map(({ kind, label, hint }) => (
          <button
            key={kind}
            type="button"
            className={preview?.kind === kind ? "button" : "button-secondary"}
            onClick={() => void build(kind)}
            disabled={busy !== null}
            title={hint}
          >
            {busy === kind ? "Building…" : label}
          </button>
        ))}
      </div>

      {error && (
        <p className="muted" style={{ color: "#f87171", fontSize: "var(--text-sm)" }}>
          {error}
        </p>
      )}

      {preview && (
        <div className="v-stack">
          {/* Shown before sending, because the owner is about to put this in
              front of forty regulars and should see it first. */}
          <pre
            style={{
              margin: 0,
              padding: "var(--space-4)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-inset)",
              border: "1px solid var(--glass-border-color)",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              fontFamily: "inherit",
              fontSize: "var(--text-sm)",
              lineHeight: 1.7,
              maxHeight: "22rem",
              overflowY: "auto",
            }}
          >
            {preview.text}
          </pre>

          <div className="h-stack tight">
            <a
              className="button"
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none" }}
            >
              Open WhatsApp
            </a>
            <button type="button" className="button-secondary" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy text"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
