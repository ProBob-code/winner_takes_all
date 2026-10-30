import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/privacy");

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
