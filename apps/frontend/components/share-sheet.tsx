"use client";

/**
 * One share sheet for everything W.T.A sends to a chat.
 *
 * It shows the message the way WhatsApp will: the link card WhatsApp builds
 * from the page's preview image, then the text with its bold and italics, so
 * the sender sees exactly what the group will see before they send it. Then
 * three ways out: straight to WhatsApp, copy it, or the phone's own sheet for
 * any other app.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { canSystemShare, systemShare, whatsappUrl, type ShareMessage } from "@/lib/share";

export interface LinkCard {
  title: string;
  description?: string;
  image?: string;
}

const DEFAULT_CARD: LinkCard = {
  title: "Winner Takes All: run the fight, crown the winner",
  description: "Brackets, scoring and a live table for 8-ball and football fights. Set up in a minute, free to enter.",
  image: "/og-image.jpg",
};

/** WhatsApp's *bold* and _italic_, and links, as React nodes. */
function waFormat(text: string): ReactNode[] {
  return text.split("\n").map((line, li) => {
    const parts: ReactNode[] = [];
    const re = /(\*[^*\n]+\*|_[^_\n]+_|https?:\/\/\S+)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    while ((m = re.exec(line))) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      const t = m[0];
      if (t.startsWith("http")) parts.push(<span key={k++} style={{ color: "#53bdeb", textDecoration: "underline", wordBreak: "break-all" }}>{t}</span>);
      else if (t.startsWith("*")) parts.push(<strong key={k++}>{t.slice(1, -1)}</strong>);
      else parts.push(<em key={k++}>{t.slice(1, -1)}</em>);
      last = m.index + t.length;
    }
    if (last < line.length) parts.push(line.slice(last));
    return (
      <div key={li} style={{ minHeight: "1.25em" }}>
        {parts.length ? parts : " "}
      </div>
    );
  });
}

export function WhatsAppPreview({ message, card = DEFAULT_CARD }: { message: ShareMessage; card?: LinkCard }) {
  const host = (() => {
    try {
      return new URL(message.url).host;
    } catch {
      return "winnertakesall.live";
    }
  })();
  return (
    <div
      aria-label="How the message will look in WhatsApp"
      style={{
        borderRadius: 14,
        padding: "14px 12px",
        textAlign: "left",
        background: "#0b141a radial-gradient(circle at 20% 10%, rgba(255,255,255,.04), transparent 40%)",
        maxHeight: "52vh",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          marginLeft: "auto",
          maxWidth: 360,
          background: "#005c4b",
          color: "#e9edef",
          borderRadius: "10px 2px 10px 10px",
          padding: 4,
          boxShadow: "0 1px 1px rgba(0,0,0,.3)",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ borderRadius: 8, overflow: "hidden", background: "#025144" }}>
          {card.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.image} alt="" style={{ display: "block", width: "100%", aspectRatio: "1200 / 630", objectFit: "cover" }} />
          )}
          <div style={{ padding: "8px 10px 10px" }}>
            <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{card.title}</div>
            {card.description && <div style={{ marginTop: 3, fontSize: 12.5, lineHeight: 1.35, color: "#aebac1" }}>{card.description}</div>}
            <div style={{ marginTop: 5, fontSize: 12, color: "#aebac1" }}>🔗 {host}</div>
          </div>
        </div>
        <div style={{ padding: "8px 8px 4px", fontSize: 14.2, lineHeight: 1.38, overflowWrap: "anywhere" }}>{waFormat(message.text)}</div>
        <div style={{ textAlign: "right", fontSize: 11, color: "#8fbfb4", padding: "0 6px 2px" }}>now ✓✓</div>
      </div>
    </div>
  );
}

export function ShareSheet({
  message,
  card,
  open,
  onClose,
  heading = "Share",
}: {
  message: ShareMessage;
  card?: LinkCard;
  open: boolean;
  onClose: () => void;
  heading?: string;
}) {
  const [copied, setCopied] = useState(false);
  const first = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const btn: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 46,
    padding: "0 14px",
    borderRadius: 12,
    fontWeight: 800,
    fontSize: 14,
    letterSpacing: ".02em",
    cursor: "pointer",
    textDecoration: "none",
    border: "1px solid var(--glass-border-color, rgba(255,255,255,.14))",
    background: "var(--bg-card, #16110c)",
    color: "var(--text-primary, #f3eee6)",
  };

  // Drawn at the top of the document: a transformed ancestor (the landing page
  // animates its sections) would otherwise trap position:fixed inside it.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        textAlign: "left",
        background: "rgba(0,0,0,.6)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 12,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(460px, 100%)",
          maxHeight: "calc(100dvh - 24px)",
          overflowY: "auto",
          background: "var(--bg-secondary, #0f0b08)",
          color: "var(--text-primary, #f3eee6)",
          border: "1px solid var(--glass-border-color, rgba(226,180,55,.3))",
          borderRadius: 20,
          padding: 16,
          boxShadow: "0 24px 60px rgba(0,0,0,.55)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 17 }}>{heading}</div>
            <div style={{ fontSize: 12.5, opacity: 0.7, marginTop: 2 }}>This is exactly what they will see.</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...btn, minHeight: 36, width: 36, padding: 0, borderRadius: 10 }}>
            ✕
          </button>
        </div>

        <WhatsAppPreview message={message} card={card} />

        <a
          ref={first}
          href={whatsappUrl(message.text)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...btn, background: "#25d366", color: "#062b15", border: "none", fontSize: 15 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3Z"
            />
          </svg>
          Send on WhatsApp
        </a>
        <div style={{ display: "grid", gridTemplateColumns: canSystemShare() ? "1fr 1fr" : "1fr", gap: 10 }}>
          <button type="button" onClick={copy} style={{ ...btn, color: copied ? "#2ecf5a" : btn.color }}>
            {copied ? "✓ Copied" : "Copy message"}
          </button>
          {canSystemShare() && (
            <button type="button" onClick={() => void systemShare(message)} style={btn}>
              More apps
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/** A button that opens the share sheet for one message. */
export function ShareButton({
  message,
  card,
  label = "Share",
  heading,
  className = "button button-sm button-secondary",
  style,
}: {
  message: ShareMessage | (() => ShareMessage);
  card?: LinkCard;
  label?: ReactNode;
  heading?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [m, setM] = useState<ShareMessage | null>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        style={style}
        onClick={() => {
          setM(typeof message === "function" ? message() : message);
          setOpen(true);
        }}
      >
        {label}
      </button>
      {m && <ShareSheet message={m} card={card} open={open} onClose={() => setOpen(false)} heading={heading} />}
    </>
  );
}
