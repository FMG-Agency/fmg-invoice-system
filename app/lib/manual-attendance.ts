import { z } from "zod";
import type { AttendanceRecord, Employee, HrPolicy } from "../types";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}, "Choose a valid date.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const manualRequestSchema = z.object({
  type: z.enum(["mission", "overtime", "early_arrival", "early_leave", "leave"]),
  dateFrom: date, dateTo: date,
  startTime: z.union([time, z.literal("")]).default(""),
  endTime: z.union([time, z.literal("24:00"), z.literal("")]).default(""),
  dayType: z.enum(["normal", "holiday"]).default("normal"),
  leavePaid: z.boolean().default(true),
  reason: z.enum(["sick", "normal", "other"]).default("normal"),
  details: z.string().trim().min(3, "Enter a reason or assignment description.").max(2000),
}).superRefine((r, ctx) => {
  const issue = (message: string) => ctx.addIssue({code: "custom", message});
  if (r.dateTo < r.dateFrom || (Date.parse(r.dateTo) - Date.parse(r.dateFrom)) / 86400000 > 61) issue("Choose a date range of up to 62 days.");
  if (r.type !== "leave" && r.dateFrom !== r.dateTo) issue("Use one day per timed request.");
  if (r.type !== "leave" && !r.startTime) issue("Choose the start time.");
  if (["mission", "overtime", "early_arrival"].includes(r.type) && (!r.endTime || r.endTime <= r.startTime)) issue("End time must be after start time. For overnight work, enter a separate request for each date.");
  if (r.type === "overtime" && r.startTime < "22:00") issue("Extra evening overtime starts at 22:00 or later.");
  if (r.type === "early_arrival" && r.endTime > "11:00") issue("Early overtime must end by 11:00.");
});
export type ManualRequest = z.infer<typeof manualRequestSchema>;
export function requestDates(r: Pick<ManualRequest, "dateFrom" | "dateTo">) {
  const dates: string[] = [];
  for (let value = Date.parse(r.dateFrom); value <= Date.parse(r.dateTo); value += 86400000) dates.push(new Date(value).toISOString().slice(0,10));
  return dates;
}
export function timeMinutes(time: string) { const [h,m] = time.split(":").map(Number); return h * 60 + m; }
type Source = Omit<AttendanceRecord, "lateMinutes" | "penaltyMinutes" | "earlyLeaveMinutes" | "normalOvertimeMinutes" | "overtimeMinutes" | "earlyOvertimeMinutes" | "normalMissionMinutes" | "earlyMissionMinutes" | "totalMissionMinutes" | "lateDeduction" | "earlyLeaveDeduction" | "leaveDeduction" | "overtimePay" | "fridayPay">;
type MathResult = Omit<AttendanceRecord, keyof Source>;

// Apply approved manual requests when reading payroll, so subsequent biometric imports
// cannot erase the authorization. Minute masks avoid paying overlapping intervals twice.
export function manualAttendance(source: Source, requests: ManualRequest[], employee: Employee, policy: HrPolicy, calculate: (r: Source,e: Employee,p: HrPolicy) => MathResult): AttendanceRecord {
  if (!requests.length) return {...source,...calculate(source,employee,policy)};
  const record = {...source};
  const missions = requests.filter(r => r.type === "mission");
  const leave = requests.find(r => r.type === "leave");
  const friday = new Date(source.workDate + "T12:00:00Z").getUTCDay() === 5;
  const hasPunches = Boolean(source.firstIn || source.lastOut);
  if (leave) { record.status = leave.reason === "sick" ? "sick_leave" : "normal_leave"; record.leavePaid = leave.leavePaid; record.firstIn = ""; record.lastOut = ""; }
  if (missions.length) {
    record.status = "present";
    record.firstIn = [source.firstIn,...missions.map(r => r.startTime)].filter(Boolean).sort()[0];
    record.lastOut = [source.lastOut,...missions.map(r => r.endTime)].filter(Boolean).sort().at(-1)!;
    record.lateExcused ||= !hasPunches || missions.some(r => r.startTime <= policy.workdayStartsAt && r.endTime >= policy.workdayStartsAt);
    record.earlyLeaveExcused ||= !hasPunches || missions.some(r => r.startTime <= policy.workdayEndsAt && r.endTime >= policy.workdayEndsAt);
  }
  if (requests.some(r => r.type === "early_leave")) record.earlyLeaveExcused = true;
  record.notes = [source.notes,...requests.map(r => "Manual " + r.type.replaceAll("_", " ") + ": " + r.details + (r.type === "leave" ? (r.leavePaid ? " (paid)" : " (unpaid)") : " · " + r.startTime + "–" + r.endTime) + (r.type === "mission" ? " · " + (friday || r.dayType === "holiday" ? "Holiday ×2" : "Normal ×1") : ""))].filter(Boolean).join("\n");
  const result = calculate(record,employee,policy);
  if (leave) return {...record,...result};
  const normal = new Array<number>(1440).fill(0), early = new Array<number>(1440).fill(0), holiday = new Array<number>(1440).fill(0);
  const mark = (mask: number[], from: number,to: number,weight: number) => { for(let m = Math.max(0,from); m < Math.min(1440,to);m++) mask[m] = Math.max(mask[m],weight); };
  const arrival = timeMinutes(record.firstIn), departure = timeMinutes(record.lastOut);
  if (!friday && arrival <= timeMinutes(policy.overtimeArrivalCutoff) && record.missionOvertimeMinutes <= 0) mark(normal,timeMinutes(policy.overtimeStartsAt), record.overtimeApproved && source.notes.trim() ? departure : Math.min(departure,timeMinutes(policy.overtimeApprovalAfter)),policy.overtimeMultiplier);
  if (!friday && record.earlyOvertimeApproved && source.notes.trim()) mark(early,arrival,timeMinutes(policy.workdayStartsAt),policy.earlyOvertimeMultiplier);
  for (const r of missions) {
    for (let m = timeMinutes(r.startTime);m < timeMinutes(r.endTime);m++) {
      normal[m] = 0; early[m] = 0;
      if (friday || r.dayType === "holiday") holiday[m] = 2;
      else if (m < timeMinutes(policy.workdayStartsAt) || m >= timeMinutes(policy.workdayEndsAt)) normal[m] = 1;
    }
  }
  for (const r of requests) {
    if (r.type === "overtime") mark(normal,timeMinutes(r.startTime),timeMinutes(r.endTime),2);
    if (r.type === "early_arrival") mark(early,timeMinutes(r.startTime),timeMinutes(r.endTime),2.5);
  }
  // A minute already paid as holiday work must not be paid again as overtime.
  for(let m=0;m<1440;m++) if(holiday[m]) { holiday[m]=Math.max(holiday[m],normal[m],early[m]);normal[m]=0;early[m]=0; }
  const sum = (mask: number[]) => mask.reduce((a,b)=>a+b,0);
  const count = (mask: number[]) => mask.filter(Boolean).length;
  const rate = employee.baseSalary / Math.max(1,policy.salaryDivisor) / Math.max(1,policy.workdayMinutes);
  const round = (n:number) => Math.round(n*100)/100;
  const legacy = record.missionOvertimeMinutes;
  result.normalOvertimeMinutes = count(normal) + legacy;
  result.earlyOvertimeMinutes = count(early);
  result.overtimeMinutes = result.normalOvertimeMinutes + result.earlyOvertimeMinutes;
  result.normalMissionMinutes = sum(normal) + legacy * policy.overtimeMultiplier;
  result.earlyMissionMinutes = sum(early);
  result.totalMissionMinutes = result.normalMissionMinutes + result.earlyMissionMinutes;
  result.overtimePay = round(result.totalMissionMinutes * rate);
  result.fridayPay = round(Math.max(friday && hasPunches ? result.fridayPay : 0, sum(holiday)*rate));
  return {...record,...result, overtimeApproved: record.overtimeApproved || requests.some(r => r.type === "overtime"), earlyOvertimeApproved: record.earlyOvertimeApproved || requests.some(r => r.type === "early_arrival")};
}
