import { NextResponse } from "next/server";
import { getApiBaseUrl } from "./backend";

type UpstreamCookieHeaders = Headers & {
  getSetCookie?: () => string[];
};

function getSetCookieHeaders(headers: Headers) {
  const extendedHeaders = headers as UpstreamCookieHeaders;
  const viaMethod = extendedHeaders.getSetCookie?.();

  if (viaMethod && viaMethod.length > 0) {
    return viaMethod;
  }

  const combined = headers.get("set-cookie");
  return combined ? [combined] : [];
}

export async function proxyJson(path: string, init: RequestInit = {}) {
  let response;
  let body;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers: new Headers(init.headers),
      cache: "no-store"
    });
    body = await response.text();
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: "Backend connection failed. Please ensure the API is running." },
      { status: 502 }
    );
  }

  const nextResponse = new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json"
    }
  });

  for (const setCookie of getSetCookieHeaders(response.headers)) {
    nextResponse.headers.append("set-cookie", setCookie);
  }

  return nextResponse;
}
