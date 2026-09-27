import { database } from "./database";
import type { AgencyTask, TaskAssignee, TaskReference, TasksState } from "../types";
import type { AuthSession } from "./auth-server";

const CAIRO_TIME_ZONE = "Africa/Cairo";

const taskSchema = [
  `CREATE TABLE IF NOT EXISTS agency_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    brief TEXT NOT NULL DEFAULT '',
    grid_notes TEXT NOT NULL DEFAULT '',
    references_json TEXT NOT NULL DEFAULT '[]',
    start_at TEXT NOT NULL,
    deadline_at TEXT NOT NULL,
    assigned_user_id INTEGER NOT NULL REFERENCES auth_users(id),
    assigned_user_name TEXT NOT NULL,
    assigned_user_role TEXT NOT NULL DEFAULT 'Team Member',
    created_by_user_id INTEGER NOT NULL REFERENCES auth_users(id),
    created_by_name TEXT NOT NULL,
    created_by_role TEXT NOT NULL DEFAULT 'Team Member',
    status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'submitted')),
    submission_url TEXT NOT NULL DEFAULT '',
    submitted_at TEXT NOT NULL DEFAULT '',
    late_minutes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS task_submissions (
    task_id INTEGER NOT NULL REFERENCES agency_tasks(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL, user_name TEXT NOT NULL, part TEXT NOT NULL DEFAULT '',
    method TEXT NOT NULL, url TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    submitted_at TEXT NOT NULL, late_minutes INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(task_id, user_id)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_agency_tasks_assignee_status_deadline ON agency_tasks(assigned_user_id, status, deadline_at)",
  "CREATE INDEX IF NOT EXISTS idx_agency_tasks_schedule ON agency_tasks(start_at, deadline_at)",
  "CREATE INDEX IF NOT EXISTS idx_agency_tasks_creator ON agency_tasks(created_by_user_id, created_at)",
];

let tasksDatabaseReady: Promise<void> | null = null;

export async function ensureTasksDatabase() {
  tasksDatabaseReady ??= database.batch(taskSchema.map((statement) => database.prepare(statement))).then(async () => {
    const columns = (await database.prepare("PRAGMA table_info(agency_tasks)").all<{name:string}>()).results;
    for (const [name, value] of [["individual_tracking", ""], ["grid_post_notes_json", "[]"], ["task_notes", ""], ["grid_cells_json", "[]"], ["assigned_users_json", "[]"], ["submission_method", "link"], ["submission_notes", ""], ["submitted_by_name", ""]]) {
      if (columns.some(c => c.name === name)) continue;
      try { await database.prepare(`ALTER TABLE agency_tasks ADD COLUMN ${name} TEXT NOT NULL DEFAULT '${value}'`).run(); }
      catch(error) { if (!/duplicate column/i.test(String(error))) throw error; }
    }
    const legacy = await database.prepare("SELECT * FROM agency_tasks WHERE individual_tracking = ''").all<Record<string,unknown>>();
    for (const row of legacy.results) {
      const team = JSON.parse(String(row.assigned_users_json || "[]")) as {id:number;displayName:string}[];
      const people = team.length ? team : [{id:Number(row.assigned_user_id),displayName:String(row.assigned_user_name)}];
      const matches = people.filter(person => person.displayName === row.submitted_by_name);
      const sender = people.length === 1 ? people[0] : matches.length === 1 ? matches[0] : null;
      const statements = [];
      if (row.status === "submitted" && sender) {
        statements.push(database.prepare(`INSERT OR IGNORE INTO task_submissions (task_id,user_id,user_name,part,method,url,notes,submitted_at,late_minutes)
          SELECT id,?,?, '',submission_method,submission_url,submission_notes,submitted_at,late_minutes FROM agency_tasks
          WHERE id=? AND individual_tracking='' AND NOT EXISTS (SELECT 1 FROM task_submissions WHERE task_id=agency_tasks.id)`).bind(sender.id,String(row.submitted_by_name || sender.displayName),row.id));
        statements.push(database.prepare(`UPDATE agency_tasks SET status='assigned', submitted_at='', late_minutes=0
          WHERE id=? AND individual_tracking='' AND (SELECT COUNT(*) FROM task_submissions WHERE task_id=agency_tasks.id)>0
          AND (SELECT COUNT(*) FROM task_submissions WHERE task_id=agency_tasks.id) < ?`).bind(row.id,people.length));
      }
      statements.push(database.prepare("UPDATE agency_tasks SET individual_tracking='1' WHERE id=?").bind(row.id));
      await database.batch(statements);
    }
  });
  try {
    await tasksDatabaseReady;
  } catch (error) {
    tasksDatabaseReady = null;
    throw error;
  }
}

function normalizedRole(value: string) {
  return value.toLowerCase().replace(/[^a-z]+/g, " ").trim();
}

export function taskWorkflowRole(session: Pick<AuthSession, "isAdmin" | "roleLabel">): TasksState["role"] {
  if (session.isAdmin) return "administrator";
  const role = normalizedRole(session.roleLabel);
  if ((role.includes("operation") || role.includes("operations")) && role.includes("manager")) return "operation_manager";
  if (role.includes("account") && role.includes("manager")) return "account_manager";
  return "member";
}

export function canCreateTasks(session: Pick<AuthSession, "isAdmin" | "roleLabel">) {
  return taskWorkflowRole(session) !== "member";
}

export function canViewDailyTasks(session: Pick<AuthSession, "isAdmin" | "roleLabel">) {
  const role = taskWorkflowRole(session);
  return role === "administrator" || role === "operation_manager";
}

function cairoParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CAIRO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function cairoNow() {
  const parts = cairoParts();
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    dateTime: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

function zoneOffsetMs(timestamp: number) {
  const parts = cairoParts(new Date(timestamp));
  const representedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return representedAsUtc - Math.floor(timestamp / 1000) * 1000;
}

export function cairoLocalEpoch(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return Number.NaN;
  const utcGuess = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] ?? 0));
  let timestamp = utcGuess - zoneOffsetMs(utcGuess);
  timestamp = utcGuess - zoneOffsetMs(timestamp);
  return timestamp;
}

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

function referencesValue(value: unknown): TaskReference[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is TaskReference => Boolean(item && typeof item.label === "string" && typeof item.url === "string"));
  } catch {
    return [];
  }
}

function taskFromRow(row: Record<string, unknown>, nowEpoch: number): AgencyTask {
  const status = String(row.status ?? "assigned") === "submitted" ? "submitted" : "assigned";
  const deadlineEpoch = cairoLocalEpoch(String(row.deadlineAt ?? ""));
  const liveLateMinutes = status === "assigned" && Number.isFinite(deadlineEpoch)
    ? Math.max(0, Math.ceil((nowEpoch - deadlineEpoch) / 60_000))
    : numberValue(row.lateMinutes);
  return {
    submissions: JSON.parse(String(row.submissionsJson || "[]")),
    id: numberValue(row.id),
    title: String(row.title ?? ""),
    details: String(row.details ?? ""),
    brief: String(row.brief ?? ""),
    notes: String(row.taskNotes ?? ""),
    gridNotes: String(row.gridNotes ?? ""),
    gridPostNotes: JSON.parse(String(row.gridPostNotesJson || "[]")),
    gridCells: JSON.parse(String(row.gridCellsJson || "[]")),
    assignedUsers: JSON.parse(String(row.assignedUsersJson || "[]")).length ? JSON.parse(String(row.assignedUsersJson)) : [{id:numberValue(row.assignedUserId),displayName:String(row.assignedUserName),roleLabel:String(row.assignedUserRole)}],
    submissionMethod: String(row.submissionMethod || "link"),
    submissionNotes: String(row.submissionNotes || ""),
    submittedByName: String(row.submittedByName || ""),
    references: referencesValue(row.referencesJson),
    startAt: String(row.startAt ?? ""),
    deadlineAt: String(row.deadlineAt ?? ""),
    assignedUserId: numberValue(row.assignedUserId),
    assignedUserName: String(row.assignedUserName ?? ""),
    assignedUserRole: String(row.assignedUserRole ?? "Team Member"),
    createdByUserId: numberValue(row.createdByUserId),
    createdByName: String(row.createdByName ?? ""),
    createdByRole: String(row.createdByRole ?? "Team Member"),
    status,
    submissionUrl: String(row.submissionUrl ?? ""),
    submittedAt: String(row.submittedAt ?? ""),
    lateMinutes: numberValue(row.lateMinutes),
    liveLateMinutes,
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

export async function taskAssignees(session: AuthSession): Promise<TaskAssignee[]> {
  const role = taskWorkflowRole(session);
  if (role === "member") return [];
  const result = await database.prepare(`SELECT u.id, u.username, u.display_name AS displayName,
      u.role_label AS roleLabel, u.is_admin AS isAdmin, u.employee_id AS employeeId,
      COALESCE(e.title, '') AS employeeTitle
    FROM auth_users u
    LEFT JOIN employees e ON e.id = u.employee_id
    WHERE u.active = 1 AND u.client_id IS NULL
    ORDER BY u.display_name COLLATE NOCASE, u.username COLLATE NOCASE`).all<Record<string, unknown>>();
  return result.results.filter((row) => {
    if (role !== "account_manager") return true;
    if (numberValue(row.isAdmin) === 1) return false;
    const assigneeRole = normalizedRole(String(row.roleLabel ?? ""));
    return !((assigneeRole.includes("operation") || assigneeRole.includes("operations")) && assigneeRole.includes("manager"));
  }).map((row) => ({
    id: numberValue(row.id),
    displayName: String(row.displayName ?? "").trim() || String(row.username ?? ""),
    username: String(row.username ?? ""),
    roleLabel: String(row.roleLabel ?? "Team Member"),
    employeeId: row.employeeId === null || row.employeeId === undefined ? null : numberValue(row.employeeId),
    employeeTitle: String(row.employeeTitle ?? ""),
  }));
}

export async function getTasksState(session: AuthSession): Promise<TasksState> {
  const role = taskWorkflowRole(session);
  const assignedAccess = "(t.assigned_user_id = ? OR EXISTS (SELECT 1 FROM json_each(t.assigned_users_json) a WHERE json_extract(a.value, '$.id') = ?))";
  const accessWhere = role === "administrator" || role === "operation_manager"
    ? "1 = 1"
    : role === "account_manager"
      ? `(${assignedAccess} OR t.created_by_user_id = ?)`
      : assignedAccess;
  const query = database.prepare(`SELECT (SELECT json_group_array(json_object('userId',s.user_id,'userName',s.user_name,'part',s.part,'method',s.method,'url',s.url,'notes',s.notes,'submittedAt',s.submitted_at,'lateMinutes',s.late_minutes)) FROM task_submissions s WHERE s.task_id=t.id) AS submissionsJson, t.grid_post_notes_json AS gridPostNotesJson, t.task_notes AS taskNotes, t.grid_cells_json AS gridCellsJson, t.assigned_users_json AS assignedUsersJson, t.submission_method AS submissionMethod, t.submission_notes AS submissionNotes, t.submitted_by_name AS submittedByName, t.id, t.title, t.details, t.brief, t.grid_notes AS gridNotes,
      t.references_json AS referencesJson, t.start_at AS startAt, t.deadline_at AS deadlineAt,
      t.assigned_user_id AS assignedUserId, t.assigned_user_name AS assignedUserName,
      t.assigned_user_role AS assignedUserRole, t.created_by_user_id AS createdByUserId,
      t.created_by_name AS createdByName, t.created_by_role AS createdByRole, t.status,
      t.submission_url AS submissionUrl, t.submitted_at AS submittedAt, t.late_minutes AS lateMinutes,
      t.created_at AS createdAt, t.updated_at AS updatedAt
    FROM agency_tasks t WHERE ${accessWhere}
    ORDER BY CASE t.status WHEN 'assigned' THEN 0 ELSE 1 END, t.deadline_at ASC, t.id DESC
    LIMIT 1000`);
  const rows = role === "administrator" || role === "operation_manager"
    ? await query.all<Record<string, unknown>>()
    : role === "account_manager"
      ? await query.bind(session.userId, session.userId, session.userId).all<Record<string, unknown>>()
      : await query.bind(session.userId, session.userId).all<Record<string, unknown>>();
  const now = cairoNow();
  return {
    tasks: rows.results.map((row) => taskFromRow(row, Date.now())),
    assignees: await taskAssignees(session),
    userId: session.userId,
    role,
    canCreate: canCreateTasks(session),
    canViewDaily: canViewDailyTasks(session),
    currentDate: now.date,
  };
}
