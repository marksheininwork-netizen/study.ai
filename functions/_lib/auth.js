const JWKS_TTL_MS = 10 * 60 * 1000;
let keyCache = new Map();

function decodeSegment(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJson(value) {
  return JSON.parse(new TextDecoder().decode(decodeSegment(value)));
}

async function getSigningKey(jwksUrl, kid, forceRefresh = false) {
  const cached = keyCache.get(jwksUrl);
  if (!forceRefresh && cached && cached.expiresAt > Date.now() && cached.keys.has(kid)) return cached.keys.get(kid);
  const response = await fetch(jwksUrl, { headers: { Accept: "application/json" }, cf: { cacheTtl: 600 } });
  if (!response.ok) throw new Error("Unable to load authentication keys");
  const document = await response.json();
  const keys = new Map((Array.isArray(document.keys) ? document.keys : []).filter((key) => key.kty === "RSA" && key.use === "sig" && key.alg === "RS256" && key.kid).map((key) => [key.kid, key]));
  keyCache.set(jwksUrl, { keys, expiresAt: Date.now() + JWKS_TTL_MS });
  return keys.get(kid) || null;
}

export async function verifySessionToken(token, env, now = Date.now()) {
  if (typeof token !== "string" || token.length > 8192) return null;
  const [encodedHeader, encodedPayload, encodedSignature, ...extra] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature || extra.length) return null;
  let header, claims;
  try {
    header = decodeJson(encodedHeader);
    claims = decodeJson(encodedPayload);
  } catch { return null; }
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !env.CLERK_ISSUER || !env.CLERK_JWKS_URL || !env.MINDSPARK_APP_ORIGIN) return null;
  const issuer = String(env.CLERK_ISSUER).replace(/\/$/, "");
  const origin = String(env.MINDSPARK_APP_ORIGIN).replace(/\/$/, "");
  const seconds = Math.floor(now / 1000);
  if (claims.iss !== issuer || typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255) return null;
  if (claims.azp !== origin || !Number.isFinite(claims.exp) || claims.exp <= seconds || (Number.isFinite(claims.nbf) && claims.nbf > seconds)) return null;
  if (Number.isFinite(claims.iat) && claims.iat > seconds + 60) return null;
  try {
    let jwk = await getSigningKey(env.CLERK_JWKS_URL, header.kid);
    if (!jwk) jwk = await getSigningKey(env.CLERK_JWKS_URL, header.kid, true);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const signed = new TextEncoder().encode(encodedHeader + "." + encodedPayload);
    const valid = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, decodeSegment(encodedSignature), signed);
    return valid ? claims : null;
  } catch { return null; }
}

export async function authenticate(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization);
  if (!match) return { error: "Sign in to sync your progress.", status: 401 };
  if (!env.MINDSPARK_APP_ORIGIN || !env.CLERK_ISSUER || !env.CLERK_JWKS_URL || !(env.MINDSPARK_DB || env.DB)) {
    return { error: "Cloud sync is not configured yet. Your device copy remains available.", status: 503 };
  }
  const claims = await verifySessionToken(match[1], env);
  if (!claims) return { error: "Your sign-in expired. Sign in again to sync.", status: 401 };
  return { userId: claims.sub };
}

export function clearAuthKeyCacheForTests() {
  keyCache = new Map();
}
