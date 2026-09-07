import type { Metadata } from "next";
import { BroadcastClient } from "./BroadcastClient";

type Props = {
  params: Promise<{ arenaId: string; matchId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Go Live | Winner Takes All",
  description: "Stream this match live from your phone.",
  // A broadcast link is a capability: keep it out of search results.
  robots: { index: false, follow: false },
};

export default async function BroadcastPage({ params, searchParams }: Props) {
  const { arenaId, matchId } = await params;
  const query = await searchParams;
  const raw = query.t;
  const token = typeof raw === "string" ? raw : "";

  return <BroadcastClient arenaId={arenaId} matchId={matchId} token={token} />;
}
