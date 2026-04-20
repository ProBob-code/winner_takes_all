export const runtime = "edge";
import { backendFetch } from "@/lib/backend";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const res = await backendFetch("/notifications");
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
