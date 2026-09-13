import { z } from "zod";
import { ensureAuthDatabase, getSession, requirePermission } from "../../lib/auth-server";
import { administratorUserIds, notifyUsers, workflowRecipientUserIds } from "../../lib/notifications";
import { database } from "../../lib/database";
import {
  cairoLocalEpoch,
  cairoNow,
  canCreateTasks,
  ensureTasksDatabase,
  getTasksState,
  taskAssignees,
} from "../../lib/tasks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/);
const httpUrl = z.string().trim().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "Use an http or https link.");
const reference = z.object({
  label: z.string().trim().max(120).default(""),
  url: httpUrl,
});
const taskData = z.object({
  title: z.string().trim().min(2).max(200),
  details: z.string().trim().min(3).max(10_000),
  brief: z.string().trim().max(10_000).default(""),
  gridNotes: z.string().trim().max(10_000).default(""),
  references: z.array(reference).max(20).default([]),
  startAt: localDateTime,
  deadlineAt: localDateTime,
  assignedUserId: z.number().int().positive(),
  additionalUserIds: z.array(z.number().int().positive()).max(49).default([]),
  gridCells: z.array(z.enum(["design", "carousel", "video"])).max(36).default([]),
});
const payloadSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), data: taskData }),
  z.object({ action: z.literal("submit"), id: z.number().int().positive(), submissionMethod: z.enum(["link", "flash_drive", "other"]).default("link"), submissionNotes: z.string().trim().max(2000).default(""), submissionUrl: z.union([httpUrl, z.literal("")]).default("") }),
]);

function sessionName(session: { displayName: string; username: string }) {
  return session.displayName.trim() || session.username;
}

function errorResponse(error: unknown) {
  const message = error instanceof z.ZodError
    ? error.issues[0]?.message ?? "Invalid task data."
    : error instanceof Error ? error.message : "Unexpected task error.";
  return Response.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
}

export async function GET(request: Request) {
  try {
    const authError = await requirePermission(request, "tasks");
    if (authError) return authError;
    await ensureTasksDatabase();
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    return Response.json(await getTasksState(session));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const authError = await requirePermission(request, "tasks");
    if (authError) return authError;
    await ensureAuthDatabase();
    await ensureTasksDatabase();
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    const payload = payloadSchema.parse(await request.json());

    if (payload.action === "create") {
      if (!canCreateTasks(session)) return Response.json({ error: "Only administrators, Operation Managers, and Account Managers can assign tasks." }, { status: 403 });
      const startEpoch = cairoLocalEpoch(payload.data.startAt);
      const deadlineEpoch = cairoLocalEpoch(payload.data.deadlineAt);
      if (!Number.isFinite(startEpoch) || !Number.isFinite(deadlineEpoch) || deadlineEpoch <= startEpoch) {
        return Response.json({ error: "The deadline must be after the task start time." }, { status: 400 });
      }
      const allowedAssignee = (await taskAssignees(session)).find((assignee) => assignee.id === payload.data.assignedUserId);
      if (!allowedAssignee) return Response.json({ error: "You cannot assign a task to this user." }, { status: 403 });
      const ids = [...new Set([payload.data.assignedUserId, ...payload.data.additionalUserIds])];
      const available = await taskAssignees(session);
      if (ids.some(id => !available.some(a => a.id === id))) return Response.json({error:"You cannot assign a task to this user."}, {status:403});
      const team = ids.map(id => { const a = available.find(a => a.id === id)!; return {id, displayName:a.displayName, roleLabel:a.roleLabel}; });
      const creatorName = sessionName(session);
      const result = await database.prepare(`INSERT INTO agency_tasks
          (grid_cells_json, assigned_users_json, title, details, brief, grid_notes, references_json, start_at, deadline_at,
            assigned_user_id, assigned_user_name, assigned_user_role,
            created_by_user_id, created_by_name, created_by_role)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(JSON.stringify(payload.data.gridCells), JSON.stringify(team), payload.data.title, payload.data.details, payload.data.brief, payload.data.gridNotes,
          JSON.stringify(payload.data.references), payload.data.startAt, payload.data.deadlineAt,
          allowedAssignee.id, allowedAssignee.displayName, allowedAssignee.roleLabel,
          session.userId, creatorName, session.roleLabel).run();
      const taskId = Number(result.meta.last_row_id);
      await notifyUsers(ids, {
        type: "task_assigned",
        title: "New task assigned",
        message: `${creatorName} assigned “${payload.data.title}” to you. Deadline: ${payload.data.deadlineAt.replace("T", " ")}.`,
        targetView: "tasks",
        entityId: taskId,
        actorUserId: session.userId,
      });
    } else {
      const task = await database.prepare(`SELECT assigned_users_json AS assignedUsersJson, id, title, assigned_user_id AS assignedUserId,
          created_by_user_id AS createdByUserId, deadline_at AS deadlineAt, status
        FROM agency_tasks WHERE id = ?`).bind(payload.id).first<Record<string, unknown>>();
      if (!task) return Response.json({ error: "Task not found." }, { status: 404 });
      if (Number(task.assignedUserId) !== session.userId && !JSON.parse(String(task.assignedUsersJson || "[]")).some((a: {id:number}) => a.id === session.userId)) return Response.json({ error: "Only the assigned user can submit this task." }, { status: 403 });
      if (String(task.status) === "submitted") return Response.json({ error: "This task has already been submitted." }, { status: 409 });
      if (payload.submissionMethod === "other" && !payload.submissionNotes) return Response.json({error:"Describe how the work was delivered."},{status:400});
      const now = cairoNow();
      const deadlineEpoch = cairoLocalEpoch(String(task.deadlineAt ?? ""));
      const lateMinutes = Number.isFinite(deadlineEpoch) ? Math.max(0, Math.ceil((Date.now() - deadlineEpoch) / 60_000)) : 0;
      const updated = await database.prepare(`UPDATE agency_tasks SET status = 'submitted', submission_method = ?, submission_notes = ?, submitted_by_name = ?, submission_url = ?,
          submitted_at = ?, late_minutes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'assigned' AND (assigned_user_id = ? OR EXISTS (SELECT 1 FROM json_each(assigned_users_json) a WHERE json_extract(a.value, '$.id') = ?))`)
        .bind(payload.submissionMethod, payload.submissionNotes, sessionName(session), payload.submissionMethod === "link" ? payload.submissionUrl : "", now.dateTime, lateMinutes, payload.id, session.userId, session.userId).run();
      if (!Number(updated.meta.changes)) return Response.json({ error: "This task was already submitted." }, { status: 409 });
      const recipients = [
        Number(task.createdByUserId),
        ...await administratorUserIds(session.userId),
        ...await workflowRecipientUserIds("operation_manager", session.userId),
      ];
      await notifyUsers(recipients, {
        type: "task_submitted",
        title: "Task submitted",
        message: `${sessionName(session)} submitted “${String(task.title ?? "Task")}”${lateMinutes ? ` ${lateMinutes} minutes late` : " on time"}.`,
        targetView: "tasks",
        entityId: payload.id,
        actorUserId: session.userId,
      });
    }

    return Response.json(await getTasksState(session));
  } catch (error) {
    return errorResponse(error);
  }
}
