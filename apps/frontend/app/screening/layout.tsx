import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/screening");

export default function ScreeningLayout({ children }: { children: React.ReactNode }) {
  return children;
}
