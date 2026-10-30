import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/series");

export default function SeriesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
