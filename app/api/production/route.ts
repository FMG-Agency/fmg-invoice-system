import { z } from "zod";
import { database } from "../../lib/database";
import { getSession, requirePermission, type AuthSession } from "../../lib/auth-server";
import type { ProductionCostOption, ProductionState, ProductionWorkflowRole, ProductionWorkOrder } from "../../types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid production date.");
const timeValue = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid call time.");
const noteValue = z.string().trim().max(5000).default("");
const optionTypes = ["photographer", "videographer", "model", "blogger", "location", "studio", "hair_stylist", "makeup_stylist", "stylist"] as const;
const productionOptionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  type: z.enum(optionTypes),
  name: z.string().trim().min(1, "Enter a name or detail for every production option.").max(300),
  price: z.number().finite().min(0, "Production option prices cannot be negative."),
  billingMode: z.enum(["included", "extra"]).default("included"),
});

const payloadSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    data: z.object({
      documentType: z.literal("media_guide"),
      clientId: z.number().int().positive(),
      bundleCatalogId: z.number().int().positive(),
      addonCatalogId: z.number().int().positive().nullable(),
      workDate: dateValue,
      accountNote: noteValue,
    }),
  }),
  z.object({
    action: z.literal("complete"),
    id: z.number().int().positive(),
    data: z.object({
      callTime: timeValue,
      options: z.array(productionOptionSchema).min(1, "Add at least one production option.").max(30),
      productionNote: noteValue,
    }),
  }),
  z.object({
    action: z.literal("finalApprove"),
    id: z.number().int().positive(),
    data: z.object({
      clientId: z.number().int().positive(),
      bundleCatalogId: z.number().int().positive(),
      addonCatalogId: z.number().int().positive().nullable(),
      workDate: dateValue,
      callTime: timeValue,
      options: z.array(productionOptionSchema).min(1, "Add at least one production option.").max(30),
      accountNote: noteValue,
      productionNote: noteValue,
      operationNote: noteValue,
    }),
  }),
  z.object({
    action: z.literal("delete"),
    id: z.number().int().positive(),
  }),
]);

const productionSchema = [
  `CREATE TABLE IF NOT EXISTS production_work_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_type TEXT NOT NULL DEFAULT 'media_guide' CHECK(document_type = 'media_guide'),
    client_id INTEGER NOT NULL REFERENCES clients(id),
    client_name TEXT NOT NULL,
    bundle_catalog_id INTEGER NOT NULL REFERENCES quotation_catalog(id),
    bundle_name TEXT NOT NULL,
    bundle_price REAL NOT NULL DEFAULT 0,
    bundle_inputs_json TEXT NOT NULL DEFAULT '[]',
    bundle_outputs_json TEXT NOT NULL DEFAULT '[]',
    addon_catalog_id INTEGER REFERENCES quotation_catalog(id),
    addon_name TEXT NOT NULL DEFAULT '',
    addon_price REAL NOT NULL DEFAULT 0,
    addon_inputs_json TEXT NOT NULL DEFAULT '[]',
    addon_outputs_json TEXT NOT NULL DEFAULT '[]',
    work_date TEXT NOT NULL,
    call_time TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    model_name TEXT NOT NULL DEFAULT '',
    photographer_name TEXT NOT NULL DEFAULT '',
    account_note TEXT NOT NULL DEFAULT '',
    production_note TEXT NOT NULL DEFAULT '',
    operation_note TEXT NOT NULL DEFAULT '',
    production_options_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending_production' CHECK(status IN ('pending_production','ready_for_operations')),
    created_by_user_id INTEGER NOT NULL REFERENCES auth_users(id),
    created_by_name TEXT NOT NULL,
    created_by_role TEXT NOT NULL,
    production_manager_user_id INTEGER REFERENCES auth_users(id),
    production_manager_name TEXT NOT NULL DEFAULT '',
    operation_manager_user_id INTEGER REFERENCES auth_users(id),
    operation_manager_name TEXT NOT NULL DEFAULT '',
    account_submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    production_submitted_at TEXT NOT NULL DEFAULT '',
    final_approved_at TEXT NOT NULL DEFAULT '',
    draft_invoice_id INTEGER REFERENCES documents(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS production_work_order_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_order_id INTEGER NOT NULL REFERENCES production_work_orders(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK(event_type IN ('account_submitted','production_submitted')),
    actor_user_id INTEGER NOT NULL REFERENCES auth_users(id),
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS idx_production_work_orders_status_date ON production_work_orders(status, work_date)",
  "CREATE INDEX IF NOT EXISTS idx_production_work_orders_creator ON production_work_orders(created_by_user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_production_work_order_events_order ON production_work_order_events(work_order_id, created_at)",
];

let productionDatabaseReady: Promise<void> | null = null;

async function ensureProductionDatabase() {
  productionDatabaseReady ??= (async () => {
    await database.batch(productionSchema.map((statement) => database.prepare(statement)));
    const columns = await database.prepare("PRAGMA table_info(production_work_orders)").all<{ name: string }>();
    const names = new Set(columns.results.map((column) => column.name));
    const additions = [
      ["operation_note", "ALTER TABLE production_work_orders ADD COLUMN operation_note TEXT NOT NULL DEFAULT ''"],
      ["operation_manager_user_id", "ALTER TABLE production_work_orders ADD COLUMN operation_manager_user_id INTEGER"],
      ["operation_manager_name", "ALTER TABLE production_work_orders ADD COLUMN operation_manager_name TEXT NOT NULL DEFAULT ''"],
      ["final_approved_at", "ALTER TABLE production_work_orders ADD COLUMN final_approved_at TEXT NOT NULL DEFAULT ''"],
      ["bundle_price", "ALTER TABLE production_work_orders ADD COLUMN bundle_price REAL NOT NULL DEFAULT 0"],
      ["bundle_inputs_json", "ALTER TABLE production_work_orders ADD COLUMN bundle_inputs_json TEXT NOT NULL DEFAULT '[]'"],
      ["bundle_outputs_json", "ALTER TABLE production_work_orders ADD COLUMN bundle_outputs_json TEXT NOT NULL DEFAULT '[]'"],
      ["addon_price", "ALTER TABLE production_work_orders ADD COLUMN addon_price REAL NOT NULL DEFAULT 0"],
      ["addon_inputs_json", "ALTER TABLE production_work_orders ADD COLUMN addon_inputs_json TEXT NOT NULL DEFAULT '[]'"],
      ["addon_outputs_json", "ALTER TABLE production_work_orders ADD COLUMN addon_outputs_json TEXT NOT NULL DEFAULT '[]'"],
      ["production_options_json", "ALTER TABLE production_work_orders ADD COLUMN production_options_json TEXT NOT NULL DEFAULT '[]'"],
      ["draft_invoice_id", "ALTER TABLE production_work_orders ADD COLUMN draft_invoice_id INTEGER"],
    ] as const;
    for (const [name, statement] of additions) {
      if (!names.has(name)) {
        try {
          await database.prepare(statement).run();
        } catch (error) {
          if (!/duplicate column name/i.test(error instanceof Error ? error.message : String(error))) throw error;
        }
      }
    }
    const documentColumns = await database.prepare("PRAGMA table_info(documents)").all<{ name: string }>();
    if (!documentColumns.results.some((column) => column.name === "production_work_order_id")) {
      try {
        await database.prepare("ALTER TABLE documents ADD COLUMN production_work_order_id INTEGER").run();
      } catch (error) {
        if (!/duplicate column name/i.test(error instanceof Error ? error.message : String(error))) throw error;
      }
    }
    await database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_production_work_order ON documents(production_work_order_id)").run();
    await database.prepare(`UPDATE production_work_orders SET
      bundle_price = COALESCE((SELECT price FROM quotation_catalog WHERE id = bundle_catalog_id), bundle_price),
      bundle_inputs_json = COALESCE((SELECT inputs_json FROM quotation_catalog WHERE id = bundle_catalog_id), bundle_inputs_json),
      bundle_outputs_json = COALESCE((SELECT outputs_json FROM quotation_catalog WHERE id = bundle_catalog_id), bundle_outputs_json)
      WHERE bundle_inputs_json = '[]'`).run();
    await database.prepare(`UPDATE production_work_orders SET
      addon_price = COALESCE((SELECT price FROM quotation_catalog WHERE id = addon_catalog_id), addon_price),
      addon_inputs_json = COALESCE((SELECT inputs_json FROM quotation_catalog WHERE id = addon_catalog_id), addon_inputs_json),
      addon_outputs_json = COALESCE((SELECT outputs_json FROM quotation_catalog WHERE id = addon_catalog_id), addon_outputs_json)
      WHERE addon_catalog_id IS NOT NULL AND addon_inputs_json = '[]'`).run();
  })();
  try {
    await productionDatabaseReady;
  } catch (error) {
    productionDatabaseReady = null;
    throw error;
  }
}

function workflowRole(session: AuthSession): ProductionWorkflowRole {
  if (session.isAdmin) return "administrator";
  const normalized = session.roleLabel.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (normalized.includes("account") && normalized.includes("manager")) return "account_manager";
  if (normalized.includes("production") && normalized.includes("manager")) return "production_manager";
  if ((normalized.includes("operation") || normalized.includes("operations")) && normalized.includes("manager")) return "operation_manager";
  return "viewer";
}

function displayName(session: AuthSession) {
  return session.displayName.trim() || session.username;
}

function codeFor(id: number) {
  return `WO-${String(id).padStart(4, "0")}`;
}

function stringArray(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function productionOptions(row: Record<string, unknown>): ProductionCostOption[] {
  try {
    const parsed = z.array(productionOptionSchema).safeParse(JSON.parse(String(row.productionOptionsJson ?? "[]")));
    if (parsed.success && parsed.data.length) return parsed.data;
  } catch {
    // Older work orders are reconstructed from their legacy production fields below.
  }
  const legacy: ProductionCostOption[] = [];
  const addLegacy = (type: ProductionCostOption["type"], name: unknown) => {
    const value = String(name ?? "").trim();
    if (value) legacy.push({ id: `legacy-${type}`, type, name: value, price: 0, billingMode: "included" });
  };
  addLegacy("photographer", row.photographerName);
  addLegacy("model", row.modelName);
  addLegacy("location", row.location);
  return legacy;
}

function firstOption(options: ProductionCostOption[], type: ProductionCostOption["type"]) {
  return options.find((option) => option.type === type)?.name ?? "";
}

function mapOrder(row: Record<string, unknown>): ProductionWorkOrder {
  const id = Number(row.id);
  const finalApprovedAt = String(row.finalApprovedAt ?? "");
  const status = row.status === "ready_for_operations"
    ? finalApprovedAt ? "final_approved" : "pending_operations"
    : "pending_production";
  const options = productionOptions(row);
  const bundlePrice = Number(row.bundlePrice ?? 0);
  const addonPrice = Number(row.addonPrice ?? 0);
  const productionOptionsTotal = options.reduce((total, option) => total + (option.billingMode === "extra" ? option.price : 0), 0);
  return {
    id,
    code: codeFor(id),
    documentType: "media_guide",
    clientId: Number(row.clientId),
    clientName: String(row.clientName ?? ""),
    bundleCatalogId: Number(row.bundleCatalogId),
    bundleName: String(row.bundleName ?? ""),
    bundlePrice,
    bundleInputs: stringArray(row.bundleInputsJson),
    bundleOutputs: stringArray(row.bundleOutputsJson),
    addonCatalogId: row.addonCatalogId === null || row.addonCatalogId === undefined ? null : Number(row.addonCatalogId),
    addonName: String(row.addonName ?? ""),
    addonPrice,
    addonInputs: stringArray(row.addonInputsJson),
    addonOutputs: stringArray(row.addonOutputsJson),
    workDate: String(row.workDate ?? ""),
    callTime: String(row.callTime ?? ""),
    location: String(row.location ?? ""),
    modelName: String(row.modelName ?? ""),
    photographerName: String(row.photographerName ?? ""),
    accountNote: String(row.accountNote ?? ""),
    productionNote: String(row.productionNote ?? ""),
    operationNote: String(row.operationNote ?? ""),
    productionOptions: options,
    productionOptionsTotal,
    workOrderTotal: bundlePrice + addonPrice + productionOptionsTotal,
    status,
    createdByUserId: Number(row.createdByUserId),
    createdByName: String(row.createdByName ?? ""),
    createdByRole: String(row.createdByRole ?? ""),
    productionManagerUserId: row.productionManagerUserId === null || row.productionManagerUserId === undefined ? null : Number(row.productionManagerUserId),
    productionManagerName: String(row.productionManagerName ?? ""),
    operationManagerUserId: row.operationManagerUserId === null || row.operationManagerUserId === undefined ? null : Number(row.operationManagerUserId),
    operationManagerName: String(row.operationManagerName ?? ""),
    accountSubmittedAt: String(row.accountSubmittedAt ?? ""),
    productionSubmittedAt: String(row.productionSubmittedAt ?? ""),
    finalApprovedAt,
    draftInvoiceId: row.draftInvoiceId === null || row.draftInvoiceId === undefined ? null : Number(row.draftInvoiceId),
    draftInvoiceCode: String(row.draftInvoiceCode ?? ""),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

async function getProductionState(session: AuthSession): Promise<ProductionState> {
  const role = workflowRole(session);
  const [ordersResult, clientsResult, catalogResult] = await Promise.all([
    database.prepare(`SELECT p.id, p.document_type AS documentType, p.client_id AS clientId, p.client_name AS clientName,
        p.bundle_catalog_id AS bundleCatalogId, p.bundle_name AS bundleName, p.bundle_price AS bundlePrice,
        p.bundle_inputs_json AS bundleInputsJson, p.bundle_outputs_json AS bundleOutputsJson,
        p.addon_catalog_id AS addonCatalogId, p.addon_name AS addonName, p.addon_price AS addonPrice,
        p.addon_inputs_json AS addonInputsJson, p.addon_outputs_json AS addonOutputsJson,
        p.work_date AS workDate, p.call_time AS callTime, p.location, p.model_name AS modelName,
        p.photographer_name AS photographerName, p.account_note AS accountNote, p.production_note AS productionNote,
        p.operation_note AS operationNote, p.production_options_json AS productionOptionsJson,
        p.status, p.created_by_user_id AS createdByUserId, p.created_by_name AS createdByName, p.created_by_role AS createdByRole,
        p.production_manager_user_id AS productionManagerUserId, p.production_manager_name AS productionManagerName,
        p.operation_manager_user_id AS operationManagerUserId, p.operation_manager_name AS operationManagerName,
        p.account_submitted_at AS accountSubmittedAt, p.production_submitted_at AS productionSubmittedAt,
        p.final_approved_at AS finalApprovedAt, p.draft_invoice_id AS draftInvoiceId,
        COALESCE(d.generated_code, '') AS draftInvoiceCode,
        p.created_at AS createdAt, p.updated_at AS updatedAt
      FROM production_work_orders p LEFT JOIN documents d ON d.id = p.draft_invoice_id
      ORDER BY p.work_date DESC, p.id DESC`).all<Record<string, unknown>>(),
    database.prepare(`SELECT id, COALESCE(NULLIF(company_name, ''), name) AS name
      FROM clients ORDER BY COALESCE(NULLIF(company_name, ''), name) COLLATE NOCASE`).all<Record<string, unknown>>(),
    database.prepare(`SELECT id, kind, name, price, inputs_json AS inputsJson, outputs_json AS outputsJson,
        applies_to AS appliesTo, bundle_total AS bundleTotal FROM quotation_catalog
      WHERE active = 1 ORDER BY kind DESC, sort_order, id`).all<Record<string, unknown>>(),
  ]);

  const allOrders = ordersResult.results.map(mapOrder);
  const orders = role === "account_manager"
    ? allOrders.filter((order) => order.createdByUserId === session.userId)
    : role === "operation_manager"
      ? allOrders.filter((order) => order.status === "pending_operations" || order.status === "final_approved")
      : role === "viewer"
        ? []
        : allOrders;

  return {
    role,
    orders,
    clients: role === "account_manager" || role === "operation_manager" || role === "administrator"
      ? clientsResult.results.map((row) => ({ id: Number(row.id), name: String(row.name ?? "") }))
      : [],
    catalog: role === "account_manager" || role === "operation_manager" || role === "administrator"
      ? catalogResult.results.map((row) => ({
        id: Number(row.id),
        kind: row.kind === "addon" ? "addon" : "package",
        name: String(row.name ?? ""),
        price: Number(row.price ?? 0),
        inputs: stringArray(row.inputsJson),
        outputs: stringArray(row.outputsJson),
        appliesTo: String(row.appliesTo ?? ""),
        bundleTotal: row.bundleTotal === null || row.bundleTotal === undefined ? null : Number(row.bundleTotal),
      }))
      : [],
    pendingProductionCount: orders.filter((order) => order.status === "pending_production").length,
    pendingOperationsCount: orders.filter((order) => order.status === "pending_operations").length,
    finalApprovedCount: orders.filter((order) => order.status === "final_approved").length,
  };
}

function accessDenied(message: string) {
  return Response.json({ error: message, code: "PRODUCTION_ROLE_REQUIRED" }, { status: 403 });
}

async function resolveScope(data: { clientId: number; bundleCatalogId: number; addonCatalogId: number | null }) {
  const [client, bundleRow] = await Promise.all([
    database.prepare("SELECT COALESCE(NULLIF(company_name, ''), name) AS name, agency_key AS agencyKey FROM clients WHERE id = ?")
      .bind(data.clientId).first<{ name: string; agencyKey: string }>(),
    database.prepare(`SELECT id, name, price, inputs_json AS inputsJson, outputs_json AS outputsJson,
        applies_to AS appliesTo, bundle_total AS bundleTotal
      FROM quotation_catalog WHERE id = ? AND kind = 'package' AND active = 1`)
      .bind(data.bundleCatalogId).first<Record<string, unknown>>(),
  ]);
  if (!client) throw new Error("The selected client is no longer available.");
  if (!bundleRow) throw new Error("The selected Media Guide bundle is no longer available.");
  const bundle = {
    id: Number(bundleRow.id), name: String(bundleRow.name ?? ""), price: Number(bundleRow.price ?? 0),
    inputs: stringArray(bundleRow.inputsJson), outputs: stringArray(bundleRow.outputsJson),
    appliesTo: String(bundleRow.appliesTo ?? ""),
    bundleTotal: bundleRow.bundleTotal === null || bundleRow.bundleTotal === undefined ? null : Number(bundleRow.bundleTotal),
  };

  let addon: typeof bundle | null = null;
  if (data.addonCatalogId) {
    const addonRow = await database.prepare(`SELECT id, name, price, inputs_json AS inputsJson, outputs_json AS outputsJson,
        applies_to AS appliesTo, bundle_total AS bundleTotal
      FROM quotation_catalog WHERE id = ? AND kind = 'addon' AND active = 1`)
      .bind(data.addonCatalogId).first<Record<string, unknown>>();
    if (!addonRow) throw new Error("The selected add-on is no longer available.");
    addon = {
      id: Number(addonRow.id), name: String(addonRow.name ?? ""), price: Number(addonRow.price ?? 0),
      inputs: stringArray(addonRow.inputsJson), outputs: stringArray(addonRow.outputsJson),
      appliesTo: String(addonRow.appliesTo ?? ""),
      bundleTotal: addonRow.bundleTotal === null || addonRow.bundleTotal === undefined ? null : Number(addonRow.bundleTotal),
    };
    if (addon.appliesTo && addon.appliesTo.toLowerCase() !== bundle.name.toLowerCase()) {
      throw new Error("This add-on is not available for the selected bundle.");
    }
  }
  return { client, bundle, addon };
}

const productionOptionLabels: Record<ProductionCostOption["type"], string> = {
  photographer: "Photographer",
  videographer: "Videographer",
  model: "Model",
  blogger: "Blogger",
  location: "Location",
  studio: "Studio",
  hair_stylist: "Hair Stylist",
  makeup_stylist: "Makeup Stylist",
  stylist: "Stylist",
};

async function ensureDraftInvoice(input: {
  workOrderId: number;
  clientId: number;
  workDate: string;
  accountNote: string;
  productionNote: string;
  operationNote: string;
  options: ProductionCostOption[];
  scope: Awaited<ReturnType<typeof resolveScope>>;
}) {
  const existing = await database.prepare("SELECT id, generated_code AS generatedCode FROM documents WHERE production_work_order_id = ?")
    .bind(input.workOrderId).first<{ id: number; generatedCode: string }>();
  if (existing) return existing;

  const category = await database.prepare(`UPDATE categories SET counter = counter + 1, updated_at = CURRENT_TIMESTAMP
    WHERE LOWER(TRIM(name)) = 'media guide' RETURNING id, prefix, counter`)
    .first<{ id: number; prefix: string; counter: number }>();
  if (!category) throw new Error("The Media Guide category is required before a draft invoice can be created.");
  const settings = await database.prepare("SELECT prepared_by AS preparedBy, default_payment_terms AS paymentTerms FROM settings WHERE id = 1")
    .first<{ preparedBy: string; paymentTerms: string }>();
  const clientPart = input.scope.client.name.trim().replace(/[^A-Za-z0-9\u0600-\u06FF]+/g, "-").replace(/^-|-$/g, "") || "CLIENT";
  const generatedCode = `${clientPart}-${category.prefix}${String(category.counter).padStart(4, "0")}`;
  const lineItem = (id: string, description: string, price: number, kind: "package" | "addon" | "custom", catalogId: number | null,
    inputs: string[], outputs: string[], appliesTo = "", bundleTotal: number | null = null) => ({
    id, date: input.workDate, description, qty: 1, unit: kind === "package" ? "Package" : kind === "addon" ? "Add-on" : "Service",
    unitPrice: price, kind, catalogId, includedServices: inputs, inputs, outputs, appliesTo, bundleTotal,
  });
  const items = [
    lineItem(`wo-${input.workOrderId}-bundle`, input.scope.bundle.name, input.scope.bundle.price, "package", input.scope.bundle.id,
      input.scope.bundle.inputs, input.scope.bundle.outputs, "", input.scope.bundle.bundleTotal),
    ...(input.scope.addon ? [lineItem(`wo-${input.workOrderId}-addon`, input.scope.addon.name, input.scope.addon.price, "addon", input.scope.addon.id,
      input.scope.addon.inputs, input.scope.addon.outputs, input.scope.addon.appliesTo, input.scope.addon.bundleTotal)] : []),
    ...input.options.filter((option) => option.billingMode === "extra").map((option, index) => lineItem(`wo-${input.workOrderId}-option-${index + 1}`,
      `${productionOptionLabels[option.type]} · ${option.name}`, option.price, "custom", null, [option.name], [])),
  ];
  const subtotal = items.reduce((total, item) => total + item.unitPrice, 0);
  const notes = [
    `Created automatically from ${codeFor(input.workOrderId)} after final Operations approval.`,
    input.accountNote ? `Account note: ${input.accountNote}` : "",
    input.productionNote ? `Production note: ${input.productionNote}` : "",
    input.operationNote ? `Operation note: ${input.operationNote}` : "",
  ].filter(Boolean).join("\n");
  await database.prepare(`INSERT OR IGNORE INTO documents
    (type, company_key, generated_code, client_id, category_id, date, valid_until, prepared_by, currency, project,
      status, items_json, subtotal, discount, tax, total, payment_terms, notes_exclusions, pdf_key, production_work_order_id)
    VALUES ('invoice', ?, ?, ?, ?, ?, '', ?, 'EGP', ?, 'Draft', ?, ?, 0, 0, ?, ?, ?, '', ?)`)
    .bind(input.scope.client.agencyKey === "digital_empire" ? "digital_empire" : "fmg", generatedCode,
      input.clientId, category.id, input.workDate,
      settings?.preparedBy || "Finance Department", `Media Guide · ${codeFor(input.workOrderId)}`,
      JSON.stringify(items), subtotal, subtotal, settings?.paymentTerms || "", notes, input.workOrderId).run();
  const created = await database.prepare("SELECT id, generated_code AS generatedCode FROM documents WHERE production_work_order_id = ?")
    .bind(input.workOrderId).first<{ id: number; generatedCode: string }>();
  if (!created) throw new Error("The work order was approved, but its draft invoice could not be created.");
  return created;
}

function errorResponse(error: unknown) {
  const message = error instanceof z.ZodError
    ? error.issues[0]?.message ?? "Invalid work order data."
    : error instanceof Error ? error.message : "Unexpected production workflow error.";
  const conflict = /already been completed|no longer pending|already received final approval/i.test(message);
  const invalidSelection = /selected .+ no longer available|add-on is not available/i.test(message);
  return Response.json({ error: message }, { status: conflict ? 409 : error instanceof z.ZodError || invalidSelection ? 400 : 500 });
}

export async function GET(request: Request) {
  try {
    const authError = await requirePermission(request, "production");
    if (authError) return authError;
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    await ensureProductionDatabase();
    return Response.json(await getProductionState(session));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const authError = await requirePermission(request, "production");
    if (authError) return authError;
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    await ensureProductionDatabase();
    const role = workflowRole(session);
    const payload = payloadSchema.parse(await request.json());

    if (payload.action === "delete") {
      if (!session.isAdmin) return accessDenied("Only an administrator can delete production work orders.");
      const existing = await database.prepare("SELECT id FROM production_work_orders WHERE id = ?").bind(payload.id).first<{ id: number }>();
      if (!existing) return Response.json({ error: "Work order not found." }, { status: 404 });
      await database.batch([
        database.prepare("UPDATE documents SET production_work_order_id = NULL WHERE production_work_order_id = ?").bind(payload.id),
        database.prepare("DELETE FROM production_work_order_events WHERE work_order_id = ?").bind(payload.id),
        database.prepare("DELETE FROM production_work_orders WHERE id = ?").bind(payload.id),
      ]);
    } else if (payload.action === "create") {
      if (role !== "account_manager" && role !== "administrator") return accessDenied("Only an Account Manager can create and submit a work order.");
      const { client, bundle, addon } = await resolveScope(payload.data);

      const actorName = displayName(session);
      const inserted = await database.prepare(`INSERT INTO production_work_orders
        (document_type, client_id, client_name, bundle_catalog_id, bundle_name, bundle_price, bundle_inputs_json, bundle_outputs_json,
          addon_catalog_id, addon_name, addon_price, addon_inputs_json, addon_outputs_json,
          work_date, account_note, status, created_by_user_id, created_by_name, created_by_role)
        VALUES ('media_guide', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_production', ?, ?, ?)`)
        .bind(payload.data.clientId, client.name, bundle.id, bundle.name, bundle.price, JSON.stringify(bundle.inputs), JSON.stringify(bundle.outputs),
          addon?.id ?? null, addon?.name ?? "", addon?.price ?? 0, JSON.stringify(addon?.inputs ?? []), JSON.stringify(addon?.outputs ?? []),
          payload.data.workDate, payload.data.accountNote, session.userId, actorName, session.roleLabel).run();
      const workOrderId = Number(inserted.meta.last_row_id);
      await database.prepare(`INSERT INTO production_work_order_events
        (work_order_id, event_type, actor_user_id, actor_name, actor_role, note)
        VALUES (?, 'account_submitted', ?, ?, ?, ?)`)
        .bind(workOrderId, session.userId, actorName, session.roleLabel, payload.data.accountNote).run();
    } else if (payload.action === "complete") {
      if (role !== "production_manager" && role !== "administrator") return accessDenied("Only a Production Manager can complete and approve this work order.");
      const actorName = displayName(session);
      const options = payload.data.options as ProductionCostOption[];
      const updated = await database.prepare(`UPDATE production_work_orders SET
          photographer_name = ?, model_name = ?, location = ?, call_time = ?, production_options_json = ?, production_note = ?,
          status = 'ready_for_operations', production_manager_user_id = ?, production_manager_name = ?,
          production_submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending_production'`)
        .bind(firstOption(options, "photographer"), firstOption(options, "model"), firstOption(options, "location") || firstOption(options, "studio"),
          payload.data.callTime, JSON.stringify(options), payload.data.productionNote, session.userId, actorName, payload.id).run();
      if (Number(updated.meta.changes) !== 1) throw new Error("This work order has already been completed or is no longer pending.");
      await database.prepare(`INSERT INTO production_work_order_events
        (work_order_id, event_type, actor_user_id, actor_name, actor_role, note)
        VALUES (?, 'production_submitted', ?, ?, ?, ?)`)
        .bind(payload.id, session.userId, actorName, session.roleLabel, payload.data.productionNote).run();
    } else {
      if (role !== "operation_manager" && role !== "administrator") return accessDenied("Only an Operation Manager can edit and give final approval to this work order.");
      const scope = await resolveScope(payload.data);
      const { client, bundle, addon } = scope;
      const actorName = displayName(session);
      const options = payload.data.options as ProductionCostOption[];
      const pendingOrder = await database.prepare("SELECT id FROM production_work_orders WHERE id = ? AND status = 'ready_for_operations' AND final_approved_at = ''")
        .bind(payload.id).first<{ id: number }>();
      if (!pendingOrder) throw new Error("This work order has already received final approval or is no longer pending Operations.");
      const draftInvoice = await ensureDraftInvoice({
        workOrderId: payload.id,
        clientId: payload.data.clientId,
        workDate: payload.data.workDate,
        accountNote: payload.data.accountNote,
        productionNote: payload.data.productionNote,
        operationNote: payload.data.operationNote,
        options,
        scope,
      });
      const updated = await database.prepare(`UPDATE production_work_orders SET
          client_id = ?, client_name = ?, bundle_catalog_id = ?, bundle_name = ?, bundle_price = ?, bundle_inputs_json = ?, bundle_outputs_json = ?,
          addon_catalog_id = ?, addon_name = ?, addon_price = ?, addon_inputs_json = ?, addon_outputs_json = ?,
          work_date = ?, photographer_name = ?, model_name = ?, location = ?, call_time = ?, production_options_json = ?,
          account_note = ?, production_note = ?, operation_note = ?, draft_invoice_id = ?,
          operation_manager_user_id = ?, operation_manager_name = ?, final_approved_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'ready_for_operations' AND final_approved_at = ''`)
        .bind(payload.data.clientId, client.name, bundle.id, bundle.name, bundle.price, JSON.stringify(bundle.inputs), JSON.stringify(bundle.outputs),
          addon?.id ?? null, addon?.name ?? "", addon?.price ?? 0, JSON.stringify(addon?.inputs ?? []), JSON.stringify(addon?.outputs ?? []),
          payload.data.workDate, firstOption(options, "photographer"), firstOption(options, "model"), firstOption(options, "location") || firstOption(options, "studio"),
          payload.data.callTime, JSON.stringify(options), payload.data.accountNote, payload.data.productionNote, payload.data.operationNote, draftInvoice.id,
          session.userId, actorName, payload.id).run();
      if (Number(updated.meta.changes) !== 1) throw new Error("This work order has already received final approval or is no longer pending Operations.");
    }

    return Response.json(await getProductionState(session));
  } catch (error) {
    return errorResponse(error);
  }
}
