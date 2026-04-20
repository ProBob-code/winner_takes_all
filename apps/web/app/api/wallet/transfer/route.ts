import { proxyJson } from "@/lib/proxy";

export async function POST(request: Request) {
  const body = await request.text();

  return proxyJson("/wallet/transfer", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body
  });
}
