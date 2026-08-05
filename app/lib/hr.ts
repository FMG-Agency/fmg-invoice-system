import { database } from "./database";
import type { AttendanceRecord, Employee, HrPolicy, HrState, PayrollAdjustment, PayrollSummary } from "../types";

const hrSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    biometric_code TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    department TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    hire_date TEXT NOT NULL DEFAULT '',
    base_salary REAL NOT NULL DEFAULT 0,
    monthly_commission REAL NOT NULL DEFAULT 0,
    monthly_deduction REAL NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS hr_policy (
    id INTEGER PRIMARY KEY,
    currency TEXT NOT NULL DEFAULT 'EGP',
    salary_divisor REAL NOT NULL DEFAULT 30,
    workday_minutes INTEGER NOT NULL DEFAULT 480,
    free_arrival_until TEXT NOT NULL DEFAULT '11:05',
    minor_late_until TEXT NOT NULL DEFAULT '11:15',
    quarter_day_until TEXT NOT NULL DEFAULT '11:45',
    overtime_starts_at TEXT NOT NULL DEFAULT '19:15',
    overtime_arrival_cutoff TEXT NOT NULL DEFAULT '11:30',
    minute_penalty_multiplier REAL NOT NULL DEFAULT 4,
    overtime_multiplier REAL NOT NULL DEFAULT 2,
    friday_multiplier REAL NOT NULL DEFAULT 2,
    absence_deduction_enabled INTEGER NOT NULL DEFAULT 0,
    absence_day_multiplier REAL NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    employee_count INTEGER NOT NULL DEFAULT 0,
    record_count INTEGER NOT NULL DEFAULT 0,
    created_employees INTEGER NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER REFERENCES attendance_imports(id) ON DELETE SET NULL,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    work_date TEXT NOT NULL,
    first_in TEXT NOT NULL DEFAULT '',
    last_out TEXT NOT NULL DEFAULT '',
    punches_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'present',
    late_excused INTEGER NOT NULL DEFAULT 0,
    overtime_approved INTEGER NOT NULL DEFAULT 1,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, work_date)
  )`,
  `CREATE TABLE IF NOT EXISTS payroll_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    period_month TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('commission','bonus','allowance','deduction')),
    label TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_biometric_code ON employees(biometric_code) WHERE biometric_code <> ''",
  "CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name)",
  "CREATE INDEX IF NOT EXISTS idx_attendance_work_date ON attendance_records(work_date)",
  "CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_records(employee_id, work_date)",
  "CREATE INDEX IF NOT EXISTS idx_adjustments_month_employee ON payroll_adjustments(period_month, employee_id)",
];

export async function ensureHrDatabase() {
  await database.batch(hrSchemaStatements.map((statement) => database.prepare(statement)));
  await database.prepare(`INSERT OR IGNORE INTO hr_policy
    (id, currency, salary_divisor, workday_minutes, free_arrival_until, minor_late_until,
      quarter_day_until, overtime_starts_at, overtime_arrival_cutoff, minute_penalty_multiplier,
      overtime_multiplier, friday_multiplier, absence_deduction_enabled, absence_day_multiplier)
    VALUES (1, 'EGP', 30, 480, '11:05', '11:15', '11:45', '19:15', '11:30', 4, 2, 2, 0, 1)`).run();
}

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

function boolValue(value: unknown) {
  return numberValue(value) === 1;
}

function moneyValue(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function minutesFromTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function isFriday(value: string) {
  return new Date(`${value}T12:00:00Z`).getUTCDay() === 5;
}

type AttendanceSource = Omit<AttendanceRecord, "lateMinutes" | "penaltyMinutes" | "overtimeMinutes" | "lateDeduction" | "overtimePay" | "fridayPay">;

export function attendanceMath(record: AttendanceSource, employee: Employee, policy: HrPolicy) {
  const dailyRate = employee.baseSalary / Math.max(1, policy.salaryDivisor);
  const minuteRate = dailyRate / Math.max(1, policy.workdayMinutes);
  const arrival = minutesFromTime(record.firstIn);
  const departure = minutesFromTime(record.lastOut);
  const freeArrival = minutesFromTime(policy.freeArrivalUntil) ?? 665;
  const minorLateEnd = minutesFromTime(policy.minorLateUntil) ?? 675;
  const quarterDayEnd = minutesFromTime(policy.quarterDayUntil) ?? 705;
  const overtimeStart = minutesFromTime(policy.overtimeStartsAt) ?? 1155;
  const overtimeCutoff = minutesFromTime(policy.overtimeArrivalCutoff) ?? 690;
  const friday = isFriday(record.workDate);

  let lateMinutes = 0;
  let penaltyMinutes = 0;
  let lateDeduction = 0;
  let overtimeMinutes = 0;
  let overtimePay = 0;
  let fridayPay = 0;

  if (friday && (arrival !== null || departure !== null)) {
    fridayPay = dailyRate * policy.fridayMultiplier;
  } else if (!friday && record.status === "absent" && policy.absenceDeductionEnabled) {
    lateDeduction = dailyRate * policy.absenceDayMultiplier;
  } else if (!friday && arrival !== null && ["present", "incomplete"].includes(record.status)) {
    lateMinutes = Math.max(0, arrival - freeArrival);
    if (!record.lateExcused && arrival > freeArrival) {
      if (arrival <= minorLateEnd) {
        penaltyMinutes = (arrival - freeArrival) * policy.minutePenaltyMultiplier;
        lateDeduction = penaltyMinutes * minuteRate;
      } else if (arrival <= quarterDayEnd) {
        lateDeduction = dailyRate / 4;
      } else {
        penaltyMinutes = (arrival - quarterDayEnd) * policy.minutePenaltyMultiplier;
        lateDeduction = dailyRate / 2 + penaltyMinutes * minuteRate;
      }
    }

    if (record.overtimeApproved && departure !== null && arrival <= overtimeCutoff && departure > overtimeStart) {
      overtimeMinutes = departure - overtimeStart;
      overtimePay = overtimeMinutes * minuteRate * policy.overtimeMultiplier;
    }
  }

  return {
    lateMinutes,
    penaltyMinutes: Math.round(penaltyMinutes),
    overtimeMinutes,
    lateDeduction: moneyValue(lateDeduction),
    overtimePay: moneyValue(overtimePay),
    fridayPay: moneyValue(fridayPay),
  };
}

function employeeFromRow(row: Record<string, unknown>): Employee {
  return {
    id: numberValue(row.id),
    biometricCode: String(row.biometricCode ?? ""),
    name: String(row.name ?? ""),
    title: String(row.title ?? ""),
    department: String(row.department ?? ""),
    email: String(row.email ?? ""),
    phone: String(row.phone ?? ""),
    hireDate: String(row.hireDate ?? ""),
    baseSalary: numberValue(row.baseSalary),
    monthlyCommission: numberValue(row.monthlyCommission),
    monthlyDeduction: numberValue(row.monthlyDeduction),
    active: boolValue(row.active),
    notes: String(row.notes ?? ""),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

function policyFromRow(row: Record<string, unknown>): HrPolicy {
  return {
    id: numberValue(row.id),
    currency: String(row.currency ?? "EGP"),
    salaryDivisor: numberValue(row.salaryDivisor),
    workdayMinutes: numberValue(row.workdayMinutes),
    freeArrivalUntil: String(row.freeArrivalUntil ?? "11:05"),
    minorLateUntil: String(row.minorLateUntil ?? "11:15"),
    quarterDayUntil: String(row.quarterDayUntil ?? "11:45"),
    overtimeStartsAt: String(row.overtimeStartsAt ?? "19:15"),
    overtimeArrivalCutoff: String(row.overtimeArrivalCutoff ?? "11:30"),
    minutePenaltyMultiplier: numberValue(row.minutePenaltyMultiplier),
    overtimeMultiplier: numberValue(row.overtimeMultiplier),
    fridayMultiplier: numberValue(row.fridayMultiplier),
    absenceDeductionEnabled: boolValue(row.absenceDeductionEnabled),
    absenceDayMultiplier: numberValue(row.absenceDayMultiplier),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

function attendanceFromRow(row: Record<string, unknown>, employees: Map<number, Employee>, policy: HrPolicy): AttendanceRecord {
  const source: AttendanceSource = {
    id: numberValue(row.id),
    importId: row.importId === null || row.importId === undefined ? null : numberValue(row.importId),
    employeeId: numberValue(row.employeeId),
    employeeName: String(row.employeeName ?? ""),
    biometricCode: String(row.biometricCode ?? ""),
    workDate: String(row.workDate ?? ""),
    firstIn: String(row.firstIn ?? ""),
    lastOut: String(row.lastOut ?? ""),
    punches: JSON.parse(String(row.punchesJson ?? "[]")) as string[],
    status: String(row.status ?? "present") as AttendanceRecord["status"],
    lateExcused: boolValue(row.lateExcused),
    overtimeApproved: boolValue(row.overtimeApproved),
    notes: String(row.notes ?? ""),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
  const employee = employees.get(source.employeeId);
  return { ...source, ...attendanceMath(source, employee ?? ({ baseSalary: 0 } as Employee), policy) };
}

function payrollForEmployee(employee: Employee, attendance: AttendanceRecord[], adjustments: PayrollAdjustment[]): PayrollSummary {
  const employeeAttendance = attendance.filter((record) => record.employeeId === employee.id);
  const employeeAdjustments = adjustments.filter((record) => record.employeeId === employee.id);
  const manualAdditions = employeeAdjustments.filter((record) => record.type !== "deduction").reduce((sum, record) => sum + record.amount, 0);
  const manualDeductions = employeeAdjustments.filter((record) => record.type === "deduction").reduce((sum, record) => sum + record.amount, 0);
  const lateDeduction = employeeAttendance.reduce((sum, record) => sum + record.lateDeduction, 0);
  const overtimePay = employeeAttendance.reduce((sum, record) => sum + record.overtimePay, 0);
  const fridayPay = employeeAttendance.reduce((sum, record) => sum + record.fridayPay, 0);
  const netSalary = employee.baseSalary + employee.monthlyCommission + manualAdditions + overtimePay + fridayPay - employee.monthlyDeduction - manualDeductions - lateDeduction;

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    title: employee.title,
    baseSalary: moneyValue(employee.baseSalary),
    monthlyCommission: moneyValue(employee.monthlyCommission),
    monthlyDeduction: moneyValue(employee.monthlyDeduction),
    manualAdditions: moneyValue(manualAdditions),
    manualDeductions: moneyValue(manualDeductions),
    lateDeduction: moneyValue(lateDeduction),
    overtimePay: moneyValue(overtimePay),
    fridayPay: moneyValue(fridayPay),
    netSalary: moneyValue(netSalary),
    presentDays: employeeAttendance.filter((record) => record.status === "present").length,
    absentDays: employeeAttendance.filter((record) => record.status === "absent").length,
    incompleteDays: employeeAttendance.filter((record) => record.status === "incomplete").length,
    lateDays: employeeAttendance.filter((record) => record.lateMinutes > 0).length,
    lateMinutes: employeeAttendance.reduce((sum, record) => sum + record.lateMinutes, 0),
    overtimeMinutes: employeeAttendance.reduce((sum, record) => sum + record.overtimeMinutes, 0),
  };
}

export async function getHrState(month: string): Promise<HrState> {
  const [employeeResult, policyRow, attendanceResult, importResult, adjustmentResult] = await Promise.all([
    database.prepare(`SELECT id, biometric_code AS biometricCode, name, title, department, email, phone,
      hire_date AS hireDate, base_salary AS baseSalary, monthly_commission AS monthlyCommission,
      monthly_deduction AS monthlyDeduction, active, notes, created_at AS createdAt, updated_at AS updatedAt
      FROM employees ORDER BY active DESC, name COLLATE NOCASE`).all(),
    database.prepare(`SELECT id, currency, salary_divisor AS salaryDivisor, workday_minutes AS workdayMinutes,
      free_arrival_until AS freeArrivalUntil, minor_late_until AS minorLateUntil,
      quarter_day_until AS quarterDayUntil, overtime_starts_at AS overtimeStartsAt,
      overtime_arrival_cutoff AS overtimeArrivalCutoff, minute_penalty_multiplier AS minutePenaltyMultiplier,
      overtime_multiplier AS overtimeMultiplier, friday_multiplier AS fridayMultiplier,
      absence_deduction_enabled AS absenceDeductionEnabled, absence_day_multiplier AS absenceDayMultiplier,
      updated_at AS updatedAt FROM hr_policy WHERE id = 1`).first(),
    database.prepare(`SELECT a.id, a.import_id AS importId, a.employee_id AS employeeId, e.name AS employeeName,
      e.biometric_code AS biometricCode, a.work_date AS workDate, a.first_in AS firstIn, a.last_out AS lastOut,
      a.punches_json AS punchesJson, a.status, a.late_excused AS lateExcused,
      a.overtime_approved AS overtimeApproved, a.notes, a.created_at AS createdAt, a.updated_at AS updatedAt
      FROM attendance_records a JOIN employees e ON e.id = a.employee_id
      WHERE substr(a.work_date, 1, 7) = ? ORDER BY a.work_date DESC, e.name COLLATE NOCASE`).bind(month).all(),
    database.prepare(`SELECT id, file_name AS fileName, period_start AS periodStart, period_end AS periodEnd,
      employee_count AS employeeCount, record_count AS recordCount, created_employees AS createdEmployees,
      imported_at AS importedAt FROM attendance_imports
      WHERE substr(period_start, 1, 7) = ? ORDER BY id DESC`).bind(month).all(),
    database.prepare(`SELECT p.id, p.employee_id AS employeeId, e.name AS employeeName, p.period_month AS periodMonth,
      p.type, p.label, p.amount, p.notes, p.created_at AS createdAt
      FROM payroll_adjustments p JOIN employees e ON e.id = p.employee_id
      WHERE p.period_month = ? ORDER BY p.id DESC`).bind(month).all(),
  ]);

  const employees = employeeResult.results.map((row) => employeeFromRow(row as Record<string, unknown>));
  const policy = policyFromRow((policyRow ?? {}) as Record<string, unknown>);
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const attendance = attendanceResult.results.map((row) => attendanceFromRow(row as Record<string, unknown>, employeeMap, policy));
  const adjustments: PayrollAdjustment[] = adjustmentResult.results.map((row) => ({
    id: numberValue(row.id),
    employeeId: numberValue(row.employeeId),
    employeeName: String(row.employeeName ?? ""),
    periodMonth: String(row.periodMonth ?? ""),
    type: String(row.type) as PayrollAdjustment["type"],
    label: String(row.label ?? ""),
    amount: numberValue(row.amount),
    notes: String(row.notes ?? ""),
    createdAt: String(row.createdAt ?? ""),
  }));

  const payroll = employees.filter((employee) => employee.active).map((employee) => payrollForEmployee(employee, attendance, adjustments));
  return {
    month,
    employees,
    policy,
    attendance,
    imports: importResult.results.map((row) => ({
      id: numberValue(row.id),
      fileName: String(row.fileName ?? ""),
      periodStart: String(row.periodStart ?? ""),
      periodEnd: String(row.periodEnd ?? ""),
      employeeCount: numberValue(row.employeeCount),
      recordCount: numberValue(row.recordCount),
      createdEmployees: numberValue(row.createdEmployees),
      importedAt: String(row.importedAt ?? ""),
    })),
    adjustments,
    payroll,
  };
}
