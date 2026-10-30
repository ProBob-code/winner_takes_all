import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/games");

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
