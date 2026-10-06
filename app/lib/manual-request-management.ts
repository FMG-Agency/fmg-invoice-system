import { z } from "zod";
import { database } from "./database";
import { getSession, requirePermission } from "./auth-server";
import { ensureHrDatabase } from "./hr";
import { archiveStatement } from "./trash";
import { manualRequestSchema, requestDates, requestEndMinutes, timeMinutes, type SavedManualEntry } from "./manual-attendance";
const identity = z.object({kind:z.enum(["request","penalty"]),id:z.number().int().positive(),version:z.string().min(1).max(20000)});
const adjustmentVersion = "json_array(employee_id,period_month,type,label,amount,days,notes)";
function failure(error:unknown) {
  if (error instanceof z.ZodError) return Response.json({error:error.issues[0]?.message},{status:400});
  if (/manual_request_no_overlap/.test(String(error))) return Response.json({error:"The entry changed or overlaps another request. Reload the saved entries and try again."},{status:409});
  console.error("Manual request management failed",error);
  return Response.json({error:"Could not update saved entries. Please retry."},{status:500});
}
export async function GET(request:Request) {
  const denied=await requirePermission(request,"attendance");if(denied)return denied;
  try {
    const employeeId=z.coerce.number().int().positive().parse(new URL(request.url).searchParams.get("employeeId"));
    await ensureHrDatabase();
    const [requests,penalties]=await Promise.all([
      database.prepare("SELECT id,employee_id,manual_data,created_at FROM employee_requests WHERE employee_id=? AND manual_data<>'' AND status='approved' ORDER BY id DESC").bind(employeeId).all(),
      database.prepare("SELECT *,"+adjustmentVersion+" AS version FROM payroll_adjustments WHERE employee_id=? AND type='deduction' AND days>0 ORDER BY id DESC").bind(employeeId).all(),
    ]);
    const entries:SavedManualEntry[]=requests.results.map(r=>({id:Number(r.id),kind:"request",employeeId,version:String(r.manual_data),createdAt:String(r.created_at),data:manualRequestSchema.parse(JSON.parse(String(r.manual_data)))}));
    for(const r of penalties.results){
      const date=String(r.label).match(/\d{4}-\d{2}-\d{2}/)?.[0] || String(r.period_month)+"-01";
      entries.push({id:Number(r.id),kind:"penalty",employeeId,version:String(r.version),createdAt:String(r.created_at),data:{type:"penalty",days:Number(r.days),dateFrom:date,dateTo:date,startTime:"",endTime:"",details:String(r.notes || r.label),dayType:"normal",leavePaid:true,reason:"normal"}});
    }
    entries.sort((a,b)=>b.data.dateFrom.localeCompare(a.data.dateFrom)||b.createdAt.localeCompare(a.createdAt));
    return Response.json({entries},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return failure(error);}
}
async function change(request:Request,remove:boolean) {
  const denied=await requirePermission(request,"attendance");if(denied)return denied;
  const session=await getSession(request);if(!session)return Response.json({error:"Authentication required."},{status:401});
  try {
    const raw=await request.json();const payload=identity.parse(raw);
    const data=remove?null:manualRequestSchema.parse((raw as {data:unknown}).data);
    if(data && (payload.kind==="penalty") !== (data.type==="penalty")) return Response.json({error:"A penalty must remain a penalty. Add a separate request to change categories."},{status:400});
    await ensureHrDatabase();
    const table=payload.kind==="request"?"employee_requests":"payroll_adjustments";
    const expression=payload.kind==="request"?"manual_data":adjustmentVersion;
    const scope=payload.kind==="request"?"manual_data<>'' AND status='approved'":"type='deduction' AND days>0";
    const row=await database.prepare(`SELECT *,${expression} AS version FROM ${table} WHERE id=? AND ${scope}`).bind(payload.id).first();
    if(!row)return Response.json({error:"This entry was deleted or is no longer available."},{status:404});
    if(String(row.version)!==payload.version)return Response.json({error:"This entry changed. Reload before editing it."},{status:409});
    const employeeId=Number(row.employee_id);
    if(data){const employee=await database.prepare("SELECT hire_date FROM employees WHERE id=?").bind(employeeId).first();if(employee?.hire_date && data.dateFrom<String(employee.hire_date))return Response.json({error:"Date cannot precede the employee hire date."},{status:400});}
    const statements=[database.prepare(`INSERT INTO hr_manual_request_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM ${table} WHERE id=? AND ${scope} AND ${expression}=?) THEN 1 ELSE 0 END`).bind(payload.id,payload.version)];
    if(remove){
      statements.push(await archiveStatement(table,"id=?",[payload.id],session),database.prepare(`DELETE FROM ${table} WHERE id=?`).bind(payload.id));
    }else if(data){
      if(payload.kind==="penalty"){
        statements.push(database.prepare("UPDATE payroll_adjustments SET period_month=?,label=?,days=?,amount=0,notes=? WHERE id=?").bind(data.dateFrom.slice(0,7),"Penalty · "+data.dateFrom,data.days,data.details,payload.id));
      }else{
        statements.push(database.prepare(`INSERT INTO hr_manual_request_guard SELECT CASE WHEN EXISTS (
          SELECT 1 FROM employee_requests WHERE employee_id=? AND id<>? AND status='approved' AND date_from<=? AND date_to>=?
          AND (type='leave' OR ?='leave' OR (manual_data<>'' AND json_extract(manual_data,'$.type')=? AND (?='early_leave' OR ((CAST(substr(start_time,1,2) AS INTEGER)*60+CAST(substr(start_time,4,2) AS INTEGER))<? AND (CAST(substr(start_time,1,2) AS INTEGER)*60+CAST(substr(start_time,4,2) AS INTEGER)+duration_minutes)>?))))
        ) THEN 0 ELSE 1 END`).bind(employeeId,payload.id,data.dateTo,data.dateFrom,data.type,data.type,data.type,requestEndMinutes(data),data.startTime?timeMinutes(data.startTime):0));
        statements.push(database.prepare(`UPDATE employee_requests SET type=?,leave_kind=?,date_from=?,date_to=?,start_time=?,end_time=?,duration_minutes=?,leave_paid=?,details=?,manual_data=?,reviewed_by_user_id=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(data.type === "paid_weekend" ? "mission" : data.type,data.reason==="sick"?"sick_leave":"normal_leave",data.dateFrom,data.dateTo,data.startTime,data.endTime,data.endTime&&data.startTime?requestEndMinutes(data)-timeMinutes(data.startTime):0,data.leavePaid?1:0,data.details,JSON.stringify(data),session.userId,payload.id));
        for(const date of requestDates(data))statements.push(database.prepare("INSERT INTO attendance_records(employee_id,work_date,status,manual_seed) VALUES(?,?,'absent',1) ON CONFLICT(employee_id,work_date) DO NOTHING").bind(employeeId,date));
      }
    }
    statements.push(database.prepare("DELETE FROM hr_manual_request_guard"));
    await database.batch(statements);
    return Response.json({ok:true});
  }catch(error){return failure(error);}
}
export async function PATCH(request:Request){return change(request,false);}
export async function DELETE(request:Request){return change(request,true);}
