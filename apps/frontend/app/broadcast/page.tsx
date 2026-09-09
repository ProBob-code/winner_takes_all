import type { Metadata } from "next";
import { StreamCodeEntry } from "./StreamCodeEntry";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stream a match | Winner Takes All",
  description: "Enter your stream code to put a camera on the match.",
  robots: { index: false, follow: false },
};

/**
 * Typed entry point for the stream code. Scanning the QR jumps straight to
 * /broadcast/<code>; this is the same door for anyone whose camera will not read it.
 */
export default function StreamCodePage() {
  return <StreamCodeEntry />;
}
