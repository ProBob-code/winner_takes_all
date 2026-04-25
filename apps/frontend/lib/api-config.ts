/**
 * Returns the base URL for the backend API.
 * In production (static export on Cloudflare Pages), this points to the Workers API.
 * In local dev, it can be empty (relative paths) or a tunnel URL.
 */
export function getApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || "";
}
