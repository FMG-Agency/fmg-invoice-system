import { trashDelete } from '../../lib/trash';
import { z } from "zod";
import { getSession, requirePermission } from "../../lib/auth-server";
import { ensureClientPortalDatabase, getClientPortalState, portalClientAllowed, planningPeople, isPortalPlanner } from "../../lib/client-portal";
import { cairoLocalEpoch, ensureTasksDatabase } from "../../lib/tasks";
import { notifyUsers } from "../../lib/notifications";
import { database } from "../../lib/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const httpUrl = z.string().trim().url().max(2000).refine((value) => /^https?:\/\//i.test(value), "Use a valid https:// or http:// link.");
const planData = z.object({
  clientId: z.number().int().positive(),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  part: z.union([z.literal(1), z.literal(2)]),
  title: z.string().trim().min(1).max(160),
  url: httpUrl,
  notes: z.string().trim().max(5000).default(""),
  published: z.boolean().default(true),
});
const actionPayload = z.discriminatedUnion("action", [
  z.object({action:z.literal("manager"), clientId:planData.shape.clientId, year:planData.shape.year, managerId:z.number().int().positive().nullable()}),
  z.object({action:z.literal("schedule"), clientId:planData.shape.clientId, year:planData.shape.year, month:planData.shape.month, part:planData.shape.part, designerId:z.number().int().positive(), startAt:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), deadlineAt:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)}),
  z.object({ action: z.literal("savePlan"), data: planData }),
  z.object({ action: z.literal("deletePlan"), id: z.number().int().positive(), clientId: z.number().int().positive(), year: z.number().int().min(2020).max(2100) }),
]);

function errorResponse(error: unknown) {
  const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid client portal data." : error instanceof Error ? error.message : "Unexpected client portal error.";
  return Response.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
}

export async function GET(request: Request) {
  try {
    const authError = await requirePermission(request, "client_portal");
    if (authError) return authError;
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    const url = new URL(request.url);
    const requestedClientId = Number(url.searchParams.get("clientId")) || null;
    const requestedYear = Number(url.searchParams.get("year")) || new Date().getFullYear();
    return Response.json(await getClientPortalState(session, requestedClientId, requestedYear));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const authError = await requirePermission(request, "client_portal");
    if (authError) return authError;
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    if (session.clientId !== null) return Response.json({ error: "Client accounts are read-only." }, { status: 403 });
    await ensureClientPortalDatabase();
    const payload = actionPayload.parse(await request.json());
    const id = payload.action === "savePlan" ? payload.data.clientId : payload.clientId;
    if (!await portalClientAllowed(session,id)) return Response.json({error:"Client access denied."},{status:403});
    if (payload.action === "manager") {
      if (!session.isAdmin) return Response.json({error:"Administrator access required."},{status:403});
      if (payload.managerId === null) await database.prepare("DELETE FROM portal_client_managers WHERE client_id=?").bind(id).run();
      else {
        if (!(await planningPeople(session)).managers.some(person=>person.id===payload.managerId)) return Response.json({error:"Choose an active account manager."},{status:400});
        await database.prepare("INSERT INTO portal_client_managers(client_id,manager_id) VALUES(?,?) ON CONFLICT(client_id) DO UPDATE SET manager_id=excluded.manager_id").bind(id,payload.managerId).run();
      }
      return Response.json(await getClientPortalState(session,id,payload.year));
    }
    if (payload.action === "schedule") {
      if (!session.isAdmin && !await isPortalPlanner(session)) return Response.json({error:"Account manager access required."},{status:403});
      const designer=(await planningPeople(session)).designers.find(person=>person.id===payload.designerId);
      const client=await database.prepare("SELECT COALESCE(NULLIF(company_name,''),name) AS name FROM clients WHERE id=? AND lifecycle_status='active'").bind(id).first<{name:string}>();
      if (!client || !designer || !(cairoLocalEpoch(payload.deadlineAt)>cairoLocalEpoch(payload.startAt))) return Response.json({error:"Choose an active client, a designer and a deadline after the start."},{status:400});
      await ensureTasksDatabase();
      const slot=[id,payload.year,payload.month,payload.part].join("/");
      const title=`${client.name} · ${payload.month}/${payload.year} content plan · Part ${payload.part}`;
      const task=await database.prepare(`INSERT INTO agency_tasks(plan_slot,title,start_at,deadline_at,assigned_user_id,assigned_user_name,assigned_user_role,created_by_user_id,created_by_name,created_by_role,individual_tracking)
        VALUES(?,?,?,?,?,?,?,?,?,?,'1') ON CONFLICT(plan_slot) WHERE plan_slot<>'' DO UPDATE SET
        plan_generated='',start_at=excluded.start_at,deadline_at=excluded.deadline_at,assigned_user_id=excluded.assigned_user_id,assigned_user_name=excluded.assigned_user_name,assigned_user_role=excluded.assigned_user_role
        WHERE agency_tasks.status='assigned' RETURNING id`).bind(slot,title,payload.startAt,payload.deadlineAt,designer.id,designer.displayName,designer.roleLabel,session.userId,session.displayName,session.roleLabel).first<{id:number}>();
      if (!task) return Response.json({error:"This plan has already been delivered."},{status:409});
      await notifyUsers([designer.id],{type:"task_assigned",title:"Client plan scheduled",message:title+" · Due "+payload.deadlineAt.replace("T"," "),targetView:"standard-tasks",entityId:task.id,actorUserId:session.userId});
      return Response.json(await getClientPortalState(session,id,payload.year));
    }
    if (payload.action === "savePlan") {
      const value = payload.data;
      const client = await database.prepare("SELECT id FROM clients WHERE id = ?").bind(value.clientId).first<{ id: number }>();
      if (!client) return Response.json({ error: "Client not found." }, { status: 404 });
      await database.prepare(`INSERT INTO client_portal_plans
          (client_id, year, month, part, title, url, notes, published, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(client_id, year, month, part) DO UPDATE SET
          title = excluded.title, url = excluded.url, notes = excluded.notes,
          published = excluded.published, created_by = excluded.created_by, updated_at = CURRENT_TIMESTAMP`)
        .bind(value.clientId, value.year, value.month, value.part, value.title, value.url, value.notes, value.published ? 1 : 0, session.userId).run();
      return Response.json(await getClientPortalState(session, value.clientId, value.year));
    }
    const existing = await database.prepare("SELECT id FROM client_portal_plans WHERE id = ? AND client_id = ?").bind(payload.id, payload.clientId).first<{ id: number }>();
    if (!existing) return Response.json({ error: "Plan part not found." }, { status: 404 });
    await trashDelete("client_portal_plans", "id = ? AND client_id = ?", [payload.id, payload.clientId], session);
    return Response.json(await getClientPortalState(session, payload.clientId, payload.year));
  } catch (error) {
    return errorResponse(error);
  }
}
