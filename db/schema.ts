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
  portalLogoKey: text("portal_logo_key").notNull().default(""),
  portalLogoType: text("portal_logo_type").notNull().default(""),
  portalLogoUpdatedAt: text("portal_logo_updated_at").notNull().default(""),
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
  companyKey: text("company_key", { enum: ["fmg", "digital_empire"] }).notNull().default("fmg"),
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
  productionWorkOrderId: integer("production_work_order_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_documents_production_work_order").on(table.productionWorkOrderId),
]);

export const clientFinancialTransactions = sqliteTable("client_financial_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull().references(() => clients.id),
  documentId: integer("document_id").references(() => documents.id, { onDelete: "set null" }),
  type: text("type", { enum: ["payment", "credit", "refund"] }).notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("EGP"),
  transactionDate: text("transaction_date").notNull(),
  paymentMethod: text("payment_method").notNull().default("Bank transfer"),
  reference: text("reference").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdBy: integer("created_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_client_financial_transactions_client_date").on(table.clientId, table.transactionDate),
  index("idx_client_financial_transactions_document").on(table.documentId),
]);

export const clientPortalPlans = sqliteTable("client_portal_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  part: integer("part").notNull(),
  title: text("title").notNull().default("Content plan"),
  url: text("url").notNull(),
  notes: text("notes").notNull().default(""),
  published: integer("published").notNull().default(1),
  createdBy: integer("created_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_client_portal_plans_period_part").on(table.clientId, table.year, table.month, table.part),
  index("idx_client_portal_plans_client_year").on(table.clientId, table.year, table.month),
]);

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

export const quotationCatalog = sqliteTable("quotation_catalog", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["package", "addon"] }).notNull(),
  name: text("name").notNull(),
  price: real("price").notNull().default(0),
  includedServicesJson: text("included_services_json").notNull().default("[]"),
  inputsJson: text("inputs_json").notNull().default("[]"),
  outputsJson: text("outputs_json").notNull().default("[]"),
  appliesTo: text("applies_to").notNull().default(""),
  bundleTotal: real("bundle_total"),
  active: integer("active").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_quotation_catalog_kind_name").on(table.kind, table.name),
  index("idx_quotation_catalog_sort").on(table.kind, table.sortOrder),
]);

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
  employeeId: integer("employee_id"),
  clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
  createdBy: integer("created_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_auth_users_active").on(table.active),
  uniqueIndex("idx_auth_users_employee_id").on(table.employeeId).where(sql`${table.employeeId} IS NOT NULL`),
  uniqueIndex("idx_auth_users_client_id").on(table.clientId).where(sql`${table.clientId} IS NOT NULL`),
]);

export const authUserSessions = sqliteTable("auth_user_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_auth_user_sessions_expires_at").on(table.expiresAt)]);

export const productionWorkOrders = sqliteTable("production_work_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  documentType: text("document_type", { enum: ["media_guide"] }).notNull().default("media_guide"),
  clientId: integer("client_id").notNull().references(() => clients.id),
  clientName: text("client_name").notNull(),
  bundleCatalogId: integer("bundle_catalog_id").notNull().references(() => quotationCatalog.id),
  bundleName: text("bundle_name").notNull(),
  bundlePrice: real("bundle_price").notNull().default(0),
  bundleInputsJson: text("bundle_inputs_json").notNull().default("[]"),
  bundleOutputsJson: text("bundle_outputs_json").notNull().default("[]"),
  addonCatalogId: integer("addon_catalog_id").references(() => quotationCatalog.id),
  addonName: text("addon_name").notNull().default(""),
  addonPrice: real("addon_price").notNull().default(0),
  addonInputsJson: text("addon_inputs_json").notNull().default("[]"),
  addonOutputsJson: text("addon_outputs_json").notNull().default("[]"),
  addonsJson: text("addons_json").notNull().default("[]"),
  workDate: text("work_date").notNull(),
  callTime: text("call_time").notNull().default(""),
  location: text("location").notNull().default(""),
  modelName: text("model_name").notNull().default(""),
  photographerName: text("photographer_name").notNull().default(""),
  accountNote: text("account_note").notNull().default(""),
  productionNote: text("production_note").notNull().default(""),
  operationNote: text("operation_note").notNull().default(""),
  productionOptionsJson: text("production_options_json").notNull().default("[]"),
  status: text("status", { enum: ["pending_production", "ready_for_operations"] }).notNull().default("pending_production"),
  createdByUserId: integer("created_by_user_id").notNull().references(() => authUsers.id),
  createdByName: text("created_by_name").notNull(),
  createdByRole: text("created_by_role").notNull(),
  productionManagerUserId: integer("production_manager_user_id").references(() => authUsers.id),
  productionManagerName: text("production_manager_name").notNull().default(""),
  operationManagerUserId: integer("operation_manager_user_id").references(() => authUsers.id),
  operationManagerName: text("operation_manager_name").notNull().default(""),
  accountSubmittedAt: text("account_submitted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  productionSubmittedAt: text("production_submitted_at").notNull().default(""),
  finalApprovedAt: text("final_approved_at").notNull().default(""),
  draftInvoiceId: integer("draft_invoice_id").references(() => documents.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_production_work_orders_status_date").on(table.status, table.workDate),
  index("idx_production_work_orders_creator").on(table.createdByUserId, table.createdAt),
]);

export const productionWorkOrderEvents = sqliteTable("production_work_order_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workOrderId: integer("work_order_id").notNull().references(() => productionWorkOrders.id, { onDelete: "cascade" }),
  eventType: text("event_type", { enum: ["account_submitted", "production_submitted"] }).notNull(),
  actorUserId: integer("actor_user_id").notNull().references(() => authUsers.id),
  actorName: text("actor_name").notNull(),
  actorRole: text("actor_role").notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_production_work_order_events_order").on(table.workOrderId, table.createdAt)]);

export const productionCrewMembers = sqliteTable("production_crew_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category", { enum: ["model", "photographer", "videographer"] }).notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  profileUrl: text("profile_url").notNull().default(""),
  notes: text("notes").notNull().default(""),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_production_crew_category").on(table.category, table.name),
  index("idx_production_crew_active").on(table.active),
]);

export const productionSettings = sqliteTable("production_settings", {
  id: integer("id").primaryKey(),
  modelCatalogUrl: text("model_catalog_url").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

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
  policyVersion: integer("policy_version").notNull().default(2),
  currency: text("currency").notNull().default("EGP"),
  salaryDivisor: real("salary_divisor").notNull().default(30),
  workdayMinutes: integer("workday_minutes").notNull().default(480),
  workdayStartsAt: text("workday_starts_at").notNull().default("11:00"),
  freeArrivalUntil: text("free_arrival_until").notNull().default("11:05"),
  minorLateUntil: text("minor_late_until").notNull().default("11:15"),
  quarterDayUntil: text("quarter_day_until").notNull().default("11:45"),
  workdayEndsAt: text("workday_ends_at").notNull().default("19:00"),
  overtimeStartsAt: text("overtime_starts_at").notNull().default("19:15"),
  overtimeApprovalAfter: text("overtime_approval_after").notNull().default("22:00"),
  overtimeArrivalCutoff: text("overtime_arrival_cutoff").notNull().default("11:30"),
  minutePenaltyMultiplier: real("minute_penalty_multiplier").notNull().default(4),
  overtimeMultiplier: real("overtime_multiplier").notNull().default(2),
  earlyOvertimeMultiplier: real("early_overtime_multiplier").notNull().default(2.5),
  fridayMultiplier: real("friday_multiplier").notNull().default(2),
  earlyLeaveDayMultiplier: real("early_leave_day_multiplier").notNull().default(0.5),
  unpaidLeaveDayMultiplier: real("unpaid_leave_day_multiplier").notNull().default(1),
  urgentLeaveDeadline: text("urgent_leave_deadline").notNull().default("12:00"),
  urgentLeaveYearLimit: integer("urgent_leave_year_limit").notNull().default(12),
  sickReportAfterDays: integer("sick_report_after_days").notNull().default(2),
  resortLeaveDays: integer("resort_leave_days").notNull().default(7),
  resortNoticeDays: integer("resort_notice_days").notNull().default(14),
  normalLeaveNoticeDays: integer("normal_leave_notice_days").notNull().default(2),
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
  earlyLeaveExcused: integer("early_leave_excused").notNull().default(0),
  leavePaid: integer("leave_paid").notNull().default(1),
  overtimeApproved: integer("overtime_approved").notNull().default(0),
  earlyOvertimeApproved: integer("early_overtime_approved").notNull().default(0),
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

export const employeeRequests = sqliteTable("employee_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  requesterUserId: integer("requester_user_id").notNull().references(() => authUsers.id),
  type: text("type", { enum: ["leave", "early_leave", "mission", "overtime", "early_arrival"] }).notNull(),
  leaveKind: text("leave_kind", { enum: ["vacation", "occasional_leave", "resort_leave", "sick_leave", "urgent_leave", "normal_leave"] }).notNull().default("vacation"),
  dateFrom: text("date_from").notNull(),
  dateTo: text("date_to").notNull(),
  startTime: text("start_time").notNull().default(""),
  endTime: text("end_time").notNull().default(""),
  durationMinutes: integer("duration_minutes").notNull().default(0),
  leavePaid: integer("leave_paid"),
  details: text("details").notNull(),
  attachmentKey: text("attachment_key").notNull().default(""),
  attachmentName: text("attachment_name").notNull().default(""),
  attachmentType: text("attachment_type").notNull().default(""),
  status: text("status", { enum: ["pending", "approved", "rejected", "cancelled"] }).notNull().default("pending"),
  assignedReviewerId: integer("assigned_reviewer_id").references(() => authUsers.id, { onDelete: "set null" }),
  reviewerNote: text("reviewer_note").notNull().default(""),
  reviewedByUserId: integer("reviewed_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  reviewedAt: text("reviewed_at").notNull().default(""),
  decisionToken: text("decision_token").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_employee_requests_employee").on(table.employeeId, table.createdAt),
  index("idx_employee_requests_status").on(table.status, table.createdAt),
  index("idx_employee_requests_reviewer").on(table.assignedReviewerId, table.status),
]);
