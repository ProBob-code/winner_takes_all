import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/contact");

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
