"use client";

import { useParams } from "next/navigation";
import { TournamentEngine } from "@/components/tournament-engine";

export default function TournamentEnginePage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <main className="page">
      <div className="shell">
        <TournamentEngine tournamentId={id} />
      </div>
    </main>
  );
}
