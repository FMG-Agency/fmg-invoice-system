import { z } from "zod";
import { getSession, requireAnyPermission, requirePermission } from "../../lib/auth-server";
import { database } from "../../lib/database";
import { ensureHrDatabase, getHrState } from "../../lib/hr";
import { canAccess } from "../../lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const monthValue = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const optionalText = z.string().trim().max(5000).default("");
const timeValue = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const optionalTime = z.union([timeValue, z.literal("")]);

const employeePayload = z.object({
  biometricCode: z.string().trim().max(80).default(""),
  name: z.string().trim().min(1).max(160),
  title: z.string().trim().max(160).default(""),
  department: z.string().trim().max(160).default(""),
  email: z.union([z.string().trim().email(), z.literal("")]).default(""),
  phone: z.string().trim().max(80).default(""),
  hireDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).default(""),
  baseSalary: z.number().finite().min(0),
  monthlyCommission: z.number().finite().min(0),
  monthlyDeduction: z.number().finite().min(0),
  active: z.boolean().default(true),
  notes: optionalText,
});

const policyPayload = z.object({
  currency: z.string().trim().min(3).max(8),
  salaryDivisor: z.number().finite().positive().max(366),
  workdayMinutes: z.number().int().positive().max(1440),
  workdayStartsAt: timeValue,
  freeArrivalUntil: timeValue,
  minorLateUntil: timeValue,
  quarterDayUntil: timeValue,
  workdayEndsAt: timeValue,
  overtimeStartsAt: timeValue,
  overtimeApprovalAfter: timeValue,
  overtimeArrivalCutoff: timeValue,
  minutePenaltyMultiplier: z.number().finite().positive().max(20),
  overtimeMultiplier: z.number().finite().positive().max(20),
  earlyOvertimeMultiplier: z.number().finite().positive().max(20),
  fridayMultiplier: z.number().finite().positive().max(20),
  earlyLeaveDayMultiplier: z.number().finite().min(0).max(2),
  unpaidLeaveDayMultiplier: z.number().finite().min(0).max(2),
  urgentLeaveDeadline: timeValue,
  urgentLeaveYearLimit: z.number().int().positive().max(366),
  sickReportAfterDays: z.number().int().positive().max(31),
  resortLeaveDays: z.number().int().positive().max(31),
  resortNoticeDays: z.number().int().min(0).max(366),
  normalLeaveNoticeDays: z.number().int().min(0).max(366),
  absenceDeductionEnabled: z.boolean(),
  absenceDayMultiplier: z.number().finite().min(0).max(31),
}).refine((value) => value.workdayStartsAt <= value.freeArrivalUntil, { message: "Free arrival must be at or after the scheduled start.", path: ["freeArrivalUntil"] })
  .refine((value) => value.workdayEndsAt <= value.overtimeStartsAt, { message: "Overtime must start at or after the workday ends.", path: ["overtimeStartsAt"] })
  .refine((value) => value.overtimeStartsAt < value.overtimeApprovalAfter, { message: "The approval threshold must be after overtime starts.", path: ["overtimeApprovalAfter"] });

const attendancePayload = z.object({
  firstIn: optionalTime,
  lastOut: optionalTime,
  status: z.enum(["present", "incomplete", "absent", "friday", "vacation", "occasional_leave", "resort_leave", "sick_leave", "urgent_leave", "normal_leave", "assignment"]),
  lateExcused: z.boolean(),
  earlyLeaveExcused: z.boolean(),
  leavePaid: z.boolean(),
  overtimeApproved: z.boolean(),
  earlyOvertimeApproved: z.boolean(),
  notes: optionalText,
});

const adjustmentPayload = z.object({
  employeeId: z.number().int().positive(),
  type: z.enum(["commission", "bonus", "allowance", "deduction"]),
  label: z.string().trim().min(1).max(160),
  amount: z.number().finite().positive(),
  notes: optionalText,
});

const actionPayload = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createEmployee"), month: monthValue, data: employeePayload }),
  z.object({ action: z.literal("updateEmployee"), month: monthValue, id: z.number().int().positive(), data: employeePayload }),
  z.object({ action: z.literal("deleteEmployee"), month: monthValue, id: z.number().int().positive() }),
  z.object({ action: z.literal("updatePolicy"), month: monthValue, data: policyPayload }),
  z.object({ action: z.literal("updateAttendance"), month: monthValue, id: z.number().int().positive(), data: attendancePayload }),
  z.object({ action: z.literal("createAdjustment"), month: monthValue, data: adjustmentPayload }),
  z.object({ action: z.literal("deleteAdjustment"), month: monthValue, id: z.number().int().positive() }),
]);

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit" }).format(new Date());
}

function responseError(error: unknown) {
  const message = error instanceof z.ZodError
    ? error.issues[0]?.message ?? "Invalid HR data"
    : error instanceof Error
      ? error.message
      : "Unexpected HR error";
  const duplicate = /UNIQUE constraint failed.*biometric_code/i.test(message);
  return Response.json({ error: duplicate ? "This biometric ID is already assigned to another employee." : message }, { status: duplicate || error instanceof z.ZodError ? 400 : 500 });
}

type HrStateResult = Awaited<ReturnType<typeof getHrState>>;

function filterHrState(state: HrStateResult, permissions: Parameters<typeof canAccess>[0], isAdmin: boolean): HrStateResult {
  if (canAccess(permissions, "attendance", isAdmin)) return state;
  return { ...state, attendance: [], imports: [], adjustments: [], payroll: [] };
}

export async function GET(request: Request) {
  try {
    const authError = await requireAnyPermission(request, ["employees", "attendance"]);
    if (authError) return authError;
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    await ensureHrDatabase();
    const url = new URL(request.url);
    const parsedMonth = monthValue.safeParse(url.searchParams.get("month") || currentMonth());
    if (!parsedMonth.success) return Response.json({ error: "Invalid payroll month." }, { status: 400 });
    return Response.json(filterHrState(await getHrState(parsedMonth.data), session.permissions, session.isAdmin));
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request) {
  try {
    const authError = await requireAnyPermission(request, ["employees", "attendance"]);
    if (authError) return authError;
    await ensureHrDatabase();
    const payload = actionPayload.parse(await request.json());
    const requiredPermission = payload.action === "createEmployee" || payload.action === "updateEmployee" || payload.action === "deleteEmployee"
      ? "employees"
      : "attendance";
    const permissionError = await requirePermission(request, requiredPermission);
    if (permissionError) return permissionError;
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });

    if (payload.action === "createEmployee") {
      const value = payload.data;
      await database.prepare(`INSERT INTO employees
        (biometric_code, name, title, department, email, phone, hire_date, base_salary,
          monthly_commission, monthly_deduction, active, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
          value.biometricCode, value.name, value.title, value.department, value.email, value.phone,
          value.hireDate, value.baseSalary, value.monthlyCommission, value.monthlyDeduction,
          value.active ? 1 : 0, value.notes,
        ).run();
    }

    if (payload.action === "updateEmployee") {
      const value = payload.data;
      await database.prepare(`UPDATE employees SET biometric_code = ?, name = ?, title = ?, department = ?,
        email = ?, phone = ?, hire_date = ?, base_salary = ?, monthly_commission = ?,
        monthly_deduction = ?, active = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(
          value.biometricCode, value.name, value.title, value.department, value.email, value.phone,
          value.hireDate, value.baseSalary, value.monthlyCommission, value.monthlyDeduction,
          value.active ? 1 : 0, value.notes, payload.id,
        ).run();
    }

    if (payload.action === "deleteEmployee") {
      await database.prepare("UPDATE employees SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(payload.id).run();
    }

    if (payload.action === "updatePolicy") {
      const value = payload.data;
      await database.prepare(`UPDATE hr_policy SET currency = ?, salary_divisor = ?, workday_minutes = ?,
        workday_starts_at = ?, free_arrival_until = ?, minor_late_until = ?, quarter_day_until = ?, workday_ends_at = ?, overtime_starts_at = ?,
        overtime_approval_after = ?, overtime_arrival_cutoff = ?, minute_penalty_multiplier = ?, overtime_multiplier = ?,
        early_overtime_multiplier = ?, friday_multiplier = ?, early_leave_day_multiplier = ?, unpaid_leave_day_multiplier = ?,
        urgent_leave_deadline = ?, urgent_leave_year_limit = ?, sick_report_after_days = ?, resort_leave_days = ?,
        resort_notice_days = ?, normal_leave_notice_days = ?,
        absence_deduction_enabled = ?, absence_day_multiplier = ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = 1`).bind(
        value.currency, value.salaryDivisor, value.workdayMinutes, value.workdayStartsAt, value.freeArrivalUntil,
        value.minorLateUntil, value.quarterDayUntil, value.workdayEndsAt, value.overtimeStartsAt,
        value.overtimeApprovalAfter, value.overtimeArrivalCutoff, value.minutePenaltyMultiplier, value.overtimeMultiplier,
        value.earlyOvertimeMultiplier, value.fridayMultiplier, value.earlyLeaveDayMultiplier, value.unpaidLeaveDayMultiplier,
        value.urgentLeaveDeadline, value.urgentLeaveYearLimit, value.sickReportAfterDays, value.resortLeaveDays,
        value.resortNoticeDays, value.normalLeaveNoticeDays,
        value.absenceDeductionEnabled ? 1 : 0, value.absenceDayMultiplier,
      ).run();
    }

    if (payload.action === "updateAttendance") {
      const value = payload.data;
      await database.prepare(`UPDATE attendance_records SET first_in = ?, last_out = ?, status = ?,
        late_excused = ?, early_leave_excused = ?, leave_paid = ?, overtime_approved = ?, early_overtime_approved = ?,
        notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(
        value.firstIn, value.lastOut, value.status, value.lateExcused ? 1 : 0,
        value.earlyLeaveExcused ? 1 : 0, value.leavePaid ? 1 : 0,
        value.overtimeApproved ? 1 : 0, value.earlyOvertimeApproved ? 1 : 0, value.notes, payload.id,
      ).run();
    }

    if (payload.action === "createAdjustment") {
      const value = payload.data;
      await database.prepare(`INSERT INTO payroll_adjustments
        (employee_id, period_month, type, label, amount, notes) VALUES (?, ?, ?, ?, ?, ?)`).bind(
          value.employeeId, payload.month, value.type, value.label, value.amount, value.notes,
        ).run();
    }

    if (payload.action === "deleteAdjustment") {
      await database.prepare("DELETE FROM payroll_adjustments WHERE id = ?").bind(payload.id).run();
    }

    return Response.json(filterHrState(await getHrState(payload.month), session.permissions, session.isAdmin));
  } catch (error) {
    return responseError(error);
  }
}
