import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { onRequestGet, onRequestPut, onRequestDelete } from "../functions/api/progress.js";
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
globalThis.fetch = async (url) => {
  assert.equal(String(url), jwksUrl);
  return Response.json({ keys: [jwk] });
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
        throw new Error("Unexpected SQL: " + sql);
      },
    };
    return statement;
  },
};
const env = { DB, CLERK_ISSUER: issuer, CLERK_JWKS_URL: jwksUrl, MINDSPARK_APP_ORIGIN: origin };
const makeRequest = async (method, subject, body, options = {}) => new Request(origin + "/api/progress", {
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

globalThis.fetch = originalFetch;
console.log("D1 API authentication, owner isolation, CSRF, conflict handling, and deletion checks passed");
