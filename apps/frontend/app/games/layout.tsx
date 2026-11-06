import { pageMetadata } from "@/lib/page-metadata";
import { AdSlot } from "@/components/ads";

export const metadata = pageMetadata("/games");

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* Renders nothing unless AdSense is switched on in the admin console. */}
      <AdSlot placement="games" onlyPath="/games" />
    </>
  );
}
