"use client";

import { useState } from "react";
import { ShareButton } from "@/components/share-sheet";
import { tournamentInvite, type TournamentShareInfo } from "@/lib/share";

interface ShareTournamentProps extends Partial<Omit<TournamentShareInfo, "id" | "name">> {
  tournamentId: string;
  tournamentName?: string;
  className?: string;
}

/** Invite people into a tournament: a WhatsApp-ready message, or just the link. */
export function ShareTournament({ tournamentId, tournamentName, className, ...info }: ShareTournamentProps) {
  const [copied, setCopied] = useState(false);
  const message = () => tournamentInvite({ id: tournamentId, name: tournamentName || "Tournament", ...info });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(message().url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`share-container ${className || ""}`} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      <ShareButton
        message={message}
        heading="Invite players"
        label="📲 Invite on WhatsApp"
        className="button button-sm button-gold"
        style={{ flex: "1 1 auto" }}
        card={{
          title: `${tournamentName || "Tournament"} · a fight on Winner Takes All`,
          description: "Free to enter. Brackets, scoring and a live table on W.T.A.",
          image: "/og-image.jpg",
        }}
      />
      <button
        type="button"
        onClick={copyLink}
        className={`button button-sm ${copied ? "button-success" : "button-secondary"}`}
        style={{ minWidth: "110px" }}
      >
        {copied ? "✅ Copied" : "🔗 Copy link"}
      </button>
    </div>
  );
}
