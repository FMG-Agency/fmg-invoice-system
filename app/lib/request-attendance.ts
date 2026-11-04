import { database } from "./database";
import { requestDates, type ManualRequest } from "./manual-attendance";
import type { EmployeeRequest } from "../types";

export function requestOverlay(r: Pick<EmployeeRequest,"type"|"dateFrom"|"dateTo"|"startTime"|"endTime"|"details"|"leaveKind">, paid: boolean, workdayStart = "11:00"): ManualRequest {
  return {origin:"employee",leaveKind:r.leaveKind,type:r.type,dateFrom:r.dateFrom,dateTo:r.dateTo,startTime:r.startTime,endTime:r.type==="early_arrival"?workdayStart:r.endTime,details:r.details,days:0,dayType:"normal",leavePaid:paid,reason:r.leaveKind==="sick_leave"?"sick":"normal"};
}
export function seedRequest(employeeId:number,data:ManualRequest) {
  return requestDates(data).map(date=>database.prepare("INSERT INTO attendance_records(employee_id,work_date,status,manual_seed) VALUES(?,?,'absent',1) ON CONFLICT(employee_id,work_date) DO NOTHING").bind(employeeId,date));
}
// Exchanges reserve two distinct dates, never the days between them.
export async function assertExchangeAvailable(employeeId:number,data:ManualRequest,excludeId=0) {
  const rows=await database.prepare("SELECT id,type,date_from,date_to FROM employee_requests WHERE employee_id=? AND id<>? AND status IN ('approved','pending') AND (type='friday_exchange' OR type='leave')").bind(employeeId,excludeId).all();
  for(const r of rows.results){
    const from=String(r.date_from),to=String(r.date_to);
    if(data.type==="friday_exchange" && (r.type==="friday_exchange" ? [data.dateFrom,data.dateTo].some(d=>d===from||d===to) : [data.dateFrom,data.dateTo].some(d=>d>=from&&d<=to))) throw new Error("An exchange or leave already uses one of these dates.");
    if(data.type==="leave" && r.type==="friday_exchange" && [from,to].some(d=>d>=data.dateFrom&&d<=data.dateTo)) throw new Error("Leave overlaps an existing Friday exchange.");
  }
}

// Convert only effects explicitly attributed to this legacy approval. Biometric
// punches remain untouched; all authorizations are subsequently read as overlays.
export function legacyRequestCleanup(row:Record<string,unknown>) {
  const marker=`Approved ${String(row.type).replaceAll('_',' ')} request #${row.id}: ${row.details}`;
  return database.prepare(`UPDATE attendance_records SET
    late_excused=CASE WHEN ?='late_arrival' THEN 0 ELSE late_excused END,
    early_leave_excused=CASE WHEN ?='early_leave' THEN 0 ELSE early_leave_excused END,
    overtime_approved=CASE WHEN ? IN ('overtime','mission') THEN 0 ELSE overtime_approved END,
    early_overtime_approved=CASE WHEN ?='early_arrival' THEN 0 ELSE early_overtime_approved END,
    status=CASE WHEN ?='leave' AND status=? THEN CASE WHEN first_in<>'' AND last_out<>'' THEN 'present' WHEN first_in<>'' OR last_out<>'' THEN 'incomplete' ELSE 'absent' END ELSE status END,
    notes=trim(replace(notes,?,''),char(10)), updated_at=CURRENT_TIMESTAMP
    WHERE employee_id=? AND work_date BETWEEN ? AND ? AND instr(notes,?)>0`)
    .bind(row.type,row.type,row.type,row.type,row.type,row.leave_kind,marker,row.employee_id,row.date_from,row.date_to,marker);
}
export function overlayFromRow(row:Record<string,unknown>) {
  return requestOverlay({type:row.type as EmployeeRequest['type'],dateFrom:String(row.date_from),dateTo:String(row.date_to),startTime:String(row.start_time),endTime:String(row.end_time),details:String(row.details),leaveKind:row.leave_kind as EmployeeRequest['leaveKind']},row.leave_paid!==0);
}

export function exchangeGuard(employeeId:number,data:ManualRequest,excludeId=0) {
  const query=data.type==='friday_exchange'
    ? "((type='friday_exchange' AND (date_from IN (?,?) OR date_to IN (?,?))) OR (type='leave' AND (? BETWEEN date_from AND date_to OR ? BETWEEN date_from AND date_to)))"
    : data.type==='leave' ? "type='friday_exchange' AND (date_from BETWEEN ? AND ? OR date_to BETWEEN ? AND ?)" : "0=1";
  const args=data.type==='friday_exchange'?[data.dateFrom,data.dateTo,data.dateFrom,data.dateTo,data.dateFrom,data.dateTo]:data.type==='leave'?[data.dateFrom,data.dateTo,data.dateFrom,data.dateTo]:[];
  return database.prepare(`INSERT INTO hr_manual_request_guard SELECT CASE WHEN EXISTS (SELECT 1 FROM employee_requests WHERE employee_id=? AND id<>? AND status IN ('pending','approved') AND (${query})) THEN 0 ELSE 1 END`).bind(employeeId,excludeId,...args);
}

export function approvalConflictGuard(employeeId:number,data:ManualRequest,excludeId:number) {
  // Leave cannot silently override another approved attendance authorization.
  return database.prepare(`INSERT INTO hr_manual_request_guard SELECT CASE WHEN EXISTS (
    SELECT 1 FROM employee_requests WHERE employee_id=? AND id<>? AND status='approved'
    AND type<>'friday_exchange' AND ?<>'friday_exchange' AND date_from<=? AND date_to>=?
    AND (type='leave' OR ?='leave')
  ) THEN 0 ELSE 1 END`).bind(employeeId,excludeId,data.type,data.dateTo,data.dateFrom,data.type);
}
