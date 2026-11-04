import { requestOverlay, seedRequest, assertExchangeAvailable, legacyRequestCleanup, overlayFromRow, exchangeGuard, approvalConflictGuard } from "../../lib/request-attendance";
import { manualRequestSchema, requestDates } from "../../lib/manual-attendance";
import { archiveStatement } from '../../lib/trash';
import { del, put } from "@vercel/blob";
import { z } from "zod";
import { ensureAuthDatabase, getDatabase, getSession } from "../../lib/auth-server";
import { database } from "../../lib/database";
import { ensureHrDatabase } from "../../lib/hr";
import { administratorUserIds, notifyUsers } from "../../lib/notifications";
import { canAccess, parsePermissions } from "../../lib/permissions";
import type { EmployeeRequest, RequestReviewer, RequestsState } from "../../types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(value+"T12:00:00Z");return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===value;},"Choose a valid date.");
const timeValue = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const optionalTime = z.union([timeValue, z.literal("")]);
const requestData = z.object({
  type: z.enum(["leave", "early_leave", "late_arrival", "friday_exchange", "mission", "overtime", "early_arrival"]),
  leaveKind: z.enum(["vacation", "occasional_leave", "resort_leave", "sick_leave", "urgent_leave", "normal_leave"]),
  dateFrom: dateValue,
  dateTo: dateValue,
  startTime: optionalTime,
  endTime: optionalTime,
  dayType:z.enum(["normal","holiday"]).default("normal"),
  reason:z.enum(["sick","normal","other"]).default("normal"),
  bothOvertime:z.boolean().default(false),
  earlyStartTime:optionalTime.default(""),
  earlyEndTime:optionalTime.default(""),
  details: z.string().trim().min(5).max(3000),
  attachmentName: z.string().trim().max(180).default(""),
  attachmentType: z.string().trim().max(100).default(""),
  attachmentBase64: z.string().max(4_500_000).default(""),
});

type RequestPolicy = Pick<RequestsState,
  "overtimeStartsAt" | "workdayStartsAt" | "overtimeApprovalAfter" | "earlyOvertimeMultiplier" |
  "urgentLeaveDeadline" | "urgentLeaveYearLimit" | "sickReportAfterDays" | "resortLeaveDays" |
  "resortNoticeDays" | "normalLeaveNoticeDays">;

const defaultPolicy: RequestPolicy = {
  overtimeStartsAt: "19:15",
  workdayStartsAt: "11:00",
  overtimeApprovalAfter: "22:00",
  earlyOvertimeMultiplier: 2.5,
  urgentLeaveDeadline: "12:00",
  urgentLeaveYearLimit: 12,
  sickReportAfterDays: 2,
  resortLeaveDays: 7,
  resortNoticeDays: 14,
  normalLeaveNoticeDays: 2,
};

const requestTypeLabels: Record<EmployeeRequest["type"], string> = {
  friday_exchange: "Friday exchange",
  leave: "leave request",
  late_arrival: "late-arrival permission",
  early_leave: "early-leave excuse",
  mission: "work mission",
  overtime: "overtime request",
  early_arrival: "early-arrival overtime request",
};

function sessionName(session: { displayName: string; username: string }) {
  return session.displayName.trim() || session.username;
}

const actionPayload = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), data: requestData }),
  z.object({ action: z.literal("edit"), id:z.number().int().positive(), data:requestData, leavePaid:z.boolean(), version:z.string() }),
  z.object({ action: z.literal("apply"), month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }),
  z.object({ action: z.literal("assign"), id: z.number().int().positive(), reviewerId: z.number().int().positive().nullable() }),
  z.object({ action: z.literal("decide"), id: z.number().int().positive(), decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(2000).default(""), leavePaid: z.boolean().default(true) }),
  z.object({ action: z.literal("cancel"), id: z.number().int().positive() }),
  z.object({ action: z.literal("delete"), id: z.number().int().positive() }),
]);

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

function requestFromRow(row: Record<string, unknown>): EmployeeRequest {
  const metadata=row.manualData?JSON.parse(String(row.manualData)):{};
  return {
    dayType:metadata.dayType||"normal",reason:metadata.reason||(row.leaveKind==="sick_leave"?"sick":"normal"),
    isManual: Boolean(row.manualData) && JSON.parse(String(row.manualData)).origin !== "employee",
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
    leavePaid: row.leavePaid === null || row.leavePaid === undefined ? null : numberValue(row.leavePaid) === 1,
    details: String(row.details ?? ""),
    attachmentName: String(row.attachmentName ?? ""),
    attachmentType: String(row.attachmentType ?? ""),
    hasAttachment: numberValue(row.hasAttachment) === 1,
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

function durationForRequest(data: z.infer<typeof requestData>, policy: RequestPolicy) {
  if(data.type === "friday_exchange") { manualRequestSchema.parse(requestOverlay(data,true)); return 0; }
  const dates = datesBetween(data.dateFrom, data.dateTo);
  if (data.type !== "leave" && dates.length !== 1) throw new Error("Attendance requests must be for one day.");
  if (["early_leave","late_arrival"].includes(data.type) && !data.startTime) throw new Error("Enter the time you left or plan to leave.");
  if (data.type === "early_arrival") {
    if (!data.startTime) throw new Error("Enter the approved early-arrival time.");
    const end=data.endTime||policy.workdayStartsAt;
    if(end>policy.workdayStartsAt) throw new Error(`Early overtime must end by ${policy.workdayStartsAt}.`);
    const duration = minutesFromTime(end) - minutesFromTime(data.startTime);
    if (duration <= 0) throw new Error(`Early-arrival time must be before ${policy.workdayStartsAt}.`);
    return duration;
  }
  if (data.type === "early_leave" || data.type === "late_arrival" || data.type === "leave") return 0;
  if (!data.startTime || !data.endTime) throw new Error(`Enter the ${data.type === "mission" ? "mission" : "overtime"} start and end time.`);
  const start = minutesFromTime(data.startTime);
  const end = minutesFromTime(data.endTime);
  const duration = end - start + (data.type === "overtime" && end <= start && end <= 360 ? 1440 : 0);
  if (duration <= 0 || duration > 16 * 60) throw new Error("End time must be after the start time.");
  return data.type === "mission" ? duration : Math.max(0, start + duration - Math.max(start, minutesFromTime(policy.overtimeStartsAt)));
}

function cairoNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${value.year}-${value.month}-${value.day}`, time: `${value.hour}:${value.minute}` };
}

function daysFromToday(date: string, today: string) {
  return Math.round((new Date(`${date}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000);
}

function attachmentBuffer(data: z.infer<typeof requestData>) {
  if (!data.attachmentBase64) return null;
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(data.attachmentBase64);
  if (!match) throw new Error("The attachment could not be read.");
  const contentType = match[1].toLowerCase();
  if (!new Set(["application/pdf", "image/jpeg", "image/png"]).has(contentType)) {
    throw new Error("Attachments must be PDF, JPG, or PNG files.");
  }
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length || buffer.length > 3 * 1024 * 1024) throw new Error("The attachment must be no larger than 3 MB.");
  return { buffer, contentType };
}

async function requestPolicy(): Promise<RequestPolicy> {
  const row = await database.prepare(`SELECT overtime_starts_at AS overtimeStartsAt,
      workday_starts_at AS workdayStartsAt, overtime_approval_after AS overtimeApprovalAfter,
      early_overtime_multiplier AS earlyOvertimeMultiplier, urgent_leave_deadline AS urgentLeaveDeadline,
      urgent_leave_year_limit AS urgentLeaveYearLimit, sick_report_after_days AS sickReportAfterDays,
      resort_leave_days AS resortLeaveDays, resort_notice_days AS resortNoticeDays,
      normal_leave_notice_days AS normalLeaveNoticeDays
    FROM hr_policy WHERE id = 1`).first<Record<string, unknown>>();
  return row ? {
    overtimeStartsAt: String(row.overtimeStartsAt ?? defaultPolicy.overtimeStartsAt),
    workdayStartsAt: String(row.workdayStartsAt ?? defaultPolicy.workdayStartsAt),
    overtimeApprovalAfter: String(row.overtimeApprovalAfter ?? defaultPolicy.overtimeApprovalAfter),
    earlyOvertimeMultiplier: numberValue(row.earlyOvertimeMultiplier) || defaultPolicy.earlyOvertimeMultiplier,
    urgentLeaveDeadline: String(row.urgentLeaveDeadline ?? defaultPolicy.urgentLeaveDeadline),
    urgentLeaveYearLimit: numberValue(row.urgentLeaveYearLimit) || defaultPolicy.urgentLeaveYearLimit,
    sickReportAfterDays: numberValue(row.sickReportAfterDays) || defaultPolicy.sickReportAfterDays,
    resortLeaveDays: numberValue(row.resortLeaveDays) || defaultPolicy.resortLeaveDays,
    resortNoticeDays: numberValue(row.resortNoticeDays) || defaultPolicy.resortNoticeDays,
    normalLeaveNoticeDays: numberValue(row.normalLeaveNoticeDays) || defaultPolicy.normalLeaveNoticeDays,
  } : defaultPolicy;
}

async function validatePolicyRequest(employeeId: number, data: z.infer<typeof requestData>, policy: RequestPolicy) {
  const days = data.type === "friday_exchange" ? [data.dateFrom,data.dateTo] : datesBetween(data.dateFrom, data.dateTo);
  const now = cairoNow();
  const noticeDays = daysFromToday(data.dateFrom, now.date);
  // Historical requests still require admin review; advance-notice rules apply only to upcoming dates.
  const historical = noticeDays < 0;
  if (data.type === "leave" && data.leaveKind === "resort_leave") {
    if (days.length > policy.resortLeaveDays) throw new Error(`Resort leave can cover a maximum of ${policy.resortLeaveDays} days.`);
    if (!historical && noticeDays < policy.resortNoticeDays) throw new Error(`Resort leave must be submitted at least ${policy.resortNoticeDays} days in advance.`);
  }
  if (data.type === "leave" && data.leaveKind === "normal_leave" && !historical && noticeDays < policy.normalLeaveNoticeDays) {
    throw new Error(`Normal leave must be submitted at least ${policy.normalLeaveNoticeDays} days in advance.`);
  }
  if (data.type === "leave" && data.leaveKind === "urgent_leave") {
    if (noticeDays === 0 && now.time > policy.urgentLeaveDeadline) throw new Error(`Urgent leave must be submitted by ${policy.urgentLeaveDeadline}.`);
    const used = await database.prepare(`SELECT COUNT(*) AS count FROM employee_requests
      WHERE employee_id = ? AND type = 'leave' AND leave_kind = 'urgent_leave'
        AND substr(date_from, 1, 4) = ? AND status IN ('pending', 'approved')`)
      .bind(employeeId, data.dateFrom.slice(0, 4)).first<{ count: number }>();
    if (Number(used?.count ?? 0) >= policy.urgentLeaveYearLimit) throw new Error(`The annual urgent-leave limit is ${policy.urgentLeaveYearLimit} requests.`);
  }
  if (data.type === "leave" && data.leaveKind === "sick_leave" && days.length > policy.sickReportAfterDays && !data.attachmentBase64) {
    throw new Error(`Sick leave longer than ${policy.sickReportAfterDays} days requires a medical report attachment.`);
  }
  if (data.type === "early_arrival" && !historical && noticeDays < 1) throw new Error("Urgent early-arrival work must be arranged and approved at least one day in advance.");
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
      r.manual_data AS manualData, r.type, r.leave_kind AS leaveKind, r.date_from AS dateFrom, r.date_to AS dateTo,
      r.start_time AS startTime, r.end_time AS endTime, r.duration_minutes AS durationMinutes, r.leave_paid AS leavePaid,
      r.details, r.attachment_name AS attachmentName, r.attachment_type AS attachmentType,
      CASE WHEN r.attachment_key <> '' THEN 1 ELSE 0 END AS hasAttachment,
      r.status, r.assigned_reviewer_id AS assignedReviewerId,
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
  const [employee, policy] = await Promise.all([
    session.employeeId
      ? database.prepare("SELECT name FROM employees WHERE id = ? AND active = 1").bind(session.employeeId).first<{ name: string }>()
      : Promise.resolve(null),
    requestPolicy(),
  ]);
  const requests = result.results.map((row) => requestFromRow(row as Record<string, unknown>));
  return {
    requests,
    reviewers: session.isAdmin ? await reviewers() : [],
    ...policy,
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
  if(/manual_request_no_overlap/.test(String(error))) return Response.json({error:"The request changed or overlaps another request. Reload and check the dates."},{status:409});
  const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid request data." : error instanceof Error ? error.message : "Could not process this request.";
  return Response.json({ error: message }, { status: error instanceof z.ZodError || error instanceof Error ? 400 : 500 });
}

async function sessionForRequests(request: Request) {
  const session = await getSession(request);
  if (!session) return { session: null, error: accessError(401, "Authentication required.") };
  if (!canAccess(session.permissions, "requests", session.isAdmin)) return { session: null, error: accessError() };
  return { session, error: null };
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

    if(payload.action === "apply") {
      if(!session.isAdmin) return accessError(403,"Only an administrator can apply requests.");
      const rows=await database.prepare("SELECT * FROM employee_requests WHERE status='approved' AND ((type='friday_exchange' AND (substr(date_from,1,7)=? OR substr(date_to,1,7)=?)) OR (type<>'friday_exchange' AND substr(date_from,1,7)<=? AND substr(date_to,1,7)>=?))").bind(payload.month,payload.month,payload.month,payload.month).all();
      const statements=rows.results.flatMap(row=>{
        const data=row.manual_data?JSON.parse(String(row.manual_data)):overlayFromRow(row);
        const seeds=seedRequest(Number(row.employee_id),data).filter((_,i)=>requestDates(data)[i].startsWith(payload.month));
        return row.manual_data?seeds:[legacyRequestCleanup(row),database.prepare("UPDATE employee_requests SET manual_data=? WHERE id=? AND manual_data='' AND status='approved'").bind(JSON.stringify(data),row.id),...seeds];
      });
      if(statements.length) await database.batch(statements);
    }
    if(payload.action === "edit") {
      if(!session.isAdmin) return accessError(403,"Only an administrator can edit requests.");
      const row=await database.prepare("SELECT * FROM employee_requests WHERE id=?").bind(payload.id).first();
      if(!row) return accessError(404,"Request not found.");
      if(row.manual_data && JSON.parse(String(row.manual_data)).origin!=="employee") return accessError(400,"Edit this entry in Manual Requests to preserve its category.");
      if(String(row.updated_at)!==payload.version) return accessError(409,"Request changed. Reload before editing.");

      if(payload.data.bothOvertime) return accessError(400,"Edit each overtime request separately.");
      const duration=durationForRequest(payload.data,await requestPolicy());
      const overlay=requestOverlay(payload.data,payload.leavePaid);
      await assertExchangeAvailable(Number(row.employee_id),overlay,payload.id);
      const update=database.prepare("UPDATE employee_requests SET type=?,leave_kind=?,date_from=?,date_to=?,start_time=?,end_time=?,duration_minutes=?,details=?,leave_paid=?,manual_data=?,reviewed_by_user_id=?,updated_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE id=? AND updated_at=?")
        .bind(payload.data.type,payload.data.leaveKind,payload.data.dateFrom,payload.data.dateTo,payload.data.startTime,payload.data.endTime,duration,payload.data.details,payload.leavePaid?1:0,JSON.stringify(overlay),session.userId,payload.id,payload.version);
      await database.batch([database.prepare("INSERT INTO hr_manual_request_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM employee_requests WHERE id=? AND updated_at=?) THEN 1 ELSE 0 END").bind(payload.id,payload.version),exchangeGuard(Number(row.employee_id),overlay,payload.id),...(row.status==='approved'?[approvalConflictGuard(Number(row.employee_id),overlay,payload.id)]:[]),...(row.status==='approved' && !row.manual_data?[legacyRequestCleanup(row)]:[]),update,...(row.status==='approved'?seedRequest(Number(row.employee_id),overlay):[]),database.prepare("DELETE FROM hr_manual_request_guard")]);
    }
    if (payload.action === "delete") {
      if (!session.isAdmin) return accessError(403, "Only an administrator can delete employee requests.");
      const existing = await database.prepare("SELECT * FROM employee_requests WHERE id = ?")
        .bind(payload.id).first<Record<string,unknown>>();
      if (!existing) return accessError(404, "Request not found.");
      await database.batch([...(existing.status==='approved' && !existing.manual_data?[database.prepare("UPDATE employee_requests SET manual_data=? WHERE id=?").bind(JSON.stringify(overlayFromRow(existing)),payload.id)]:[]),await archiveStatement("employee_requests","id = ?",[payload.id],session),...(existing.status==='approved' && !existing.manual_data?[legacyRequestCleanup(existing)]:[]),database.prepare("DELETE FROM employee_requests WHERE id=?").bind(payload.id)]);

    }

    if (payload.action === "create") {
      if (!session.employeeId) return accessError(400, "Ask the administrator to link your user account to your employee profile first.");
      const employee = await database.prepare("SELECT id FROM employees WHERE id = ? AND active = 1").bind(session.employeeId).first<{ id: number }>();
      if (!employee) return accessError(400, "Your linked employee profile is inactive or unavailable.");
      const policy = await requestPolicy();
      if(payload.data.bothOvertime && payload.data.type!=="overtime") throw new Error("Both is available only for overtime.");
      const entries=[payload.data];
      if(payload.data.bothOvertime) entries.push({...payload.data,type:"early_arrival",startTime:payload.data.earlyStartTime,endTime:payload.data.earlyEndTime,bothOvertime:false});
      const durations:number[]=[];
      for(const data of entries){
        await validatePolicyRequest(session.employeeId,data,policy);
        const duration=durationForRequest(data,policy);durations.push(duration);
        await assertExchangeAvailable(session.employeeId,requestOverlay(data,true));
        if(data.type==='overtime' && (duration<=0 || data.startTime<policy.overtimeApprovalAfter)) throw new Error('Extra overtime starts at '+policy.overtimeApprovalAfter+' or later.');
        if(['mission','overtime','early_arrival'].includes(data.type)){
          const overlap=await database.prepare("SELECT id FROM employee_requests WHERE employee_id=? AND type=? AND date_from=? AND status IN ('pending','approved') AND (CAST(substr(start_time,1,2) AS INTEGER)*60+CAST(substr(start_time,4,2) AS INTEGER))<? AND (CAST(substr(start_time,1,2) AS INTEGER)*60+CAST(substr(start_time,4,2) AS INTEGER)+duration_minutes)>? LIMIT 1")
            .bind(session.employeeId,data.type,data.dateFrom,minutesFromTime(data.startTime)+duration,minutesFromTime(data.startTime)).first();
          if(overlap)return accessError(409,'This request overlaps another pending or approved request.');
        }
      }
      const attachment = attachmentBuffer(payload.data);
      let attachmentKey = "";
      let createdRequestId = 0;
      const attachmentName = attachment ? payload.data.attachmentName.replace(/[\r\n"]/g, "").slice(0, 180) || "attachment" : "";
      try {
        if (attachment) {
          const safeName = attachmentName.replace(/[^A-Za-z0-9._-]+/g, "-") || "attachment";
          attachmentKey = `employee-requests/${session.employeeId}/${crypto.randomUUID()}-${safeName}`;
          await put(attachmentKey, attachment.buffer, {
            access: "private",
            addRandomSuffix: false,
            allowOverwrite: false,
            contentType: attachment.contentType,
          });
        }
        const statements=entries.flatMap((data,index)=>[
          exchangeGuard(session.employeeId!,requestOverlay(data,true)),
          database.prepare(`INSERT INTO employee_requests
            (employee_id,requester_user_id,type,leave_kind,date_from,date_to,start_time,end_time,duration_minutes,details,attachment_key,attachment_name,attachment_type,manual_data)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(session.employeeId,session.userId,data.type,data.leaveKind,data.dateFrom,data.dateTo,data.startTime,data.endTime,durations[index],data.details,index===0?attachmentKey:'',index===0?attachmentName:'',index===0?(attachment?.contentType??''):'',JSON.stringify(requestOverlay(data,true)))
        ]);
        const results=await database.batch([...statements,database.prepare("DELETE FROM hr_manual_request_guard")]);
        createdRequestId=Number(results[1].lastInsertRowid);
      } catch (error) {
        if (attachmentKey) await del(attachmentKey).catch(() => undefined);
        throw error;
      }
      await notifyUsers(await administratorUserIds(session.userId), {
        type: "employee_request_created",
        title: payload.data.bothOvertime?"New Early + Extra overtime requests":"New employee request",
        message: `${sessionName(session)} sent a ${requestTypeLabels[payload.data.type]} for ${payload.data.dateFrom}.`,
        targetView: "requests",
        entityId: createdRequestId,
        actorUserId: session.userId,
      });
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
      if (payload.reviewerId !== null) {
        const assignedRequest = await database.prepare(`SELECT e.name AS employeeName, r.type, r.date_from AS dateFrom
          FROM employee_requests r JOIN employees e ON e.id = r.employee_id WHERE r.id = ?`).bind(payload.id)
          .first<{ employeeName: string; type: EmployeeRequest["type"]; dateFrom: string }>();
        await notifyUsers([payload.reviewerId], {
          type: "employee_request_assigned",
          title: "Employee request assigned to you",
          message: `${assignedRequest?.employeeName || "An employee"} has a ${requestTypeLabels[assignedRequest?.type || "leave"]} for ${assignedRequest?.dateFrom || "review"}.`,
          targetView: "requests",
          entityId: payload.id,
          actorUserId: session.userId,
        });
      }
    }

    if (payload.action === "cancel") {
      if (!session.employeeId) return accessError(403);
      const cancelled = await database.prepare(`UPDATE employee_requests SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND employee_id = ? AND requester_user_id = ? AND status = 'pending'
        RETURNING id, assigned_reviewer_id AS assignedReviewerId`)
        .bind(payload.id, session.employeeId, session.userId).first<{ id: number; assignedReviewerId: number | null }>();
      if (!cancelled) return accessError(409, "Only your own pending requests can be cancelled.");
      const cancellationRecipients = cancelled.assignedReviewerId ? [cancelled.assignedReviewerId] : await administratorUserIds(session.userId);
      await notifyUsers(cancellationRecipients, {
        type: "employee_request_cancelled",
        title: "Employee request cancelled",
        message: `${sessionName(session)} cancelled request #${payload.id}.`,
        targetView: "requests",
        entityId: payload.id,
        actorUserId: session.userId,
      });
    }

    if (payload.action === "decide") {
      const row = await database.prepare(`SELECT r.id, r.employee_id AS employeeId, e.name AS employeeName,
          e.title AS employeeTitle, r.requester_user_id AS requesterUserId, requester.display_name AS requesterName,
          r.manual_data AS manualData, r.type, r.leave_kind AS leaveKind, r.date_from AS dateFrom, r.date_to AS dateTo,
          r.start_time AS startTime, r.end_time AS endTime, r.duration_minutes AS durationMinutes, r.leave_paid AS leavePaid,
          r.details, r.attachment_name AS attachmentName, r.attachment_type AS attachmentType,
          CASE WHEN r.attachment_key <> '' THEN 1 ELSE 0 END AS hasAttachment,
          r.status, r.assigned_reviewer_id AS assignedReviewerId, '' AS assignedReviewerName,
          r.reviewer_note AS reviewerNote, r.reviewed_by_user_id AS reviewedByUserId, '' AS reviewedByName,
          r.reviewed_at AS reviewedAt, r.created_at AS createdAt, r.updated_at AS updatedAt
        FROM employee_requests r JOIN employees e ON e.id = r.employee_id
        JOIN auth_users requester ON requester.id = r.requester_user_id WHERE r.id = ?`).bind(payload.id).first<Record<string, unknown>>();
      if (!row) return accessError(404, "Request not found.");
      const employeeRequest = requestFromRow(row);
      if (employeeRequest.status !== "pending") return accessError(409, "This request has already been decided.");
      if (!session.isAdmin) return accessError(403, "Only an administrator can approve or reject employee requests.");
      const decisionToken = crypto.randomUUID();
      const leavePaid = payload.leavePaid;
      const overlay = requestOverlay(employeeRequest,leavePaid);
      if(payload.decision === "approved") await assertExchangeAvailable(employeeRequest.employeeId,overlay,employeeRequest.id);
      const decision = database.prepare(`UPDATE employee_requests SET status = ?, leave_paid = ?, reviewer_note = ?, reviewed_by_user_id = ?,
        reviewed_at = CURRENT_TIMESTAMP, decision_token = ?, manual_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`)
        .bind(payload.decision, payload.decision === "approved" ? (leavePaid ? 1 : 0) : null, payload.note, session.userId, decisionToken, JSON.stringify(overlay), payload.id);
      const versionGuard=database.prepare("INSERT INTO hr_manual_request_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM employee_requests WHERE id=? AND status='pending' AND updated_at=?) THEN 1 ELSE 0 END").bind(employeeRequest.id,employeeRequest.updatedAt);
      await database.batch(payload.decision === "approved" ? [versionGuard,exchangeGuard(employeeRequest.employeeId,overlay,employeeRequest.id),approvalConflictGuard(employeeRequest.employeeId,overlay,employeeRequest.id),decision, ...seedRequest(employeeRequest.employeeId,overlay),database.prepare("DELETE FROM hr_manual_request_guard")] : [versionGuard,decision,database.prepare("DELETE FROM hr_manual_request_guard")]);
      const applied = await database.prepare("SELECT id FROM employee_requests WHERE id = ? AND decision_token = ?").bind(payload.id, decisionToken).first<{ id: number }>();
      if (!applied) return accessError(409, "This request has already been decided.");
      await notifyUsers([employeeRequest.requesterUserId], {
        type: `employee_request_${payload.decision}`,
        title: `Your request was ${payload.decision}`,
        message: `${requestTypeLabels[employeeRequest.type]} for ${employeeRequest.dateFrom}${payload.note ? ` · ${payload.note}` : ""}`,
        targetView: "requests",
        entityId: payload.id,
        actorUserId: session.userId,
      });
    }

    return Response.json(await getRequestsState(session));
  } catch (error) {
    return responseError(error);
  }
}
