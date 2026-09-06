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
import { ACCESS_PERMISSIONS, effectivePermissions, normalizePermissions, parsePermissions } from "../../lib/permissions";
import { ensureHrDatabase } from "../../lib/hr";

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
  employeeId: z.number().int().positive().nullable(),
  clientId: z.number().int().positive().nullable(),
});
const payloadSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), data: baseUser.extend({ password: z.string().min(8).max(200) }) }),
  z.object({ action: z.literal("update"), id: z.number().int().positive(), data: baseUser.extend({ password: z.union([z.string().min(8).max(200), z.literal("")]) }) }),
]);

async function listUsers() {
  const db = getDatabase();
  const result = await db.prepare(`SELECT u.id, u.username, u.display_name AS displayName, u.role_label AS roleLabel,
      u.is_admin AS isAdmin, u.active, u.permissions_json AS permissionsJson, u.employee_id AS employeeId,
      COALESCE(e.name, '') AS employeeName, u.client_id AS clientId,
      COALESCE(c.company_name, c.name, '') AS clientName, u.created_at AS createdAt, u.updated_at AS updatedAt
    FROM auth_users u
    LEFT JOIN employees e ON e.id = u.employee_id
    LEFT JOIN clients c ON c.id = u.client_id
    ORDER BY u.is_admin DESC, u.active DESC, u.display_name COLLATE NOCASE`).all<Record<string, unknown>>();
  return result.results.map((row) => {
    const permissions = effectivePermissions(
      parsePermissions(String(row.permissionsJson ?? "[]")),
      String(row.roleLabel ?? "Team Member"),
      Number(row.isAdmin) === 1,
    );
    if ((row.clientId === null || row.clientId === undefined) && !permissions.includes("tasks")) permissions.push("tasks");
    return {
      id: Number(row.id),
      username: String(row.username ?? ""),
      displayName: String(row.displayName ?? ""),
      roleLabel: String(row.roleLabel ?? "Team Member"),
      isAdmin: Number(row.isAdmin) === 1,
      active: Number(row.active) === 1,
      permissions,
      employeeId: row.employeeId === null || row.employeeId === undefined ? null : Number(row.employeeId),
      employeeName: String(row.employeeName ?? ""),
      clientId: row.clientId === null || row.clientId === undefined ? null : Number(row.clientId),
      clientName: String(row.clientName ?? ""),
      createdAt: String(row.createdAt ?? ""),
      updatedAt: String(row.updatedAt ?? ""),
    };
  });
}

async function listEmployees() {
  const result = await getDatabase().prepare("SELECT id, name, title, department FROM employees WHERE active = 1 ORDER BY name COLLATE NOCASE").all<Record<string, unknown>>();
  return result.results.map((row) => ({ id: Number(row.id), name: String(row.name ?? ""), title: String(row.title ?? ""), department: String(row.department ?? "") }));
}

async function listClients() {
  const result = await getDatabase().prepare(`SELECT id, name, company_name AS companyName, owner_name AS ownerName
    FROM clients ORDER BY company_name COLLATE NOCASE, name COLLATE NOCASE`).all<Record<string, unknown>>();
  return result.results.map((row) => ({
    id: Number(row.id),
    name: String(row.name ?? ""),
    companyName: String(row.companyName ?? ""),
    ownerName: String(row.ownerName ?? ""),
  }));
}

function errorResponse(error: unknown) {
  const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid user data." : error instanceof Error ? error.message : "Unexpected error.";
  const duplicateUsername = /UNIQUE constraint failed.*username/i.test(message);
  const duplicateEmployee = /UNIQUE constraint failed.*employee_id/i.test(message);
  const duplicateClient = /UNIQUE constraint failed.*client_id/i.test(message);
  return Response.json({ error: duplicateUsername ? "This username is already in use." : duplicateEmployee ? "This employee is already linked to another user." : duplicateClient ? "This client already has a portal user." : message }, { status: duplicateUsername || duplicateEmployee || duplicateClient || error instanceof z.ZodError ? 400 : 500 });
}

export async function GET(request: Request) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;
    await ensureAuthDatabase();
    await ensureHrDatabase();
    return Response.json({ users: await listUsers(), employees: await listEmployees(), clients: await listClients() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;
    await ensureAuthDatabase();
    await ensureHrDatabase();
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    const payload = payloadSchema.parse(await request.json());
    if (payload.data.employeeId && payload.data.clientId) return Response.json({ error: "A user can be linked to an employee or a client, not both." }, { status: 400 });
    if (payload.data.clientId && (payload.data.permissions.length !== 1 || payload.data.permissions[0] !== "client_portal")) {
      return Response.json({ error: "Client users can only access their own Client Portal." }, { status: 400 });
    }
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
          is_admin, active, permissions_json, employee_id, client_id, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`)
        .bind(payload.data.username, payload.data.displayName, payload.data.roleLabel, hash, salt,
          PASSWORD_ITERATIONS, payload.data.active ? 1 : 0, permissions, payload.data.employeeId, payload.data.clientId, session.userId).run();
    } else {
      const existing = await db.prepare("SELECT is_admin AS isAdmin FROM auth_users WHERE id = ?").bind(payload.id).first<{ isAdmin: number }>();
      if (!existing) return Response.json({ error: "User account not found." }, { status: 404 });
      if (Number(existing.isAdmin) === 1) return Response.json({ error: "Update the administrator login from Settings." }, { status: 400 });
      if (payload.data.password) {
        const salt = newSalt();
        const hash = await passwordHash(payload.data.password, salt);
        await db.batch([
          db.prepare(`UPDATE auth_users SET username = ?, display_name = ?, role_label = ?, active = ?,
            permissions_json = ?, employee_id = ?, client_id = ?, password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .bind(payload.data.username, payload.data.displayName, payload.data.roleLabel, payload.data.active ? 1 : 0,
              permissions, payload.data.employeeId, payload.data.clientId, hash, salt, PASSWORD_ITERATIONS, payload.id),
          db.prepare("DELETE FROM auth_user_sessions WHERE user_id = ?").bind(payload.id),
        ]);
      } else {
        await db.prepare(`UPDATE auth_users SET username = ?, display_name = ?, role_label = ?, active = ?,
          permissions_json = ?, employee_id = ?, client_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .bind(payload.data.username, payload.data.displayName, payload.data.roleLabel, payload.data.active ? 1 : 0, permissions, payload.data.employeeId, payload.data.clientId, payload.id).run();
      }
    }

    return Response.json({ users: await listUsers(), employees: await listEmployees(), clients: await listClients() });
  } catch (error) {
    return errorResponse(error);
  }
}
