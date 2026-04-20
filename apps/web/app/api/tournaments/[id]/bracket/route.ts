export const runtime = "edge";
import { backendFetch } from "@/lib/backend";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await backendFetch(`/tournaments/${id}/bracket`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
