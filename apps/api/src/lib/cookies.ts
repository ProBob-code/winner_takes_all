import type { FastifyReply, FastifyRequest } from "fastify";

export const ACCESS_COOKIE = "wta_access_token";
export const REFRESH_COOKIE = "wta_refresh_token";

function parseCookieHeader(header: string | undefined) {
  if (!header) {
    return {};
  }

  return header
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex === -1) {
        return accumulator;
      }

      const name = part.slice(0, separatorIndex);
      const value = part.slice(separatorIndex + 1);
      accumulator[name] = decodeURIComponent(value);
      return accumulator;
    }, {});
}

function serializeCookie(name: string, value: string, maxAgeSeconds: number) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`
  ].join("; ");
}

export function setSessionCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string
) {
  reply.header("Set-Cookie", [
    serializeCookie(ACCESS_COOKIE, accessToken, 60 * 15),
    serializeCookie(REFRESH_COOKIE, refreshToken, 60 * 60 * 24 * 7)
  ]);
}

export function readCookie(request: FastifyRequest, name: string) {
  const cookies = parseCookieHeader(request.headers.cookie);
  return cookies[name];
}
