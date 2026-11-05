"use client";

// Reads the signed-in player at mount.
export const dynamic = "force-dynamic";

/**
 * Imposter, the party game. Everyone plays on their own phone in one room.
 *
 * Like 8-ball, every game is on an account: anyone signed out goes to log in
 * first, and the room uses the account's name. The game runs on the API (a
 * Durable Object per room, see apps/api/src/durable-objects/imposter-rooms.ts),
 * which also pays the winners; this page only draws it.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { backendFetch } from "@/lib/backend";
import { ImposterGame } from "@/components/imposter/imposter-game";

export default function PlayImposterPage() {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await backendFetch("/user/profile");
        if (res.status === 401) {
          router.replace("/login?next=/play/imposter");
          return;
        }
        const profile: any = await res.json().catch(() => ({}));
        if (!profile?.ok) {
          router.replace("/login?next=/play/imposter");
          return;
        }
        if (live) setName(String(profile.user?.name || "Player"));
      } catch {
        if (live) router.replace("/login?next=/play/imposter");
      }
    })();
    return () => {
      live = false;
    };
  }, [router]);

  if (!name) {
    return (
      <main
        role="status"
        aria-live="polite"
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          background: "radial-gradient(1000px 560px at 50% -8%,#4a0d22 0%,transparent 62%),#12040a",
          color: "#f3eee6",
          fontFamily: "var(--font-montserrat), Montserrat, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontStyle: "italic",
            fontWeight: 900,
            fontSize: 40,
            lineHeight: 1,
            background: "linear-gradient(180deg,#fff3b0,#f2c21b 50%,#d58a00)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          IMPOSTER
        </div>
        <div style={{ fontSize: 12.5, color: "#a08890", fontFamily: "var(--font-inter), Inter, system-ui, sans-serif" }}>Checking your account…</div>
      </main>
    );
  }

  return (
    <main>
      <ImposterGame name={name} />
    </main>
  );
}
