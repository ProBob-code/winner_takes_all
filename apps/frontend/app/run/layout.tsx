import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/run");

export default function RunLayout({ children }: { children: React.ReactNode }) {
  return children;
}
