import seedData from "../data/fmg-clients-2026.json";
import type { Client, ClientFinanceState, ClientMonthlyRetainerStatus, CompanyKey } from "../types";
import { ensureClientAccountsDatabase } from "./client-accounts";
import { database, type DatabaseStatement } from "./database";

const clientColumnMigrations = [
  ["agency_key", "ALTER TABLE clients ADD COLUMN agency_key TEXT NOT NULL DEFAULT 'fmg'"],
  ["lifecycle_status", "ALTER TABLE clients ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'prospect'"],
  ["activity", "ALTER TABLE clients ADD COLUMN activity TEXT NOT NULL DEFAULT ''"],
  ["start_date", "ALTER TABLE clients ADD COLUMN start_date TEXT NOT NULL DEFAULT ''"],
  ["payment_schedule", "ALTER TABLE clients ADD COLUMN payment_schedule TEXT NOT NULL DEFAULT ''"],
  ["monthly_fee", "ALTER TABLE clients ADD COLUMN monthly_fee REAL NOT NULL DEFAULT 0"],
  ["contract_status", "ALTER TABLE clients ADD COLUMN contract_status TEXT NOT NULL DEFAULT 'not_set'"],
  ["relationship_stage", "ALTER TABLE clients ADD COLUMN relationship_stage TEXT NOT NULL DEFAULT ''"],
] as const;

const financeSchema = [
  `CREATE TABLE IF NOT EXISTS client_monthly_retainers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
    amount REAL NOT NULL DEFAULT 0 CHECK(amount >= 0),
    status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','confirmed','paused')),
    notes TEXT NOT NULL DEFAULT '',
    source_key TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(client_id, year, month)
  )`,
  `CREATE TABLE IF NOT EXISTS workspace_data_imports (
    import_key TEXT PRIMARY KEY,
    source_file TEXT NOT NULL,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS idx_client_monthly_retainers_year_month ON client_monthly_retainers(year, month)",
  "CREATE INDEX IF NOT EXISTS idx_client_monthly_retainers_client ON client_monthly_retainers(client_id)",
];

function numeric(value: unknown) {
  return Number(value ?? 0);
}

function normalizedName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim();
}

async function runInChunks(statements: DatabaseStatement[], size = 70) {
  for (let index = 0; index < statements.length; index += size) {
    await database.batch(statements.slice(index, index + size));
  }
}

export async function ensureClientFinanceDatabase() {
  const columns = await database.prepare("PRAGMA table_info(clients)").all<Record<string, unknown>>();
  const names = new Set(columns.results.map((column) => String(column.name)));
  for (const [name, sql] of clientColumnMigrations) {
    if (names.has(name)) continue;
    try {
      await database.prepare(sql).run();
    } catch (error) {
      if (!/duplicate column name/i.test(error instanceof Error ? error.message : String(error))) throw error;
    }
  }
  await database.batch(financeSchema.map((statement) => database.prepare(statement)));
  await ensureClientAccountsDatabase();
}

export async function importClientWorkbookData() {
  await ensureClientFinanceDatabase();
  const completed = await database.prepare("SELECT import_key AS importKey FROM workspace_data_imports WHERE import_key = ?")
    .bind(seedData.importKey).first<{ importKey: string }>();
  if (completed) return true;

  const existingResult = await database.prepare("SELECT id, name, company_name AS companyName FROM clients").all<{ id: number; name: string; companyName: string }>();
  const clientIds = new Map<string, number>();
  for (const client of existingResult.results) {
    clientIds.set(normalizedName(client.companyName || client.name), numeric(client.id));
    clientIds.set(normalizedName(client.name), numeric(client.id));
  }

  const idByCanonicalName = new Map<string, number>();
  for (const profile of seedData.profiles) {
    const candidates = [profile.name, ...profile.aliases].map(normalizedName);
    let clientId = candidates.map((candidate) => clientIds.get(candidate)).find(Boolean) ?? 0;
    if (!clientId) {
      const created = await database.prepare(`INSERT INTO clients
        (name, company_name, owner_name, phone, email, address, notes, agency_key, lifecycle_status, activity,
         start_date, payment_schedule, monthly_fee, contract_status, relationship_stage)
        VALUES (?, ?, '', '', '', '', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(profile.name, profile.name, `Imported from ${seedData.sourceFile}.`, profile.agency, profile.lifecycleStatus,
          profile.activity, profile.startDate, profile.paymentSchedule, profile.monthlyFee, profile.contractStatus, profile.relationshipStage).run();
      clientId = numeric(created.meta.last_row_id);
    }
    await database.prepare(`UPDATE clients SET
      company_name = CASE WHEN TRIM(company_name) = '' THEN ? ELSE company_name END,
      agency_key = ?, lifecycle_status = ?, activity = ?, start_date = ?, payment_schedule = ?, monthly_fee = ?,
      contract_status = ?, relationship_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(profile.name, profile.agency, profile.lifecycleStatus, profile.activity, profile.startDate, profile.paymentSchedule,
        profile.monthlyFee, profile.contractStatus, profile.relationshipStage, clientId).run();
    idByCanonicalName.set(profile.name, clientId);
    for (const alias of [profile.name, ...profile.aliases]) clientIds.set(normalizedName(alias), clientId);
  }

  const retainerStatements = seedData.retainers.flatMap((entry) => {
    const clientId = idByCanonicalName.get(entry.clientName);
    if (!clientId) return [];
    const sourceKey = `${seedData.importKey}:retainer:${clientId}:${entry.year}:${entry.month}`;
    return [database.prepare(`INSERT INTO client_monthly_retainers
      (client_id, year, month, amount, status, notes, source_key)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(client_id, year, month) DO NOTHING`).bind(
      clientId, entry.year, entry.month, entry.amount, entry.status, `Imported from ${seedData.sourceFile}.`, sourceKey,
    )];
  });

  const ledgerStatements = seedData.ledger.flatMap((entry) => {
    const clientId = idByCanonicalName.get(entry.clientName);
    if (!clientId) return [];
    const method = entry.type === "charge"
      ? entry.category ? `Charge · ${entry.category}` : "Account charge"
      : entry.category ? `Payment · ${entry.category}` : "Imported payment";
    return [database.prepare(`INSERT OR IGNORE INTO client_financial_transactions
      (client_id, document_id, type, amount, currency, transaction_date, payment_method, reference, notes, source_key)
      VALUES (?, NULL, ?, ?, 'EGP', ?, ?, ?, ?, ?)`).bind(
      clientId, entry.type, entry.amount, entry.transactionDate, method, seedData.sourceFile, entry.description, entry.sourceKey,
    )];
  });

  await runInChunks(retainerStatements);
  await runInChunks(ledgerStatements);
  await database.prepare("INSERT OR IGNORE INTO workspace_data_imports (import_key, source_file) VALUES (?, ?)")
    .bind(seedData.importKey, seedData.sourceFile).run();
  return true;
}

function mapClient(record: Record<string, unknown>): Client {
  return {
    id: numeric(record.id),
    name: String(record.name ?? ""),
    companyName: String(record.companyName ?? ""),
    ownerName: String(record.ownerName ?? ""),
    phone: String(record.phone ?? ""),
    email: String(record.email ?? ""),
    address: String(record.address ?? ""),
    notes: String(record.notes ?? ""),
    agencyKey: (String(record.agencyKey || "fmg") as CompanyKey),
    lifecycleStatus: (String(record.lifecycleStatus || "prospect") as Client["lifecycleStatus"]),
    activity: String(record.activity ?? ""),
    startDate: String(record.startDate ?? ""),
    paymentSchedule: String(record.paymentSchedule ?? ""),
    monthlyFee: numeric(record.monthlyFee),
    contractStatus: (String(record.contractStatus || "not_set") as Client["contractStatus"]),
    relationshipStage: (String(record.relationshipStage || "") as Client["relationshipStage"]),
    createdAt: String(record.createdAt ?? ""),
    updatedAt: String(record.updatedAt ?? ""),
  };
}

export async function getClientFinanceState(year: number): Promise<ClientFinanceState> {
  await importClientWorkbookData();
  const [clientResult, retainerResult, transactionResult, invoiceResult, importResult] = await Promise.all([
    database.prepare(`SELECT id, name, company_name AS companyName, owner_name AS ownerName, phone, email, address, notes,
      agency_key AS agencyKey, lifecycle_status AS lifecycleStatus, activity, start_date AS startDate,
      payment_schedule AS paymentSchedule, monthly_fee AS monthlyFee, contract_status AS contractStatus,
      relationship_stage AS relationshipStage, created_at AS createdAt, updated_at AS updatedAt
      FROM clients ORDER BY company_name COLLATE NOCASE, name COLLATE NOCASE`).all<Record<string, unknown>>(),
    database.prepare(`SELECT id, client_id AS clientId, year, month, amount, status, notes, source_key AS sourceKey,
      created_at AS createdAt, updated_at AS updatedAt FROM client_monthly_retainers WHERE year = ? ORDER BY client_id, month`)
      .bind(year).all<Record<string, unknown>>(),
    database.prepare(`SELECT client_id AS clientId,
      SUM(CASE WHEN type = 'charge' THEN amount ELSE 0 END) AS totalCharges,
      SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END) AS totalPaid,
      SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END) AS totalCredited,
      SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END) AS totalRefunded
      FROM client_financial_transactions GROUP BY client_id`).all<Record<string, unknown>>(),
    database.prepare(`SELECT d.client_id AS clientId, SUM(d.total) AS totalInvoiced
      FROM documents d
      LEFT JOIN (
        SELECT client_id, MAX(transaction_date) AS cutoff
        FROM client_financial_transactions
        WHERE source_key LIKE 'fmg-clients-2026:%'
        GROUP BY client_id
      ) imported ON imported.client_id = d.client_id
      WHERE d.type = 'invoice' AND d.status NOT IN ('Draft','Rejected')
        AND (imported.cutoff IS NULL OR d.date > imported.cutoff)
      GROUP BY d.client_id`).all<Record<string, unknown>>(),
    database.prepare("SELECT import_key AS importKey FROM workspace_data_imports WHERE import_key = ?")
      .bind(seedData.importKey).first<{ importKey: string }>(),
  ]);

  const clients = clientResult.results.map(mapClient);
  const retainers = retainerResult.results.map((row) => ({
    id: numeric(row.id), clientId: numeric(row.clientId), year: numeric(row.year), month: numeric(row.month), amount: numeric(row.amount),
    status: String(row.status) as ClientMonthlyRetainerStatus, notes: String(row.notes ?? ""), sourceKey: String(row.sourceKey ?? ""),
    createdAt: String(row.createdAt ?? ""), updatedAt: String(row.updatedAt ?? ""),
  }));
  const transactionByClient = new Map(transactionResult.results.map((row) => [numeric(row.clientId), row]));
  const invoiceByClient = new Map(invoiceResult.results.map((row) => [numeric(row.clientId), numeric(row.totalInvoiced)]));
  const currentMonth = new Date().getFullYear() === year ? new Date().getMonth() + 1 : 0;
  const summaries = clients.map((client) => {
    const transactions = transactionByClient.get(client.id) ?? {};
    const totalInvoiced = invoiceByClient.get(client.id) ?? 0;
    const totalCharges = numeric(transactions.totalCharges);
    const totalPaid = numeric(transactions.totalPaid);
    const totalCredited = numeric(transactions.totalCredited);
    const totalRefunded = numeric(transactions.totalRefunded);
    const clientRetainers = retainers.filter((entry) => entry.clientId === client.id && entry.status !== "paused");
    return {
      clientId: client.id,
      totalInvoiced,
      totalCharges,
      totalPaid,
      totalCredited,
      totalRefunded,
      balance: totalInvoiced + totalCharges - totalPaid - totalCredited + totalRefunded,
      plannedYear: clientRetainers.reduce((sum, entry) => sum + entry.amount, 0),
      currentMonthPlan: clientRetainers.find((entry) => entry.month === currentMonth)?.amount ?? 0,
    };
  });

  return { year, clients, retainers, summaries, importedWorkbook: Boolean(importResult) };
}

export type RetainerInput = {
  clientId: number;
  year: number;
  month: number;
  amount: number;
  status: ClientMonthlyRetainerStatus;
  notes: string;
};

export async function saveRetainer(value: RetainerInput) {
  await ensureClientFinanceDatabase();
  await database.prepare(`INSERT INTO client_monthly_retainers (client_id, year, month, amount, status, notes)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(client_id, year, month) DO UPDATE SET amount = excluded.amount, status = excluded.status,
      notes = excluded.notes, updated_at = CURRENT_TIMESTAMP`)
    .bind(value.clientId, value.year, value.month, value.amount, value.status, value.notes).run();
}

export async function saveRetainerRange(value: Omit<RetainerInput, "month"> & { startMonth: number; endMonth: number }) {
  await ensureClientFinanceDatabase();
  const statements = [];
  for (let month = value.startMonth; month <= value.endMonth; month += 1) {
    statements.push(database.prepare(`INSERT INTO client_monthly_retainers (client_id, year, month, amount, status, notes)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(client_id, year, month) DO UPDATE SET amount = excluded.amount, status = excluded.status,
        notes = excluded.notes, updated_at = CURRENT_TIMESTAMP`)
      .bind(value.clientId, value.year, month, value.amount, value.status, value.notes));
  }
  await database.batch(statements);
}

export async function deleteRetainer(clientId: number, year: number, month: number) {
  await ensureClientFinanceDatabase();
  await database.prepare("DELETE FROM client_monthly_retainers WHERE client_id = ? AND year = ? AND month = ?")
    .bind(clientId, year, month).run();
}
