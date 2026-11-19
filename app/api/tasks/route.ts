import { archiveStatement } from '../../lib/trash';
import { z } from "zod";
import { ensureAuthDatabase, getSession, requirePermission } from "../../lib/auth-server";
import { prepareStandardMonth } from "../../lib/standard-tasks";
import { ensureClientPortalDatabase } from "../../lib/client-portal";
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

import { taskData, httpUrl } from "../../lib/task-input";
const payloadSchema = z.discriminatedUnion("action", [
  z.object({action:z.literal("reject"),id:z.number().int().positive(),userId:z.number().int().positive(),note:z.string().trim().min(3).max(5000)}),
  z.object({action:z.literal("approve"),id:z.number().int().positive(),role:z.enum(["creator","admin"])}),
  z.object({ action: z.literal("delete"), id: z.number().int().positive() }),
  z.object({ action: z.literal("create"), data: taskData }),
  z.object({ action: z.literal("update"), id: z.number().int().positive(), data: taskData }),
  z.object({ action: z.literal("submit"), id: z.number().int().positive(), submissionPart: z.string().trim().max(300).default(""), submissionMethod: z.enum(["link", "flash_drive", "other"]).default("link"), submissionNotes: z.string().trim().max(2000).default(""), submissionUrl: z.union([httpUrl, z.literal("")]).default("") }),
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

function taskCalendar(request: Request) {
  const month = new URL(request.url).searchParams.get("month");
  return month && /^(20\d\d|2100)-(0[1-9]|1[0-2])$/.test(month) ? month : "regular";
}

export async function GET(request: Request) {
  try {
    const authError = await requirePermission(request, "tasks");
    if (authError) return authError;
    await ensureTasksDatabase();
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    const calendar = taskCalendar(request);
    if (calendar !== "regular") {
      await ensureClientPortalDatabase();
      await prepareStandardMonth(calendar);
    }
    return Response.json(await getTasksState(session,calendar));
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
    const input = await request.json();
    // Offline delivery must ignore a hidden or unfinished URL from the link option.
    if (input && typeof input === "object" && "action" in input && input.action === "submit" && "submissionMethod" in input && ["flash_drive", "other"].includes(String(input.submissionMethod))) {
      Object.assign(input, { submissionUrl: "" });
    }
    const payload = payloadSchema.parse(input);

    if (payload.action === "reject") {
      const task=await database.prepare("SELECT title,plan_slot,created_by_user_id FROM agency_tasks WHERE id=?").bind(payload.id).first<Record<string,unknown>>();
      if(!task)return Response.json({error:"Task not found."},{status:404});
      if(!session.isAdmin && Number(task.created_by_user_id)!==session.userId)return Response.json({error:"Only the task sender or an administrator can request revisions."},{status:403});
      const token=crypto.randomUUID();
      const result=await database.batch([
        database.prepare(`UPDATE agency_tasks SET status='assigned',review_required='1',creator_approval='',admin_approval='',submitted_at='',submission_url='',submitted_by_name='',late_minutes=0,revision_token=?,updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND EXISTS(SELECT 1 FROM task_submissions WHERE task_id=agency_tasks.id AND user_id=?)
          AND (assigned_user_id=? OR EXISTS(SELECT 1 FROM json_each(assigned_users_json) WHERE json_extract(value,'$.id')=?))`).bind(token,payload.id,payload.userId,payload.userId,payload.userId),
        database.prepare(`INSERT INTO task_revisions(task_id,user_id,reviewer_name,note,delivery_json)
          SELECT s.task_id,s.user_id,?,?,json_object('url',s.url,'notes',s.notes,'method',s.method,'submittedAt',s.submitted_at,'lateMinutes',s.late_minutes)
          FROM task_submissions s JOIN agency_tasks t ON t.id=s.task_id WHERE t.id=? AND t.revision_token=? AND s.user_id=?`).bind(sessionName(session),payload.note,payload.id,token,payload.userId),
        database.prepare("DELETE FROM task_submissions WHERE task_id=? AND user_id=? AND EXISTS(SELECT 1 FROM agency_tasks WHERE id=? AND revision_token=?)").bind(payload.id,payload.userId,payload.id,token)
      ]);
      if(!result[0].rowsAffected)return Response.json({error:"This delivery is no longer available for review."},{status:409});
      await notifyUsers([payload.userId],{type:"task_revision_requested",title:"Changes requested",message:String(task.title)+" · "+payload.note,targetView:task.plan_slot?"standard-tasks":"tasks",entityId:payload.id,actorUserId:session.userId});
      return Response.json(await getTasksState(session,taskCalendar(request)));
    }
    if (payload.action === "approve") {
      const task=await database.prepare("SELECT id,title,plan_slot,created_by_user_id,assigned_user_id,assigned_users_json FROM agency_tasks WHERE id=?").bind(payload.id).first<Record<string,unknown>>();
      if(!task)return Response.json({error:"Task not found."},{status:404});
      if(payload.role==="creator" ? Number(task.created_by_user_id)!==session.userId : !session.isAdmin) return Response.json({error:"Only the task sender and an administrator can approve their respective review."},{status:403});
      const column=payload.role==="creator"?"creator_approval":"admin_approval";
      const approval=sessionName(session)+" · "+cairoNow().dateTime;
      const changed=await database.prepare(`UPDATE agency_tasks SET ${column}=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND review_required='1' AND status='submitted' AND ${column}=''`).bind(approval,payload.id).run();
      if(!changed.meta.changes)return Response.json({error:"Approval is unavailable or already recorded."},{status:409});
      const row=await database.prepare("SELECT creator_approval,admin_approval FROM agency_tasks WHERE id=?").bind(payload.id).first<Record<string,unknown>>();
      const complete=Boolean(row?.creator_approval && row?.admin_approval);
      const people=JSON.parse(String(task.assigned_users_json||"[]")) as {id:number}[];
      await notifyUsers([...new Set([Number(task.assigned_user_id),...people.map(person=>person.id),Number(task.created_by_user_id),...await administratorUserIds()])],{
        type:complete?"task_completed":"task_reviewed",title:complete?"Task completed":"Task approval recorded",
        message:sessionName(session)+" approved “"+task.title+"”. "+(complete?"Both approvals are complete.":"Waiting for the second approval."),
        targetView:task.plan_slot?"standard-tasks":"tasks",entityId:payload.id,actorUserId:session.userId,
      });
      return Response.json(await getTasksState(session,taskCalendar(request)));
    }
    if (payload.action === "delete") {
      if (!session.isAdmin) return Response.json({ error: "Only administrators can delete tasks." }, { status: 403 });
      const deleted = await database.batch([await archiveStatement("agency_tasks", "id = ?", [payload.id], session), database.prepare("INSERT OR IGNORE INTO skipped_plan_months(slot) SELECT plan_slot FROM agency_tasks WHERE id=? AND plan_slot<>''").bind(payload.id), database.prepare("DELETE FROM task_submissions WHERE task_id = ?").bind(payload.id), database.prepare("DELETE FROM agency_tasks WHERE id = ?").bind(payload.id)]);
      if (!Number(deleted[3].rowsAffected)) return Response.json({ error: "Task not found." }, { status: 404 });
      return Response.json(await getTasksState(session,taskCalendar(request)));
    }

    if (payload.action === "update") {
      const task=await database.prepare("SELECT plan_slot,created_by_user_id,assigned_users_json,assigned_user_id FROM agency_tasks WHERE id=?").bind(payload.id).first<Record<string,unknown>>();
      if(!task)return Response.json({error:"Task not found."},{status:404});
      if(!session.isAdmin&&Number(task.created_by_user_id)!==session.userId)return Response.json({error:"Only the task creator or an administrator can edit this task."},{status:403});
      const start=cairoLocalEpoch(payload.data.startAt),end=cairoLocalEpoch(payload.data.deadlineAt);
      if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return Response.json({error:"The deadline must be after the task start time."},{status:400});
      
const ids=[...new Set([payload.data.assignedUserId,...payload.data.additionalUserIds])];
      const available=await taskAssignees({...session,roleLabel:"Operation Manager"});
      if(ids.some(id=>!available.some(a=>a.id===id)))return Response.json({error:"Choose active team members."},{status:400});
      const team=ids.map(id=>{const a=available.find(a=>a.id===id)!;return {id,displayName:a.displayName,roleLabel:a.roleLabel,part:payload.data.assignments.find(p=>p.userId===id)?.part||""};});

      const results=await database.batch([database.prepare(`UPDATE agency_tasks SET creator_approval='',admin_approval='',title=?,details=?,brief=?,task_notes=?,grid_notes=?,references_json=?,grid_cells_json=?,grid_post_notes_json=?,start_at=?,deadline_at=?,assigned_user_id=?,assigned_user_name=?,assigned_user_role=?,assigned_users_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND (?=1 OR created_by_user_id=?)`)
        .bind(payload.data.title,payload.data.details,payload.data.brief,payload.data.notes,payload.data.gridNotes,JSON.stringify(payload.data.references),JSON.stringify(payload.data.gridCells),JSON.stringify(payload.data.gridCells.map((_,i)=>payload.data.gridPostNotes[i]||"")),payload.data.startAt,payload.data.deadlineAt,team[0].id,team[0].displayName,team[0].roleLabel,JSON.stringify(team),payload.id,session.isAdmin?1:0,session.userId),
        database.prepare(`UPDATE agency_tasks SET status=CASE WHEN EXISTS (
        SELECT 1 FROM json_each(assigned_users_json) a WHERE NOT EXISTS (
        SELECT 1 FROM task_submissions s WHERE s.task_id=agency_tasks.id AND s.user_id=json_extract(a.value,'$.id')
        )) THEN 'assigned' ELSE 'submitted' END WHERE id=?`).bind(payload.id)
      ]);
      const result=results[0];
      if(!result.rowsAffected)return Response.json({error:"Task no longer available."},{status:409});

      await notifyUsers([...new Set(ids)],{type:"task_updated",title:"Task updated",message:sessionName(session)+" updated “"+payload.data.title+"”.",targetView:task.plan_slot?"standard-tasks":"tasks",entityId:payload.id,actorUserId:session.userId});
      return Response.json(await getTasksState(session,taskCalendar(request)));
    }

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
      const team = ids.map(id => { const a = available.find(a => a.id === id)!; return {id, displayName:a.displayName, roleLabel:a.roleLabel, part:payload.data.assignments.find(item=>item.userId===id)?.part || ""}; });
      const creatorName = sessionName(session);
      const result = await database.prepare(`INSERT INTO agency_tasks
          (review_required,grid_post_notes_json, task_notes, grid_cells_json, assigned_users_json, title, details, brief, grid_notes, references_json, start_at, deadline_at,
            assigned_user_id, assigned_user_name, assigned_user_role,
            created_by_user_id, created_by_name, created_by_role)
        VALUES ('1',?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(JSON.stringify(payload.data.gridCells.map((_, i) => payload.data.gridPostNotes[i] || "")), payload.data.notes, JSON.stringify(payload.data.gridCells), JSON.stringify(team), payload.data.title, payload.data.details, payload.data.brief, payload.data.gridNotes,
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
      const task = await database.prepare(`SELECT plan_slot,assigned_users_json AS assignedUsersJson, id, title, assigned_user_id AS assignedUserId,
          created_by_user_id AS createdByUserId, deadline_at AS deadlineAt, status
        FROM agency_tasks WHERE id = ?`).bind(payload.id).first<Record<string, unknown>>();
      if (!task) return Response.json({ error: "Task not found." }, { status: 404 });
      if (Number(task.assignedUserId) !== session.userId && !JSON.parse(String(task.assignedUsersJson || "[]")).some((a: {id:number}) => a.id === session.userId)) return Response.json({ error: "Only the assigned user can submit this task." }, { status: 403 });
      if (String(task.status) === "submitted") return Response.json({ error: "This task has already been submitted." }, { status: 409 });
      if (payload.submissionMethod === "other" && !payload.submissionNotes) return Response.json({error:"Describe how the work was delivered."},{status:400});
      const now = cairoNow();
      const deadlineEpoch = cairoLocalEpoch(String(task.deadlineAt ?? ""));
      const lateMinutes = Number.isFinite(deadlineEpoch) ? Math.max(0, Math.ceil((Date.now() - deadlineEpoch) / 60_000)) : 0;
      const updated = await database.batch([
        database.prepare(`INSERT OR IGNORE INTO task_submissions (task_id,user_id,user_name,part,method,url,notes,submitted_at,late_minutes)
          SELECT id,?,?,?,?,?,?,?,? FROM agency_tasks
          WHERE id = ? AND status = 'assigned' AND (assigned_user_id = ? OR EXISTS (SELECT 1 FROM json_each(assigned_users_json) a WHERE json_extract(a.value, '$.id') = ?))`)
          .bind(session.userId,sessionName(session),payload.submissionPart,payload.submissionMethod,payload.submissionMethod === "link" ? payload.submissionUrl : "",payload.submissionNotes,now.dateTime,lateMinutes,payload.id,session.userId,session.userId),
        database.prepare(`UPDATE agency_tasks SET status = 'submitted',
          submitted_at = (SELECT MAX(submitted_at) FROM task_submissions WHERE task_id = agency_tasks.id),
          late_minutes = (SELECT MAX(late_minutes) FROM task_submissions WHERE task_id = agency_tasks.id),
          submission_method = ?, submission_notes = ?, submitted_by_name = ?, submission_url = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'assigned' AND NOT EXISTS (
            SELECT user_id FROM (SELECT assigned_user_id AS user_id UNION SELECT CAST(json_extract(value,'$.id') AS INTEGER) FROM json_each(assigned_users_json)) team
            WHERE NOT EXISTS (SELECT 1 FROM task_submissions s WHERE s.task_id = agency_tasks.id AND s.user_id = team.user_id)
          )`).bind(payload.submissionMethod,payload.submissionNotes,sessionName(session),payload.submissionMethod === "link" ? payload.submissionUrl : "",payload.id),
      ]);
      if (!updated[0].rowsAffected) return Response.json({ error: "Your part was already submitted." }, { status: 409 });
      const finished = Boolean(updated[1].rowsAffected);
      const recipients = [
        Number(task.createdByUserId),
        ...await administratorUserIds(session.userId),
        ...await workflowRecipientUserIds("operation_manager", session.userId),
      ];
      await notifyUsers(recipients, {
        type: "task_submitted",
        title: finished ? "Task awaiting approval" : "Task part submitted",
        message: `${sessionName(session)} submitted their part of “${String(task.title ?? "Task")}”${lateMinutes ? ` ${lateMinutes} minutes late` : " on time"}. ${finished ? "All employees have delivered." : "Waiting for remaining employees."}`,
        targetView: task.plan_slot ? "standard-tasks" : "tasks",
        entityId: payload.id,
        actorUserId: session.userId,
      });
    }

    return Response.json(await getTasksState(session,taskCalendar(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
