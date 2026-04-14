import { cookies } from "next/headers";
import { proxyJson } from "@/lib/proxy";

export async function POST(
  _: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join("; ");

  return proxyJson(`/tournaments/${id}/join`, {
    method: "POST",
    headers: {
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}
