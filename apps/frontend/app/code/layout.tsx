import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/code");

export default function CodeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
