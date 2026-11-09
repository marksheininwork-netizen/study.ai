import { authenticate } from "../_lib/auth.js";

const MAX_BYTES = 512 * 1024;
const MAX_LIST = 1000;
const LIST_FIELDS = ["cards", "tasks", "quizHistory", "academyHistory", "mathHistory", "focusSessions"];
const DATA_FIELDS = [...LIST_FIELDS, "cardStats", "gameBest", "essayChecks", "createdAt"];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", "Vary": "Authorization, Origin" } });
}
function database(env) { return env.MINDSPARK_DB || env.DB; }
function databaseMissing(env) {
  return !database(env) || !env.MINDSPARK_APP_ORIGIN;
}
function sameOrigin(request, env) {
  return request.headers.get("Origin") === env.MINDSPARK_APP_ORIGIN && new URL(request.url).origin === env.MINDSPARK_APP_ORIGIN;
}
function cleanPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).some((key) => !DATA_FIELDS.includes(key))) return false;
  for (const key of LIST_FIELDS) {
    if (value[key] !== undefined && (!Array.isArray(value[key]) || value[key].length > MAX_LIST)) return false;
  }
  if (value.cardStats !== undefined && (!value.cardStats || !Number.isSafeInteger(value.cardStats.reviews) || !Number.isSafeInteger(value.cardStats.known) || value.cardStats.reviews < value.cardStats.known || value.cardStats.known < 0)) return false;
  for (const key of ["gameBest", "essayChecks"]) if (value[key] !== undefined && (!Number.isSafeInteger(value[key]) || value[key] < 0)) return false;
  return true;
}
async function rowFor(env, userId) {
  const row = await database(env).prepare("SELECT payload, version, updated_at FROM mindspark_progress WHERE user_id = ?").bind(userId).first();
  if (!row) return null;
  return { payload: JSON.parse(row.payload), version: row.version, updatedAt: row.updated_at };
}
function requiredConfig(env) {
  return !databaseMissing(env) && Boolean(env.CLERK_ISSUER && env.CLERK_JWKS_URL);
}

export async function onRequestGet({ request, env }) {
  if (!requiredConfig(env)) return json({ error: "Cloud sync is not configured yet. Guest mode still works on this device." }, 503);
  const auth = await authenticate(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status);
  try { return json({ record: await rowFor(env, auth.userId) }); }
  catch { return json({ error: "Could not load saved progress. Your device copy remains safe." }, 503); }
}

export async function onRequestPut({ request, env }) {
  if (!requiredConfig(env)) return json({ error: "Cloud sync is not configured yet. Guest mode still works on this device." }, 503);
  if (!sameOrigin(request, env)) return json({ error: "This request could not be verified. Refresh and try again." }, 403);
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) return json({ error: "A JSON progress backup is required." }, 415);
  const auth = await authenticate(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status);
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BYTES) return json({ error: "This progress record is too large to sync. Export a backup to keep it safe." }, 413);
  let input;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BYTES) return json({ error: "This progress record is too large to sync. Export a backup to keep it safe." }, 413);
    input = JSON.parse(body);
  } catch { return json({ error: "Progress could not be read. Your device copy remains safe." }, 400); }
  if (!input || Object.keys(input).some((key) => !["payload", "baseVersion"].includes(key)) || !cleanPayload(input.payload)) return json({ error: "Progress data has an unsupported format." }, 400);
  const baseVersion = input.baseVersion;
  if (baseVersion !== null && (!Number.isSafeInteger(baseVersion) || baseVersion < 0)) return json({ error: "Sync version is invalid." }, 400);
  const serialized = JSON.stringify(input.payload);
  if (new TextEncoder().encode(serialized).byteLength > MAX_BYTES) return json({ error: "This progress record is too large to sync. Export a backup to keep it safe." }, 413);
  const timestamp = new Date().toISOString();
  try {
    if (baseVersion === null || baseVersion === 0) {
      const inserted = await database(env).prepare("INSERT OR IGNORE INTO mindspark_progress (user_id, payload, version, updated_at) VALUES (?, ?, 1, ?)").bind(auth.userId, serialized, timestamp).run();
      if (inserted.meta?.changes === 1) return json({ record: { payload: input.payload, version: 1, updatedAt: timestamp } }, 201);
    } else {
      const updated = await database(env).prepare("UPDATE mindspark_progress SET payload = ?, version = version + 1, updated_at = ? WHERE user_id = ? AND version = ?").bind(serialized, timestamp, auth.userId, baseVersion).run();
      if (updated.meta?.changes === 1) return json({ record: { payload: input.payload, version: baseVersion + 1, updatedAt: timestamp } });
    }
    return json({ error: "Progress changed on another device. Merge the latest copy and retry.", conflict: true, record: await rowFor(env, auth.userId) }, 409);
  } catch { return json({ error: "Sync could not reach the development database. Your device copy remains safe." }, 503); }
}

export async function onRequestDelete({ request, env }) {
  if (!requiredConfig(env)) return json({ error: "Cloud sync is not configured yet. Guest mode still works on this device." }, 503);
  if (!sameOrigin(request, env)) return json({ error: "This request could not be verified." }, 403);
  const auth = await authenticate(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status);
  try {
    await database(env).prepare("DELETE FROM mindspark_progress WHERE user_id = ?").bind(auth.userId).run();
    return json({ deleted: true });
  } catch { return json({ error: "Cloud progress could not be deleted right now." }, 503); }
}
