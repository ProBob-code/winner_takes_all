"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "@/components/tournament-engine.css";

const CODE_LENGTH = 6;

/** Accept whatever someone types: any case, spaces and dashes ignored. */
function normalise(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}

export function StreamCodeEntry() {
  const router = useRouter();
  const [code, setCode] = useState("");

  const ready = code.length === CODE_LENGTH;

  return (
    <main className="page animate-in">
      <div className="shell" style={{ maxWidth: "460px", margin: "0 auto" }}>
        <div
          className="panel page-card slide-in"
          style={{
            padding: "2.5rem 2rem",
            background: "rgba(9, 9, 22, 0.55)",
            borderRadius: "16px",
            border: "1px solid rgba(255,255,255,0.06)",
            textAlign: "center",
          }}
        >
          <span className="section-label-v2 glow-text" style={{ letterSpacing: "2px" }}>
            📷 STREAM A MATCH
          </span>
          <h1 className="glow-text mb-2" style={{ fontSize: "1.6rem", fontWeight: 900 }}>
            Enter your stream code
          </h1>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            The host shows a {CODE_LENGTH}-character code next to the QR. No account needed.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) router.push(`/b/${code}`);
            }}
            style={{ marginTop: "24px" }}
          >
            <input
              value={code}
              onChange={(e) => setCode(normalise(e.target.value))}
              placeholder="ABC123"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              aria-label="Stream code"
              style={{
                width: "100%",
                padding: "16px",
                fontSize: "1.9rem",
                fontWeight: 900,
                letterSpacing: "0.5rem",
                textAlign: "center",
                textTransform: "uppercase",
                fontFamily: "monospace",
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "12px",
                color: "#fff",
              }}
            />

            <button
              type="submit"
              className="button button-gold"
              disabled={!ready}
              style={{ width: "100%", marginTop: "18px" }}
            >
              {ready ? "START CAMERA" : `${CODE_LENGTH - code.length} more character${CODE_LENGTH - code.length === 1 ? "" : "s"}`}
            </button>
          </form>

          <p className="muted" style={{ fontSize: "0.72rem", marginTop: "18px", lineHeight: 1.6 }}>
            Your camera streams straight to viewers. Nothing is recorded, and the
            stream stops when the match ends.
          </p>
        </div>
      </div>
    </main>
  );
}
