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
  type AuthSession,
} from "../../lib/auth-server";
import { ALL_ACCESS_PERMISSIONS, effectivePermissions, parsePermissions } from "../../lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function sessionPayload(session: AuthSession) {
  return {
    authenticated: true,
    userId: session.userId,
    username: session.username,
    displayName: session.displayName,
    roleLabel: session.roleLabel,
    isAdmin: session.isAdmin,
    permissions: session.permissions,
    employeeId: session.employeeId,
    clientId: session.clientId,
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid credentials." : error instanceof Error ? error.message : "Unexpected error.";
  const duplicate = /UNIQUE constraint failed.*username/i.test(message);
  return Response.json({ error: duplicate ? "This username is already in use." : message }, { status: duplicate || error instanceof z.ZodError ? 400 : 500 });
}

export async function GET(request: Request) {
  try {
    await ensureAuthDatabase();
    const db = getDatabase();
    const credential = await db.prepare("SELECT id FROM auth_users LIMIT 1").first<{ id: number }>();
    const session = credential ? await getSession(request) : null;
    return Response.json({ setupRequired: !credential, authenticated: Boolean(session), ...(session ? sessionPayload(session) : {}) });
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
      const existing = await db.prepare("SELECT id FROM auth_users LIMIT 1").first();
      if (existing) return Response.json({ error: "The administrator account is already configured." }, { status: 409 });
      const salt = newSalt();
      const hash = await passwordHash(payload.password, salt);
      await db.prepare(`INSERT INTO auth_users
        (id, username, display_name, role_label, password_hash, password_salt, password_iterations, is_admin, active, permissions_json)
        VALUES (1, ?, 'Administrator', 'Administrator', ?, ?, ?, 1, 1, '[]')`)
        .bind(payload.username, hash, salt, PASSWORD_ITERATIONS).run();
      const cookie = await createSession(request, 1);
      return Response.json(sessionPayload({
        userId: 1,
        username: payload.username,
        displayName: "Administrator",
        roleLabel: "Administrator",
        isAdmin: true,
        permissions: ALL_ACCESS_PERMISSIONS,
        employeeId: null,
        clientId: null,
      }), { status: 201, headers: { "set-cookie": cookie } });
    }

    if (payload.action === "login") {
      const attemptKey = loginAttemptKey(request, payload.username);
      const limit = await checkRateLimit(attemptKey);
      if (!limit.allowed) return Response.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: { "retry-after": String(limit.retryAfter) } });
      const credential = await db.prepare(`SELECT id, username, password_hash AS passwordHash,
          password_salt AS passwordSalt, password_iterations AS passwordIterations
        FROM auth_users WHERE username = ? COLLATE NOCASE AND active = 1`)
        .bind(payload.username).first<{ id: number; username: string; passwordHash: string; passwordSalt: string; passwordIterations: number }>();
      const candidate = credential ? await passwordHash(payload.password, credential.passwordSalt, credential.passwordIterations) : await passwordHash(payload.password, newSalt());
      if (!credential || !secureEqual(candidate, credential.passwordHash)) {
        await recordFailedLogin(attemptKey);
        return Response.json({ error: "Incorrect username or password." }, { status: 401 });
      }
      await clearLoginAttempts(attemptKey);
      const cookie = await createSession(request, credential.id);
      const session = await db.prepare(`SELECT id AS userId, username, display_name AS displayName, role_label AS roleLabel,
          is_admin AS isAdmin, permissions_json AS permissionsJson, employee_id AS employeeId, client_id AS clientId FROM auth_users WHERE id = ?`)
        .bind(credential.id).first<{ userId: number; username: string; displayName: string; roleLabel: string; isAdmin: number; permissionsJson: string; employeeId: number | null; clientId: number | null }>();
      const authenticated: AuthSession = {
        userId: credential.id,
        username: credential.username,
        displayName: session?.displayName ?? credential.username,
        roleLabel: session?.roleLabel ?? "Team Member",
        isAdmin: Number(session?.isAdmin) === 1,
        permissions: effectivePermissions(
          parsePermissions(session?.permissionsJson ?? "[]"),
          session?.roleLabel ?? "Team Member",
          Number(session?.isAdmin) === 1,
        ),
        employeeId: session?.employeeId === null || session?.employeeId === undefined ? null : Number(session.employeeId),
        clientId: session?.clientId === null || session?.clientId === undefined ? null : Number(session.clientId),
      };
      return Response.json(sessionPayload(authenticated), { headers: { "set-cookie": cookie } });
    }

    if (payload.action === "logout") {
      await removeCurrentSession(request);
      return Response.json({ authenticated: false }, { headers: { "set-cookie": expiredSessionCookie(request) } });
    }

    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required.", code: "AUTH_REQUIRED" }, { status: 401 });
    if (session.clientId !== null) return Response.json({ error: "Client login credentials can only be changed by an administrator." }, { status: 403 });
    const credential = await db.prepare("SELECT password_hash AS passwordHash, password_salt AS passwordSalt, password_iterations AS passwordIterations FROM auth_users WHERE id = ?")
      .bind(session.userId).first<{ passwordHash: string; passwordSalt: string; passwordIterations: number }>();
    if (!credential) return Response.json({ error: "User account not found." }, { status: 404 });
    const currentHash = await passwordHash(payload.currentPassword, credential.passwordSalt, credential.passwordIterations);
    if (!secureEqual(currentHash, credential.passwordHash)) return Response.json({ error: "Current password is incorrect." }, { status: 401 });
    const nextUsername = session.isAdmin ? payload.newUsername : session.username;
    const duplicateUsername = await db.prepare("SELECT id FROM auth_users WHERE lower(username) = lower(?) AND id <> ?")
      .bind(nextUsername, session.userId).first<{ id: number }>();
    if (duplicateUsername) return Response.json({ error: "This username is already in use." }, { status: 400 });
    const salt = payload.newPassword ? newSalt() : credential.passwordSalt;
    const hash = payload.newPassword ? await passwordHash(payload.newPassword, salt) : credential.passwordHash;
    const iterations = payload.newPassword ? PASSWORD_ITERATIONS : credential.passwordIterations;
    await db.batch([
      db.prepare("UPDATE auth_users SET username = ?, password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(nextUsername, hash, salt, iterations, session.userId),
      db.prepare("DELETE FROM auth_user_sessions WHERE user_id = ?").bind(session.userId),
    ]);
    const cookie = await createSession(request, session.userId);
    return Response.json({ ...sessionPayload({ ...session, username: nextUsername }), username: nextUsername }, { headers: { "set-cookie": cookie } });
  } catch (error) {
    return errorResponse(error);
  }
}
