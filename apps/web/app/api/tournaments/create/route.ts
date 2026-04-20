export const runtime = "edge";
import { nextBackendProxy } from "@/lib/backend";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  return nextBackendProxy(request, "/tournaments/create");
}
