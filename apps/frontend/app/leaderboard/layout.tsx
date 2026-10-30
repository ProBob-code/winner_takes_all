import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/leaderboard");

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
