import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/shop");

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return children;
}
