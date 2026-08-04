import { z } from "zod";
import {
  PASSWORD_ITERATIONS,
  checkRateLimit,
  clearLoginAttempts,
  createSession,
  ensureAuthDatabase,
  expiredSessionCookie,
  getDatabase,
  getSession,
  loginAttemptKey,
  newSalt,
  passwordHash,
  recordFailedLogin,
  removeCurrentSession,
  secureEqual,
} from "../../lib/auth-server";

export const dynamic = "force-dynamic";

const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dots, dashes, or underscores."),
  password: z.string().min(8).max(200),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup"), ...credentialsSchema.shape }),
  z.object({ action: z.literal("login"), username: z.string().trim().min(1).max(80), password: z.string().min(1).max(200) }),
  z.object({ action: z.literal("logout") }),
  z.object({
    action: z.literal("change"),
    currentPassword: z.string().min(1).max(200),
    newUsername: credentialsSchema.shape.username,
    newPassword: z.union([z.string().min(8).max(200), z.literal("")]),
  }),
]);

function errorResponse(error: unknown) {
  const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid credentials." : error instanceof Error ? error.message : "Unexpected error.";
  return Response.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
}

export async function GET(request: Request) {
  try {
    await ensureAuthDatabase();
    const db = getDatabase();
    const credential = await db.prepare("SELECT username FROM auth_credentials WHERE id = 1").first<{ username: string }>();
    const session = credential ? await getSession(request) : null;
    return Response.json({ setupRequired: !credential, authenticated: Boolean(session), username: session?.username ?? "" });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureAuthDatabase();
    const db = getDatabase();
    const payload = actionSchema.parse(await request.json());

    if (payload.action === "setup") {
      const existing = await db.prepare("SELECT id FROM auth_credentials WHERE id = 1").first();
      if (existing) return Response.json({ error: "The administrator account is already configured." }, { status: 409 });
      const salt = newSalt();
      const hash = await passwordHash(payload.password, salt);
      await db.prepare("INSERT INTO auth_credentials (id, username, password_hash, password_salt, password_iterations) VALUES (1, ?, ?, ?, ?)")
        .bind(payload.username, hash, salt, PASSWORD_ITERATIONS).run();
      const cookie = await createSession(request);
      return Response.json({ authenticated: true, username: payload.username }, { status: 201, headers: { "set-cookie": cookie } });
    }

    if (payload.action === "login") {
      const attemptKey = loginAttemptKey(request, payload.username);
      const limit = await checkRateLimit(attemptKey);
      if (!limit.allowed) return Response.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: { "retry-after": String(limit.retryAfter) } });
      const credential = await db.prepare("SELECT username, password_hash AS passwordHash, password_salt AS passwordSalt, password_iterations AS passwordIterations FROM auth_credentials WHERE username = ? COLLATE NOCASE")
        .bind(payload.username).first<{ username: string; passwordHash: string; passwordSalt: string; passwordIterations: number }>();
      const candidate = credential ? await passwordHash(payload.password, credential.passwordSalt, credential.passwordIterations) : await passwordHash(payload.password, newSalt());
      if (!credential || !secureEqual(candidate, credential.passwordHash)) {
        await recordFailedLogin(attemptKey);
        return Response.json({ error: "Incorrect username or password." }, { status: 401 });
      }
      await clearLoginAttempts(attemptKey);
      const cookie = await createSession(request);
      return Response.json({ authenticated: true, username: credential.username }, { headers: { "set-cookie": cookie } });
    }

    if (payload.action === "logout") {
      await removeCurrentSession(request);
      return Response.json({ authenticated: false }, { headers: { "set-cookie": expiredSessionCookie(request) } });
    }

    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required.", code: "AUTH_REQUIRED" }, { status: 401 });
    const credential = await db.prepare("SELECT password_hash AS passwordHash, password_salt AS passwordSalt, password_iterations AS passwordIterations FROM auth_credentials WHERE id = 1")
      .first<{ passwordHash: string; passwordSalt: string; passwordIterations: number }>();
    if (!credential) return Response.json({ error: "Administrator account not found." }, { status: 404 });
    const currentHash = await passwordHash(payload.currentPassword, credential.passwordSalt, credential.passwordIterations);
    if (!secureEqual(currentHash, credential.passwordHash)) return Response.json({ error: "Current password is incorrect." }, { status: 401 });
    const salt = payload.newPassword ? newSalt() : credential.passwordSalt;
    const hash = payload.newPassword ? await passwordHash(payload.newPassword, salt) : credential.passwordHash;
    await db.batch([
      db.prepare("UPDATE auth_credentials SET username = ?, password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1")
        .bind(payload.newUsername, hash, salt, PASSWORD_ITERATIONS),
      db.prepare("DELETE FROM auth_sessions"),
    ]);
    const cookie = await createSession(request);
    return Response.json({ authenticated: true, username: payload.newUsername }, { headers: { "set-cookie": cookie } });
  } catch (error) {
    return errorResponse(error);
  }
}
