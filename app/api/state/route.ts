import { del, put } from "@vercel/blob";
import { z } from "zod";
import { database } from "../../lib/database";
import { ensureClientFinanceDatabase, importClientWorkbookData } from "../../lib/client-finance";
import { getSession, requireAuth, type AuthSession } from "../../lib/auth-server";
import { canAccess, type AccessPermission } from "../../lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const optionalText = z.string().trim().max(5000).default("");
const clientPayload = z.object({
  name: z.string().trim().min(1).max(160),
  companyName: optionalText,
  ownerName: z.string().trim().max(160).default(""),
  phone: z.string().trim().max(80).default(""),
  email: z.union([z.string().trim().email(), z.literal("")]).default(""),
  address: optionalText,
  notes: optionalText,
  agencyKey: z.enum(["fmg", "digital_empire"]).default("fmg"),
  lifecycleStatus: z.enum(["active", "inactive", "shoot", "prospect"]).default("prospect"),
  activity: z.string().trim().max(160).default(""),
  startDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).default(""),
  paymentSchedule: z.string().trim().max(160).default(""),
  monthlyFee: z.number().finite().min(0).default(0),
  contractStatus: z.enum(["contract", "no_contract", "not_set"]).default("not_set"),
  relationshipStage: z.enum(["new", "old", ""]).default(""),
});

const categoryPayload = z.object({
  name: z.string().trim().min(1).max(120),
  prefix: z.string().trim().min(1).max(6).regex(/^[A-Za-z0-9]+$/).transform((value) => value.toUpperCase()),
  footerText1: optionalText,
  footerText2: optionalText,
});

const itemPayload = z.object({
  id: z.string(),
  date: z.string().default(""),
  description: z.string().trim().min(1).max(500),
  qty: z.number().finite().min(0),
  unit: z.string().trim().max(40).default("Unit"),
  unitPrice: z.number().finite().min(0),
  kind: z.enum(["package", "addon", "custom"]).default("custom"),
  catalogId: z.number().int().positive().nullable().default(null),
  includedServices: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  inputs: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  outputs: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  appliesTo: z.string().trim().max(160).default(""),
  bundleTotal: z.number().finite().min(0).nullable().default(null),
});

const quotationCatalogPayload = z.object({
  kind: z.enum(["package", "addon"]),
  name: z.string().trim().min(1).max(160),
  price: z.number().finite().min(0),
  inputs: z.array(z.string().trim().min(1).max(300)).min(1).max(30),
  outputs: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  appliesTo: z.string().trim().max(160).default(""),
  bundleTotal: z.number().finite().min(0).nullable().default(null),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

const documentPayload = z.object({
  id: z.number().int().positive().optional(),
  type: z.enum(["invoice", "quotation"]),
  companyKey: z.enum(["fmg", "digital_empire"]).default("fmg"),
  clientId: z.number().int().positive(),
  categoryId: z.number().int().positive(),
  date: z.string().min(1),
  validUntil: z.string().default(""),
  preparedBy: z.string().trim().min(1).max(160),
  currency: z.string().trim().min(1).max(12),
  project: z.string().trim().max(240).default(""),
  status: z.string().trim().min(1).max(40).default("Draft"),
  items: z.array(itemPayload).min(1).max(40),
  discount: z.number().finite().min(0).default(0),
  tax: z.number().finite().min(0).default(0),
  paymentTerms: optionalText,
  notesExclusions: optionalText,
  pdfBase64: z.string().min(20),
});

const settingsPayload = z.object({
  agencyName: z.string().trim().min(1).max(160),
  defaultCurrency: z.string().trim().min(1).max(12),
  preparedBy: z.string().trim().min(1).max(160),
  defaultPaymentTerms: optionalText,
  defaultTax: z.number().finite().min(0).max(100),
  phone: optionalText,
  email: z.union([z.string().trim().email(), z.literal("")]).default(""),
  address: optionalText,
});

const actionPayload = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createClient"), data: clientPayload }),
  z.object({ action: z.literal("updateClient"), id: z.number().int().positive(), data: clientPayload }),
  z.object({ action: z.literal("deleteClient"), id: z.number().int().positive() }),
  z.object({ action: z.literal("createCategory"), data: categoryPayload }),
  z.object({ action: z.literal("updateCategory"), id: z.number().int().positive(), data: categoryPayload }),
  z.object({ action: z.literal("deleteCategory"), id: z.number().int().positive() }),
  z.object({ action: z.literal("saveDocument"), data: documentPayload }),
  z.object({ action: z.literal("setDocumentStatus"), id: z.number().int().positive(), status: z.string().trim().min(1).max(40) }),
  z.object({ action: z.literal("deleteDocument"), id: z.number().int().positive() }),
  z.object({ action: z.literal("updateSettings"), data: settingsPayload }),
  z.object({ action: z.literal("createQuotationCatalogItem"), data: quotationCatalogPayload }),
  z.object({ action: z.literal("updateQuotationCatalogItem"), id: z.number().int().positive(), data: quotationCatalogPayload }),
]);

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company_name TEXT NOT NULL DEFAULT '',
    owner_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    agency_key TEXT NOT NULL DEFAULT 'fmg',
    lifecycle_status TEXT NOT NULL DEFAULT 'prospect',
    activity TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL DEFAULT '',
    payment_schedule TEXT NOT NULL DEFAULT '',
    monthly_fee REAL NOT NULL DEFAULT 0,
    contract_status TEXT NOT NULL DEFAULT 'not_set',
    relationship_stage TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL UNIQUE,
    footer_text_1 TEXT NOT NULL DEFAULT '',
    footer_text_2 TEXT NOT NULL DEFAULT '',
    counter INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('invoice','quotation')),
    company_key TEXT NOT NULL DEFAULT 'fmg' CHECK(company_key IN ('fmg','digital_empire')),
    generated_code TEXT NOT NULL UNIQUE,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    date TEXT NOT NULL,
    valid_until TEXT NOT NULL DEFAULT '',
    prepared_by TEXT NOT NULL DEFAULT 'Finance Department',
    currency TEXT NOT NULL DEFAULT 'EGP',
    project TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Draft',
    items_json TEXT NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    payment_terms TEXT NOT NULL DEFAULT '',
    notes_exclusions TEXT NOT NULL DEFAULT '',
    pdf_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY,
    agency_name TEXT NOT NULL DEFAULT 'FMG Agency',
    default_currency TEXT NOT NULL DEFAULT 'EGP',
    prepared_by TEXT NOT NULL DEFAULT 'Finance Department',
    default_payment_terms TEXT NOT NULL DEFAULT '50% advance payment • 50% upon completion',
    default_tax REAL NOT NULL DEFAULT 0,
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS quotation_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK(kind IN ('package','addon')),
    name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    included_services_json TEXT NOT NULL DEFAULT '[]',
    inputs_json TEXT NOT NULL DEFAULT '[]',
    outputs_json TEXT NOT NULL DEFAULT '[]',
    applies_to TEXT NOT NULL DEFAULT '',
    bundle_total REAL,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(kind, name)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_documents_client_id ON documents(client_id)",
  "CREATE INDEX IF NOT EXISTS idx_documents_category_id ON documents(category_id)",
  "CREATE INDEX IF NOT EXISTS idx_documents_type_date ON documents(type, date)",
  "CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)",
  "CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name)",
  "CREATE INDEX IF NOT EXISTS idx_quotation_catalog_sort ON quotation_catalog(kind, sort_order)",
];

const defaultQuotationCatalog = [
  { id: 1, kind: "package", name: "Stories Package", price: 15_000, services: ["Videographer", "Camera", "Model"], appliesTo: "", bundleTotal: null, sortOrder: 10 },
  { id: 2, kind: "package", name: "Product Photography Package", price: 25_000, services: ["Photographer + Assistant", "Camera + Lights", "Studio + Props", "Retoucher"], appliesTo: "", bundleTotal: null, sortOrder: 20 },
  { id: 3, kind: "package", name: "G1 Bundle", price: 40_000, services: ["Videographer + Assistant", "Camera", "Foreign Model", "Location"], appliesTo: "", bundleTotal: null, sortOrder: 30 },
  { id: 4, kind: "package", name: "G1+ Bundle", price: 65_000, services: ["Mobile Content Creator", "Foreign Model", "Stylist", "Art Director"], appliesTo: "", bundleTotal: null, sortOrder: 40 },
  { id: 5, kind: "package", name: "G2 Bundle", price: 65_000, services: ["Photographer + Assistant", "Videographer + Assistant", "Foreign Model", "Studio", "Stylist", "Art Director"], appliesTo: "", bundleTotal: null, sortOrder: 50 },
  { id: 6, kind: "addon", name: "Photography Add-on", price: 10_000, services: ["Photography Add-on"], appliesTo: "G1 Bundle", bundleTotal: 50_000, sortOrder: 10 },
] as const;

async function ensureDatabase() {
  await database.batch(schemaStatements.map((statement) => database.prepare(statement)));
  const documentColumns = await database.prepare("PRAGMA table_info(documents)").all<Record<string, unknown>>();
  if (!documentColumns.results.some((column) => String(column.name) === "company_key")) {
    try {
      await database.prepare("ALTER TABLE documents ADD COLUMN company_key TEXT NOT NULL DEFAULT 'fmg'").run();
    } catch (error) {
      if (!/duplicate column name/i.test(error instanceof Error ? error.message : String(error))) throw error;
    }
  }
  const categoryCount = await database.prepare("SELECT COUNT(*) AS count FROM categories").first<{ count: number }>();
  if (!categoryCount?.count) {
    await database.batch([
      database.prepare("INSERT INTO categories (name, prefix, footer_text_1, footer_text_2) VALUES (?, ?, ?, ?)").bind("Media Guide", "MG", "Thank you for choosing FMG Agency.", "Media Guide services are delivered according to the approved scope."),
      database.prepare("INSERT INTO categories (name, prefix, footer_text_1, footer_text_2) VALUES (?, ?, ?, ?)").bind("Agency Fees", "AF", "Thank you for your partnership.", "Agency fees are subject to the agreed payment schedule."),
      database.prepare("INSERT INTO categories (name, prefix, footer_text_1, footer_text_2) VALUES (?, ?, ?, ?)").bind("Prints", "PR", "Print specifications must be approved before production.", "Color variation may occur within standard production tolerances."),
    ]);
  }
  await database.prepare(`INSERT OR IGNORE INTO settings
    (id, agency_name, default_currency, prepared_by, default_payment_terms, default_tax)
    VALUES (1, 'FMG Agency', 'EGP', 'Finance Department', '50% advance payment • 50% upon completion', 0)`).run();
  const catalogColumns = await database.prepare("PRAGMA table_info(quotation_catalog)").all<Record<string, unknown>>();
  const catalogColumnNames = new Set(catalogColumns.results.map((column) => String(column.name)));
  const catalogMigrations: Array<ReturnType<typeof database.prepare>> = [];
  const inputsColumnMissing = !catalogColumnNames.has("inputs_json");
  if (inputsColumnMissing) catalogMigrations.push(database.prepare("ALTER TABLE quotation_catalog ADD COLUMN inputs_json TEXT NOT NULL DEFAULT '[]'"));
  if (!catalogColumnNames.has("outputs_json")) catalogMigrations.push(database.prepare("ALTER TABLE quotation_catalog ADD COLUMN outputs_json TEXT NOT NULL DEFAULT '[]'"));
  for (const migration of catalogMigrations) {
    try {
      await migration.run();
    } catch (error) {
      if (!/duplicate column name/i.test(error instanceof Error ? error.message : String(error))) throw error;
    }
  }
  if (inputsColumnMissing) await database.prepare("UPDATE quotation_catalog SET inputs_json = included_services_json").run();
  await database.batch(defaultQuotationCatalog.map((item) => database.prepare(`INSERT OR IGNORE INTO quotation_catalog
    (id, kind, name, price, included_services_json, inputs_json, outputs_json, applies_to, bundle_total, active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, 1, ?)`).bind(
      item.id, item.kind, item.name, item.price, JSON.stringify(item.services), JSON.stringify(item.services), item.appliesTo, item.bundleTotal, item.sortOrder,
    )));
  await ensureClientFinanceDatabase();
  await importClientWorkbookData();
}

function responseError(error: unknown) {
  const message = error instanceof z.ZodError
    ? error.issues[0]?.message ?? "Invalid data"
    : error instanceof Error
      ? error.message
      : "Unexpected error";
  const duplicate = /UNIQUE constraint failed/i.test(message);
  const referenced = /FOREIGN KEY constraint failed/i.test(message);
  return Response.json({ error: duplicate ? "This name or prefix already exists." : referenced ? "This record is linked to saved documents and cannot be deleted." : message }, { status: duplicate || referenced || error instanceof z.ZodError ? 400 : 500 });
}

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

async function getState() {
  const [clientsResult, categoriesResult, documentsResult, catalogResult, settingsResult] = await Promise.all([
    database.prepare(`SELECT id, name, company_name AS companyName, owner_name AS ownerName, phone, email, address, notes,
      agency_key AS agencyKey, lifecycle_status AS lifecycleStatus, activity, start_date AS startDate,
      payment_schedule AS paymentSchedule, monthly_fee AS monthlyFee, contract_status AS contractStatus,
      relationship_stage AS relationshipStage, created_at AS createdAt, updated_at AS updatedAt
      FROM clients ORDER BY company_name COLLATE NOCASE, name COLLATE NOCASE`).all(),
    database.prepare("SELECT id, name, prefix, footer_text_1 AS footerText1, footer_text_2 AS footerText2, counter, created_at AS createdAt, updated_at AS updatedAt FROM categories ORDER BY id").all(),
    database.prepare(`SELECT d.id, d.type, d.company_key AS companyKey, d.generated_code AS generatedCode, d.client_id AS clientId,
      d.category_id AS categoryId, d.date, d.valid_until AS validUntil, d.prepared_by AS preparedBy,
      d.currency, d.project, d.status, d.items_json AS itemsJson, d.subtotal, d.discount, d.tax,
      d.total, d.payment_terms AS paymentTerms, d.notes_exclusions AS notesExclusions,
      d.pdf_key AS pdfKey, d.created_at AS createdAt, d.updated_at AS updatedAt,
      c.name AS clientName, c.company_name AS companyName, c.owner_name AS ownerName, c.phone,
      c.email, c.address, cat.name AS categoryName, cat.prefix AS categoryPrefix,
      cat.footer_text_1 AS footerText1, cat.footer_text_2 AS footerText2
      FROM documents d
      JOIN clients c ON c.id = d.client_id
      JOIN categories cat ON cat.id = d.category_id
      ORDER BY d.created_at DESC, d.id DESC`).all<Record<string, unknown>>(),
    database.prepare(`SELECT id, kind, name, price, included_services_json AS includedServicesJson,
      inputs_json AS inputsJson, outputs_json AS outputsJson,
      applies_to AS appliesTo, bundle_total AS bundleTotal, active, sort_order AS sortOrder,
      created_at AS createdAt, updated_at AS updatedAt
      FROM quotation_catalog ORDER BY kind DESC, sort_order, id`).all<Record<string, unknown>>(),
    database.prepare("SELECT id, agency_name AS agencyName, default_currency AS defaultCurrency, prepared_by AS preparedBy, default_payment_terms AS defaultPaymentTerms, default_tax AS defaultTax, phone, email, address, updated_at AS updatedAt FROM settings WHERE id = 1").first(),
  ]);

  const documents = documentsResult.results.map((record) => {
    const row = record as Record<string, unknown>;
    return {
      ...row,
      items: JSON.parse(String(row.itemsJson ?? "[]")),
      subtotal: numberValue(row.subtotal),
      discount: numberValue(row.discount),
      tax: numberValue(row.tax),
      total: numberValue(row.total),
    };
  });

  return {
    clients: clientsResult.results,
    categories: categoriesResult.results,
    documents,
    quotationCatalog: catalogResult.results.map((record) => ({
      ...record,
      price: numberValue(record.price),
      includedServices: JSON.parse(String(record.includedServicesJson ?? "[]")) as string[],
      inputs: JSON.parse(String(record.inputsJson ?? record.includedServicesJson ?? "[]")) as string[],
      outputs: JSON.parse(String(record.outputsJson ?? "[]")) as string[],
      bundleTotal: record.bundleTotal === null || record.bundleTotal === undefined ? null : numberValue(record.bundleTotal),
      active: numberValue(record.active) === 1,
      sortOrder: numberValue(record.sortOrder),
    })),
    settings: settingsResult,
  };
}

type WorkspaceState = Awaited<ReturnType<typeof getState>>;

function filterState(state: WorkspaceState, session: AuthSession): WorkspaceState {
  const allowed = (permission: AccessPermission) => canAccess(session.permissions, permission, session.isAdmin);
  const dashboardAccess = allowed("dashboard");
  const documents = state.documents.flatMap((document) => {
    const documentPermission = String((document as Record<string, unknown>).type) === "invoice" ? "invoices" : "quotations";
    if (allowed("all_data") || allowed(documentPermission)) return [document];
    if (!dashboardAccess) return [];
    return [{
      ...document,
      itemsJson: "[]",
      items: [],
      validUntil: "",
      preparedBy: "",
      project: "",
      discount: 0,
      tax: 0,
      paymentTerms: "",
      notesExclusions: "",
      pdfKey: "",
      ownerName: "",
      phone: "",
      email: "",
      address: "",
      footerText1: "",
      footerText2: "",
    }];
  });
  const clientAccess = allowed("clients") || allowed("all_data") || allowed("invoices") || allowed("quotations");
  const clients = clientAccess
    ? state.clients
    : dashboardAccess
      ? state.clients.map((client) => ({
        ...client, name: "", companyName: "", ownerName: "", phone: "", email: "", address: "", notes: "",
        activity: "", startDate: "", paymentSchedule: "", monthlyFee: 0, contractStatus: "not_set", relationshipStage: "",
      }))
      : [];
  return {
    clients,
    categories: allowed("categories") || allowed("all_data") || allowed("invoices") || allowed("quotations") ? state.categories : [],
    documents,
    quotationCatalog: allowed("quotations") ? state.quotationCatalog : [],
    settings: allowed("settings") || allowed("invoices") || allowed("quotations") ? state.settings : null,
  };
}

function accessDenied() {
  return Response.json({ error: "You do not have access to this area.", code: "ACCESS_DENIED" }, { status: 403 });
}

function decodeBase64(input: string) {
  const normalized = input.includes(",") ? input.slice(input.indexOf(",") + 1) : input;
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function documentMath(data: z.infer<typeof documentPayload>) {
  const subtotal = data.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const total = Math.max(0, subtotal - data.discount + data.tax);
  return { subtotal, total };
}

export async function GET(request: Request) {
  try {
    const authError = await requireAuth(request);
    if (authError) return authError;
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    await ensureDatabase();
    return Response.json(filterState(await getState(), session));
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request) {
  try {
    const authError = await requireAuth(request);
    if (authError) return authError;
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    await ensureDatabase();
    const payload = actionPayload.parse(await request.json());
    const allowed = (permission: AccessPermission) => canAccess(session.permissions, permission, session.isAdmin);
    let requiredPermission: AccessPermission = payload.action === "createClient" || payload.action === "updateClient" || payload.action === "deleteClient"
      ? "clients"
      : payload.action === "createCategory" || payload.action === "updateCategory" || payload.action === "deleteCategory"
        ? "categories"
        : payload.action === "createQuotationCatalogItem" || payload.action === "updateQuotationCatalogItem"
          ? "quotations"
        : payload.action === "saveDocument"
          ? payload.data.type === "invoice" ? "invoices" : "quotations"
          : payload.action === "setDocumentStatus" || payload.action === "deleteDocument"
            ? "all_data"
            : "settings";
    if (payload.action === "saveDocument" && payload.data.id) {
      const existing = await database.prepare("SELECT type FROM documents WHERE id = ?").bind(payload.data.id).first<{ type: "invoice" | "quotation" }>();
      if (!existing) return Response.json({ error: "Document not found." }, { status: 404 });
      if (existing.type !== payload.data.type) return Response.json({ error: "A document type cannot be changed after it is created." }, { status: 400 });
      requiredPermission = existing.type === "invoice" ? "invoices" : "quotations";
    }
    if (!allowed(requiredPermission)) return accessDenied();

    if (payload.action === "createClient" || payload.action === "updateClient") {
      const values = payload.data;
      if (payload.action === "createClient") {
        await database.prepare(`INSERT INTO clients
          (name, company_name, owner_name, phone, email, address, notes, agency_key, lifecycle_status, activity,
           start_date, payment_schedule, monthly_fee, contract_status, relationship_stage)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
          values.name, values.companyName, values.ownerName, values.phone, values.email, values.address, values.notes,
          values.agencyKey, values.lifecycleStatus, values.activity, values.startDate, values.paymentSchedule,
          values.monthlyFee, values.contractStatus, values.relationshipStage,
        ).run();
      } else {
        await database.prepare(`UPDATE clients SET name = ?, company_name = ?, owner_name = ?, phone = ?, email = ?, address = ?, notes = ?,
          agency_key = ?, lifecycle_status = ?, activity = ?, start_date = ?, payment_schedule = ?, monthly_fee = ?,
          contract_status = ?, relationship_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .bind(values.name, values.companyName, values.ownerName, values.phone, values.email, values.address, values.notes,
            values.agencyKey, values.lifecycleStatus, values.activity, values.startDate, values.paymentSchedule,
            values.monthlyFee, values.contractStatus, values.relationshipStage, payload.id).run();
      }
    }

    if (payload.action === "deleteClient") {
      await database.prepare("DELETE FROM clients WHERE id = ?").bind(payload.id).run();
    }

    if (payload.action === "createCategory" || payload.action === "updateCategory") {
      const values = payload.data;
      if (payload.action === "createCategory") {
        await database.prepare("INSERT INTO categories (name, prefix, footer_text_1, footer_text_2) VALUES (?, ?, ?, ?)")
          .bind(values.name, values.prefix, values.footerText1, values.footerText2).run();
      } else {
        await database.prepare("UPDATE categories SET name = ?, prefix = ?, footer_text_1 = ?, footer_text_2 = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(values.name, values.prefix, values.footerText1, values.footerText2, payload.id).run();
      }
    }

    if (payload.action === "deleteCategory") {
      await database.prepare("DELETE FROM categories WHERE id = ?").bind(payload.id).run();
    }

    if (payload.action === "createQuotationCatalogItem" || payload.action === "updateQuotationCatalogItem") {
      const values = payload.data;
      if (payload.action === "createQuotationCatalogItem") {
        await database.prepare(`INSERT INTO quotation_catalog
          (kind, name, price, included_services_json, inputs_json, outputs_json, applies_to, bundle_total, active, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
            values.kind, values.name, values.price, JSON.stringify(values.inputs), JSON.stringify(values.inputs), JSON.stringify(values.outputs), values.appliesTo,
            values.bundleTotal, values.active ? 1 : 0, values.sortOrder,
          ).run();
      } else {
        await database.prepare(`UPDATE quotation_catalog SET kind = ?, name = ?, price = ?, included_services_json = ?, inputs_json = ?, outputs_json = ?,
          applies_to = ?, bundle_total = ?, active = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(
            values.kind, values.name, values.price, JSON.stringify(values.inputs), JSON.stringify(values.inputs), JSON.stringify(values.outputs), values.appliesTo,
            values.bundleTotal, values.active ? 1 : 0, values.sortOrder, payload.id,
          ).run();
      }
    }

    if (payload.action === "saveDocument") {
      const data = payload.data;
      const math = documentMath(data);
      let generatedCode = "";
      let pdfKey = "";

      if (data.id) {
        const existing = await database.prepare("SELECT generated_code AS generatedCode, pdf_key AS pdfKey FROM documents WHERE id = ?").bind(data.id).first<{ generatedCode: string; pdfKey: string }>();
        if (!existing) throw new Error("Document not found.");
        generatedCode = existing.generatedCode;
        pdfKey = existing.pdfKey;
      } else {
        const category = await database.prepare("UPDATE categories SET counter = counter + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING prefix, counter")
          .bind(data.categoryId).first<{ prefix: string; counter: number }>();
        const client = await database.prepare("SELECT name, company_name AS companyName FROM clients WHERE id = ?").bind(data.clientId).first<{ name: string; companyName: string }>();
        if (!category || !client) throw new Error("Choose a valid client and category.");
        const clientPart = (client.companyName || client.name).trim().replace(/[^A-Za-z0-9\u0600-\u06FF]+/g, "-").replace(/^-|-$/g, "") || "CLIENT";
        generatedCode = `${clientPart}-${category.prefix}${String(category.counter).padStart(4, "0")}`;
        pdfKey = `documents/${data.type}/${generatedCode}.pdf`;
      }

      await put(pdfKey, Buffer.from(decodeBase64(data.pdfBase64)), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/pdf",
      });

      if (data.id) {
        await database.prepare(`UPDATE documents SET company_key = ?, client_id = ?, category_id = ?, date = ?, valid_until = ?, prepared_by = ?, currency = ?, project = ?, status = ?, items_json = ?, subtotal = ?, discount = ?, tax = ?, total = ?, payment_terms = ?, notes_exclusions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .bind(data.companyKey, data.clientId, data.categoryId, data.date, data.validUntil, data.preparedBy, data.currency, data.project, data.status, JSON.stringify(data.items), math.subtotal, data.discount, data.tax, math.total, data.paymentTerms, data.notesExclusions, data.id).run();
      } else {
        await database.prepare(`INSERT INTO documents (type, company_key, generated_code, client_id, category_id, date, valid_until, prepared_by, currency, project, status, items_json, subtotal, discount, tax, total, payment_terms, notes_exclusions, pdf_key)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(data.type, data.companyKey, generatedCode, data.clientId, data.categoryId, data.date, data.validUntil, data.preparedBy, data.currency, data.project, data.status, JSON.stringify(data.items), math.subtotal, data.discount, data.tax, math.total, data.paymentTerms, data.notesExclusions, pdfKey).run();
      }
    }

    if (payload.action === "setDocumentStatus") {
      await database.prepare("UPDATE documents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(payload.status, payload.id).run();
    }

    if (payload.action === "deleteDocument") {
      const row = await database.prepare("SELECT pdf_key AS pdfKey FROM documents WHERE id = ?").bind(payload.id).first<{ pdfKey: string }>();
      if (row?.pdfKey) await del(row.pdfKey);
      await database.prepare("DELETE FROM documents WHERE id = ?").bind(payload.id).run();
    }

    if (payload.action === "updateSettings") {
      const values = payload.data;
      await database.prepare(`UPDATE settings SET agency_name = ?, default_currency = ?, prepared_by = ?, default_payment_terms = ?, default_tax = ?, phone = ?, email = ?, address = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`)
        .bind(values.agencyName, values.defaultCurrency, values.preparedBy, values.defaultPaymentTerms, values.defaultTax, values.phone, values.email, values.address).run();
    }

    return Response.json(filterState(await getState(), session));
  } catch (error) {
    return responseError(error);
  }
}
