import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  companyName: text("company_name").notNull().default(""),
  ownerName: text("owner_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  prefix: text("prefix").notNull().unique(),
  footerText1: text("footer_text_1").notNull().default(""),
  footerText2: text("footer_text_2").notNull().default(""),
  counter: integer("counter").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", { enum: ["invoice", "quotation"] }).notNull(),
  generatedCode: text("generated_code").notNull().unique(),
  clientId: integer("client_id").notNull().references(() => clients.id),
  categoryId: integer("category_id").notNull().references(() => categories.id),
  date: text("date").notNull(),
  validUntil: text("valid_until").notNull().default(""),
  preparedBy: text("prepared_by").notNull().default("Finance Department"),
  currency: text("currency").notNull().default("EGP"),
  project: text("project").notNull().default(""),
  status: text("status").notNull().default("Draft"),
  itemsJson: text("items_json").notNull(),
  subtotal: real("subtotal").notNull().default(0),
  discount: real("discount").notNull().default(0),
  tax: real("tax").notNull().default(0),
  total: real("total").notNull().default(0),
  paymentTerms: text("payment_terms").notNull().default(""),
  notesExclusions: text("notes_exclusions").notNull().default(""),
  pdfKey: text("pdf_key").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  agencyName: text("agency_name").notNull().default("FMG Agency"),
  defaultCurrency: text("default_currency").notNull().default("EGP"),
  preparedBy: text("prepared_by").notNull().default("Finance Department"),
  defaultPaymentTerms: text("default_payment_terms").notNull().default("50% advance payment • 50% upon completion"),
  defaultTax: real("default_tax").notNull().default(0),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const authCredentials = sqliteTable("auth_credentials", {
  id: integer("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const authSessions = sqliteTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id").notNull().default(1).references(() => authCredentials.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_auth_sessions_expires_at").on(table.expiresAt)]);

export const authUsers = sqliteTable("auth_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull().default(""),
  roleLabel: text("role_label").notNull().default("Team Member"),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  isAdmin: integer("is_admin").notNull().default(0),
  active: integer("active").notNull().default(1),
  permissionsJson: text("permissions_json").notNull().default("[]"),
  createdBy: integer("created_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_auth_users_active").on(table.active)]);

export const authUserSessions = sqliteTable("auth_user_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_auth_user_sessions_expires_at").on(table.expiresAt)]);

export const authAttempts = sqliteTable("auth_attempts", {
  attemptKey: text("attempt_key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  resetAt: integer("reset_at").notNull(),
});

export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  biometricCode: text("biometric_code").notNull().default(""),
  name: text("name").notNull(),
  title: text("title").notNull().default(""),
  department: text("department").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  hireDate: text("hire_date").notNull().default(""),
  baseSalary: real("base_salary").notNull().default(0),
  monthlyCommission: real("monthly_commission").notNull().default(0),
  monthlyDeduction: real("monthly_deduction").notNull().default(0),
  active: integer("active").notNull().default(1),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_employees_name").on(table.name),
  uniqueIndex("idx_employees_biometric_code").on(table.biometricCode).where(sql`${table.biometricCode} <> ''`),
]);

export const hrPolicy = sqliteTable("hr_policy", {
  id: integer("id").primaryKey(),
  currency: text("currency").notNull().default("EGP"),
  salaryDivisor: real("salary_divisor").notNull().default(30),
  workdayMinutes: integer("workday_minutes").notNull().default(480),
  freeArrivalUntil: text("free_arrival_until").notNull().default("11:05"),
  minorLateUntil: text("minor_late_until").notNull().default("11:15"),
  quarterDayUntil: text("quarter_day_until").notNull().default("11:45"),
  overtimeStartsAt: text("overtime_starts_at").notNull().default("19:15"),
  overtimeArrivalCutoff: text("overtime_arrival_cutoff").notNull().default("11:30"),
  minutePenaltyMultiplier: real("minute_penalty_multiplier").notNull().default(4),
  overtimeMultiplier: real("overtime_multiplier").notNull().default(2),
  fridayMultiplier: real("friday_multiplier").notNull().default(2),
  absenceDeductionEnabled: integer("absence_deduction_enabled").notNull().default(0),
  absenceDayMultiplier: real("absence_day_multiplier").notNull().default(1),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const attendanceImports = sqliteTable("attendance_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  employeeCount: integer("employee_count").notNull().default(0),
  recordCount: integer("record_count").notNull().default(0),
  createdEmployees: integer("created_employees").notNull().default(0),
  importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const attendanceRecords = sqliteTable("attendance_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id").references(() => attendanceImports.id, { onDelete: "set null" }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  workDate: text("work_date").notNull(),
  firstIn: text("first_in").notNull().default(""),
  lastOut: text("last_out").notNull().default(""),
  punchesJson: text("punches_json").notNull().default("[]"),
  status: text("status").notNull().default("present"),
  lateExcused: integer("late_excused").notNull().default(0),
  overtimeApproved: integer("overtime_approved").notNull().default(1),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("attendance_records_employee_id_work_date_unique").on(table.employeeId, table.workDate),
  index("idx_attendance_work_date").on(table.workDate),
  index("idx_attendance_employee_date").on(table.employeeId, table.workDate),
]);

export const payrollAdjustments = sqliteTable("payroll_adjustments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  periodMonth: text("period_month").notNull(),
  type: text("type", { enum: ["commission", "bonus", "allowance", "deduction"] }).notNull(),
  label: text("label").notNull(),
  amount: real("amount").notNull().default(0),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_adjustments_month_employee").on(table.periodMonth, table.employeeId)]);
