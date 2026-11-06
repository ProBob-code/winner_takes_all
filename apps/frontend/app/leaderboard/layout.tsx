import { pageMetadata } from "@/lib/page-metadata";
import { AdSlot } from "@/components/ads";

export const metadata = pageMetadata("/leaderboard");

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* Renders nothing unless AdSense is switched on in the admin console. */}
      <AdSlot placement="leaderboard" onlyPath="/leaderboard" />
    </>
  );
}
