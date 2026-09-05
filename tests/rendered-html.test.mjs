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
  const [component, clientAccountComponent, accessComponent, requestsComponent, hrComponent, api, clientAccountsApi, clientAccountsLib, usersApi, requestsApi, requestAttachmentApi, hrApi, hrImportApi, hrExportApi, hrExport, hrLib, pdf, pdfApi, authApi, authServer, permissions, database, vercel, migration, authMigration, hrMigration, multiUserMigration, requestsMigration, payrollRulesMigration, quotationCatalogMigration, catalogIoMigration, companyMigration, clientAccountsMigration, policyV2Migration] = await Promise.all([
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
    readFile(new URL("app/lib/hr.ts", root), "utf8"),
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
  assert.match(hrExport, /one sheet per employee|addCompactEmployeeSheet/i);
  assert.match(hrExport, /DAILY ATTENDANCE & TIME DETAIL/);
  assert.match(hrExport, /DAILY PAYROLL IMPACT & APPROVALS/);
  assert.match(hrExport, /Penalty Time \(min\)\\nLate Time ×\$\{state\.policy\.minutePenaltyMultiplier\}/);
  assert.match(hrExport, /Normal Mission Time \(min\)\\nNormal OT ×\$\{state\.policy\.overtimeMultiplier\}/);
  assert.match(hrExport, /Early Mission Time \(min\)\\nEarly OT ×\$\{state\.policy\.earlyOvertimeMultiplier\}/);
  assert.match(hrExport, /Total Mission Time \(min\)/);
  assert.match(hrExport, /G\$\{row\.number\}\*\$\{state\.policy\.minutePenaltyMultiplier\}/);
  assert.match(hrExport, /J\$\{row\.number\}\*\$\{state\.policy\.overtimeMultiplier\}/);
  assert.match(hrExport, /L\$\{row\.number\}\*\$\{state\.policy\.earlyOvertimeMultiplier\}/);
  assert.match(hrExport, /K\$\{row\.number\}\+M\$\{row\.number\}/);
  assert.match(hrExport, /only days explicitly allowed with a written reason/i);
  assert.match(hrExport, /days 1–16.*arrival cutoff/i);
  assert.match(hrApi, /action: z\.literal\("allowOvertimeDay"\)/);
  assert.match(hrApi, /Normal overtime allowed/);
  assert.match(hrApi, /Early overtime allowed/);
  assert.match(hrApi, /overtimeArrivalCutoff/);
  assert.match(hrLib, /workDay <= 16/);
  assert.match(hrLib, /overtimeArrivalEligible/);
  assert.match(hrLib, /writtenOvertimeApproval/);
  assert.match(hrLib, /normalMissionMinutes/);
  assert.match(hrLib, /earlyMissionMinutes/);
  assert.match(hrLib, /totalMissionMinutes/);
  assert.match(hrComponent, /Days 1–16/);
  assert.match(hrComponent, /Allow overtime for a specific employee and day/);
  assert.match(hrComponent, /Only allowed days count/);
  assert.match(requestsComponent, /from day 17 arrival must be no later than 11:30 AM/);
  assert.match(hrExport, /Early OT allowed/);
  assert.match(hrExport, /Email not provided/);
  assert.match(hrExport, /Phone not provided/);
  assert.match(hrExport, /Hire date not provided/);
  assert.match(hrExport, /No punches recorded/);
  assert.match(hrExport, /No manager note/);
  assert.match(hrExport, /DATA CHECK — Employee profile is incomplete/);
  assert.match(hrExport, /Update Employees before relying on payroll amounts/);
  assert.match(hrExport, /sheet\.pageSetup\.printArea = `A1:O/);
  assert.doesNotMatch(hrExport, /sheet\.views = \[\{ state: "frozen", ySplit: timeHeaderRow/);
  assert.doesNotMatch(hrExport, /Mission Time[^\n`]*×4/);
  for (const action of ["setup", "login", "logout", "change"]) {
    assert.match(authApi, new RegExp(`action: z\\.literal\\(\\"${action}\\"\\)`));
  }
  assert.match(authServer, /PASSWORD_ITERATIONS = 100_000/);
  assert.match(authServer, /JOIN auth_users/);
  assert.match(usersApi, /requireAdmin/);
  assert.match(usersApi, /permissions_json/);
  assert.match(accessComponent, /Ready-made employee presets/);
  assert.match(accessComponent, /Account Manager/);
  assert.match(accessComponent, /Production Manager/);
  assert.match(accessComponent, /Operation Manager/);
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
  assert.match(requestsApi, /action: z\.literal\("delete"\)/);
  assert.match(requestsApi, /Only an administrator can delete employee requests/);
  assert.match(requestsApi, /DELETE FROM employee_requests WHERE id = \? RETURNING id/);
  assert.match(requestsComponent, /Delete employee request/);
  assert.match(requestAttachmentApi, /get\(row\.attachmentKey, \{ access: "private" \}\)/);
  assert.match(requestAttachmentApi, /row\.employeeId !== session\.employeeId/);
  assert.match(permissions, /OPERATION_MANAGER_PERMISSIONS/);
  assert.doesNotMatch(permissions.match(/OPERATION_MANAGER_PERMISSIONS[\s\S]*?\];/)?.[0] ?? "", /"employees"|"attendance"/);
  assert.match(permissions, /function isOperationManager/);
  assert.match(permissions, /function effectivePermissions/);
  assert.match(permissions, /!normalized\.includes\("invoices"\)/);
  assert.match(authServer, /effectivePermissions\(parsePermissions\(row\.permissionsJson\), row\.roleLabel, isAdmin\)/);
  assert.match(authApi, /effectivePermissions/);
  assert.match(usersApi, /effectivePermissions/);
  assert.match(component, /function canOpenDocumentArchive/);
  assert.match(component, /\["all_data", "invoices", "quotations"\]/);
  assert.match(api, /SELECT type FROM documents WHERE id = \?/);
  assert.match(api, /allowed\("all_data"\)/);
  assert.match(api, /isOperationManager\(session\.roleLabel\)/);
  assert.match(api, /operationManagerInvoiceAccess/);
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
  assert.match(hrComponent, /Allow this day’s early overtime/);
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
  assert.match(component, /type === "quotation" && mediaGuideSelected && !selectedBundle/);
  assert.match(component, /Manual bundle · no preset/);
  assert.match(component, /Optional: choose a saved bundle or build the bundle manually/);
  assert.match(component, /No add-ons available for this bundle/);
  assert.match(component, /BUNDLE NAME/);
  assert.match(component, /INPUTS/);
  assert.match(component, /OUTPUTS/);
  assert.match(component, /mediaGuideSelected \? <div className="item-io-grid">/);
  assert.match(component, /document-notes"><Field label="Payment terms">/);
  assert.match(component, /Optional notes shown on the \$\{type\}/);
  assert.match(component, /use a negative unit price to apply previous client credit/);
  assert.match(component, /min=\{type === "invoice" \? undefined : 0\}/);
  assert.match(component, /const total = type === "invoice" \? rawTotal : Math\.max\(0, rawTotal\)/);
  assert.match(component, /paper-payment-notes/);
  assert.match(component, /const showPaymentNotes = draft\.type !== "invoice" \|\| Boolean\(draft\.paymentTerms\.trim\(\) \|\| draft\.notesExclusions\.trim\(\)\)/);
  assert.match(component, /\{showPaymentNotes && <section className="paper-payment-notes">/);
  assert.match(component, /selectCategory\(Number\(event\.target\.value\)\)/);
  assert.match(pdf, /category\.name\.trim\(\)\.toLowerCase\(\) === "media guide"/);
  assert.match(pdf, /const mediaGuideDocument = category\.name/);
  assert.match(pdf, /function quotationScopeText/);
  assert.match(pdf, /item\.includedServices\.length/);
  assert.match(component, /paper-scope-name/);
  assert.doesNotMatch(pdf, /const mediaGuideQuotation = draft\.type === "quotation"/);
  assert.match(pdf, /\["DATE", addonGroup \? "ADD-ON NAME" : "BUNDLE NAME", "INPUTS", "OUTPUTS"/);
  assert.match(pdf, /band\(doc, "PAYMENT & NOTES  \/", y, theme\)/);
  assert.match(pdf, /const showPaymentNotes = draft\.type !== "invoice" \|\| Boolean\(draft\.paymentTerms\.trim\(\) \|\| draft\.notesExclusions\.trim\(\)\)/);
  assert.match(pdf, /const paymentNotesHeight = showPaymentNotes/);
  assert.match(pdf, /const closingBottom = doc\.internal\.pageSize\.getHeight\(\) - 22/);
  assert.match(pdf, /if \(y \+ closingHeight > closingBottom\)/);
  assert.doesNotMatch(pdf, /if \(y > 205\)/);
  assert.match(pdf, /if \(showPaymentNotes\)/);
  assert.match(pdf, /draft\.type === "invoice" \? "—" : "50% advance payment • 50% upon completion"/);
  assert.match(pdf, /const grand = draft\.type === "invoice" \? rawTotal : Math\.max\(0, rawTotal\)/);
  assert.match(api, /unitPrice: z\.number\(\)\.finite\(\),/);
  assert.match(api, /Quotation item prices cannot be negative/);
  assert.match(api, /const total = data\.type === "invoice" \? rawTotal : Math\.max\(0, rawTotal\)/);
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

test("ships the locked Media Guide production workflow", async () => {
  const [component, workOrder, workOrderStyles, productionApi, permissions, migration, finalApprovalMigration, costingMigration, multiAddonMigration] = await Promise.all([
    readFile(new URL("app/components/FmgSystem.tsx", root), "utf8"),
    readFile(new URL("app/components/WorkOrderPanel.tsx", root), "utf8"),
    readFile(new URL("app/components/WorkOrderPanel.module.css", root), "utf8"),
    readFile(new URL("app/api/production/route.ts", root), "utf8"),
    readFile(new URL("app/lib/permissions.ts", root), "utf8"),
    readFile(new URL("drizzle/0011_stormy_nightshade.sql", root), "utf8"),
    readFile(new URL("drizzle/0012_demonic_gunslinger.sql", root), "utf8"),
    readFile(new URL("drizzle/0013_third_mimic.sql", root), "utf8"),
    readFile(new URL("drizzle/0017_brown_goblin_queen.sql", root), "utf8"),
  ]);
  assert.match(permissions, /key: "production"/);
  assert.match(component, /label: "Production"/);
  assert.match(component, /permission: "production"/);
  assert.match(workOrder, /Approve & send to Production/);
  assert.match(workOrder, /Approve & send to Operations/);
  assert.match(workOrder, /Final approve & lock/);
  assert.match(workOrder, /cannot edit or cancel/i);
  assert.match(workOrder, /Account Manager note/);
  assert.match(workOrder, /Production Manager note/);
  assert.match(workOrder, /Operation Manager note/);
  assert.match(workOrder, /Add option/);
  assert.match(workOrder, /Photographer/);
  assert.match(workOrder, /Videographer/);
  assert.match(workOrder, /Blogger/);
  assert.match(workOrder, /Hair Stylist/);
  assert.match(workOrder, /Makeup Stylist/);
  assert.match(workOrder, /INPUTS/);
  assert.match(workOrder, /OUTPUTS/);
  assert.match(workOrder, /PRICE · EGP/);
  assert.match(workOrder, /Draft invoice/);
  assert.match(workOrder, /FINAL APPROVED/);
  assert.match(workOrder, /Included in bundle/);
  assert.match(workOrder, /Extra cost/);
  assert.match(workOrder, /Search by client, order code, bundle, or manager/);
  assert.match(workOrder, /WORK ORDER TOTAL/);
  assert.match(workOrder, /PRODUCTION RESOURCES/);
  assert.match(workOrder, /Action required/);
  assert.match(workOrderStyles, /\.orderGrid \{[^}]*display: grid; grid-template-columns: 1fr/);
  assert.match(workOrderStyles, /\.workflowTrack/);
  assert.match(workOrderStyles, /\.orderToolbar/);
  assert.match(workOrder, /Work orders from date/);
  assert.match(workOrder, /Work orders to date/);
  assert.match(workOrder, /Download PDF/);
  assert.match(workOrder, /role="dialog" aria-modal="true" aria-label=\{`Final work order/);
  assert.match(workOrder, /import\("html2canvas"\)/);
  assert.match(workOrder, /aria-expanded=\{expanded\}/);
  assert.match(workOrder, /View details/);
  assert.match(workOrder, /Number\.isFinite\(option\.price\) \? option\.price : ""/);
  assert.match(workOrder, /productionOptionPrice\(option\)/);
  assert.match(workOrderStyles, /\.previewModalLayer/);
  assert.match(workOrderStyles, /\.orderDetails \{/);
  assert.match(workOrderStyles, /\.chevronOpen/);
  assert.match(workOrderStyles, /\.orderGrid \{[^}]*gap: 20px/);
  assert.match(workOrderStyles, /\.optionsTable th:nth-child\(4\) \{ width: 24%; \}/);
  assert.doesNotMatch(workOrderStyles, /\.optionsTable th:nth-child\(3\) \{ width: 55%; \}/);
  assert.match(workOrder, /Only production options marked Extra cost are added above the bundle price/);
  assert.match(workOrder, /Choose more than one or create a custom item/);
  assert.match(workOrder, /Custom add-on/);
  assert.match(workOrder, /previewOrder\.addons\.map/);
  assert.match(workOrder, /completing\.addons\.map/);
  assert.match(productionApi, /role !== "account_manager" && role !== "operation_manager" && role !== "administrator"/);
  assert.match(productionApi, /role !== "production_manager" && role !== "operation_manager" && role !== "administrator"/);
  assert.match(productionApi, /role !== "operation_manager" && role !== "administrator"/);
  assert.match(workOrder, /state\.role === "account_manager" \|\| state\.role === "operation_manager" \|\| state\.role === "administrator"/);
  assert.match(workOrder, /state\.role === "production_manager" \|\| state\.role === "operation_manager" \|\| state\.role === "administrator"/);
  assert.doesNotMatch(productionApi, /role === "operation_manager"[\s\S]{0,120}pending_operations/);
  assert.match(productionApi, /action: z\.literal\("finalApprove"\)/);
  assert.match(productionApi, /WHERE id = \? AND status = 'pending_production'/);
  assert.match(productionApi, /WHERE id = \? AND status = 'ready_for_operations' AND final_approved_at = ''/);
  assert.match(productionApi, /production_options_json/);
  assert.match(productionApi, /billingMode: z\.enum\(\["included", "extra"\]\)\.default\("included"\)/);
  assert.match(productionApi, /option\.billingMode === "extra" \? option\.price : 0/);
  assert.match(productionApi, /input\.options\.filter\(\(option\) => option\.billingMode === "extra"\)/);
  assert.match(productionApi, /addons: z\.array\(addonSelectionSchema\)\.max\(20/);
  assert.match(productionApi, /input\.scope\.addons\.map/);
  assert.match(productionApi, /addons_json/);
  assert.match(productionApi, /Only an administrator can delete production work orders/);
  assert.match(productionApi, /DELETE FROM production_work_orders WHERE id = \?/);
  assert.match(productionApi, /INSERT OR IGNORE INTO documents/);
  assert.match(productionApi, /'Draft'/);
  assert.doesNotMatch(productionApi, /action: z\.literal\("(?:update|cancel)"\)/);
  assert.match(migration, /CREATE TABLE `production_work_orders`/);
  assert.match(migration, /CREATE TABLE `production_work_order_events`/);
  assert.match(finalApprovalMigration, /operation_manager_user_id/);
  assert.match(finalApprovalMigration, /final_approved_at/);
  assert.match(costingMigration, /production_options_json/);
  assert.match(costingMigration, /production_work_order_id/);
  assert.match(costingMigration, /draft_invoice_id/);
  assert.match(multiAddonMigration, /ADD `addons_json`/);
  assert.match(multiAddonMigration, /Rana Wagih/);
  assert.match(multiAddonMigration, /Ahmed Attia/);
  assert.match(multiAddonMigration, /Foreign model/);
  assert.match(workOrderStyles, /size: A4 landscape/);
});

test("ships role-targeted in-app and device push notifications", async () => {
  const [shell, center, notificationApi, notificationLib, productionApi, requestsApi, serviceWorker, manifest, migration] = await Promise.all([
    readFile(new URL("app/components/FmgSystem.tsx", root), "utf8"),
    readFile(new URL("app/components/NotificationCenter.tsx", root), "utf8"),
    readFile(new URL("app/api/notifications/route.ts", root), "utf8"),
    readFile(new URL("app/lib/notifications.ts", root), "utf8"),
    readFile(new URL("app/api/production/route.ts", root), "utf8"),
    readFile(new URL("app/api/requests/route.ts", root), "utf8"),
    readFile(new URL("public/sw.js", root), "utf8"),
    readFile(new URL("public/manifest.webmanifest", root), "utf8"),
    readFile(new URL("drizzle/0018_round_colleen_wing.sql", root), "utf8"),
  ]);
  assert.match(shell, /<NotificationCenter/);
  assert.match(shell, /new URLSearchParams\(window\.location\.search\)\.get\("view"\)/);
  assert.match(center, /navigator\.serviceWorker\.register\("\/sw\.js"/);
  assert.match(center, /registration\.pushManager\.subscribe/);
  assert.match(center, /Get alerts on this device/);
  assert.match(center, /25_000/);
  assert.match(notificationApi, /ON CONFLICT\(endpoint\) DO UPDATE SET user_id = excluded\.user_id/);
  assert.match(notificationApi, /Invalid request origin/);
  assert.match(notificationLib, /buildPushPayload/);
  assert.match(notificationLib, /workflowRecipientUserIds/);
  assert.match(productionApi, /work_order_pending_production/);
  assert.match(productionApi, /work_order_pending_operations/);
  assert.match(productionApi, /work_order_final_approved/);
  assert.match(requestsApi, /employee_request_created/);
  assert.match(requestsApi, /employee_request_assigned/);
  assert.match(requestsApi, /employee_request_\$\{payload\.decision\}/);
  assert.match(serviceWorker, /self\.addEventListener\("push"/);
  assert.match(serviceWorker, /self\.addEventListener\("notificationclick"/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(migration, /CREATE TABLE `system_notifications`/);
  assert.match(migration, /CREATE TABLE `push_subscriptions`/);

  const db = createClient({ url: "file::memory:" });
  await db.execute("PRAGMA foreign_keys = ON");
  await db.execute("CREATE TABLE auth_users (id INTEGER PRIMARY KEY)");
  await db.executeMultiple(migration);
  await db.execute("INSERT INTO auth_users (id) VALUES (1)");
  await db.execute("INSERT INTO system_notifications (user_id, type, title, message) VALUES (1, 'test', 'Ready', 'Notification stored')");
  await db.execute("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (1, 'https://push.example/one', 'key', 'auth')");
  const unread = await db.execute("SELECT COUNT(*) AS count FROM system_notifications WHERE user_id = 1 AND read_at = ''");
  assert.equal(unread.rows[0].count, 1);
  db.close();
});

test("ships the Production talent and crew directory with work-order pickers", async () => {
  const [component, directory, directoryStyles, workOrder, productionApi, migration] = await Promise.all([
    readFile(new URL("app/components/FmgSystem.tsx", root), "utf8"),
    readFile(new URL("app/components/ProductionDirectoryPanel.tsx", root), "utf8"),
    readFile(new URL("app/components/ProductionDirectoryPanel.module.css", root), "utf8"),
    readFile(new URL("app/components/WorkOrderPanel.tsx", root), "utf8"),
    readFile(new URL("app/api/production/route.ts", root), "utf8"),
    readFile(new URL("drizzle/0016_outgoing_ken_ellis.sql", root), "utf8"),
  ]);
  assert.match(component, /label: "Production"[\s\S]*items: \["work-order", "production-directory"\]/);
  assert.match(component, /label: "Work Orders"/);
  assert.match(component, /label: "Talent & Crew"/);
  assert.match(directory, /Open model catalogue/);
  assert.match(directory, /Phone number/);
  assert.match(directory, /Add talent \/ crew/);
  assert.match(directory, /Models/);
  assert.match(directory, /Photographers/);
  assert.match(directory, /Videographers/);
  assert.match(directoryStyles, /\.crewGrid/);
  assert.match(workOrder, /Use someone not listed/);
  assert.match(workOrder, /Saved talent \/ crew/);
  assert.match(workOrder, /Open model catalogue/);
  assert.match(workOrder, /directoryCategory === "photographer" \|\| directoryCategory === "videographer"/);
  assert.match(workOrder, /member\.category === "photographer" \|\| member\.category === "videographer"/);
  assert.match(workOrder, /optionLabels\[member\.category\]/);
  assert.match(productionApi, /action: z\.literal\("saveCrew"\)/);
  assert.match(productionApi, /action: z\.literal\("saveDirectorySettings"\)/);
  assert.match(productionApi, /requirePermission\(request, "production"\)/);
  assert.match(migration, /CREATE TABLE `production_crew_members`/);
  assert.match(migration, /CREATE TABLE `production_settings`/);
});

test("lets internal users change their own password while client and company settings stay protected", async () => {
  const [component, credentials, clientPortal, authApi, stateApi, permissions] = await Promise.all([
    readFile(new URL("app/components/FmgSystem.tsx", root), "utf8"),
    readFile(new URL("app/components/LoginCredentialsPanel.tsx", root), "utf8"),
    readFile(new URL("app/components/ClientPortalPanel.tsx", root), "utf8"),
    readFile(new URL("app/api/auth/route.ts", root), "utf8"),
    readFile(new URL("app/api/state/route.ts", root), "utf8"),
    readFile(new URL("app/lib/permissions.ts", root), "utf8"),
  ]);
  assert.match(component, /next === "settings"/);
  assert.match(component, /auth\.isAdmin[\s\S]*<SettingsPanel[\s\S]*<LoginCredentialsPanel/);
  assert.match(credentials, /Login credentials/);
  assert.match(credentials, /Change my password/);
  assert.match(credentials, /readOnly=\{!allowUsernameChange\}/);
  assert.match(credentials, /Company profile and document defaults remain administrator-only/);
  assert.doesNotMatch(clientPortal, /Settings2/);
  assert.doesNotMatch(clientPortal, /<LoginCredentialsPanel/);
  assert.match(authApi, /session\.isAdmin \? payload\.newUsername : session\.username/);
  assert.match(authApi, /session\.clientId !== null[\s\S]*Client login credentials can only be changed by an administrator/);
  assert.match(stateApi, /payload\.action === "updateSettings" && !session\.isAdmin/);
  assert.match(permissions, /Personal login credentials; agency defaults remain administrator-only/);
});

test("upgrades existing production orders for Operations final approval", async () => {
  const db = createClient({ url: "file::memory:" });
  await db.execute("CREATE TABLE documents (id INTEGER PRIMARY KEY)");
  await db.executeMultiple(await readFile(new URL("drizzle/0011_stormy_nightshade.sql", root), "utf8"));
  await db.executeMultiple(await readFile(new URL("drizzle/0012_demonic_gunslinger.sql", root), "utf8"));
  await db.executeMultiple(await readFile(new URL("drizzle/0013_third_mimic.sql", root), "utf8"));
  await db.executeMultiple(await readFile(new URL("drizzle/0016_outgoing_ken_ellis.sql", root), "utf8"));
  await db.executeMultiple(await readFile(new URL("drizzle/0017_brown_goblin_queen.sql", root), "utf8"));
  const columns = await db.execute("PRAGMA table_info(production_work_orders)");
  const names = columns.rows.map((column) => column.name);
  assert.ok(names.includes("operation_note"));
  assert.ok(names.includes("operation_manager_user_id"));
  assert.ok(names.includes("operation_manager_name"));
  assert.ok(names.includes("final_approved_at"));
  assert.ok(names.includes("production_options_json"));
  assert.ok(names.includes("draft_invoice_id"));
  assert.ok(names.includes("addons_json"));
  const documentColumns = await db.execute("PRAGMA table_info(documents)");
  assert.ok(documentColumns.rows.some((column) => column.name === "production_work_order_id"));
  const seededModels = await db.execute("SELECT name, phone, notes FROM production_crew_members WHERE category = 'model' ORDER BY id");
  assert.equal(seededModels.rows.length, 17);
  assert.ok(seededModels.rows.some((model) => model.name === "Neven Tarek" && model.notes === "Ahmed Attia"));
  assert.ok(seededModels.rows.some((model) => model.name === "Anastasia" && model.notes === "Foreign model"));
  db.close();
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

  for (const expected of ["Client Directory", "Client Accounts", "Retainers", "Client Portal", "navSections", "nav-submenu", "aria-expanded"])
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

test("ships a private client invoice portal with publishable monthly Canva plans and client branding", async () => {
  const [component, portalComponent, portalStyles, portalApi, logoApi, portalLib, fileStorage, worker, authApi, authServer, usersApi, accessComponent, permissions, pdfApi, migration, logoMigration] = await Promise.all([
    readFile(new URL("app/components/FmgSystem.tsx", root), "utf8"),
    readFile(new URL("app/components/ClientPortalPanel.tsx", root), "utf8"),
    readFile(new URL("app/components/ClientPortalPanel.module.css", root), "utf8"),
    readFile(new URL("app/api/client-portal/route.ts", root), "utf8"),
    readFile(new URL("app/api/client-portal/logo/[clientId]/route.ts", root), "utf8"),
    readFile(new URL("app/lib/client-portal.ts", root), "utf8"),
    readFile(new URL("app/lib/file-storage.ts", root), "utf8"),
    readFile(new URL("worker/index.ts", root), "utf8"),
    readFile(new URL("app/api/auth/route.ts", root), "utf8"),
    readFile(new URL("app/lib/auth-server.ts", root), "utf8"),
    readFile(new URL("app/api/users/route.ts", root), "utf8"),
    readFile(new URL("app/components/AccessPanel.tsx", root), "utf8"),
    readFile(new URL("app/lib/permissions.ts", root), "utf8"),
    readFile(new URL("app/api/pdf/[id]/route.ts", root), "utf8"),
    readFile(new URL("drizzle/0014_youthful_mephistopheles.sql", root), "utf8"),
    readFile(new URL("drizzle/0015_fresh_garia.sql", root), "utf8"),
  ]);
  assert.match(component, /client-portal-admin/);
  assert.match(component, /auth\.clientId !== null/);
  assert.match(component, /<ClientPortalShell/);
  assert.match(portalComponent, /Your account, made clear/);
  assert.match(portalComponent, /Every plan\. Every month\. One place/);
  assert.match(portalComponent, /Part 1 covers days 1–15/);
  assert.match(portalComponent, /16–\$\{String\(finalDay\)/);
  assert.match(portalComponent, /Canva or external link/);
  assert.match(portalComponent, /ClientBrandMark/);
  assert.match(portalComponent, /Upload logo/);
  assert.match(portalComponent, /Replace logo/);
  assert.doesNotMatch(portalComponent, /TOTAL RECEIVED/);
  assert.match(portalComponent, /image\/png,image\/jpeg,image\/webp/);
  assert.match(portalComponent, /2 \* 1024 \* 1024/);
  assert.match(portalComponent, /api\/client-portal\/logo/);
  assert.match(portalComponent, /target="_blank" rel="noopener noreferrer"/);
  assert.match(portalStyles, /grid-template-columns: repeat\(3/);
  assert.match(portalStyles, /@media \(max-width: 760px\)/);
  assert.match(portalApi, /requirePermission\(request, "client_portal"\)/);
  assert.match(portalApi, /Client accounts are read-only/);
  assert.match(portalApi, /ON CONFLICT\(client_id, year, month, part\)/);
  assert.match(portalLib, /p\.published = 1/);
  assert.match(portalLib, /!\["Draft", "Rejected"\]\.includes/);
  assert.match(portalLib, /portalLogoAvailable/);
  assert.match(logoApi, /requirePermission\(request, "client_portal"\)/);
  assert.match(logoApi, /session\.clientId !== null && session\.clientId !== numericClientId/);
  assert.match(logoApi, /MAX_LOGO_BYTES = 2 \* 1024 \* 1024/);
  assert.match(logoApi, /image\/png/);
  assert.match(logoApi, /image\/jpeg/);
  assert.match(logoApi, /image\/webp/);
  assert.match(logoApi, /putPrivateFile/);
  assert.match(logoApi, /deletePrivateFile/);
  assert.match(fileStorage, /__FMG_FILES_BUCKET__/);
  assert.match(fileStorage, /@vercel\/blob/);
  assert.match(worker, /__FMG_FILES_BUCKET__ = env\.FILES/);
  assert.match(component, /Client Portal/);
  assert.match(await readFile(new URL("app/api/state/route.ts", root), "utf8"), /if \(session\.clientId !== null\) return accessDenied\(\)/);
  assert.match(authApi, /clientId: session\.clientId/);
  assert.match(authServer, /u\.client_id AS clientId/);
  assert.match(usersApi, /Client users can only access their own Client Portal/);
  assert.match(accessComponent, /Client Portal/);
  assert.match(accessComponent, /Linked client/);
  assert.match(permissions, /key: "client_portal"/);
  assert.match(pdfApi, /row\.type !== "invoice" \|\| Number\(row\.clientId\) !== session\.clientId/);
  assert.match(migration, /CREATE TABLE `client_portal_plans`/);
  assert.match(migration, /ALTER TABLE `auth_users` ADD `client_id`/);
  assert.match(logoMigration, /portal_logo_key/);
  assert.match(logoMigration, /portal_logo_type/);
  assert.match(logoMigration, /portal_logo_updated_at/);

  const db = createClient({ url: "file::memory:" });
  await db.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE clients (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE auth_users (id INTEGER PRIMARY KEY, username TEXT NOT NULL);
    INSERT INTO clients (id, name) VALUES (1, 'Portal Client');
  `);
  await db.executeMultiple(migration);
  await db.executeMultiple(logoMigration);
  const authColumns = await db.execute("PRAGMA table_info(auth_users)");
  assert.ok(authColumns.rows.some((column) => column.name === "client_id"));
  const clientColumns = await db.execute("PRAGMA table_info(clients)");
  assert.ok(clientColumns.rows.some((column) => column.name === "portal_logo_key"));
  await db.execute({ sql: "INSERT INTO client_portal_plans (client_id, year, month, part, title, url) VALUES (?, ?, ?, ?, ?, ?)", args: [1, 2026, 8, 1, "August Part 1", "https://www.canva.com/design/example"] });
  await assert.rejects(() => db.execute({ sql: "INSERT INTO client_portal_plans (client_id, year, month, part, title, url) VALUES (?, ?, ?, ?, ?, ?)", args: [1, 2026, 8, 1, "Duplicate", "https://example.com"] }), /UNIQUE constraint failed/i);
  db.close();
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
