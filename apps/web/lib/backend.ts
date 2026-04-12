import { cookies } from "next/headers";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:4000";

export function getApiBaseUrl() {
  return process.env.WTA_API_URL ?? DEFAULT_API_BASE_URL;
}

function serializeCookieHeader(entries: Array<{ name: string; value: string }>) {
  return entries.map((entry) => `${entry.name}=${entry.value}`).join("; ");
}

export async function getRequestCookieHeader() {
  const cookieStore = await cookies();
  return serializeCookieHeader(cookieStore.getAll());
}

export async function backendFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const cookieHeader = await getRequestCookieHeader();

  if (cookieHeader && !headers.has("cookie")) {
    headers.set("cookie", cookieHeader);
  }

  return fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });
}

export async function readBackendJson<T>(path: string, init: RequestInit = {}) {
  const response = await backendFetch(path, init);
  const payload = (await response.json()) as T;

  return {
    response,
    payload
  };
}

export async function nextBackendProxy(request: Request, path: string) {
  const body = request.method !== "GET" && request.method !== "HEAD" ? await request.json() : undefined;

  const response = await backendFetch(path, {
    method: request.method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "Content-Type": "application/json"
    }
  });

  const data = await response.json();
  return Response.json(data, { status: response.status });
}
