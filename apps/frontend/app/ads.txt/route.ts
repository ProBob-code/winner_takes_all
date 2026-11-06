/**
 * /ads.txt, which AdSense checks before it pays out: it names the publisher
 * id allowed to sell ads on this domain. Built from the id saved in the admin
 * console, so it needs no deploy when the id is set. With ads off it is empty,
 * which AdSense reads as "nobody authorised yet".
 */

import { SITE_API_URL } from "@/lib/api-config";

export const dynamic = "force-dynamic";

export async function GET() {
  let body = "";
  try {
    const base = process.env.NEXT_PUBLIC_API_URL || SITE_API_URL;
    const res = await fetch(`${base}/api/ads/config`, { cache: "no-store" });
    const cfg = (await res.json()) as { client?: string };
    const pub = (cfg?.client ?? "").replace(/^ca-/, "");
    // f08c47fec0942fa0 is Google's own certification authority id.
    if (/^pub-\d{10,20}$/.test(pub)) body = `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`;
  } catch {
    // An empty file rather than an error page.
  }
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
