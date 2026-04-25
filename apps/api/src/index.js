export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 🔥 API ROUTING
    if (path.startsWith("/api/")) {
        return handleApi(request, env);
    }

    // 🔥 SPA FALLBACK FOR DYNAMIC ROUTES
    if (path.startsWith("/match/")) {
        const nextUrl = new URL(request.url);
        nextUrl.pathname = "/match.html";
        return env.ASSETS.fetch(new Request(nextUrl, request));
    }
    if (path.startsWith("/tournaments/") && !path.endsWith("/create") && !path.endsWith("/tournaments")) {
        const parts = path.split("/");
        if (parts.length === 3 && parts[2] !== "create") {
            const nextUrl = new URL(request.url);
            nextUrl.pathname = "/tournaments/view.html";
            return env.ASSETS.fetch(new Request(nextUrl, request));
        }
    }

    // 🔥 STATIC FILES
    let response = await env.ASSETS.fetch(request);

    // 🔥 SPA FALLBACK (fixes /signup issue)
    if (response.status === 404) {
      const nextUrl = new URL(request.url);
      nextUrl.pathname = "/index.html";
      return env.ASSETS.fetch(new Request(nextUrl, request));
    }

    return response;
  }
};

// ---------------- API ----------------

async function handleApi(request, env) {
  const url = new URL(request.url);

  // SIGNUP
  if (url.pathname === "/api/signup" && request.method === "POST") {
    const body = await request.json();

    await env.DB.prepare(
      "INSERT INTO users (email, password) VALUES (?, ?)"
    ).bind(body.email, body.password).run();

    return json({ success: true });
  }

  // LOGIN
  if (url.pathname === "/api/login" && request.method === "POST") {
    const body = await request.json();

    const user = await env.DB.prepare(
      "SELECT * FROM users WHERE email = ?"
    ).bind(body.email).first();

    if (!user) return json({ error: "User not found" }, 401);

    return json({ success: true, user });
  }

  // TEST
  if (url.pathname === "/api/test") {
    return json({ message: "API working" });
  }

  return new Response("Not Found", { status: 404 });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
