import { nextBackendProxy } from "@/lib/backend";
import { NextRequest } from "next/server";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return nextBackendProxy(request, `/tournaments/${id}`);
}
