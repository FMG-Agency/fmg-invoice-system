import { env } from "cloudflare:workers";

type AppEnv = { DB: D1Database };
const runtime = env as unknown as AppEnv;

const COOKIE_NAME = "fmg_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
// Cloudflare Workers Web Crypto accepts PBKDF2 iteration counts up to 100,000.
export const PASSWORD_ITERATIONS = 100_000;

const authSchema = [
  `CREATE TABLE IF NOT EXISTS auth_credentials (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_iterations INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES auth_credentials(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS auth_attempts (
    attempt_key TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    reset_at INTEGER NOT NULL
  )`,
];

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBytes(input: string) {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function randomBase64(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

export async function passwordHash(password: string, saltBase64: string, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: base64ToBytes(saltBase64), iterations },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(result));
}

export function newSalt() {
  return randomBase64(24);
}

export function secureEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  return difference === 0;
}

export async function ensureAuthDatabase() {
  if (!runtime.DB) throw new Error("Database binding is unavailable.");
  await runtime.DB.batch(authSchema.map((statement) => runtime.DB.prepare(statement)));
  await runtime.DB.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(Math.floor(Date.now() / 1000)).run();
}

export function getDatabase() {
  return runtime.DB;
}

function cookieValue(request: Request) {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(value.join("="));
  }
  return "";
}

function sessionCookie(request: Request, token: string, maxAge = SESSION_SECONDS) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function expiredSessionCookie(request: Request) {
  return sessionCookie(request, "", 0);
}

export async function createSession(request: Request) {
  const token = randomBase64(32);
  const tokenHash = await sha256(token);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  await runtime.DB.prepare("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, 1, ?)").bind(tokenHash, expiresAt).run();
  return sessionCookie(request, token);
}

export async function removeCurrentSession(request: Request) {
  const token = cookieValue(request);
  if (token) await runtime.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function getSession(request: Request) {
  await ensureAuthDatabase();
  const token = cookieValue(request);
  if (!token) return null;
  return runtime.DB.prepare(`SELECT c.username
    FROM auth_sessions s
    JOIN auth_credentials c ON c.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`)
    .bind(await sha256(token), Math.floor(Date.now() / 1000))
    .first<{ username: string }>();
}

export async function requireAuth(request: Request) {
  const session = await getSession(request);
  if (session) return null;
  return Response.json({ error: "Authentication required.", code: "AUTH_REQUIRED" }, { status: 401, headers: { "set-cookie": expiredSessionCookie(request) } });
}

export function loginAttemptKey(request: Request, username: string) {
  const address = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return `${address}:${username.toLowerCase()}`;
}

export async function checkRateLimit(key: string) {
  const now = Math.floor(Date.now() / 1000);
  const row = await runtime.DB.prepare("SELECT attempts, reset_at AS resetAt FROM auth_attempts WHERE attempt_key = ?").bind(key).first<{ attempts: number; resetAt: number }>();
  if (!row || row.resetAt <= now) return { allowed: true, retryAfter: 0 };
  return { allowed: row.attempts < 5, retryAfter: Math.max(1, row.resetAt - now) };
}

export async function recordFailedLogin(key: string) {
  const resetAt = Math.floor(Date.now() / 1000) + 15 * 60;
  await runtime.DB.prepare(`INSERT INTO auth_attempts (attempt_key, attempts, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(attempt_key) DO UPDATE SET
      attempts = CASE WHEN auth_attempts.reset_at <= ? THEN 1 ELSE auth_attempts.attempts + 1 END,
      reset_at = CASE WHEN auth_attempts.reset_at <= ? THEN excluded.reset_at ELSE auth_attempts.reset_at END`)
    .bind(key, resetAt, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).run();
}

export async function clearLoginAttempts(key: string) {
  await runtime.DB.prepare("DELETE FROM auth_attempts WHERE attempt_key = ?").bind(key).run();
}
