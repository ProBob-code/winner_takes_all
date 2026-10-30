import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/terms");

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
