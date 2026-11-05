import { previewMetadata } from "@/lib/link-preview";

export const metadata = previewMetadata({
  title: "🎱 W.T.A Eight Ball — play free in your browser",
  description: "Beat the Machine, play a friend, or play live online. Every win pays WTA Coins.",
  path: "/play/8ball",
});

export default function EightBallLayout({ children }: { children: React.ReactNode }) {
  return children;
}
