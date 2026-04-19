import Link from "next/link";

export const runtime = "edge";

export default function NotFound() {
  return (
    <main className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
      <p className="text-muted-foreground mb-8">
        Oops! The page you're looking for doesn't exist or has been moved.
      </p>
      <Link href="/dashboard" className="button">
        Go to Dashboard
      </Link>
    </main>
  );
}
