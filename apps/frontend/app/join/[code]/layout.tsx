import type { Metadata } from "next";
import { previewMetadata } from "@/lib/link-preview";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return previewMetadata({
    title: "👑 You're invited to a fight on W.T.A",
    description: "Tap to take your seat. Free to enter, live scores, and WTA Coins for every win.",
    path: `/join/${encodeURIComponent(code)}`,
  });
}

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
