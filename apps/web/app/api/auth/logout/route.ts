export const runtime = "edge";
import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({
    ok: true
  });

  response.cookies.set("wta_access_token", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });

  response.cookies.set("wta_refresh_token", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });

  return response;
}
