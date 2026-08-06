import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
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
  const [component, accessComponent, hrComponent, api, usersApi, hrApi, hrImportApi, hrExportApi, hrExport, pdfApi, authApi, authServer, permissions, database, vercel, migration, authMigration, hrMigration, multiUserMigration] = await Promise.all([
    readFile(new URL("app/components/FmgSystem.tsx", root), "utf8"),
    readFile(new URL("app/components/AccessPanel.tsx", root), "utf8"),
    readFile(new URL("app/components/HrPanels.tsx", root), "utf8"),
    readFile(new URL("app/api/state/route.ts", root), "utf8"),
    readFile(new URL("app/api/users/route.ts", root), "utf8"),
    readFile(new URL("app/api/hr/route.ts", root), "utf8"),
    readFile(new URL("app/api/hr/import/route.ts", root), "utf8"),
    readFile(new URL("app/api/hr/export/route.ts", root), "utf8"),
    readFile(new URL("app/lib/hr-export.ts", root), "utf8"),
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
