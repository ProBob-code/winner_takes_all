"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <main className="flex flex-col items-center justify-center min-h-screen text-center px-4">
          <h1 className="text-4xl font-bold mb-4">A critical error occurred</h1>
          <button onClick={() => reset()} className="button">
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
