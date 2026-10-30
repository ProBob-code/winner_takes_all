import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/refund");

export default function RefundLayout({ children }: { children: React.ReactNode }) {
  return children;
}
