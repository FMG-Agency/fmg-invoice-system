import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("builds the FMG production entrypoint", async () => {
  await access(new URL(".next/BUILD_ID", root));
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
  const [component, hrComponent, api, hrApi, hrImportApi, hrExportApi, hrExport, pdfApi, authApi, authServer, database, vercel, migration, authMigration, hrMigration] = await Promise.all([
    readFile(new URL("app/components/FmgSystem.tsx", root), "utf8"),
    readFile(new URL("app/components/HrPanels.tsx", root), "utf8"),
    readFile(new URL("app/api/state/route.ts", root), "utf8"),
    readFile(new URL("app/api/hr/route.ts", root), "utf8"),
    readFile(new URL("app/api/hr/import/route.ts", root), "utf8"),
    readFile(new URL("app/api/hr/export/route.ts", root), "utf8"),
    readFile(new URL("app/lib/hr-export.ts", root), "utf8"),
    readFile(new URL("app/api/pdf/[id]/route.ts", root), "utf8"),
    readFile(new URL("app/api/auth/route.ts", root), "utf8"),
    readFile(new URL("app/lib/auth-server.ts", root), "utf8"),
    readFile(new URL("app/lib/database.ts", root), "utf8"),
    readFile(new URL("vercel.json", root), "utf8"),
    readFile(new URL("drizzle/0000_exotic_nightcrawler.sql", root), "utf8"),
    readFile(new URL("drizzle/0001_gifted_hobgoblin.sql", root), "utf8"),
    readFile(new URL("drizzle/0002_yielding_sally_floyd.sql", root), "utf8"),
  ]);
  for (const expected of ["New Invoice", "New Quotation", "Clients", "Employees", "Attendance", "Categories", "All Data", "Settings"]) {
    assert.match(component, new RegExp(expected));
  }
  for (const expected of ["Import biometric Excel", "Payroll", "Policy settings", "Download full Excel", "Monthly commission"]) {
    assert.match(hrComponent, new RegExp(expected));
  }
  assert.match(api, /saveDocument/);
  assert.match(api, /createClient/);
  assert.match(api, /createCategory/);
  assert.match(api, /requireAuth/);
  assert.match(hrApi, /requireAuth/);
  assert.match(hrApi, /updatePolicy/);
  assert.match(hrApi, /createAdjustment/);
  assert.match(hrImportApi, /requireAuth/);
  assert.match(hrImportApi, /ExcelJS/);
  assert.match(hrImportApi, /parseWorksheet/);
  assert.match(hrExportApi, /requireAuth/);
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
});
