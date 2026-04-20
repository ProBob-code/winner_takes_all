import { backendFetch } from "@/lib/backend";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await backendFetch(`/notifications/${id}/read`, { method: "POST" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
