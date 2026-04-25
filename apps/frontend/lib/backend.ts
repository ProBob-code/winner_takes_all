export function getApiBaseUrl() {
  return "";
}

export async function getRequestCookieHeader() {
  return "";
}

export async function backendFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const cookieHeader = await getRequestCookieHeader();

  if (cookieHeader && !headers.has("cookie")) {
    headers.set("cookie", cookieHeader);
  }

  const apiPath = path.startsWith("/api") ? path : `/api${path}`;
  return fetch(apiPath, {
    ...init,
    headers,
    cache: "no-store"
  });
}

export async function readBackendJson<T>(path: string, init: RequestInit = {}) {
  const response = await backendFetch(path, init);
  
  if (!response.ok) {
    if (response.status === 401) {
      return {
        response,
        payload: { ok: false, message: "Authentication required" } as any,
        status: 401
      };
    }
    const text = await response.text();
    console.error(`Backend API error [${response.status}]: ${text}`);
    throw new Error(`API ${response.status}: ${text.slice(0, 100)}`);
  }

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const text = await response.text();
    console.error(`Expected JSON but got ${contentType}: ${text}`);
    throw new Error(`Invalid response format: ${text.slice(0, 100)}`);
  }

  const payload = (await response.json()) as T;

  return {
    response,
    payload,
    status: response.status
  };
}

export async function nextBackendProxy(request: Request, path: string) {
  let body: any = undefined;
  
  if (request.method !== "GET" && request.method !== "HEAD") {
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 0) {
      try {
        body = await request.json();
      } catch (e) {
        console.error("Failed to parse request body as JSON:", e);
      }
    }
  }

  const response = await backendFetch(path, {
    method: request.method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "Content-Type": "application/json"
    }
  });

  // Handle various response types gracefully
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const data = await response.json();
    return Response.json(data, { status: response.status });
  } else {
    const text = await response.text();
    return new Response(text, { 
      status: response.status,
      headers: { "Content-Type": contentType || "text/plain" }
    });
  }
}

export async function getCurrentUserProfile() {
  try {
    const { payload } = await readBackendJson<any>("/user/profile");
    if (payload && payload.ok) {
      return payload.user;
    }
    return null;
  } catch (err) {
    return null;
  }
}
