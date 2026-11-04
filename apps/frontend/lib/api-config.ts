/**
 * Returns the base URL for the backend API.
 * In production (static export on Cloudflare Pages), this points to the Workers API.
 * In local dev, it can be empty (relative paths) or a tunnel URL.
 */
export function getApiUrl(): string {
  // On the site's own domain the API is api.winnertakesall.live, so its
  // session cookies are first-party. From workers.dev they were third-party,
  // and Safari (every browser on an iPhone) drops those: iPhone users were
  // logged out the moment they logged in. Other hosts (pages.dev previews,
  // localhost) keep the configured URL.
  if (typeof window !== "undefined" && /(^|\.)winnertakesall\.live$/.test(window.location.hostname)) {
    return SITE_API_URL;
  }
  return process.env.NEXT_PUBLIC_API_URL || "";
}

/** The Worker's custom domain, on the same site as the pages. */
export const SITE_API_URL = "https://api.winnertakesall.live";

/** True when NEXT_PUBLIC_API_URL has not been configured for this build. */
export function isApiConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_API_URL);
}

/**
 * Parse a JSON API response.
 *
 * When NEXT_PUBLIC_API_URL is unset the request falls through to the Next.js
 * server, which answers with an HTML 404 page. Calling res.json() on that
 * throws `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`, which says
 * nothing about the real problem. Detect it and raise something actionable.
 */
export async function readJsonResponse(res: Response): Promise<any> {
  const contentType = res.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const hint = isApiConfigured()
      ? `The API at ${getApiUrl()} returned ${res.status} without JSON.`
      : "The API base URL is not configured (NEXT_PUBLIC_API_URL is unset), so this request hit the web app instead of the backend.";
    throw new Error(hint);
  }

  try {
    return await res.json();
  } catch {
    throw new Error("The API returned a malformed JSON response.");
  }
}
