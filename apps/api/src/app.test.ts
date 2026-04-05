import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "./server";

function normalizeCookies(setCookieHeader: string | string[] | undefined) {
  const cookieLines = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];

  return cookieLines.map((cookie) => cookie.split(";")[0]).join("; ");
}

test("health endpoint reports service readiness", async (t) => {
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);

  const payload = response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.service, "api");
});

test("signup creates a session and profile can be fetched with cookies", async (t) => {
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const signupResponse = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: {
      name: "Test Player",
      email: "player@example.com",
      password: "supersecure123"
    }
  });

  assert.equal(signupResponse.statusCode, 201);
  const cookieHeader = normalizeCookies(signupResponse.headers["set-cookie"]);
  assert.match(cookieHeader, /wta_access_token=/);
  assert.match(cookieHeader, /wta_refresh_token=/);

  const profileResponse = await app.inject({
    method: "GET",
    url: "/user/profile",
    headers: {
      cookie: cookieHeader
    }
  });

  assert.equal(profileResponse.statusCode, 200);
  const profilePayload = profileResponse.json();
  assert.equal(profilePayload.ok, true);
  assert.equal(profilePayload.user.email, "player@example.com");
  assert.equal(profilePayload.user.walletBalance, "25.00");
});

test("wallet and tournament join flow update ledger-backed balance", async (t) => {
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const signupResponse = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: {
      name: "Bracket Runner",
      email: "runner@example.com",
      password: "anothersecure123"
    }
  });

  const cookieHeader = normalizeCookies(signupResponse.headers["set-cookie"]);

  const tournamentsResponse = await app.inject({
    method: "GET",
    url: "/tournaments"
  });

  assert.equal(tournamentsResponse.statusCode, 200);
  const tournamentsPayload = tournamentsResponse.json();
  assert.equal(tournamentsPayload.ok, true);
  assert.equal(tournamentsPayload.tournaments.length, 2);

  const paidTournament = tournamentsPayload.tournaments.find(
    (tournament: { entryFee: { amount: string } }) => tournament.entryFee.amount === "10.00"
  );

  assert.ok(paidTournament);

  const joinResponse = await app.inject({
    method: "POST",
    url: `/tournaments/${paidTournament.id}/join`,
    headers: {
      cookie: cookieHeader
    }
  });

  assert.equal(joinResponse.statusCode, 200);
  const joinPayload = joinResponse.json();
  assert.equal(joinPayload.ok, true);
  assert.equal(joinPayload.wallet.balance.amount, "15.00");
  assert.equal(joinPayload.tournament.joinedPlayers, 1);

  const walletResponse = await app.inject({
    method: "GET",
    url: "/wallet",
    headers: {
      cookie: cookieHeader
    }
  });

  assert.equal(walletResponse.statusCode, 200);
  const walletPayload = walletResponse.json();
  assert.equal(walletPayload.wallet.balance.amount, "15.00");
  assert.equal(walletPayload.wallet.transactions.length, 2);
});

test("refresh rotates the session when a valid refresh token is present", async (t) => {
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const signupResponse = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: {
      name: "Refresh Player",
      email: "refresh@example.com",
      password: "refreshsecure123"
    }
  });

  const cookieHeader = normalizeCookies(signupResponse.headers["set-cookie"]);

  const refreshResponse = await app.inject({
    method: "POST",
    url: "/auth/refresh",
    headers: {
      cookie: cookieHeader
    }
  });

  assert.equal(refreshResponse.statusCode, 200);
  const refreshedCookies = normalizeCookies(refreshResponse.headers["set-cookie"]);
  assert.match(refreshedCookies, /wta_access_token=/);
  assert.match(refreshedCookies, /wta_refresh_token=/);
});

test("protected routes reject unauthenticated requests", async (t) => {
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const walletResponse = await app.inject({
    method: "GET",
    url: "/wallet"
  });

  assert.equal(walletResponse.statusCode, 401);
  const payload = walletResponse.json();
  assert.equal(payload.ok, false);
});
