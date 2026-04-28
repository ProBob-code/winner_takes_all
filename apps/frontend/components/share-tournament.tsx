"use client";

import { useState, useEffect } from "react";

interface ShareTournamentProps {
  tournamentId: string;
  tournamentName?: string;
  className?: string;
}

export function ShareTournament({ tournamentId, tournamentName, className }: ShareTournamentProps) {
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    // Construct the URL on the client side
    const url = `${window.location.origin}/tournaments/${tournamentId}`;
    setShareUrl(url);
  }, [tournamentId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link: ", err);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: tournamentName || "Join my Tournament",
          text: `Join my tournament \"${tournamentName || \"Tournament\"}\" on Winner.Takes.All!`,
          url: shareUrl,
        });
      } catch (err) {
        console.error("Error sharing:", err);
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className={`share-container ${className || ""}`} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
      <div 
        className="share-link-box desktop-only" 
        style={{ 
          background: "var(--glass-bg)", 
          border: "1px solid var(--glass-border-color)", 
          padding: "0.5rem 1rem", 
          borderRadius: "var(--radius-sm)",
          fontSize: "0.85rem",
          color: "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
      >
        <span style={{ fontSize: "1.1rem" }}>🔗</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{shareUrl || "Loading link..."}</span>
      </div>
      
      <button 
        onClick={handleCopy}
        className={`button button-sm ${copied ? "button-success" : "button-secondary"}`}
        style={{ minWidth: "100px" }}
      >
        {copied ? "✅ Copied!" : "📋 Copy"}
      </button>

      {typeof navigator !== 'undefined' && (navigator as any).share && (
        <button 
          onClick={handleShare}
          className="button button-sm button-secondary"
          title="Share using system menu"
          style={{ flex: 1 }}
        >
          📤 Share
        </button>
      )}
      <style jsx>{`
        @media (max-width: 600px) {
          .desktop-only {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
