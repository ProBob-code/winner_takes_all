import type { Metadata } from "next";
import { tournamentFacts, tournamentPreview } from "@/lib/link-preview";

// The page itself is a client component; this gives its link a proper preview card.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return tournamentPreview(id, await tournamentFacts(id));
}

export default function TournamentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
