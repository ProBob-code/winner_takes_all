import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/venues");

export default function VenuesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
