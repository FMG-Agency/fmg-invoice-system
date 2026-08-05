import { del, put } from "@vercel/blob";
import { z } from "zod";
import { database } from "../../lib/database";
import { requireAuth } from "../../lib/auth-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const optionalText = z.string().trim().max(5000).default("");
const clientPayload = z.object({
  name: z.string().trim().min(1).max(160),
  companyName: optionalText,
  ownerName: z.string().trim().min(1).max(160),
  phone: z.string().trim().min(3).max(80),
  email: z.union([z.string().trim().email(), z.literal("")]).default(""),
  address: optionalText,
  notes: optionalText,
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
});

const documentPayload = z.object({
  id: z.number().int().positive().optional(),
  type: z.enum(["invoice", "quotation"]),
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
  "CREATE INDEX IF NOT EXISTS idx_documents_client_id ON documents(client_id)",
  "CREATE INDEX IF NOT EXISTS idx_documents_category_id ON documents(category_id)",
  "CREATE INDEX IF NOT EXISTS idx_documents_type_date ON documents(type, date)",
  "CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)",
  "CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name)",
];

async function ensureDatabase() {
  await database.batch(schemaStatements.map((statement) => database.prepare(statement)));
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
  const [clientsResult, categoriesResult, documentsResult, settingsResult] = await Promise.all([
    database.prepare("SELECT id, name, company_name AS companyName, owner_name AS ownerName, phone, email, address, notes, created_at AS createdAt, updated_at AS updatedAt FROM clients ORDER BY name COLLATE NOCASE").all(),
    database.prepare("SELECT id, name, prefix, footer_text_1 AS footerText1, footer_text_2 AS footerText2, counter, created_at AS createdAt, updated_at AS updatedAt FROM categories ORDER BY id").all(),
    database.prepare(`SELECT d.id, d.type, d.generated_code AS generatedCode, d.client_id AS clientId,
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
    settings: settingsResult,
  };
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
    await ensureDatabase();
    return Response.json(await getState());
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request) {
  try {
    const authError = await requireAuth(request);
    if (authError) return authError;
    await ensureDatabase();
    const payload = actionPayload.parse(await request.json());

    if (payload.action === "createClient" || payload.action === "updateClient") {
      const values = payload.data;
      if (payload.action === "createClient") {
        await database.prepare(`INSERT INTO clients (name, company_name, owner_name, phone, email, address, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(values.name, values.companyName, values.ownerName, values.phone, values.email, values.address, values.notes).run();
      } else {
        await database.prepare(`UPDATE clients SET name = ?, company_name = ?, owner_name = ?, phone = ?, email = ?, address = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .bind(values.name, values.companyName, values.ownerName, values.phone, values.email, values.address, values.notes, payload.id).run();
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
        await database.prepare(`UPDATE documents SET client_id = ?, category_id = ?, date = ?, valid_until = ?, prepared_by = ?, currency = ?, project = ?, status = ?, items_json = ?, subtotal = ?, discount = ?, tax = ?, total = ?, payment_terms = ?, notes_exclusions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .bind(data.clientId, data.categoryId, data.date, data.validUntil, data.preparedBy, data.currency, data.project, data.status, JSON.stringify(data.items), math.subtotal, data.discount, data.tax, math.total, data.paymentTerms, data.notesExclusions, data.id).run();
      } else {
        await database.prepare(`INSERT INTO documents (type, generated_code, client_id, category_id, date, valid_until, prepared_by, currency, project, status, items_json, subtotal, discount, tax, total, payment_terms, notes_exclusions, pdf_key)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(data.type, generatedCode, data.clientId, data.categoryId, data.date, data.validUntil, data.preparedBy, data.currency, data.project, data.status, JSON.stringify(data.items), math.subtotal, data.discount, data.tax, math.total, data.paymentTerms, data.notesExclusions, pdfKey).run();
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

    return Response.json(await getState());
  } catch (error) {
    return responseError(error);
  }
}
