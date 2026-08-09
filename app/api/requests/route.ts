import { z } from "zod";
import { ensureAuthDatabase, getDatabase, getSession } from "../../lib/auth-server";
import { database } from "../../lib/database";
import { ensureHrDatabase } from "../../lib/hr";
import { canAccess, parsePermissions } from "../../lib/permissions";
import type { EmployeeRequest, RequestReviewer, RequestsState } from "../../types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeValue = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const optionalTime = z.union([timeValue, z.literal("")]);
const requestData = z.object({
  type: z.enum(["leave", "early_leave", "mission"]),
  leaveKind: z.enum(["vacation", "sick_leave", "urgent_leave", "normal_leave"]),
  dateFrom: dateValue,
  dateTo: dateValue,
  startTime: optionalTime,
  endTime: optionalTime,
  details: z.string().trim().min(5).max(3000),
});

const actionPayload = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), data: requestData }),
  z.object({ action: z.literal("assign"), id: z.number().int().positive(), reviewerId: z.number().int().positive().nullable() }),
  z.object({ action: z.literal("decide"), id: z.number().int().positive(), decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(2000).default("") }),
  z.object({ action: z.literal("cancel"), id: z.number().int().positive() }),
]);

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

function requestFromRow(row: Record<string, unknown>): EmployeeRequest {
  return {
    id: numberValue(row.id),
    employeeId: numberValue(row.employeeId),
    employeeName: String(row.employeeName ?? ""),
    employeeTitle: String(row.employeeTitle ?? ""),
    requesterUserId: numberValue(row.requesterUserId),
    requesterName: String(row.requesterName ?? ""),
    type: String(row.type) as EmployeeRequest["type"],
    leaveKind: String(row.leaveKind ?? "vacation") as EmployeeRequest["leaveKind"],
    dateFrom: String(row.dateFrom ?? ""),
    dateTo: String(row.dateTo ?? ""),
    startTime: String(row.startTime ?? ""),
    endTime: String(row.endTime ?? ""),
    durationMinutes: numberValue(row.durationMinutes),
    details: String(row.details ?? ""),
    status: String(row.status ?? "pending") as EmployeeRequest["status"],
    assignedReviewerId: row.assignedReviewerId === null || row.assignedReviewerId === undefined ? null : numberValue(row.assignedReviewerId),
    assignedReviewerName: String(row.assignedReviewerName ?? ""),
    reviewerNote: String(row.reviewerNote ?? ""),
    reviewedByUserId: row.reviewedByUserId === null || row.reviewedByUserId === undefined ? null : numberValue(row.reviewedByUserId),
    reviewedByName: String(row.reviewedByName ?? ""),
    reviewedAt: String(row.reviewedAt ?? ""),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

function datesBetween(start: string, end: string) {
  const first = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || last < first) throw new Error("The end date must be on or after the start date.");
  const days: string[] = [];
  for (const cursor = new Date(first); cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    days.push(cursor.toISOString().slice(0, 10));
    if (days.length > 31) throw new Error("A single request cannot cover more than 31 days.");
  }
  return days;
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function durationForRequest(data: z.infer<typeof requestData>) {
  const dates = datesBetween(data.dateFrom, data.dateTo);
  if (data.type !== "leave" && dates.length !== 1) throw new Error("Early-leave and mission requests must be for one day.");
  if (data.type === "early_leave" && !data.startTime) throw new Error("Enter the time you left or plan to leave.");
  if (data.type !== "mission") return 0;
  if (!data.startTime || !data.endTime) throw new Error("Enter the mission start and end time.");
  const duration = minutesFromTime(data.endTime) - minutesFromTime(data.startTime);
  if (duration <= 0 || duration > 16 * 60) throw new Error("Mission end time must be after its start time.");
  return duration;
}

async function reviewers(): Promise<RequestReviewer[]> {
  const result = await database.prepare(`SELECT id, display_name AS displayName, role_label AS roleLabel,
      permissions_json AS permissionsJson FROM auth_users WHERE active = 1 AND is_admin = 0
      ORDER BY display_name COLLATE NOCASE`).all<Record<string, unknown>>();
  return result.results
    .filter((row) => parsePermissions(String(row.permissionsJson ?? "[]")).includes("requests"))
    .map((row) => ({ id: numberValue(row.id), displayName: String(row.displayName ?? ""), roleLabel: String(row.roleLabel ?? "Team Member") }));
}

async function getRequestsState(session: NonNullable<Awaited<ReturnType<typeof getSession>>>): Promise<RequestsState> {
  const accessWhere = session.isAdmin
    ? "1 = 1"
    : "(r.employee_id = ? OR r.assigned_reviewer_id = ?)";
  const statement = database.prepare(`SELECT r.id, r.employee_id AS employeeId, e.name AS employeeName,
      e.title AS employeeTitle, r.requester_user_id AS requesterUserId, requester.display_name AS requesterName,
      r.type, r.leave_kind AS leaveKind, r.date_from AS dateFrom, r.date_to AS dateTo,
      r.start_time AS startTime, r.end_time AS endTime, r.duration_minutes AS durationMinutes,
      r.details, r.status, r.assigned_reviewer_id AS assignedReviewerId,
      COALESCE(assigned.display_name, '') AS assignedReviewerName, r.reviewer_note AS reviewerNote,
      r.reviewed_by_user_id AS reviewedByUserId, COALESCE(reviewer.display_name, '') AS reviewedByName,
      r.reviewed_at AS reviewedAt, r.created_at AS createdAt, r.updated_at AS updatedAt
    FROM employee_requests r
    JOIN employees e ON e.id = r.employee_id
    JOIN auth_users requester ON requester.id = r.requester_user_id
    LEFT JOIN auth_users assigned ON assigned.id = r.assigned_reviewer_id
    LEFT JOIN auth_users reviewer ON reviewer.id = r.reviewed_by_user_id
    WHERE ${accessWhere}
    ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC, r.id DESC`);
  const result = session.isAdmin
    ? await statement.all<Record<string, unknown>>()
    : await statement.bind(session.employeeId ?? -1, session.userId).all<Record<string, unknown>>();
  const employee = session.employeeId
    ? await database.prepare("SELECT name FROM employees WHERE id = ? AND active = 1").bind(session.employeeId).first<{ name: string }>()
    : null;
  const requests = result.results.map((row) => requestFromRow(row as Record<string, unknown>));
  return {
    requests,
    reviewers: session.isAdmin ? await reviewers() : [],
    employeeId: session.employeeId,
    employeeName: employee?.name ?? "",
    isAdmin: session.isAdmin,
    userId: session.userId,
    pendingCount: requests.filter((request) => request.status === "pending").length,
  };
}

function accessError(status = 403, message = "You do not have access to employee requests.") {
  return Response.json({ error: message, code: status === 401 ? "AUTH_REQUIRED" : "ACCESS_DENIED" }, { status });
}

function responseError(error: unknown) {
  const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid request data." : error instanceof Error ? error.message : "Could not process this request.";
  return Response.json({ error: message }, { status: error instanceof z.ZodError || error instanceof Error ? 400 : 500 });
}

async function sessionForRequests(request: Request) {
  const session = await getSession(request);
  if (!session) return { session: null, error: accessError(401, "Authentication required.") };
  if (!canAccess(session.permissions, "requests", session.isAdmin)) return { session: null, error: accessError() };
  return { session, error: null };
}

function approvalStatements(request: EmployeeRequest) {
  const note = `Approved ${request.type.replace("_", " ")} request #${request.id}: ${request.details}`;
  if (request.type === "leave") {
    return datesBetween(request.dateFrom, request.dateTo).map((date) => database.prepare(`INSERT INTO attendance_records
      (employee_id, work_date, status, late_excused, overtime_approved, notes)
      VALUES (?, ?, ?, 1, 0, ?)
      ON CONFLICT(employee_id, work_date) DO UPDATE SET status = excluded.status, late_excused = 1,
        notes = CASE WHEN attendance_records.notes = '' THEN excluded.notes ELSE attendance_records.notes || char(10) || excluded.notes END,
        updated_at = CURRENT_TIMESTAMP`).bind(request.employeeId, date, request.leaveKind, note));
  }
  if (request.type === "early_leave") {
    return [database.prepare(`INSERT INTO attendance_records
      (employee_id, work_date, last_out, status, late_excused, overtime_approved, notes)
      VALUES (?, ?, ?, 'present', 1, 0, ?)
      ON CONFLICT(employee_id, work_date) DO UPDATE SET
        last_out = CASE WHEN attendance_records.last_out = '' THEN excluded.last_out ELSE attendance_records.last_out END,
        status = CASE WHEN attendance_records.status IN ('absent','incomplete') THEN 'present' ELSE attendance_records.status END,
        late_excused = 1,
        notes = CASE WHEN attendance_records.notes = '' THEN excluded.notes ELSE attendance_records.notes || char(10) || excluded.notes END,
        updated_at = CURRENT_TIMESTAMP`).bind(request.employeeId, request.dateFrom, request.startTime, note)];
  }
  return [database.prepare(`INSERT INTO attendance_records
    (employee_id, work_date, status, late_excused, overtime_approved, notes)
    VALUES (?, ?, 'assignment', 1, 1, ?)
    ON CONFLICT(employee_id, work_date) DO UPDATE SET status = 'assignment', overtime_approved = 1,
      notes = CASE WHEN attendance_records.notes = '' THEN excluded.notes ELSE attendance_records.notes || char(10) || excluded.notes END,
      updated_at = CURRENT_TIMESTAMP`).bind(request.employeeId, request.dateFrom, note)];
}

export async function GET(request: Request) {
  try {
    await ensureAuthDatabase();
    await ensureHrDatabase();
    const access = await sessionForRequests(request);
    if (access.error || !access.session) return access.error;
    return Response.json(await getRequestsState(access.session));
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureAuthDatabase();
    await ensureHrDatabase();
    const access = await sessionForRequests(request);
    if (access.error || !access.session) return access.error;
    const session = access.session;
    const payload = actionPayload.parse(await request.json());

    if (payload.action === "create") {
      if (!session.employeeId) return accessError(400, "Ask the administrator to link your user account to your employee profile first.");
      const employee = await database.prepare("SELECT id FROM employees WHERE id = ? AND active = 1").bind(session.employeeId).first<{ id: number }>();
      if (!employee) return accessError(400, "Your linked employee profile is inactive or unavailable.");
      const duration = durationForRequest(payload.data);
      await database.prepare(`INSERT INTO employee_requests
        (employee_id, requester_user_id, type, leave_kind, date_from, date_to, start_time, end_time, duration_minutes, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(session.employeeId, session.userId, payload.data.type, payload.data.leaveKind, payload.data.dateFrom,
          payload.data.dateTo, payload.data.startTime, payload.data.endTime, duration, payload.data.details).run();
    }

    if (payload.action === "assign") {
      if (!session.isAdmin) return accessError(403, "Only an administrator can forward requests to another reviewer.");
      if (payload.reviewerId !== null) {
        const reviewer = await getDatabase().prepare("SELECT permissions_json AS permissionsJson, active FROM auth_users WHERE id = ? AND is_admin = 0")
          .bind(payload.reviewerId).first<{ permissionsJson: string; active: number }>();
        if (!reviewer || Number(reviewer.active) !== 1 || !parsePermissions(reviewer.permissionsJson).includes("requests")) {
          return accessError(400, "Choose an active user who has Employee Requests access.");
        }
      }
      const updated = await database.prepare("UPDATE employee_requests SET assigned_reviewer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending' RETURNING id")
        .bind(payload.reviewerId, payload.id).first<{ id: number }>();
      if (!updated) return accessError(409, "Only pending requests can be forwarded.");
    }

    if (payload.action === "cancel") {
      if (!session.employeeId) return accessError(403);
      const cancelled = await database.prepare(`UPDATE employee_requests SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND employee_id = ? AND requester_user_id = ? AND status = 'pending' RETURNING id`)
        .bind(payload.id, session.employeeId, session.userId).first<{ id: number }>();
      if (!cancelled) return accessError(409, "Only your own pending requests can be cancelled.");
    }

    if (payload.action === "decide") {
      const row = await database.prepare(`SELECT r.id, r.employee_id AS employeeId, e.name AS employeeName,
          e.title AS employeeTitle, r.requester_user_id AS requesterUserId, requester.display_name AS requesterName,
          r.type, r.leave_kind AS leaveKind, r.date_from AS dateFrom, r.date_to AS dateTo,
          r.start_time AS startTime, r.end_time AS endTime, r.duration_minutes AS durationMinutes,
          r.details, r.status, r.assigned_reviewer_id AS assignedReviewerId, '' AS assignedReviewerName,
          r.reviewer_note AS reviewerNote, r.reviewed_by_user_id AS reviewedByUserId, '' AS reviewedByName,
          r.reviewed_at AS reviewedAt, r.created_at AS createdAt, r.updated_at AS updatedAt
        FROM employee_requests r JOIN employees e ON e.id = r.employee_id
        JOIN auth_users requester ON requester.id = r.requester_user_id WHERE r.id = ?`).bind(payload.id).first<Record<string, unknown>>();
      if (!row) return accessError(404, "Request not found.");
      const employeeRequest = requestFromRow(row);
      if (employeeRequest.status !== "pending") return accessError(409, "This request has already been decided.");
      if (!session.isAdmin && employeeRequest.assignedReviewerId !== session.userId) return accessError(403, "This request is not assigned to you.");
      const decision = database.prepare(`UPDATE employee_requests SET status = ?, reviewer_note = ?, reviewed_by_user_id = ?,
        reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`)
        .bind(payload.decision, payload.note, session.userId, payload.id);
      await database.batch(payload.decision === "approved" ? [decision, ...approvalStatements(employeeRequest)] : [decision]);
    }

    return Response.json(await getRequestsState(session));
  } catch (error) {
    return responseError(error);
  }
}
