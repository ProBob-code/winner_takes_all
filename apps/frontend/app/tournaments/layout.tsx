import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/tournaments");

export default function TournamentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
