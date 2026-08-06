import { database } from "./database";
import { ALL_ACCESS_PERMISSIONS, canAccess, parsePermissions, type AccessPermission } from "./permissions";

const COOKIE_NAME = "fmg_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
let authDatabaseReady: Promise<void> | null = null;
// Cloudflare Workers Web Crypto accepts PBKDF2 iteration counts up to 100,000.
export const PASSWORD_ITERATIONS = 100_000;

export type AuthSession = {
  userId: number;
  username: string;
  displayName: string;
  roleLabel: string;
  isAdmin: boolean;
  permissions: AccessPermission[];
};

const authSchema = [
  // Legacy tables remain available so the existing administrator can be migrated without a password reset.
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
  `CREATE TABLE IF NOT EXISTS auth_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL DEFAULT '',
    role_label TEXT NOT NULL DEFAULT 'Team Member',
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_iterations INTEGER NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    permissions_json TEXT NOT NULL DEFAULT '[]',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS auth_user_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS auth_attempts (
    attempt_key TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    reset_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_user_sessions_expires_at ON auth_user_sessions(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_users_active ON auth_users(active)`,
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

async function initializeAuthDatabase() {
  await database.batch(authSchema.map((statement) => database.prepare(statement)));
  await database.batch([
    database.prepare(`INSERT OR IGNORE INTO auth_users
      (id, username, display_name, role_label, password_hash, password_salt, password_iterations,
        is_admin, active, permissions_json, created_at, updated_at)
      SELECT id, username, 'Administrator', 'Administrator', password_hash, password_salt,
        password_iterations, 1, 1, '[]', created_at, updated_at
      FROM auth_credentials WHERE id = 1`),
    database.prepare(`INSERT OR IGNORE INTO auth_user_sessions (token_hash, user_id, expires_at, created_at)
      SELECT token_hash, user_id, expires_at, created_at FROM auth_sessions
      WHERE user_id IN (SELECT id FROM auth_users)`),
    database.prepare("DELETE FROM auth_sessions"),
  ]);
  const now = Math.floor(Date.now() / 1000);
  await database.batch([
    database.prepare("DELETE FROM auth_user_sessions WHERE expires_at <= ?").bind(now),
  ]);
}

export async function ensureAuthDatabase() {
  authDatabaseReady ??= initializeAuthDatabase();
  try {
    await authDatabaseReady;
  } catch (error) {
    authDatabaseReady = null;
    throw error;
  }
}

export function getDatabase() {
  return database;
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

export async function createSession(request: Request, userId: number) {
  const token = randomBase64(32);
  const tokenHash = await sha256(token);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  await database.prepare("INSERT INTO auth_user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(tokenHash, userId, expiresAt).run();
  return sessionCookie(request, token);
}

export async function removeCurrentSession(request: Request) {
  const token = cookieValue(request);
  if (token) await database.prepare("DELETE FROM auth_user_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function getSession(request: Request): Promise<AuthSession | null> {
  await ensureAuthDatabase();
  const token = cookieValue(request);
  if (!token) return null;
  const row = await database.prepare(`SELECT u.id AS userId, u.username, u.display_name AS displayName,
      u.role_label AS roleLabel, u.is_admin AS isAdmin, u.permissions_json AS permissionsJson
    FROM auth_user_sessions s
    JOIN auth_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`)
    .bind(await sha256(token), Math.floor(Date.now() / 1000))
    .first<{ userId: number; username: string; displayName: string; roleLabel: string; isAdmin: number; permissionsJson: string }>();
  if (!row) return null;
  const isAdmin = Number(row.isAdmin) === 1;
  return {
    userId: Number(row.userId),
    username: row.username,
    displayName: row.displayName,
    roleLabel: row.roleLabel,
    isAdmin,
    permissions: isAdmin ? ALL_ACCESS_PERMISSIONS : parsePermissions(row.permissionsJson),
  };
}

function authRequired(request: Request) {
  return Response.json({ error: "Authentication required.", code: "AUTH_REQUIRED" }, { status: 401, headers: { "set-cookie": expiredSessionCookie(request) } });
}

function accessDenied() {
  return Response.json({ error: "You do not have access to this area.", code: "ACCESS_DENIED" }, { status: 403 });
}

export async function requireAuth(request: Request) {
  const session = await getSession(request);
  return session ? null : authRequired(request);
}

export async function requirePermission(request: Request, permission: AccessPermission) {
  const session = await getSession(request);
  if (!session) return authRequired(request);
  return canAccess(session.permissions, permission, session.isAdmin) ? null : accessDenied();
}

export async function requireAnyPermission(request: Request, permissions: AccessPermission[]) {
  const session = await getSession(request);
  if (!session) return authRequired(request);
  return session.isAdmin || permissions.some((permission) => session.permissions.includes(permission)) ? null : accessDenied();
}

export async function requireAdmin(request: Request) {
  const session = await getSession(request);
  if (!session) return authRequired(request);
  return session.isAdmin ? null : accessDenied();
}

export function loginAttemptKey(request: Request, username: string) {
  const address = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return `${address}:${username.toLowerCase()}`;
}

export async function checkRateLimit(key: string) {
  const now = Math.floor(Date.now() / 1000);
  const row = await database.prepare("SELECT attempts, reset_at AS resetAt FROM auth_attempts WHERE attempt_key = ?").bind(key).first<{ attempts: number; resetAt: number }>();
  if (!row || row.resetAt <= now) return { allowed: true, retryAfter: 0 };
  return { allowed: row.attempts < 5, retryAfter: Math.max(1, row.resetAt - now) };
}

export async function recordFailedLogin(key: string) {
  const resetAt = Math.floor(Date.now() / 1000) + 15 * 60;
  await database.prepare(`INSERT INTO auth_attempts (attempt_key, attempts, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(attempt_key) DO UPDATE SET
      attempts = CASE WHEN auth_attempts.reset_at <= ? THEN 1 ELSE auth_attempts.attempts + 1 END,
      reset_at = CASE WHEN auth_attempts.reset_at <= ? THEN excluded.reset_at ELSE auth_attempts.reset_at END`)
    .bind(key, resetAt, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).run();
}

export async function clearLoginAttempts(key: string) {
  await database.prepare("DELETE FROM auth_attempts WHERE attempt_key = ?").bind(key).run();
}
