import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("builds the FMG production entrypoint", async () => {
  await access(new URL(".next/BUILD_ID", root));
  await access(new URL("public/digital-empire-logo.png", root));
  const [layout, page] = await Promise.all([
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
  ]);
  assert.match(layout, /FMG Agency \| Invoice & Quotation System/i);
  assert.match(layout, /og\.png/i);
  assert.match(page, /FmgSystem/);
  assert.doesNotMatch(`${layout}\n${page}`, /codex-preview|react-loading-skeleton/i);
});

test("ships the complete product, protected access, HR payroll, and Vercel storage adapters", async () => {
  const [component, clientAccountComponent, accessComponent, requestsComponent, hrComponent, api, clientAccountsApi, clientAccountsLib, usersApi, requestsApi, requestAttachmentApi, hrApi, hrImportApi, hrExportApi, hrExport, pdf, pdfApi, authApi, authServer, permissions, database, vercel, migration, authMigration, hrMigration, multiUserMigration, requestsMigration, payrollRulesMigration, quotationCatalogMigration, catalogIoMigration, companyMigration, clientAccountsMigration, policyV2Migration] = await Promise.all([
    readFile(new URL("app/components/FmgSystem.tsx", root), "utf8"),
    readFile(new URL("app/components/ClientAccountPanel.tsx", root), "utf8"),
    readFile(new URL("app/components/AccessPanel.tsx", root), "utf8"),
    readFile(new URL("app/components/RequestsPanel.tsx", root), "utf8"),
    readFile(new URL("app/components/HrPanels.tsx", root), "utf8"),
    readFile(new URL("app/api/state/route.ts", root), "utf8"),
    readFile(new URL("app/api/client-accounts/route.ts", root), "utf8"),
    readFile(new URL("app/lib/client-accounts.ts", root), "utf8"),
    readFile(new URL("app/api/users/route.ts", root), "utf8"),
    readFile(new URL("app/api/requests/route.ts", root), "utf8"),
    readFile(new URL("app/api/requests/attachment/[id]/route.ts", root), "utf8"),
    readFile(new URL("app/api/hr/route.ts", root), "utf8"),
    readFile(new URL("app/api/hr/import/route.ts", root), "utf8"),
    readFile(new URL("app/api/hr/export/route.ts", root), "utf8"),
    readFile(new URL("app/lib/hr-export.ts", root), "utf8"),
    readFile(new URL("app/lib/pdf.ts", root), "utf8"),
    readFile(new URL("app/api/pdf/[id]/route.ts", root), "utf8"),
    readFile(new URL("app/api/auth/route.ts", root), "utf8"),
    readFile(new URL("app/lib/auth-server.ts", root), "utf8"),
    readFile(new URL("app/lib/permissions.ts", root), "utf8"),
    readFile(new URL("app/lib/database.ts", root), "utf8"),
    readFile(new URL("vercel.json", root), "utf8"),
    readFile(new URL("drizzle/0000_exotic_nightcrawler.sql", root), "utf8"),
    readFile(new URL("drizzle/0001_gifted_hobgoblin.sql", root), "utf8"),
    readFile(new URL("drizzle/0002_yielding_sally_floyd.sql", root), "utf8"),
    readFile(new URL("drizzle/0003_cheerful_hedge_knight.sql", root), "utf8"),
    readFile(new URL("drizzle/0004_amusing_boomerang.sql", root), "utf8"),
    readFile(new URL("drizzle/0005_dizzy_veda.sql", root), "utf8"),
    readFile(new URL("drizzle/0006_swift_morph.sql", root), "utf8"),
    readFile(new URL("drizzle/0007_melted_metal_master.sql", root), "utf8"),
    readFile(new URL("drizzle/0008_hesitant_jack_flag.sql", root), "utf8"),
    readFile(new URL("drizzle/0009_futuristic_frank_castle.sql", root), "utf8"),
    readFile(new URL("drizzle/0010_polite_hydra.sql", root), "utf8"),
  ]);
  for (const expected of ["New Invoice", "New Quotation", "Media Guide Catalog", "Clients", "Employees", "Attendance", "Employee Requests", "Categories", "All Data", "Settings"]) {
    assert.match(component, new RegExp(expected));
  }
  for (const expected of ["Import biometric Excel", "Payroll", "Policy settings", "Download full Excel", "Monthly commission"]) {
    assert.match(hrComponent, new RegExp(expected));
  }
  assert.match(api, /saveDocument/);
  assert.match(api, /createClient/);
  assert.match(api, /createCategory/);
  assert.match(api, /requiredPermission/);
  assert.match(hrApi, /requireAnyPermission/);
  assert.match(hrApi, /requirePermission/);
  assert.match(hrApi, /updatePolicy/);
  assert.match(hrApi, /createAdjustment/);
  assert.match(hrImportApi, /requirePermission\(request, "attendance"\)/);
  assert.match(hrImportApi, /ExcelJS/);
  assert.match(hrImportApi, /parseWorksheet/);
  assert.match(hrExportApi, /requirePermission\(request, "attendance"\)/);
  assert.match(hrExportApi, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(hrExportApi, /payrollWorkbookBuffer/);
  assert.match(hrExport, /Payroll Summary/);
  assert.match(hrExport, /buildPayrollWorkbook/);
  assert.match(hrExport, /NET SALARY/);
  assert.match(hrExport, /one sheet per employee|addEmployeeSheet/i);
  for (const action of ["setup", "login", "logout", "change"]) {
    assert.match(authApi, new RegExp(`action: z\\.literal\\(\\"${action}\\"\\)`));
  }
  assert.match(authServer, /PASSWORD_ITERATIONS = 100_000/);
  assert.match(authServer, /JOIN auth_users/);
  assert.match(usersApi, /requireAdmin/);
  assert.match(usersApi, /permissions_json/);
  assert.match(accessComponent, /Operation Manager preset/);
  assert.match(accessComponent, /Linked employee/);
  assert.match(requestsComponent, /Leave request/);
  assert.match(requestsComponent, /Early-leave excuse/);
  assert.match(requestsComponent, /Work mission/);
  assert.match(requestsComponent, /Overtime approval/);
  assert.match(requestsComponent, /Urgent early arrival/);
  assert.match(requestsComponent, /medical report/i);
  assert.match(requestsComponent, /Religious \/ occasional holiday/);
  assert.match(requestsApi, /approvalStatements/);
  assert.match(requestsApi, /assigned_reviewer_id/);
  assert.match(requestsApi, /duration_minutes/);
  assert.match(requestsApi, /urgentLeaveYearLimit/);
  assert.match(requestsApi, /resortNoticeDays/);
  assert.match(requestsApi, /attachment_key/);
  assert.match(requestAttachmentApi, /get\(row\.attachmentKey, \{ access: "private" \}\)/);
  assert.match(requestAttachmentApi, /row\.employeeId !== session\.employeeId/);
  assert.match(permissions, /OPERATION_MANAGER_PERMISSIONS/);
  assert.doesNotMatch(permissions.match(/OPERATION_MANAGER_PERMISSIONS[\s\S]*?\];/)?.[0] ?? "", /"employees"|"attendance"/);
  assert.match(api, /@vercel\/blob/);
  assert.match(pdfApi, /get\(row\.pdfKey, \{ access: "private" \}\)/);
  assert.match(database, /TURSO_DATABASE_URL/);
  assert.match(database, /@libsql\/client/);
  assert.match(vercel, /"framework": "nextjs"/);
  assert.match(migration, /CREATE TABLE `documents`/);
  assert.match(migration, /CREATE TABLE `clients`/);
  assert.match(authMigration, /CREATE TABLE `auth_credentials`/);
  assert.match(authMigration, /CREATE TABLE `auth_sessions`/);
  assert.match(authMigration, /CREATE TABLE `auth_attempts`/);
  assert.match(hrMigration, /CREATE TABLE `employees`/);
  assert.match(hrMigration, /CREATE TABLE `attendance_records`/);
  assert.match(hrMigration, /CREATE TABLE `payroll_adjustments`/);
  assert.match(multiUserMigration, /CREATE TABLE `auth_users`/);
  assert.match(multiUserMigration, /CREATE TABLE `auth_user_sessions`/);
  assert.match(requestsMigration, /CREATE TABLE `employee_requests`/);
  assert.match(requestsMigration, /ALTER TABLE `auth_users` ADD `employee_id`/);
  assert.match(payrollRulesMigration, /workday_ends_at/);
  assert.match(payrollRulesMigration, /early_leave_excused/);
  assert.match(payrollRulesMigration, /leave_paid/);
  assert.match(payrollRulesMigration, /decision_token/);
  assert.match(policyV2Migration, /overtime_approval_after/);
  assert.match(policyV2Migration, /early_overtime_multiplier/);
  assert.match(policyV2Migration, /urgent_leave_year_limit/);
  assert.match(policyV2Migration, /sick_report_after_days/);
  assert.match(policyV2Migration, /resort_notice_days/);
  assert.match(hrComponent, /Policy v2/);
  assert.match(hrComponent, /Approved urgent early-arrival task/);
  assert.match(hrComponent, /First audit issue/);
  assert.match(hrExport, /Early-leave deduction/);
  assert.match(hrExport, /Unpaid-leave deduction/);
  assert.match(component, /storedTheme === "dark"/);
  assert.match(component, /FMG JEWELRY SERVICES · 2026/);
  assert.match(component, /New quotation catalog item/);
  assert.match(component, /Media Guide Catalog/);
  assert.match(component, /The Digital Empire/);
  assert.match(component, /company-switcher/);
  assert.match(component, /Open client account/);
  assert.match(clientAccountComponent, /CURRENT BALANCE/);
  assert.match(clientAccountComponent, /Total billed/);
  assert.match(clientAccountComponent, /Total received/);
  assert.match(clientAccountComponent, /Client needs to pay/);
  assert.match(clientAccountComponent, /Credit available for client/);
  assert.match(clientAccountComponent, /Payments & ledger/);
  assert.match(clientAccountComponent, /Payment received/);
  assert.match(clientAccountComponent, /Charge \/ debit/);
  assert.match(clientAccountComponent, /Credit note/);
  assert.match(clientAccountComponent, /Refund paid/);
  assert.match(clientAccountsApi, /requirePermission\(request, "clients"\)/);
  assert.match(clientAccountsApi, /createTransaction/);
  assert.match(clientAccountsApi, /deleteTransaction/);
  assert.match(clientAccountsLib, /inferredPaid/);
  assert.match(clientAccountsLib, /outstanding: Math\.max\(0, netBalance\)/);
  assert.match(clientAccountsMigration, /CREATE TABLE `client_financial_transactions`/);
  assert.match(component, /digital-empire-logo\.png/);
  assert.match(component, /mediaGuideSelected &&/);
  assert.match(component, /const mediaGuideSelected = isMediaGuideCategory\(category\)/);
  assert.doesNotMatch(component, /const mediaGuideSelected = type === "quotation"/);
  assert.match(component, /Media Guide invoices and quotations/);
  assert.match(component, /Choose a Media Guide bundle first/);
  assert.match(component, /No add-ons available for this bundle/);
  assert.match(component, /BUNDLE NAME/);
  assert.match(component, /INPUTS/);
  assert.match(component, /OUTPUTS/);
  assert.match(component, /mediaGuideSelected \? <div className="item-io-grid">/);
  assert.match(component, /document-notes"><Field label="Payment terms">/);
  assert.match(component, /Optional notes shown on the \$\{type\}/);
  assert.match(component, /paper-payment-notes/);
  assert.match(component, /selectCategory\(Number\(event\.target\.value\)\)/);
  assert.match(pdf, /category\.name\.trim\(\)\.toLowerCase\(\) === "media guide"/);
  assert.match(pdf, /const mediaGuideDocument = category\.name/);
  assert.doesNotMatch(pdf, /const mediaGuideQuotation = draft\.type === "quotation"/);
  assert.match(pdf, /\["DATE", addonGroup \? "ADD-ON NAME" : "BUNDLE NAME", "INPUTS", "OUTPUTS"/);
  assert.match(pdf, /band\(doc, "PAYMENT & NOTES  \/", y, theme\)/);
  assert.doesNotMatch(pdf, /FOR \$\{theme\.brandName\}/);
  assert.doesNotMatch(pdf, /CLIENT APPROVAL/);
  assert.match(pdf, /draft\.type !== "quotation"/);
  assert.match(pdf, /opacity: 0\.025/);
  assert.match(pdf, /fmg-logo-pdf\.png/);
  assert.match(api, /createQuotationCatalogItem/);
  assert.match(api, /updateQuotationCatalogItem/);
  assert.match(pdf, /JEWELRY PHOTOGRAPHY PACKAGES · 2026/);
  assert.match(pdf, /ADD-ONS/);
  assert.match(pdf, /BUNDLE NAME/);
  assert.match(pdf, /INPUTS/);
  assert.match(pdf, /OUTPUTS/);
  assert.match(pdf, /DIGITAL_EMPIRE_THEME/);
  assert.match(pdf, /#c7372c/);
  assert.match(pdf, /#c0c0c0/);
  assert.match(pdf, /THE DIGITAL EMPIRE  •  POWERED BY FMG AGENCY/);
  assert.match(api, /inputs_json AS inputsJson/);
  assert.match(api, /outputs_json AS outputsJson/);
  assert.match(api, /company_key AS companyKey/);
  assert.match(quotationCatalogMigration, /Stories Package/);
  assert.match(quotationCatalogMigration, /Photography Add-on/);
  assert.match(catalogIoMigration, /inputs_json/);
  assert.match(catalogIoMigration, /outputs_json/);
  assert.match(catalogIoMigration, /SET `inputs_json` = `included_services_json`/);
  assert.match(companyMigration, /ADD `company_key` text DEFAULT 'fmg' NOT NULL/);
});

test("ships the smart 2026 client workbook import and finance menu", async () => {
  const [component, financeComponent, financeApi, financeLib, accountsLib, seedText] = await Promise.all([
    readFile(new URL("app/components/FmgSystem.tsx", root), "utf8"),
    readFile(new URL("app/components/ClientFinancePanel.tsx", root), "utf8"),
    readFile(new URL("app/api/client-finance/route.ts", root), "utf8"),
    readFile(new URL("app/lib/client-finance.ts", root), "utf8"),
    readFile(new URL("app/lib/client-accounts.ts", root), "utf8"),
    readFile(new URL("app/data/fmg-clients-2026.json", root), "utf8"),
  ]);
  const seed = JSON.parse(seedText);

  assert.equal(seed.importKey, "fmg-clients-2026-v1");
  assert.equal(seed.profiles.length, 22);
  assert.equal(seed.retainers.length, 113);
  assert.equal(seed.ledger.length, 261);
  assert.equal(seed.ledger.filter((entry) => entry.type === "charge").length, 133);
  assert.equal(seed.ledger.filter((entry) => entry.type === "payment").length, 128);
  assert.equal(seed.ledger.filter((entry) => entry.type === "charge").reduce((sum, entry) => sum + entry.amount, 0), 4_172_150);
  assert.equal(seed.ledger.filter((entry) => entry.type === "payment").reduce((sum, entry) => sum + entry.amount, 0), 4_037_300);

  for (const expected of ["Client Directory", "Client Accounts", "Monthly Plans", "navSections", "nav-submenu", "aria-expanded"])
    assert.match(component, new RegExp(expected));
  assert.match(component, /<ClientFinancePanel mode="accounts"/);
  assert.match(component, /<ClientFinancePanel mode="monthly"/);
  assert.match(financeComponent, /Billed & charged/);
  assert.match(financeComponent, /Apply monthly plan/);
  assert.match(financeComponent, /saveRetainerRange/);
  assert.match(financeApi, /requirePermission\(request, "clients"\)/);
  assert.match(financeApi, /saveRetainerRange/);
  assert.match(financeLib, /client_monthly_retainers/);
  assert.match(financeLib, /workspace_data_imports/);
  assert.match(financeLib, /importClientWorkbookData/);
  assert.match(financeLib, /INSERT OR IGNORE INTO client_financial_transactions/);
  assert.match(accountsLib, /source_key/);
  assert.match(accountsLib, /type TEXT NOT NULL CHECK\(type IN \('charge','payment','credit','refund'\)\)/);
});

test("creates a durable client ledger with invoice links and all financial movement types", async () => {
  const db = createClient({ url: "file::memory:" });
  await db.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE clients (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE documents (id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id));
    INSERT INTO clients (id, name) VALUES (1, 'Client');
    INSERT INTO documents (id, client_id) VALUES (10, 1);
  `);
  await db.executeMultiple(await readFile(new URL("drizzle/0009_futuristic_frank_castle.sql", root), "utf8"));
  await db.execute({ sql: `INSERT INTO client_financial_transactions
    (client_id, document_id, type, amount, currency, transaction_date)
    VALUES (?, ?, 'payment', 4000, 'EGP', '2026-08-10'),
           (?, ?, 'credit', 500, 'EGP', '2026-08-10'),
           (?, ?, 'refund', 250, 'EGP', '2026-08-11')`, args: [1, 10, 1, 10, 1, 10] });
  const totals = await db.execute(`SELECT type, amount, document_id AS documentId
    FROM client_financial_transactions ORDER BY id`);
  assert.deepEqual(totals.rows, [
    { type: "payment", amount: 4000, documentId: 10 },
    { type: "credit", amount: 500, documentId: 10 },
    { type: "refund", amount: 250, documentId: 10 },
  ]);
  await db.execute("DELETE FROM documents WHERE id = 10");
  assert.equal((await db.execute("SELECT document_id AS documentId FROM client_financial_transactions LIMIT 1")).rows[0].documentId, null);
  db.close();
});

test("seeds the exact FMG 2026 jewelry packages and add-on", async () => {
  const db = createClient({ url: "file::memory:" });
  const migration = await readFile(new URL("drizzle/0006_swift_morph.sql", root), "utf8");
  await db.executeMultiple(migration);
  await db.executeMultiple(await readFile(new URL("drizzle/0007_melted_metal_master.sql", root), "utf8"));
  const packages = await db.execute("SELECT name, price, included_services_json AS services FROM quotation_catalog WHERE kind = 'package' ORDER BY id");
  const addon = await db.execute("SELECT name, price, applies_to AS appliesTo, bundle_total AS bundleTotal FROM quotation_catalog WHERE kind = 'addon'");
  assert.deepEqual(packages.rows.map((row) => ({ name: row.name, price: row.price, services: JSON.parse(row.services) })), [
    { name: "Stories Package", price: 15000, services: ["Videographer", "Camera", "Model"] },
    { name: "Product Photography Package", price: 25000, services: ["Photographer + Assistant", "Camera + Lights", "Studio + Props", "Retoucher"] },
    { name: "G1 Bundle", price: 40000, services: ["Videographer + Assistant", "Camera", "Foreign Model", "Location"] },
    { name: "G1+ Bundle", price: 65000, services: ["Mobile Content Creator", "Foreign Model", "Stylist", "Art Director"] },
    { name: "G2 Bundle", price: 65000, services: ["Photographer + Assistant", "Videographer + Assistant", "Foreign Model", "Studio", "Stylist", "Art Director"] },
  ]);
  assert.deepEqual(addon.rows[0], { name: "Photography Add-on", price: 10000, appliesTo: "G1 Bundle", bundleTotal: 50000 });
  const addonServices = await db.execute("SELECT included_services_json AS services FROM quotation_catalog WHERE kind = 'addon'");
  assert.deepEqual(JSON.parse(addonServices.rows[0].services), ["Photography Add-on"]);
  const io = await db.execute("SELECT included_services_json AS services, inputs_json AS inputs, outputs_json AS outputs FROM quotation_catalog ORDER BY id");
  assert.deepEqual(io.rows.map((row) => JSON.parse(row.inputs)), io.rows.map((row) => JSON.parse(row.services)));
  assert.deepEqual(io.rows.map((row) => JSON.parse(row.outputs)), io.rows.map(() => []));
  db.close();
});

test("migrates existing documents to FMG while allowing Digital Empire documents", async () => {
  const db = createClient({ url: "file::memory:" });
  await db.executeMultiple(`
    CREATE TABLE documents (id INTEGER PRIMARY KEY, type TEXT NOT NULL);
    INSERT INTO documents (id, type) VALUES (1, 'invoice');
  `);
  await db.executeMultiple(await readFile(new URL("drizzle/0008_hesitant_jack_flag.sql", root), "utf8"));
  assert.deepEqual((await db.execute("SELECT company_key AS companyKey FROM documents WHERE id = 1")).rows[0], { companyKey: "fmg" });
  await db.execute("INSERT INTO documents (id, type, company_key) VALUES (2, 'quotation', 'digital_empire')");
  assert.deepEqual((await db.execute("SELECT company_key AS companyKey FROM documents WHERE id = 2")).rows[0], { companyKey: "digital_empire" });
  db.close();
});

test("migrates mission overtime, early-leave excuses, and paid leave safely", async () => {
  const db = createClient({ url: "file::memory:" });
  await db.executeMultiple(`
    CREATE TABLE hr_policy (id INTEGER PRIMARY KEY, overtime_starts_at TEXT NOT NULL);
    CREATE TABLE attendance_records (
      id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL, work_date TEXT NOT NULL,
      late_excused INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE employee_requests (
      id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL,
      date_from TEXT NOT NULL, start_time TEXT NOT NULL DEFAULT '', end_time TEXT NOT NULL DEFAULT '',
      duration_minutes INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO hr_policy (id, overtime_starts_at) VALUES (1, '19:15');
    INSERT INTO attendance_records (id, employee_id, work_date, late_excused) VALUES (1, 1, '2026-08-10', 1);
    INSERT INTO employee_requests (id, employee_id, type, status, date_from, start_time, end_time, duration_minutes)
      VALUES (1, 1, 'mission', 'approved', '2026-08-10', '18:00', '20:00', 120),
             (2, 1, 'leave', 'approved', '2026-08-11', '', '', 0),
             (3, 1, 'early_leave', 'approved', '2026-08-10', '18:00', '', 0);
  `);
  const migration = await readFile(new URL("drizzle/0005_dizzy_veda.sql", root), "utf8");
  await db.executeMultiple(migration);
  const mission = await db.execute("SELECT duration_minutes AS durationMinutes FROM employee_requests WHERE id = 1");
  const leave = await db.execute("SELECT leave_paid AS leavePaid FROM employee_requests WHERE id = 2");
  const attendance = await db.execute("SELECT early_leave_excused AS earlyLeaveExcused, late_excused AS lateExcused FROM attendance_records WHERE id = 1");
  assert.equal(mission.rows[0].durationMinutes, 45);
  assert.equal(leave.rows[0].leavePaid, 1);
  assert.deepEqual(attendance.rows[0], { earlyLeaveExcused: 1, lateExcused: 0 });
  db.close();
});

test("migrates the FMG policy v2 fields without losing attendance", async () => {
  const db = createClient({ url: "file::memory:" });
  await db.executeMultiple(`
    CREATE TABLE attendance_imports (id INTEGER PRIMARY KEY);
    CREATE TABLE employees (id INTEGER PRIMARY KEY);
    CREATE TABLE attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT, import_id INTEGER, employee_id INTEGER NOT NULL,
      work_date TEXT NOT NULL, first_in TEXT NOT NULL DEFAULT '', last_out TEXT NOT NULL DEFAULT '',
      punches_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'present',
      late_excused INTEGER NOT NULL DEFAULT 0, early_leave_excused INTEGER NOT NULL DEFAULT 0,
      leave_paid INTEGER NOT NULL DEFAULT 1, overtime_approved INTEGER NOT NULL DEFAULT 1,
      notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX attendance_records_employee_id_work_date_unique ON attendance_records(employee_id, work_date);
    CREATE TABLE employee_requests (id INTEGER PRIMARY KEY);
    CREATE TABLE hr_policy (id INTEGER PRIMARY KEY);
    INSERT INTO employees (id) VALUES (1);
    INSERT INTO attendance_records (id, employee_id, work_date, first_in, last_out) VALUES (1, 1, '2026-08-17', '11:00', '22:30');
    INSERT INTO hr_policy (id) VALUES (1);
  `);
  await db.executeMultiple(await readFile(new URL("drizzle/0010_polite_hydra.sql", root), "utf8"));
  const attendance = await db.execute("SELECT first_in AS firstIn, last_out AS lastOut, early_overtime_approved AS earlyApproved FROM attendance_records WHERE id = 1");
  const policy = await db.execute("SELECT policy_version AS version, overtime_approval_after AS approvalAfter, urgent_leave_year_limit AS urgentLimit FROM hr_policy WHERE id = 1");
  assert.deepEqual(attendance.rows[0], { firstIn: "11:00", lastOut: "22:30", earlyApproved: 0 });
  assert.deepEqual(policy.rows[0], { version: 2, approvalAfter: "22:00", urgentLimit: 12 });
  db.close();
});

test("migrates the existing administrator and active session into multi-user auth", async () => {
  const db = createClient({ url: "file::memory:" });
  await db.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE auth_credentials (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL, password_iterations INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE auth_sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 1 REFERENCES auth_credentials(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO auth_credentials (id, username, password_hash, password_salt, password_iterations)
      VALUES (1, 'admin', 'hash', 'salt', 100000);
    INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ('session', 1, 9999999999);
  `);
  const migration = await readFile(new URL("drizzle/0003_cheerful_hedge_knight.sql", root), "utf8");
  await db.executeMultiple(migration);
  const admin = await db.execute("SELECT username, is_admin AS isAdmin FROM auth_users WHERE id = 1");
  const session = await db.execute("SELECT user_id AS userId FROM auth_user_sessions WHERE token_hash = 'session'");
  const legacySessions = await db.execute("SELECT COUNT(*) AS count FROM auth_sessions");
  assert.deepEqual(admin.rows[0], { username: "admin", isAdmin: 1 });
  assert.deepEqual(session.rows[0], { userId: 1 });
  assert.equal(legacySessions.rows[0].count, 0);
  db.close();
});

test("adds employee request routing and the employee-account link to an existing database", async () => {
  const db = createClient({ url: "file::memory:" });
  await db.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE auth_users (id INTEGER PRIMARY KEY, username TEXT NOT NULL);
    INSERT INTO employees (id, name) VALUES (1, 'Employee');
    INSERT INTO auth_users (id, username) VALUES (1, 'admin'), (2, 'employee');
  `);
  const migration = await readFile(new URL("drizzle/0004_amusing_boomerang.sql", root), "utf8");
  await db.executeMultiple(migration);
  await db.execute({ sql: `INSERT INTO employee_requests
    (employee_id, requester_user_id, type, leave_kind, date_from, date_to, start_time, end_time, duration_minutes, details)
    VALUES (?, ?, 'mission', 'normal_leave', '2026-08-10', '2026-08-10', '18:00', '20:00', 120, 'Client mission')`, args: [1, 2] });
  const request = await db.execute("SELECT type, duration_minutes AS durationMinutes, status FROM employee_requests");
  assert.deepEqual(request.rows[0], { type: "mission", durationMinutes: 120, status: "pending" });
  const columns = await db.execute("PRAGMA table_info(auth_users)");
  assert.ok(columns.rows.some((column) => column.name === "employee_id"));
  db.close();
});
