import { authenticate } from "../_lib/auth.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", "Vary": "Authorization, Origin" } });
}

function database(env) { return env.MINDSPARK_DB || env.DB; }

export async function onRequestDelete({ request, env }) {
  if (!database(env) || !env.MINDSPARK_APP_ORIGIN || !env.CLERK_ISSUER || !env.CLERK_JWKS_URL) {
    return json({ error: "Account deletion is not configured. Your account and progress were not changed." }, 503);
  }
  if (request.headers.get("Origin") !== env.MINDSPARK_APP_ORIGIN || new URL(request.url).origin !== env.MINDSPARK_APP_ORIGIN) {
    return json({ error: "This request could not be verified. Your account and progress were not changed." }, 403);
  }
  const auth = await authenticate(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status);
  if (!/^sk_test_/.test(env.CLERK_SECRET_KEY || "")) {
    return json({ error: "Account deletion is unavailable because the development identity key is not configured. Your account was not changed." }, 503);
  }

  const tombstone = JSON.stringify({ __mindsparkDeletedAccount: true });
  try {
    await database(env).prepare("INSERT INTO mindspark_progress (user_id, payload, version, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, version = mindspark_progress.version + 1, updated_at = excluded.updated_at").bind(auth.userId, tombstone, new Date().toISOString()).run();
  } catch {
    return json({ error: "Cloud progress could not be deleted. Your account was not changed; try again later." }, 503);
  }

  try {
    const headers = { Authorization: `Bearer ${env.CLERK_SECRET_KEY}`, Accept: "application/json" };
    const sessions = [];
    for (let offset = 0; offset < 10000; offset += 500) {
      const query = new URLSearchParams({ user_id: auth.userId, status: "active", limit: "500", offset: String(offset) });
      const response = await fetch(`https://api.clerk.com/v1/sessions?${query}`, { headers });
      if (response.status === 404) break;
      if (!response.ok) throw new Error("Could not list active Clerk sessions.");
      const page = await response.json();
      if (!Array.isArray(page.data)) throw new Error("Clerk returned an invalid session list.");
      sessions.push(...page.data);
      if (sessions.length >= (page.total_count ?? 0) || page.data.length < 500) break;
    }
    for (const session of sessions) {
      if (typeof session.id !== "string" || !session.id) throw new Error("Clerk returned an invalid session identifier.");
      const revoked = await fetch(`https://api.clerk.com/v1/sessions/${encodeURIComponent(session.id)}/revoke`, { method: "POST", headers });
      if (!revoked.ok && revoked.status !== 404) throw new Error("Could not revoke every Clerk session.");
    }
    const clerkResponse = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(auth.userId)}`, { method: "DELETE", headers });
    if (!clerkResponse.ok && clerkResponse.status !== 404) throw new Error("Could not delete the Clerk identity.");
  } catch {
    return json({ error: "Cloud progress is deleted and account sync is blocked, but sign-in sessions or the Clerk identity could not be fully removed. Keep this page open and retry account deletion; the server will retry cleanup." }, 502);
  }
  return json({ deleted: true, progressDeleted: true, sessionsRevoked: true, identityDeleted: true });
}
