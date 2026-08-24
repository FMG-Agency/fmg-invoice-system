import { database } from "./database";
import type { AttendanceRecord, Employee, HrPolicy, HrState, PayrollAdjustment, PayrollSummary } from "../types";

let hrDatabaseReady: Promise<void> | null = null;

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
    policy_version INTEGER NOT NULL DEFAULT 2,
    currency TEXT NOT NULL DEFAULT 'EGP',
    salary_divisor REAL NOT NULL DEFAULT 30,
    workday_minutes INTEGER NOT NULL DEFAULT 480,
    workday_starts_at TEXT NOT NULL DEFAULT '11:00',
    free_arrival_until TEXT NOT NULL DEFAULT '11:05',
    minor_late_until TEXT NOT NULL DEFAULT '11:15',
    quarter_day_until TEXT NOT NULL DEFAULT '11:45',
    workday_ends_at TEXT NOT NULL DEFAULT '19:00',
    overtime_starts_at TEXT NOT NULL DEFAULT '19:15',
    overtime_approval_after TEXT NOT NULL DEFAULT '22:00',
    overtime_arrival_cutoff TEXT NOT NULL DEFAULT '11:30',
    minute_penalty_multiplier REAL NOT NULL DEFAULT 4,
    overtime_multiplier REAL NOT NULL DEFAULT 2,
    early_overtime_multiplier REAL NOT NULL DEFAULT 2.5,
    friday_multiplier REAL NOT NULL DEFAULT 2,
    early_leave_day_multiplier REAL NOT NULL DEFAULT 0.5,
    unpaid_leave_day_multiplier REAL NOT NULL DEFAULT 1,
    urgent_leave_deadline TEXT NOT NULL DEFAULT '12:00',
    urgent_leave_year_limit INTEGER NOT NULL DEFAULT 12,
    sick_report_after_days INTEGER NOT NULL DEFAULT 2,
    resort_leave_days INTEGER NOT NULL DEFAULT 7,
    resort_notice_days INTEGER NOT NULL DEFAULT 14,
    normal_leave_notice_days INTEGER NOT NULL DEFAULT 2,
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
    early_leave_excused INTEGER NOT NULL DEFAULT 0,
    leave_paid INTEGER NOT NULL DEFAULT 1,
    overtime_approved INTEGER NOT NULL DEFAULT 0,
    early_overtime_approved INTEGER NOT NULL DEFAULT 0,
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
  `CREATE TABLE IF NOT EXISTS employee_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    requester_user_id INTEGER NOT NULL REFERENCES auth_users(id),
    type TEXT NOT NULL CHECK(type IN ('leave','early_leave','mission','overtime','early_arrival')),
    leave_kind TEXT NOT NULL DEFAULT 'vacation' CHECK(leave_kind IN ('vacation','occasional_leave','resort_leave','sick_leave','urgent_leave','normal_leave')),
    date_from TEXT NOT NULL,
    date_to TEXT NOT NULL,
    start_time TEXT NOT NULL DEFAULT '',
    end_time TEXT NOT NULL DEFAULT '',
    duration_minutes INTEGER NOT NULL DEFAULT 0,
    leave_paid INTEGER,
    details TEXT NOT NULL,
    attachment_key TEXT NOT NULL DEFAULT '',
    attachment_name TEXT NOT NULL DEFAULT '',
    attachment_type TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
    assigned_reviewer_id INTEGER REFERENCES auth_users(id) ON DELETE SET NULL,
    reviewer_note TEXT NOT NULL DEFAULT '',
    reviewed_by_user_id INTEGER REFERENCES auth_users(id) ON DELETE SET NULL,
    reviewed_at TEXT NOT NULL DEFAULT '',
    decision_token TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_biometric_code ON employees(biometric_code) WHERE biometric_code <> ''",
  "CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name)",
  "CREATE INDEX IF NOT EXISTS idx_attendance_work_date ON attendance_records(work_date)",
  "CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_records(employee_id, work_date)",
  "CREATE INDEX IF NOT EXISTS idx_adjustments_month_employee ON payroll_adjustments(period_month, employee_id)",
  "CREATE INDEX IF NOT EXISTS idx_employee_requests_employee ON employee_requests(employee_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_employee_requests_status ON employee_requests(status, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_employee_requests_reviewer ON employee_requests(assigned_reviewer_id, status)",
];

async function ensureEmployeeRequestPolicySchema() {
  const table = await database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'employee_requests'").first<{ sql: string }>();
  if (!table || (table.sql.includes("'overtime'") && table.sql.includes("'resort_leave'"))) return;
  const columns = await database.prepare("PRAGMA table_info(employee_requests)").all<Record<string, unknown>>();
  const names = new Set(columns.results.map((column) => String(column.name)));
  const attachmentKey = names.has("attachment_key") ? "attachment_key" : "''";
  const attachmentName = names.has("attachment_name") ? "attachment_name" : "''";
  const attachmentType = names.has("attachment_type") ? "attachment_type" : "''";
  await database.batch([
    database.prepare(`CREATE TABLE employee_requests_policy_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      requester_user_id INTEGER NOT NULL REFERENCES auth_users(id),
      type TEXT NOT NULL CHECK(type IN ('leave','early_leave','mission','overtime','early_arrival')),
      leave_kind TEXT NOT NULL DEFAULT 'vacation' CHECK(leave_kind IN ('vacation','occasional_leave','resort_leave','sick_leave','urgent_leave','normal_leave')),
      date_from TEXT NOT NULL, date_to TEXT NOT NULL, start_time TEXT NOT NULL DEFAULT '', end_time TEXT NOT NULL DEFAULT '',
      duration_minutes INTEGER NOT NULL DEFAULT 0, leave_paid INTEGER, details TEXT NOT NULL,
      attachment_key TEXT NOT NULL DEFAULT '', attachment_name TEXT NOT NULL DEFAULT '', attachment_type TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
      assigned_reviewer_id INTEGER REFERENCES auth_users(id) ON DELETE SET NULL,
      reviewer_note TEXT NOT NULL DEFAULT '', reviewed_by_user_id INTEGER REFERENCES auth_users(id) ON DELETE SET NULL,
      reviewed_at TEXT NOT NULL DEFAULT '', decision_token TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare(`INSERT INTO employee_requests_policy_v2
      (id, employee_id, requester_user_id, type, leave_kind, date_from, date_to, start_time, end_time, duration_minutes,
       leave_paid, details, attachment_key, attachment_name, attachment_type, status, assigned_reviewer_id,
       reviewer_note, reviewed_by_user_id, reviewed_at, decision_token, created_at, updated_at)
      SELECT id, employee_id, requester_user_id, type, leave_kind, date_from, date_to, start_time, end_time, duration_minutes,
       leave_paid, details, ${attachmentKey}, ${attachmentName}, ${attachmentType}, status, assigned_reviewer_id,
       reviewer_note, reviewed_by_user_id, reviewed_at, decision_token, created_at, updated_at FROM employee_requests`),
    database.prepare("DROP TABLE employee_requests"),
    database.prepare("ALTER TABLE employee_requests_policy_v2 RENAME TO employee_requests"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_employee_requests_employee ON employee_requests(employee_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_employee_requests_status ON employee_requests(status, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_employee_requests_reviewer ON employee_requests(assigned_reviewer_id, status)"),
  ]);
}

async function initializeHrDatabase() {
  await database.batch(hrSchemaStatements.map((statement) => database.prepare(statement)));
  await ensureEmployeeRequestPolicySchema();
  const [policyColumns, attendanceColumns, requestColumns] = await Promise.all([
    database.prepare("PRAGMA table_info(hr_policy)").all<Record<string, unknown>>(),
    database.prepare("PRAGMA table_info(attendance_records)").all<Record<string, unknown>>(),
    database.prepare("PRAGMA table_info(employee_requests)").all<Record<string, unknown>>(),
  ]);
  const migrations = [];
  const hasColumn = (columns: { results: Record<string, unknown>[] }, name: string) => columns.results.some((column) => String(column.name) === name);
  const migrateExistingRequestRules = !hasColumn(requestColumns, "decision_token");
  if (!hasColumn(policyColumns, "policy_version")) migrations.push(database.prepare("ALTER TABLE hr_policy ADD COLUMN policy_version INTEGER NOT NULL DEFAULT 1"));
  if (!hasColumn(policyColumns, "workday_starts_at")) migrations.push(database.prepare("ALTER TABLE hr_policy ADD COLUMN workday_starts_at TEXT NOT NULL DEFAULT '11:00'"));
  if (!hasColumn(policyColumns, "workday_ends_at")) migrations.push(database.prepare("ALTER TABLE hr_policy ADD COLUMN workday_ends_at TEXT NOT NULL DEFAULT '19:00'"));
  if (!hasColumn(policyColumns, "overtime_approval_after")) migrations.push(database.prepare("ALTER TABLE hr_policy ADD COLUMN overtime_approval_after TEXT NOT NULL DEFAULT '22:00'"));
  if (!hasColumn(policyColumns, "early_overtime_multiplier")) migrations.push(database.prepare("ALTER TABLE hr_policy ADD COLUMN early_overtime_multiplier REAL NOT NULL DEFAULT 2.5"));
  if (!hasColumn(policyColumns, "early_leave_day_multiplier")) migrations.push(database.prepare("ALTER TABLE hr_policy ADD COLUMN early_leave_day_multiplier REAL NOT NULL DEFAULT 0.5"));
  if (!hasColumn(policyColumns, "unpaid_leave_day_multiplier")) migrations.push(database.prepare("ALTER TABLE hr_policy ADD COLUMN unpaid_leave_day_multiplier REAL NOT NULL DEFAULT 1"));
  if (!hasColumn(policyColumns, "urgent_leave_deadline")) migrations.push(database.prepare("ALTER TABLE hr_policy ADD COLUMN urgent_leave_deadline TEXT NOT NULL DEFAULT '12:00'"));
  if (!hasColumn(policyColumns, "urgent_leave_year_limit")) migrations.push(database.prepare("ALTER TABLE hr_policy ADD COLUMN urgent_leave_year_limit INTEGER NOT NULL DEFAULT 12"));
  if (!hasColumn(policyColumns, "sick_report_after_days")) migrations.push(database.prepare("ALTER TABLE hr_policy ADD COLUMN sick_report_after_days INTEGER NOT NULL DEFAULT 2"));
  if (!hasColumn(policyColumns, "resort_leave_days")) migrations.push(database.prepare("ALTER TABLE hr_policy ADD COLUMN resort_leave_days INTEGER NOT NULL DEFAULT 7"));
  if (!hasColumn(policyColumns, "resort_notice_days")) migrations.push(database.prepare("ALTER TABLE hr_policy ADD COLUMN resort_notice_days INTEGER NOT NULL DEFAULT 14"));
  if (!hasColumn(policyColumns, "normal_leave_notice_days")) migrations.push(database.prepare("ALTER TABLE hr_policy ADD COLUMN normal_leave_notice_days INTEGER NOT NULL DEFAULT 2"));
  if (!hasColumn(attendanceColumns, "early_leave_excused")) migrations.push(database.prepare("ALTER TABLE attendance_records ADD COLUMN early_leave_excused INTEGER NOT NULL DEFAULT 0"));
  if (!hasColumn(attendanceColumns, "leave_paid")) migrations.push(database.prepare("ALTER TABLE attendance_records ADD COLUMN leave_paid INTEGER NOT NULL DEFAULT 1"));
  if (!hasColumn(attendanceColumns, "early_overtime_approved")) migrations.push(database.prepare("ALTER TABLE attendance_records ADD COLUMN early_overtime_approved INTEGER NOT NULL DEFAULT 0"));
  if (!hasColumn(requestColumns, "leave_paid")) migrations.push(database.prepare("ALTER TABLE employee_requests ADD COLUMN leave_paid INTEGER"));
  if (!hasColumn(requestColumns, "decision_token")) migrations.push(database.prepare("ALTER TABLE employee_requests ADD COLUMN decision_token TEXT NOT NULL DEFAULT ''"));
  for (const migration of migrations) {
    try {
      await migration.run();
    } catch (error) {
      if (!/duplicate column name/i.test(error instanceof Error ? error.message : String(error))) throw error;
    }
  }
  await database.prepare(`UPDATE hr_policy SET policy_version = 2, workday_starts_at = '11:00', free_arrival_until = '11:05',
    minor_late_until = '11:15', quarter_day_until = '11:45', overtime_starts_at = '19:15', overtime_approval_after = '22:00',
    overtime_arrival_cutoff = '11:30', minute_penalty_multiplier = 4, overtime_multiplier = 2,
    early_overtime_multiplier = 2.5, friday_multiplier = 2, urgent_leave_deadline = '12:00', urgent_leave_year_limit = 12,
    sick_report_after_days = 2, resort_leave_days = 7, resort_notice_days = 14, normal_leave_notice_days = 2,
    updated_at = CURRENT_TIMESTAMP WHERE policy_version < 2`).run();
  await database.prepare("UPDATE attendance_records SET overtime_approved = 0 WHERE overtime_approved = 1 AND trim(notes) = ''").run();
  if (migrateExistingRequestRules) {
    await database.batch([
      database.prepare(`UPDATE employee_requests SET duration_minutes = MAX(
        0,
        (CAST(substr(end_time, 1, 2) AS INTEGER) * 60 + CAST(substr(end_time, 4, 2) AS INTEGER)) -
        MAX(
          CAST(substr(start_time, 1, 2) AS INTEGER) * 60 + CAST(substr(start_time, 4, 2) AS INTEGER),
          COALESCE((SELECT CAST(substr(overtime_starts_at, 1, 2) AS INTEGER) * 60 + CAST(substr(overtime_starts_at, 4, 2) AS INTEGER) FROM hr_policy WHERE id = 1), 1155)
        )
      ) WHERE type = 'mission' AND start_time <> '' AND end_time <> ''`),
      database.prepare("UPDATE employee_requests SET leave_paid = 1 WHERE type = 'leave' AND status = 'approved' AND leave_paid IS NULL"),
      database.prepare(`UPDATE attendance_records SET early_leave_excused = 1, late_excused = 0
        WHERE EXISTS (SELECT 1 FROM employee_requests r WHERE r.employee_id = attendance_records.employee_id
          AND r.type = 'early_leave' AND r.status = 'approved' AND r.date_from = attendance_records.work_date)`),
    ]);
  }
  await database.prepare(`INSERT OR IGNORE INTO hr_policy
    (id, policy_version, currency, salary_divisor, workday_minutes, workday_starts_at, free_arrival_until, minor_late_until,
      quarter_day_until, workday_ends_at, overtime_starts_at, overtime_approval_after, overtime_arrival_cutoff,
      minute_penalty_multiplier, overtime_multiplier, early_overtime_multiplier, friday_multiplier,
      early_leave_day_multiplier, unpaid_leave_day_multiplier, urgent_leave_deadline, urgent_leave_year_limit,
      sick_report_after_days, resort_leave_days, resort_notice_days, normal_leave_notice_days,
      absence_deduction_enabled, absence_day_multiplier)
    VALUES (1, 2, 'EGP', 30, 480, '11:00', '11:05', '11:15', '11:45', '19:00', '19:15', '22:00', '11:30',
      4, 2, 2.5, 2, 0.5, 1, '12:00', 12, 2, 7, 14, 2, 0, 1)`).run();
}

export async function ensureHrDatabase() {
  hrDatabaseReady ??= initializeHrDatabase();
  try {
    await hrDatabaseReady;
  } catch (error) {
    hrDatabaseReady = null;
    throw error;
  }
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

const leaveStatuses: AttendanceRecord["status"][] = ["vacation", "occasional_leave", "resort_leave", "sick_leave", "urgent_leave", "normal_leave"];

type AttendanceSource = Omit<AttendanceRecord, "lateMinutes" | "penaltyMinutes" | "earlyLeaveMinutes" | "overtimeMinutes" | "earlyOvertimeMinutes" | "lateDeduction" | "earlyLeaveDeduction" | "leaveDeduction" | "overtimePay" | "fridayPay">;

export function attendanceMath(record: AttendanceSource, employee: Employee, policy: HrPolicy) {
  const dailyRate = employee.baseSalary / Math.max(1, policy.salaryDivisor);
  const minuteRate = dailyRate / Math.max(1, policy.workdayMinutes);
  const arrival = minutesFromTime(record.firstIn);
  const departure = minutesFromTime(record.lastOut);
  const workdayStart = minutesFromTime(policy.workdayStartsAt) ?? 660;
  const freeArrival = minutesFromTime(policy.freeArrivalUntil) ?? 665;
  const minorLateEnd = minutesFromTime(policy.minorLateUntil) ?? 675;
  const quarterDayEnd = minutesFromTime(policy.quarterDayUntil) ?? 705;
  const workdayEnd = minutesFromTime(policy.workdayEndsAt) ?? 1140;
  const overtimeStart = minutesFromTime(policy.overtimeStartsAt) ?? 1155;
  const overtimeApprovalAfter = minutesFromTime(policy.overtimeApprovalAfter) ?? 1320;
  const overtimeCutoff = minutesFromTime(policy.overtimeArrivalCutoff) ?? 690;
  const friday = isFriday(record.workDate);

  let lateMinutes = 0;
  let penaltyMinutes = 0;
  let lateDeduction = 0;
  let earlyLeaveMinutes = 0;
  let earlyLeaveDeduction = 0;
  let leaveDeduction = 0;
  let overtimeMinutes = 0;
  let earlyOvertimeMinutes = 0;
  let overtimePay = 0;
  let fridayPay = 0;

  if (friday && (arrival !== null || departure !== null)) {
    fridayPay = dailyRate * policy.fridayMultiplier;
  } else if (!friday && leaveStatuses.includes(record.status) && !record.leavePaid) {
    leaveDeduction = dailyRate * policy.unpaidLeaveDayMultiplier;
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

    if (record.missionOvertimeMinutes <= 0 && departure !== null && arrival <= overtimeCutoff && departure > overtimeStart) {
      const approvedPastTen = record.overtimeApproved && record.notes.trim().length > 0;
      const eligibleDeparture = approvedPastTen ? departure : Math.min(departure, overtimeApprovalAfter);
      overtimeMinutes = Math.max(0, eligibleDeparture - overtimeStart);
      overtimePay = overtimeMinutes * minuteRate * policy.overtimeMultiplier;
    }

    if (record.earlyOvertimeApproved && record.notes.trim().length > 0 && arrival < workdayStart) {
      earlyOvertimeMinutes = workdayStart - arrival;
      overtimeMinutes += earlyOvertimeMinutes;
      overtimePay += earlyOvertimeMinutes * minuteRate * policy.earlyOvertimeMultiplier;
    }
  }

  if (!friday && departure !== null && ["present", "incomplete"].includes(record.status) && departure < workdayEnd) {
    earlyLeaveMinutes = workdayEnd - departure;
    if (!record.earlyLeaveExcused) earlyLeaveDeduction = dailyRate * policy.earlyLeaveDayMultiplier;
  }

  if (record.missionOvertimeMinutes > 0) {
    overtimeMinutes += record.missionOvertimeMinutes;
    overtimePay += record.missionOvertimeMinutes * minuteRate * policy.overtimeMultiplier;
  }

  return {
    lateMinutes,
    penaltyMinutes: Math.round(penaltyMinutes),
    earlyLeaveMinutes,
    overtimeMinutes,
    earlyOvertimeMinutes,
    lateDeduction: moneyValue(lateDeduction),
    earlyLeaveDeduction: moneyValue(earlyLeaveDeduction),
    leaveDeduction: moneyValue(leaveDeduction),
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
    policyVersion: numberValue(row.policyVersion || 2),
    currency: String(row.currency ?? "EGP"),
    salaryDivisor: numberValue(row.salaryDivisor),
    workdayMinutes: numberValue(row.workdayMinutes),
    workdayStartsAt: String(row.workdayStartsAt ?? "11:00"),
    freeArrivalUntil: String(row.freeArrivalUntil ?? "11:05"),
    minorLateUntil: String(row.minorLateUntil ?? "11:15"),
    quarterDayUntil: String(row.quarterDayUntil ?? "11:45"),
    workdayEndsAt: String(row.workdayEndsAt ?? "19:00"),
    overtimeStartsAt: String(row.overtimeStartsAt ?? "19:15"),
    overtimeApprovalAfter: String(row.overtimeApprovalAfter ?? "22:00"),
    overtimeArrivalCutoff: String(row.overtimeArrivalCutoff ?? "11:30"),
    minutePenaltyMultiplier: numberValue(row.minutePenaltyMultiplier),
    overtimeMultiplier: numberValue(row.overtimeMultiplier),
    earlyOvertimeMultiplier: numberValue(row.earlyOvertimeMultiplier || 2.5),
    fridayMultiplier: numberValue(row.fridayMultiplier),
    earlyLeaveDayMultiplier: numberValue(row.earlyLeaveDayMultiplier),
    unpaidLeaveDayMultiplier: numberValue(row.unpaidLeaveDayMultiplier),
    urgentLeaveDeadline: String(row.urgentLeaveDeadline ?? "12:00"),
    urgentLeaveYearLimit: numberValue(row.urgentLeaveYearLimit || 12),
    sickReportAfterDays: numberValue(row.sickReportAfterDays || 2),
    resortLeaveDays: numberValue(row.resortLeaveDays || 7),
    resortNoticeDays: numberValue(row.resortNoticeDays || 14),
    normalLeaveNoticeDays: numberValue(row.normalLeaveNoticeDays || 2),
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
    earlyLeaveExcused: boolValue(row.earlyLeaveExcused),
    leavePaid: row.leavePaid === null || row.leavePaid === undefined ? true : boolValue(row.leavePaid),
    overtimeApproved: boolValue(row.overtimeApproved),
    earlyOvertimeApproved: boolValue(row.earlyOvertimeApproved),
    missionOvertimeMinutes: numberValue(row.missionOvertimeMinutes),
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
  const earlyLeaveDeduction = employeeAttendance.reduce((sum, record) => sum + record.earlyLeaveDeduction, 0);
  const leaveDeduction = employeeAttendance.reduce((sum, record) => sum + record.leaveDeduction, 0);
  const attendanceDeduction = lateDeduction + earlyLeaveDeduction + leaveDeduction;
  const overtimePay = employeeAttendance.reduce((sum, record) => sum + record.overtimePay, 0);
  const fridayPay = employeeAttendance.reduce((sum, record) => sum + record.fridayPay, 0);
  const netSalary = employee.baseSalary + employee.monthlyCommission + manualAdditions + overtimePay + fridayPay - employee.monthlyDeduction - manualDeductions - attendanceDeduction;

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
    earlyLeaveDeduction: moneyValue(earlyLeaveDeduction),
    leaveDeduction: moneyValue(leaveDeduction),
    attendanceDeduction: moneyValue(attendanceDeduction),
    overtimePay: moneyValue(overtimePay),
    fridayPay: moneyValue(fridayPay),
    netSalary: moneyValue(netSalary),
    presentDays: employeeAttendance.filter((record) => record.status === "present").length,
    absentDays: employeeAttendance.filter((record) => record.status === "absent").length,
    incompleteDays: employeeAttendance.filter((record) => record.status === "incomplete").length,
    lateDays: employeeAttendance.filter((record) => record.lateMinutes > 0).length,
    earlyLeaveDays: employeeAttendance.filter((record) => record.earlyLeaveMinutes > 0 && !record.earlyLeaveExcused).length,
    unpaidLeaveDays: employeeAttendance.filter((record) => leaveStatuses.includes(record.status) && !record.leavePaid).length,
    lateMinutes: employeeAttendance.reduce((sum, record) => sum + record.lateMinutes, 0),
    overtimeMinutes: employeeAttendance.reduce((sum, record) => sum + record.overtimeMinutes, 0),
    missionOvertimeMinutes: employeeAttendance.reduce((sum, record) => sum + record.missionOvertimeMinutes, 0),
  };
}

export async function getHrState(month: string): Promise<HrState> {
  const [employeeResult, policyRow, attendanceResult, importResult, adjustmentResult] = await Promise.all([
    database.prepare(`SELECT id, biometric_code AS biometricCode, name, title, department, email, phone,
      hire_date AS hireDate, base_salary AS baseSalary, monthly_commission AS monthlyCommission,
      monthly_deduction AS monthlyDeduction, active, notes, created_at AS createdAt, updated_at AS updatedAt
      FROM employees ORDER BY active DESC, name COLLATE NOCASE`).all(),
    database.prepare(`SELECT id, policy_version AS policyVersion, currency, salary_divisor AS salaryDivisor, workday_minutes AS workdayMinutes,
      workday_starts_at AS workdayStartsAt, free_arrival_until AS freeArrivalUntil, minor_late_until AS minorLateUntil,
      quarter_day_until AS quarterDayUntil, workday_ends_at AS workdayEndsAt, overtime_starts_at AS overtimeStartsAt,
      overtime_approval_after AS overtimeApprovalAfter, overtime_arrival_cutoff AS overtimeArrivalCutoff,
      minute_penalty_multiplier AS minutePenaltyMultiplier, overtime_multiplier AS overtimeMultiplier,
      early_overtime_multiplier AS earlyOvertimeMultiplier, friday_multiplier AS fridayMultiplier,
      early_leave_day_multiplier AS earlyLeaveDayMultiplier, unpaid_leave_day_multiplier AS unpaidLeaveDayMultiplier,
      urgent_leave_deadline AS urgentLeaveDeadline, urgent_leave_year_limit AS urgentLeaveYearLimit,
      sick_report_after_days AS sickReportAfterDays, resort_leave_days AS resortLeaveDays,
      resort_notice_days AS resortNoticeDays, normal_leave_notice_days AS normalLeaveNoticeDays,
      absence_deduction_enabled AS absenceDeductionEnabled, absence_day_multiplier AS absenceDayMultiplier,
      updated_at AS updatedAt FROM hr_policy WHERE id = 1`).first(),
    database.prepare(`SELECT a.id, a.import_id AS importId, a.employee_id AS employeeId, e.name AS employeeName,
      e.biometric_code AS biometricCode, a.work_date AS workDate, a.first_in AS firstIn, a.last_out AS lastOut,
      a.punches_json AS punchesJson, a.status, a.late_excused AS lateExcused,
      a.early_leave_excused AS earlyLeaveExcused, a.leave_paid AS leavePaid,
      a.overtime_approved AS overtimeApproved, a.early_overtime_approved AS earlyOvertimeApproved,
      COALESCE((SELECT SUM(r.duration_minutes) FROM employee_requests r
        WHERE r.employee_id = a.employee_id AND r.type = 'mission' AND r.status = 'approved'
          AND a.work_date BETWEEN r.date_from AND r.date_to), 0) AS missionOvertimeMinutes,
      a.notes, a.created_at AS createdAt, a.updated_at AS updatedAt
      FROM attendance_records a JOIN employees e ON e.id = a.employee_id
      WHERE substr(a.work_date, 1, 7) = ? AND (e.hire_date = '' OR a.work_date >= e.hire_date)
      ORDER BY a.work_date DESC, e.name COLLATE NOCASE`).bind(month).all(),
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
