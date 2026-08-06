import { z } from "zod";
import {
  PASSWORD_ITERATIONS,
  ensureAuthDatabase,
  getDatabase,
  getSession,
  newSalt,
  passwordHash,
  requireAdmin,
} from "../../lib/auth-server";
import { ACCESS_PERMISSIONS, normalizePermissions, parsePermissions } from "../../lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const permissionValue = z.enum(ACCESS_PERMISSIONS.map((permission) => permission.key) as [string, ...string[]]);
const username = z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dots, dashes, or underscores.");
const baseUser = z.object({
  username,
  displayName: z.string().trim().min(1).max(120),
  roleLabel: z.string().trim().min(1).max(120),
  active: z.boolean(),
  permissions: z.array(permissionValue).min(1).max(ACCESS_PERMISSIONS.length),
});
const payloadSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), data: baseUser.extend({ password: z.string().min(8).max(200) }) }),
  z.object({ action: z.literal("update"), id: z.number().int().positive(), data: baseUser.extend({ password: z.union([z.string().min(8).max(200), z.literal("")]) }) }),
]);

async function listUsers() {
  const db = getDatabase();
  const result = await db.prepare(`SELECT id, username, display_name AS displayName, role_label AS roleLabel,
      is_admin AS isAdmin, active, permissions_json AS permissionsJson, created_at AS createdAt, updated_at AS updatedAt
    FROM auth_users ORDER BY is_admin DESC, active DESC, display_name COLLATE NOCASE`).all<Record<string, unknown>>();
  return result.results.map((row) => ({
    id: Number(row.id),
    username: String(row.username ?? ""),
    displayName: String(row.displayName ?? ""),
    roleLabel: String(row.roleLabel ?? "Team Member"),
    isAdmin: Number(row.isAdmin) === 1,
    active: Number(row.active) === 1,
    permissions: Number(row.isAdmin) === 1 ? ACCESS_PERMISSIONS.map((permission) => permission.key) : parsePermissions(String(row.permissionsJson ?? "[]")),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  }));
}

function errorResponse(error: unknown) {
  const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid user data." : error instanceof Error ? error.message : "Unexpected error.";
  const duplicate = /UNIQUE constraint failed.*username/i.test(message);
  return Response.json({ error: duplicate ? "This username is already in use." : message }, { status: duplicate || error instanceof z.ZodError ? 400 : 500 });
}

export async function GET(request: Request) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;
    await ensureAuthDatabase();
    return Response.json({ users: await listUsers() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;
    await ensureAuthDatabase();
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    const payload = payloadSchema.parse(await request.json());
    const db = getDatabase();
    const permissions = JSON.stringify(normalizePermissions(payload.data.permissions));
    const duplicateUsername = await db.prepare("SELECT id FROM auth_users WHERE lower(username) = lower(?) AND id <> ?")
      .bind(payload.data.username, payload.action === "update" ? payload.id : 0).first<{ id: number }>();
    if (duplicateUsername) return Response.json({ error: "This username is already in use." }, { status: 400 });

    if (payload.action === "create") {
      const salt = newSalt();
      const hash = await passwordHash(payload.data.password, salt);
      await db.prepare(`INSERT INTO auth_users
        (username, display_name, role_label, password_hash, password_salt, password_iterations,
          is_admin, active, permissions_json, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`)
        .bind(payload.data.username, payload.data.displayName, payload.data.roleLabel, hash, salt,
          PASSWORD_ITERATIONS, payload.data.active ? 1 : 0, permissions, session.userId).run();
    } else {
      const existing = await db.prepare("SELECT is_admin AS isAdmin FROM auth_users WHERE id = ?").bind(payload.id).first<{ isAdmin: number }>();
      if (!existing) return Response.json({ error: "User account not found." }, { status: 404 });
      if (Number(existing.isAdmin) === 1) return Response.json({ error: "Update the administrator login from Settings." }, { status: 400 });
      if (payload.data.password) {
        const salt = newSalt();
        const hash = await passwordHash(payload.data.password, salt);
        await db.batch([
          db.prepare(`UPDATE auth_users SET username = ?, display_name = ?, role_label = ?, active = ?,
            permissions_json = ?, password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .bind(payload.data.username, payload.data.displayName, payload.data.roleLabel, payload.data.active ? 1 : 0,
              permissions, hash, salt, PASSWORD_ITERATIONS, payload.id),
          db.prepare("DELETE FROM auth_user_sessions WHERE user_id = ?").bind(payload.id),
        ]);
      } else {
        await db.prepare(`UPDATE auth_users SET username = ?, display_name = ?, role_label = ?, active = ?,
          permissions_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .bind(payload.data.username, payload.data.displayName, payload.data.roleLabel, payload.data.active ? 1 : 0, permissions, payload.id).run();
      }
    }

    return Response.json({ users: await listUsers() });
  } catch (error) {
    return errorResponse(error);
  }
}
