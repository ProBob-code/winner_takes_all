"use client";

import { useEffect } from "react";
import { Mascot } from "@/components/mascot";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="page mascot-deadend">
      <Mascot pose="sulk" size={320} label="The WTA Tiger sulking under a rain cloud" />
      <h1>That one went in off.</h1>
      <p>Something broke on our side while loading this page. Give it another go.</p>
      <button onClick={() => reset()} className="button">
        Try again
      </button>
    </main>
  );
}
