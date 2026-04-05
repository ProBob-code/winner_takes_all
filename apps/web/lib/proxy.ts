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
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: new Headers(init.headers),
    cache: "no-store"
  });

  const body = await response.text();
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
