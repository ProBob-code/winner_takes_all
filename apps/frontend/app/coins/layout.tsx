import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/coins");

export default function CoinsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
