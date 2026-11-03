"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageSkeleton } from "@/components/skeleton";

/**
 * The old stand-alone "Stadium Arena Manager".
 *
 * A hosted tournament's arena now lives on the tournament page itself, with
 * the same engine, controls and streaming as Quick Tournament. This page kept
 * a second copy of the scoring controls with the old foul rule, and pushed its
 * own version of the arena to spectators, so it now sends anyone with an old
 * link to the tournament page instead.
 */
export default function TournamentEnginePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;

  useEffect(() => {
    if (id) router.replace(`/tournaments/${id}`);
  }, [id, router]);

  return (
    <PageSkeleton variant="detail" label="Opening the arena" />
  );
}
