import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { onRequestGet, onRequestPut, onRequestDelete } from "../functions/api/progress.js";
import { onRequestDelete as onRequestDeleteAccount } from "../functions/api/account.js";
import { clearAuthKeyCacheForTests } from "../functions/_lib/auth.js";

if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });

const origin = "https://mindspark.example.test";
const issuer = "https://mindspark.clerk.accounts.dev";
const jwksUrl = "https://mindspark.clerk.accounts.dev/.well-known/jwks.json";
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
);
const jwk = await crypto.subtle.exportKey("jwk", publicKey);
jwk.kid = "test-key-1";
jwk.use = "sig";
jwk.alg = "RS256";
const originalFetch = globalThis.fetch;
let clerkDeleteStatus = 200;
const clerkDeletedUsers = [];
const revokedSessions = [];
globalThis.fetch = async (url, options = {}) => {
  if (String(url) === jwksUrl) return Response.json({ keys: [jwk] });
  if (String(url).startsWith("https://api.clerk.com/v1/sessions?")) {
    assert.match(options.headers.Authorization, /^Bearer sk_test_/);
    const userId = new URL(String(url)).searchParams.get("user_id");
    return Response.json({ data: [{ id: "sess_" + userId }], total_count: 1 });
  }
  if (String(url).includes("/sessions/") && String(url).endsWith("/revoke")) {
    assert.equal(options.method, "POST");
    revokedSessions.push(decodeURIComponent(String(url).split("/").at(-2)));
    return new Response(null, { status: 204 });
  }
  assert.match(String(url), /^https:\/\/api\.clerk\.com\/v1\/users\//);
  assert.equal(options.method, "DELETE");
  assert.match(options.headers.Authorization, /^Bearer sk_test_/);
  clerkDeletedUsers.push(decodeURIComponent(String(url).split("/").at(-1)));
  return new Response(clerkDeleteStatus === 200 ? '{"deleted":true}' : '{"error":"provider failure"}', { status: clerkDeleteStatus, headers: { "Content-Type": "application/json" } });
};
clearAuthKeyCacheForTests();

async function token(subject, overrides = {}) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", typ: "JWT", kid: "test-key-1" });
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: issuer, sub: subject, azp: origin, iat: now, nbf: now - 1, exp: now + 300, ...overrides };
  const payload = encode(claims);
  const input = new TextEncoder().encode(header + "." + payload);
  const signature = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, privateKey, input);
  return header + "." + payload + "." + Buffer.from(signature).toString("base64url");
}

const rows = new Map();
const DB = {
  prepare(sql) {
    let values = [];
    const statement = {
      bind(...next) { values = next; return statement; },
      async first() {
        assert.match(sql, /WHERE user_id = \?$/);
        const [userId] = values;
        const row = rows.get(userId);
        return row ? { payload: row.payload, version: row.version, updated_at: row.updated_at } : null;
      },
      async run() {
        if (sql.startsWith("INSERT OR IGNORE")) {
          const [userId, payload, updatedAt] = values;
          if (rows.has(userId)) return { meta: { changes: 0 } };
          rows.set(userId, { payload, version: 1, updated_at: updatedAt });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("UPDATE")) {
          const [payload, updatedAt, userId, version] = values;
          const row = rows.get(userId);
          if (!row || row.version !== version) return { meta: { changes: 0 } };
          rows.set(userId, { payload, version: version + 1, updated_at: updatedAt });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("DELETE")) {
          const [userId] = values;
          return { meta: { changes: rows.delete(userId) ? 1 : 0 } };
        }
        if (sql.startsWith("INSERT INTO mindspark_progress")) {
          const [userId, payload, updatedAt] = values;
          const previous = rows.get(userId);
          rows.set(userId, { payload, version: (previous?.version || 0) + 1, updated_at: updatedAt });
          return { meta: { changes: 1 } };
        }
        throw new Error("Unexpected SQL: " + sql);
      },
    };
    return statement;
  },
};
const env = { MINDSPARK_DB: DB, CLERK_ISSUER: issuer, CLERK_JWKS_URL: jwksUrl, MINDSPARK_APP_ORIGIN: origin, CLERK_SECRET_KEY: "sk_test_server-only" };
const makeRequest = async (method, subject, body, options = {}, path = "/api/progress") => new Request(origin + path, {
  method,
  headers: {
    ...(subject ? { Authorization: "Bearer " + await token(subject, options.claims) } : {}),
    ...(method !== "GET" ? { "Content-Type": "application/json", Origin: options.origin || origin } : {}),
  },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const body = async (response) => response.json();

let response = await onRequestGet({ request: await makeRequest("GET", null), env });
assert.equal(response.status, 401, "anonymous requests are denied");
const validA = await token("user_a");
response = await onRequestGet({ request: new Request(origin + "/api/progress", { headers: { Authorization: "Bearer " + validA.slice(0, -2) + "xx" } }), env });
assert.equal(response.status, 401, "tampered session tokens are denied");
response = await onRequestGet({ request: await makeRequest("GET", "user_a", undefined, { claims: { exp: 1 } }), env });
assert.equal(response.status, 401, "expired sessions are denied");
response = await onRequestPut({ request: await makeRequest("PUT", "user_a", { payload: {}, baseVersion: 0 }, { origin: "https://attacker.example" }), env });
assert.equal(response.status, 403, "cross-origin writes are denied");

const progressA = { tasks: [{ id: "a-task", title: "private to A" }], cards: [], quizHistory: [] };
response = await onRequestPut({ request: await makeRequest("PUT", "user_a", { payload: progressA, baseVersion: 0 }), env });
assert.equal(response.status, 201);
assert.equal((await body(response)).record.version, 1);
assert.deepEqual([...rows.keys()], ["user_a"], "the server stores only the signed subject as owner");
assert.equal(rows.get("user_a").payload.includes("a@example.test"), false, "email is not stored with learning progress");

response = await onRequestGet({ request: await makeRequest("GET", "user_b"), env });
assert.deepEqual(await body(response), { record: null }, "B cannot read A's progress");
const progressB = { tasks: [{ id: "b-task", title: "private to B" }], cards: [], quizHistory: [] };
response = await onRequestPut({ request: await makeRequest("PUT", "user_b", { payload: progressB, baseVersion: 0 }), env });
assert.equal(response.status, 201);
assert.deepEqual([...rows.keys()].sort(), ["user_a", "user_b"]);
response = await onRequestGet({ request: await makeRequest("GET", "user_a"), env });
assert.deepEqual((await body(response)).record.payload, progressA, "A reads only A's progress");
response = await onRequestGet({ request: await makeRequest("GET", "user_b"), env });
assert.deepEqual((await body(response)).record.payload, progressB, "B reads only B's progress");

response = await onRequestPut({ request: await makeRequest("PUT", "user_a", { payload: progressB, baseVersion: 0 }), env });
assert.equal(response.status, 409, "stale writes receive a conflict and cannot overwrite newer progress");
assert.equal((await body(response)).record.payload.tasks[0].title, "private to A");
response = await onRequestPut({ request: await makeRequest("PUT", "user_a", { payload: progressA, baseVersion: 1 }), env });
assert.equal(response.status, 200);
assert.equal((await body(response)).record.version, 2);

response = await onRequestDelete({ request: await makeRequest("DELETE", "user_a"), env });
assert.equal(response.status, 200);
assert.equal(rows.has("user_a"), false, "a signed-in user can delete their own cloud progress");
assert.equal(rows.has("user_b"), true, "deletion is owner-scoped");

response = await onRequestDeleteAccount({ request: await makeRequest("DELETE", "user_b", undefined, {}, "/api/account"), env });
assert.equal(response.status, 200, "account deletion accepts an authenticated, same-origin confirmation request");
assert.deepEqual(await body(response), { deleted: true, progressDeleted: true, sessionsRevoked: true, identityDeleted: true });
assert.equal(JSON.parse(rows.get("user_b").payload).__mindsparkDeletedAccount, true, "account deletion replaces progress with a minimum tombstone to reject stale JWTs");
assert.deepEqual(clerkDeletedUsers, ["user_b"], "account deletion calls Clerk only for the signed subject");
assert.deepEqual(revokedSessions, ["sess_user_b"], "account deletion explicitly revokes every active session");
response = await onRequestGet({ request: await makeRequest("GET", "user_b"), env });
assert.equal(response.status, 410, "stale signed JWTs cannot read progress after deletion");

// A missing development secret never erases data or sends a provider request.
await onRequestPut({ request: await makeRequest("PUT", "user_a", { payload: progressA, baseVersion: 0 }), env });
const providerCallCount = clerkDeletedUsers.length;
response = await onRequestDeleteAccount({ request: await makeRequest("DELETE", "user_a", undefined, {}, "/api/account"), env: { ...env, CLERK_SECRET_KEY: "" } });
assert.equal(response.status, 503);
assert.equal(rows.has("user_a"), true, "missing server credential preserves cloud progress");
assert.equal(clerkDeletedUsers.length, providerCallCount, "missing server credential never calls Clerk");

response = await onRequestDeleteAccount({ request: await makeRequest("DELETE", "user_a", undefined, { origin: "https://attacker.example" }, "/api/account"), env });
assert.equal(response.status, 403, "cross-origin account deletion is denied");
assert.equal(rows.has("user_a"), true);

clerkDeleteStatus = 503;
response = await onRequestDeleteAccount({ request: await makeRequest("DELETE", "user_a", undefined, {}, "/api/account"), env });
assert.equal(response.status, 502, "provider failure is reported as partial completion");
assert.equal(JSON.parse(rows.get("user_a").payload).__mindsparkDeletedAccount, true, "progress stays replaced with a tombstone even when identity deletion needs retry");
assert.match((await body(response)).error, /Cloud progress is deleted and account sync is blocked/i);
clerkDeleteStatus = 200;
response = await onRequestDeleteAccount({ request: await makeRequest("DELETE", "user_a", undefined, {}, "/api/account"), env });
assert.equal(response.status, 200, "valid deletion retries can finish provider cleanup after progress is tombstoned");
response = await onRequestPut({ request: await makeRequest("PUT", "user_a", { payload: progressA, baseVersion: 0 }), env });
assert.equal(response.status, 410, "stale session tokens cannot recreate a deleted user's progress");

globalThis.fetch = originalFetch;
console.log("D1 API authentication, owner isolation, CSRF, conflict handling, and deletion checks passed");
