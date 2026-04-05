"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type JoinTournamentButtonProps = {
  tournamentId: string;
};

export function JoinTournamentButton({
  tournamentId
}: JoinTournamentButtonProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleJoin() {
    setMessage(null);

    const response = await fetch(`/api/tournaments/${tournamentId}/join`, {
      method: "POST"
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
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="stack">
      <button
        className="button form-button"
        disabled={isPending}
        onClick={handleJoin}
        type="button"
      >
        {isPending ? "Joining..." : "Join tournament"}
      </button>
      {message ? <div className="notice">{message}</div> : null}
    </div>
  );
}
