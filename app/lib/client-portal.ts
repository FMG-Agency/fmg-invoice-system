import { database } from "./database";
import { ensureClientAccountsDatabase, getClientAccount } from "./client-accounts";
import type { AuthSession } from "./auth-server";
import type { Client, ClientPortalPlanPart, ClientPortalState } from "../types";

const portalSchema = [
  `CREATE TABLE IF NOT EXISTS client_portal_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    year INTEGER NOT NULL CHECK(year BETWEEN 2020 AND 2100),
    month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
    part INTEGER NOT NULL CHECK(part IN (1, 2)),
    title TEXT NOT NULL DEFAULT 'Content plan',
    url TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(client_id, year, month, part)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_client_portal_plans_client_year ON client_portal_plans(client_id, year, month)",
];

export async function ensureClientPortalDatabase() {
  await database.batch(portalSchema.map((statement) => database.prepare(statement)));
}

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

function mapPlan(row: Record<string, unknown>): ClientPortalPlanPart {
  return {
    id: numberValue(row.id),
    clientId: numberValue(row.clientId),
    year: numberValue(row.year),
    month: numberValue(row.month),
    part: numberValue(row.part) === 2 ? 2 : 1,
    title: String(row.title || "Content plan"),
    url: String(row.url || ""),
    notes: String(row.notes || ""),
    published: numberValue(row.published) === 1,
    createdBy: row.createdBy === null || row.createdBy === undefined ? null : numberValue(row.createdBy),
    createdByName: String(row.createdByName || ""),
    createdAt: String(row.createdAt || ""),
    updatedAt: String(row.updatedAt || ""),
  };
}

async function listClients(): Promise<Array<Client & { portalUsername: string }>> {
  const result = await database.prepare(`SELECT c.id, c.name, c.company_name AS companyName, c.owner_name AS ownerName,
      c.phone, c.email, c.address, c.notes, c.agency_key AS agencyKey, c.lifecycle_status AS lifecycleStatus,
      c.activity, c.start_date AS startDate, c.payment_schedule AS paymentSchedule, c.monthly_fee AS monthlyFee,
      c.contract_status AS contractStatus, c.relationship_stage AS relationshipStage,
      c.created_at AS createdAt, c.updated_at AS updatedAt, COALESCE(u.username, '') AS portalUsername
    FROM clients c LEFT JOIN auth_users u ON u.client_id = c.id AND u.active = 1
    ORDER BY c.company_name COLLATE NOCASE, c.name COLLATE NOCASE`).all<Record<string, unknown>>();
  return result.results.map((row) => ({
    id: numberValue(row.id),
    name: String(row.name || ""),
    companyName: String(row.companyName || ""),
    ownerName: String(row.ownerName || ""),
    phone: String(row.phone || ""),
    email: String(row.email || ""),
    address: String(row.address || ""),
    notes: String(row.notes || ""),
    agencyKey: String(row.agencyKey || "fmg") === "digital_empire" ? "digital_empire" : "fmg",
    lifecycleStatus: (["active", "inactive", "shoot", "prospect"].includes(String(row.lifecycleStatus)) ? String(row.lifecycleStatus) : "prospect") as Client["lifecycleStatus"],
    activity: String(row.activity || ""),
    startDate: String(row.startDate || ""),
    paymentSchedule: String(row.paymentSchedule || ""),
    monthlyFee: numberValue(row.monthlyFee),
    contractStatus: (["contract", "no_contract", "not_set"].includes(String(row.contractStatus)) ? String(row.contractStatus) : "not_set") as Client["contractStatus"],
    relationshipStage: (["new", "old"].includes(String(row.relationshipStage)) ? String(row.relationshipStage) : "") as Client["relationshipStage"],
    createdAt: String(row.createdAt || ""),
    updatedAt: String(row.updatedAt || ""),
    portalUsername: String(row.portalUsername || ""),
  }));
}

export async function getClientPortalState(session: AuthSession, requestedClientId: number | null, requestedYear: number): Promise<ClientPortalState> {
  await ensureClientPortalDatabase();
  await ensureClientAccountsDatabase();
  const clients = session.clientId === null ? await listClients() : [];
  const clientId = session.clientId ?? requestedClientId ?? clients[0]?.id ?? null;
  const currentYear = new Date().getFullYear();
  const year = Number.isInteger(requestedYear) && requestedYear >= 2020 && requestedYear <= 2100 ? requestedYear : currentYear;
  if (!clientId) return { viewerMode: session.clientId === null ? "staff" : "client", client: null, clients, year, years: [currentYear], invoices: [], summaries: [], plans: [] };

  const account = await getClientAccount(clientId);
  if (!account) return { viewerMode: session.clientId === null ? "staff" : "client", client: null, clients, year, years: [currentYear], invoices: [], summaries: [], plans: [] };
  const [plansResult, yearsResult] = await Promise.all([
    database.prepare(`SELECT p.id, p.client_id AS clientId, p.year, p.month, p.part, p.title, p.url, p.notes,
        p.published, p.created_by AS createdBy, COALESCE(u.display_name, u.username, '') AS createdByName,
        p.created_at AS createdAt, p.updated_at AS updatedAt
      FROM client_portal_plans p LEFT JOIN auth_users u ON u.id = p.created_by
      WHERE p.client_id = ? AND p.year = ? ${session.clientId === null ? "" : "AND p.published = 1"}
      ORDER BY p.month, p.part`).bind(clientId, year).all<Record<string, unknown>>(),
    database.prepare(`SELECT DISTINCT year FROM (
        SELECT CAST(substr(date, 1, 4) AS INTEGER) AS year FROM documents WHERE client_id = ? AND type = 'invoice'
        UNION SELECT year FROM client_portal_plans WHERE client_id = ?
      ) WHERE year BETWEEN 2020 AND 2100 ORDER BY year DESC`).bind(clientId, clientId).all<Record<string, unknown>>(),
  ]);
  const years = [...new Set([currentYear, year, ...yearsResult.results.map((row) => numberValue(row.year)).filter(Boolean)])].sort((left, right) => right - left);
  return {
    viewerMode: session.clientId === null ? "staff" : "client",
    client: account.client,
    clients,
    year,
    years,
    invoices: account.invoices.filter((invoice) => !["Draft", "Rejected"].includes(invoice.status)),
    summaries: account.summaries,
    plans: plansResult.results.map(mapPlan),
  };
}
