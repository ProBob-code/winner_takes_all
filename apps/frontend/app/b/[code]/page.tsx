import type { Metadata } from "next";
import { ShortBroadcastClient } from "./ShortBroadcastClient";

type Props = {
  params: Promise<{ code: string }>;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Go Live | Winner Takes All",
  description: "Stream this match live from your phone.",
  // A broadcast link is a capability: keep it out of search results.
  robots: { index: false, follow: false },
};

/**
 * Short entry point for the match QR code.
 *
 * The full signed broadcast URL is ~128 bytes, which encodes as a dense 49x49
 * QR symbol. This route is ~43 bytes and fits in roughly 29x29, which phone
 * cameras read far more reliably. The code is exchanged for the real token on
 * arrival.
 */
export default async function ShortBroadcastPage({ params }: Props) {
  const { code } = await params;
  return <ShortBroadcastClient code={code} />;
}
