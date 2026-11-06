import Link from "next/link";
import { Mascot } from "@/components/mascot";

export default function NotFound() {
  return (
    <main className="page mascot-deadend">
      <Mascot pose="sulk" size={320} label="The WTA Tiger sulking under a rain cloud" />
      <h1>You lost, shee. This page doesn&apos;t exist.</h1>
      <p>The link is old or mistyped. Shake it off and head back to the tables.</p>
      <Link href="/dashboard" className="button">
        Back to the dashboard
      </Link>
    </main>
  );
}
