import { z } from "zod";
import { getSession, requirePermission } from "../../../lib/auth-server";
import { database } from "../../../lib/database";
import { ensureHrDatabase } from "../../../lib/hr";
import { manualRequestSchema, requestDates, requestEndMinutes, timeMinutes } from "../../../lib/manual-attendance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const payloadSchema = z.object({ batchId: z.string().uuid(), employeeId: z.number().int().positive(), requests: z.array(manualRequestSchema).min(1).max(50) });
export async function POST(request: Request) {
  const denied = await requirePermission(request,"attendance");
  if (denied) return denied;
  const session = await getSession(request);
  if (!session) return Response.json({error:"Authentication required."},{status:401});
  try {
    const payload = payloadSchema.parse(await request.json());
    await ensureHrDatabase();
    const body = JSON.stringify({employeeId:payload.employeeId,requests:payload.requests});
    const replay = async () => {
      const row = await database.prepare("SELECT actor_id, payload_json FROM hr_manual_batches WHERE id=?").bind(payload.batchId).first();
      return row ? Response.json(row.actor_id === session.userId && row.payload_json === body ? {ok:true,count:payload.requests.length} : {error:"This batch has already been used."}, {status:row.actor_id === session.userId && row.payload_json === body ? 200:409}) : null;
    };
    const previous = await replay(); if(previous) return previous;
    const employee = await database.prepare("SELECT hire_date FROM employees WHERE id=? AND active=1").bind(payload.employeeId).first();
    if (!employee) return Response.json({error:"Choose an active employee."},{status:400});
    if (payload.requests.some(r => employee.hire_date && r.dateFrom < String(employee.hire_date))) return Response.json({error:"Requests cannot precede the employee hire date."},{status:400});
    const existing = await database.prepare("SELECT manual_data FROM employee_requests WHERE employee_id=? AND status='approved' AND manual_data<>''").bind(payload.employeeId).all();
    const seen = existing.results.map(r => manualRequestSchema.parse(JSON.parse(String(r.manual_data))));
    for (const r of payload.requests) {
      if (r.type === "penalty") continue;
      const conflict = seen.some(other => r.dateFrom <= other.dateTo && r.dateTo >= other.dateFrom && (r.type === "leave" || other.type === "leave" || (r.type === other.type && (r.type === "early_leave" || (timeMinutes(r.startTime) < requestEndMinutes(other) && requestEndMinutes(r) > timeMinutes(other.startTime))))));
      if (conflict) return Response.json({error:"A request overlaps an existing or queued request. Check the employee, dates and times."},{status:409});
      seen.push(r);
    }
    const statements = [database.prepare("INSERT INTO hr_manual_batches(id,actor_id,payload_json) VALUES(?,?,?)").bind(payload.batchId,session.userId,body)];
    for (const r of payload.requests) {
      if (r.type === "penalty") {
        statements.push(database.prepare("INSERT INTO payroll_adjustments(employee_id,period_month,type,label,amount,days,notes) VALUES(?,?,'deduction',?,0,?,?)").bind(payload.employeeId,r.dateFrom.slice(0,7),"Penalty · " + r.dateFrom,r.days,r.details));
        continue;
      }
      statements.push(database.prepare(`INSERT INTO hr_manual_request_guard(value) SELECT CASE WHEN EXISTS (
        SELECT 1 FROM employee_requests WHERE employee_id=? AND status='approved' AND date_from<=? AND date_to>=?
        AND (type='leave' OR ?='leave' OR (manual_data<>'' AND json_extract(manual_data,'$.type')=? AND (?='early_leave' OR ((CAST(substr(start_time,1,2) AS INTEGER)*60+CAST(substr(start_time,4,2) AS INTEGER))<? AND (CAST(substr(start_time,1,2) AS INTEGER)*60+CAST(substr(start_time,4,2) AS INTEGER)+duration_minutes)>?))))
      ) THEN 0 ELSE 1 END`).bind(payload.employeeId,r.dateTo,r.dateFrom,r.type,r.type,r.type,requestEndMinutes(r),r.startTime?timeMinutes(r.startTime):0));
      const details = r.details + (r.type === "leave" ? " · Reason: " + r.reason : r.type === "mission" ? " · Day: " + r.dayType : "");
      statements.push(database.prepare(`INSERT INTO employee_requests(employee_id,requester_user_id,type,leave_kind,date_from,date_to,start_time,end_time,duration_minutes,leave_paid,details,status,reviewer_note,reviewed_by_user_id,reviewed_at,manual_data)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,'approved','Manually entered and approved',?,CURRENT_TIMESTAMP,?)`).bind(payload.employeeId,session.userId,r.type === "paid_weekend" ? "mission" : r.type,r.reason === "sick" ? "sick_leave":"normal_leave",r.dateFrom,r.dateTo,r.startTime,r.endTime,r.endTime ? requestEndMinutes(r)-timeMinutes(r.startTime):0,r.leavePaid?1:0,details,session.userId,JSON.stringify(r)));
      for (const date of requestDates(r)) statements.push(database.prepare("INSERT INTO attendance_records(employee_id,work_date,status,manual_seed) VALUES(?,?,'absent',1) ON CONFLICT(employee_id,work_date) DO NOTHING").bind(payload.employeeId,date));
    }
    statements.push(database.prepare("DELETE FROM hr_manual_request_guard"));
    try { await database.batch(statements); }
    catch(error) { const response = await replay(); if(response) return response; throw error; }
    return Response.json({ok:true,count:payload.requests.length});
  } catch(error) {
    if(error instanceof z.ZodError) return Response.json({error:error.issues[0]?.message || "Invalid request."},{status:400});
    if (/manual_request_no_overlap/.test(String(error))) return Response.json({error:"An overlapping request was already saved. Refresh and check the dates."},{status:409});
    console.error("Manual employee requests failed",error);
    return Response.json({error:"Could not save requests. Nothing was partially added; please retry."},{status:500});
  }
}

export { GET, PATCH, DELETE } from "../../../lib/manual-request-management";
