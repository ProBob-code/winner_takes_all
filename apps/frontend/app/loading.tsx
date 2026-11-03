import { PageSkeleton } from "@/components/skeleton";

// Shown by Next while a route's page is still on its way, for every route
// that has no loading.tsx of its own: the page's shape, shimmering, rather
// than the previous page frozen or a blank screen.
export default function Loading() {
  return <PageSkeleton variant="detail" label="Loading the page" />;
}
