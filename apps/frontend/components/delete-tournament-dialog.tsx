"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

interface DeleteTournamentDialogProps {
  tournamentId: string;
  tournamentName: string;
}

export function DeleteTournamentDialog({ tournamentId, tournamentName }: DeleteTournamentDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`, {
        method: "DELETE",
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch (e) {
        // Fallback for non-JSON responses
      }

      if (!res.ok) {
        throw new Error(data.message || `Error ${res.status}: Failed to delete`);
      }

      setIsOpen(false);
      router.push("/tournaments");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="btn"
        style={{ 
          background: "rgba(255, 77, 77, 0.12)",
          color: "#ff4d4d",
          border: "1px solid rgba(255, 77, 77, 0.25)",
          fontWeight: "600",
          fontSize: "0.85rem",
          padding: "0.6rem 1.2rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          borderRadius: "12px",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          backdropFilter: "blur(4px)",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 77, 77, 0.22)";
          e.currentTarget.style.borderColor = "rgba(255, 77, 77, 0.45)";
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 8px 20px rgba(255, 77, 77, 0.15)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255, 77, 77, 0.12)";
          e.currentTarget.style.borderColor = "rgba(255, 77, 77, 0.25)";
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
        }}
      >
        <span style={{ fontSize: "1.1rem" }}>🗑️</span> Delete Tournament
      </button>
    );
  }

  const modalContent = (
    <div className="modal-overlay" style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0, 0, 0, 0.9)",
      backdropFilter: "blur(20px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999, // Super high z-index
      padding: "1rem",
      animation: "modalFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)"
    }}>
      <div className="premium-delete-modal-panel" style={{
        maxWidth: "480px",
        width: "100%",
        background: "rgba(20, 20, 30, 0.85)",
        border: "1px solid rgba(255, 77, 77, 0.3)",
        borderRadius: "28px",
        boxShadow: "0 40px 100px rgba(0, 0, 0, 0.8), 0 0 40px rgba(255, 77, 77, 0.1)",
        padding: "3rem 2.5rem",
        position: "relative",
        textAlign: "center"
      }}>
        {/* Animated Background Elements */}
        <div className="modal-glow-top" />
        <div className="cyber-lines-bg" />
        
        <div style={{ position: "relative", zIndex: 2 }}>
          <div className="warning-icon-container">
            <span className="warning-icon">⚠️</span>
          </div>
          
          <h2 style={{ 
            color: "white", 
            fontSize: "2rem", 
            fontWeight: "900", 
            marginBottom: "1rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            textShadow: "0 0 20px rgba(255, 255, 255, 0.2)"
          }}>
            Delete Lobby?
          </h2>

          <div style={{ 
            background: "rgba(0,0,0,0.3)", 
            padding: "1.5rem", 
            borderRadius: "16px",
            border: "1px solid rgba(255,255,255,0.05)",
            marginBottom: "2rem"
          }}>
            <p style={{ color: "rgba(255, 255, 255, 0.5)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>
              You are about to permanently delete:
            </p>
            <div style={{ 
              color: "white", 
              fontSize: "1.5rem", 
              fontWeight: "800",
              fontFamily: "var(--font-outfit)",
              textShadow: "0 0 15px rgba(255, 255, 255, 0.3)"
            }}>
              "{tournamentName}"
            </div>
          </div>

          <p style={{ 
            color: "rgba(255, 255, 255, 0.6)", 
            lineHeight: "1.6",
            marginBottom: "2.5rem",
            fontSize: "0.95rem"
          }}>
            This action <span style={{ color: "#ff4d4d", fontWeight: "700" }}>cannot be undone</span>. All participants will be instantly refunded to their wallets.
          </p>

          <div style={{ 
            display: "flex", 
            gap: "1rem",
            flexDirection: "row" // desktop default
          }} className="modal-button-container">
            <button 
              onClick={() => setIsOpen(false)}
              className="modal-cancel-btn"
              disabled={isDeleting}
            >
              KEEP LOBBY
            </button>
            <button 
              onClick={handleDelete}
              className="modal-confirm-btn"
              disabled={isDeleting}
            >
              {isDeleting ? "SHUTTING DOWN..." : "CONFIRM DELETE"}
            </button>
          </div>
          {error && (
            <div className="error-toast slide-in">
              🚨 {error}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .modal-glow-top {
          position: absolute;
          top: -100px;
          left: 50%;
          transform: translateX(-50%);
          width: 300px;
          height: 200px;
          background: radial-gradient(circle, rgba(255, 77, 77, 0.15) 0%, transparent 70%);
          z-index: 1;
        }

        .cyber-lines-bg {
          position: absolute;
          inset: 0;
          background-image: linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
          background-size: 20px 20px;
          opacity: 0.3;
          z-index: 0;
        }

        .warning-icon-container {
          width: 100px;
          height: 100px;
          margin: 0 auto 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .warning-icon-container::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2px dashed rgba(255, 77, 77, 0.3);
          animation: spin 10s linear infinite;
        }

        .warning-icon {
          font-size: 3.5rem;
          filter: drop-shadow(0 0 15px rgba(255, 77, 77, 0.5));
          animation: iconPulse 2s infinite ease-in-out;
        }

        .modal-button-container {
          display: flex;
          gap: 1rem;
        }

        .modal-button-container > button {
          flex: 1;
          padding: 1rem;
          border-radius: 14px;
          font-weight: 800;
          font-size: 0.9rem;
          letter-spacing: 0.1em;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid transparent;
        }

        .modal-cancel-btn {
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.6);
          border-color: rgba(255, 255, 255, 0.1) !important;
        }

        .modal-cancel-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border-color: rgba(255, 255, 255, 0.3) !important;
          transform: translateY(-2px);
        }

        .modal-confirm-btn {
          background: linear-gradient(135deg, #ff4c4c 0%, #c81d1d 100%);
          color: white;
          box-shadow: 0 0 20px rgba(255, 76, 76, 0.3);
        }

        .modal-confirm-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 40px rgba(255, 76, 76, 0.5);
          filter: brightness(1.1);
        }

        .error-toast {
          margin-top: 2rem;
          background: rgba(255, 77, 77, 0.15);
          color: #ff8080;
          padding: 1rem 1.5rem;
          border-radius: 16px;
          font-weight: 600;
          font-size: 0.9rem;
          border: 1px solid rgba(255, 77, 77, 0.3);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
        }

        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.95); filter: blur(10px); }
          to { opacity: 1; transform: scale(1); filter: blur(0); }
        }

        @keyframes iconPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 600px) {
          .premium-delete-modal-panel {
            padding: 2.5rem 1.5rem !important;
          }
          .modal-button-container {
            flex-direction: column-reverse;
          }
          .modal-button-container > button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modalContent, document.body);
}
