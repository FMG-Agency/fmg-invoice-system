import { z } from "zod";
import { requireAuth } from "../../lib/auth-server";
import { database } from "../../lib/database";
import { ensureHrDatabase, getHrState } from "../../lib/hr";

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
  freeArrivalUntil: timeValue,
  minorLateUntil: timeValue,
  quarterDayUntil: timeValue,
  overtimeStartsAt: timeValue,
  overtimeArrivalCutoff: timeValue,
  minutePenaltyMultiplier: z.number().finite().positive().max(20),
  overtimeMultiplier: z.number().finite().positive().max(20),
  fridayMultiplier: z.number().finite().positive().max(20),
  absenceDeductionEnabled: z.boolean(),
  absenceDayMultiplier: z.number().finite().min(0).max(31),
});

const attendancePayload = z.object({
  firstIn: optionalTime,
  lastOut: optionalTime,
  status: z.enum(["present", "incomplete", "absent", "friday", "vacation", "sick_leave", "urgent_leave", "normal_leave", "assignment"]),
  lateExcused: z.boolean(),
  overtimeApproved: z.boolean(),
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

export async function GET(request: Request) {
  try {
    const authError = await requireAuth(request);
    if (authError) return authError;
    await ensureHrDatabase();
    const url = new URL(request.url);
    const parsedMonth = monthValue.safeParse(url.searchParams.get("month") || currentMonth());
    if (!parsedMonth.success) return Response.json({ error: "Invalid payroll month." }, { status: 400 });
    return Response.json(await getHrState(parsedMonth.data));
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request) {
  try {
    const authError = await requireAuth(request);
    if (authError) return authError;
    await ensureHrDatabase();
    const payload = actionPayload.parse(await request.json());

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
        free_arrival_until = ?, minor_late_until = ?, quarter_day_until = ?, overtime_starts_at = ?,
        overtime_arrival_cutoff = ?, minute_penalty_multiplier = ?, overtime_multiplier = ?,
        friday_multiplier = ?, absence_deduction_enabled = ?, absence_day_multiplier = ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = 1`).bind(
          value.currency, value.salaryDivisor, value.workdayMinutes, value.freeArrivalUntil,
          value.minorLateUntil, value.quarterDayUntil, value.overtimeStartsAt,
          value.overtimeArrivalCutoff, value.minutePenaltyMultiplier, value.overtimeMultiplier,
          value.fridayMultiplier, value.absenceDeductionEnabled ? 1 : 0, value.absenceDayMultiplier,
        ).run();
    }

    if (payload.action === "updateAttendance") {
      const value = payload.data;
      await database.prepare(`UPDATE attendance_records SET first_in = ?, last_out = ?, status = ?,
        late_excused = ?, overtime_approved = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(
          value.firstIn, value.lastOut, value.status, value.lateExcused ? 1 : 0,
          value.overtimeApproved ? 1 : 0, value.notes, payload.id,
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

    return Response.json(await getHrState(payload.month));
  } catch (error) {
    return responseError(error);
  }
}
