"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { getApiUrl } from "@/lib/api-config";

type JoinTournamentButtonProps = {
  tournamentId: string;
  isPrivate: boolean;
};

export function JoinTournamentButton({
  tournamentId,
  isPrivate
}: JoinTournamentButtonProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [password, setPassword] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleJoin() {
    if (isPrivate && !showPasswordPrompt) {
      setShowPasswordPrompt(true);
      return;
    }

    setMessage(null);

    const apiUrl = getApiUrl();
    const response = await fetch(`${apiUrl}/api/tournaments/${tournamentId}/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({ password })
    });

    const body = (await response.json()) as {
      ok: boolean;
      message?: string;
    };

    if (!response.ok || !body.ok) {
      setMessage(body.message ?? "Unable to join tournament.");
      return;
    }

    setMessage("Tournament entry confirmed.");
    setShowPasswordPrompt(false);
    startTransition(() => {
      router.refresh();
    });
  }

  const modalContent = showPasswordPrompt && mounted && createPortal(
    <div className="modal-overlay" style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0, 0, 0, 0.7)",
      backdropFilter: "blur(8px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      padding: "1rem"
    }}>
      <div className="panel slide-in" style={{
        maxWidth: "360px",
        width: "100%",
        textAlign: "center",
        padding: "2rem",
        background: "var(--glass-bg)",
        border: "1px solid var(--glass-border-color)",
        borderRadius: "20px",
        boxShadow: "0 20px 50px rgba(0,0,0,0.5)"
      }}>
        <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>🔒</div>
        <h3 style={{ marginBottom: "0.5rem", color: "white" }}>Private Tournament</h3>
        <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "1.5rem" }}>This lobby is restricted. Please enter the password to proceed.</p>
        
        <input
          type="password"
          className="form-control"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          style={{ 
            width: "100%",
            padding: "1rem",
            borderRadius: "12px",
            background: "rgba(0,0,0,0.3)",
            border: "1px solid var(--red-subtle)",
            color: "white",
            marginBottom: "1.5rem",
            textAlign: "center"
          }}
        />

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button 
            className="button button-red" 
            style={{ flex: 1 }}
            onClick={handleJoin}
            disabled={isPending || !password}
          >
            {isPending ? "Verifying..." : "Join Now"}
          </button>
          <button 
            className="button button-secondary" 
            style={{ flex: 1 }}
            onClick={() => { setShowPasswordPrompt(false); setMessage(null); }}
            disabled={isPending}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <div className="stack" style={{ gap: "0.75rem", position: "relative" }}>
      {modalContent}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
        <button
          className={`button ${isPrivate ? 'button-red' : 'button-gold'}`}
          disabled={isPending}
          onClick={handleJoin}
          type="button"
          style={{ minWidth: "160px" }}
        >
          {isPending ? "Processing..." : isPrivate ? "🔓 Join Private" : "Join Tournament"}
        </button>
      </div>

      {message && (
        <div className="fixed-toast slide-in" style={{
          position: "fixed",
          top: "2rem",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 5000,
          padding: "1rem 2rem",
          background: "rgba(10, 10, 20, 0.9)",
          backdropFilter: "blur(16px)",
          borderRadius: "16px",
          border: `1px solid ${message.includes("Invalid") || message.includes("Unable") || message.includes("failed") ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
          boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          minWidth: "300px"
        }}>
          <div style={{ 
            width: "10px", 
            height: "10px", 
            borderRadius: "50%", 
            background: message.includes("Invalid") || message.includes("Unable") || message.includes("failed") ? "var(--red)" : "var(--green)" 
          }} />
          <span style={{ 
            color: message.includes("Invalid") || message.includes("Unable") || message.includes("failed") ? "var(--red-light)" : "var(--green-light)",
            fontWeight: 600,
            fontSize: "1rem"
          }}>
            {message}
          </span>
          <button 
            onClick={() => setMessage(null)} 
            style={{ 
              marginLeft: "auto", 
              background: "transparent", 
              border: "none", 
              color: "rgba(255,255,255,0.3)", 
              cursor: "pointer",
              fontSize: "1.2rem"
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
