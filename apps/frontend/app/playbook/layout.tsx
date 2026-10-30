import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/playbook");

export default function PlaybookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
