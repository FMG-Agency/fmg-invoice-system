import { database } from "./database";
import type {
  Client,
  ClientAccountCurrencySummary,
  ClientAccountDocument,
  ClientAccountState,
  ClientFinancialTransaction,
  ClientFinancialTransactionType,
  CompanyKey,
} from "../types";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS client_financial_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK(type IN ('charge','payment','credit','refund')),
    amount REAL NOT NULL CHECK(amount > 0),
    currency TEXT NOT NULL DEFAULT 'EGP',
    transaction_date TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'Bank transfer',
    reference TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    source_key TEXT NOT NULL DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS idx_client_financial_transactions_client_date ON client_financial_transactions(client_id, transaction_date)",
  "CREATE INDEX IF NOT EXISTS idx_client_financial_transactions_document ON client_financial_transactions(document_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_client_financial_transactions_source ON client_financial_transactions(source_key) WHERE source_key <> ''",
];

export async function ensureClientAccountsDatabase() {
  await database.batch(schemaStatements.slice(0, 1).map((statement) => database.prepare(statement)));
  const table = await database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'client_financial_transactions'").first<{ sql: string }>();
  if (table && !table.sql.includes("'charge'")) {
    await database.batch([
      database.prepare(`CREATE TABLE client_financial_transactions_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
        type TEXT NOT NULL CHECK(type IN ('charge','payment','credit','refund')),
        amount REAL NOT NULL CHECK(amount > 0),
        currency TEXT NOT NULL DEFAULT 'EGP',
        transaction_date TEXT NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'Bank transfer',
        reference TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        source_key TEXT NOT NULL DEFAULT '',
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      database.prepare(`INSERT INTO client_financial_transactions_v2
        (id, client_id, document_id, type, amount, currency, transaction_date, payment_method, reference, notes, created_by, created_at, updated_at)
        SELECT id, client_id, document_id, type, amount, currency, transaction_date, payment_method, reference, notes, created_by, created_at, updated_at
        FROM client_financial_transactions`),
      database.prepare("DROP TABLE client_financial_transactions"),
      database.prepare("ALTER TABLE client_financial_transactions_v2 RENAME TO client_financial_transactions"),
    ]);
  }
  const columns = await database.prepare("PRAGMA table_info(client_financial_transactions)").all<Record<string, unknown>>();
  if (!columns.results.some((column) => String(column.name) === "source_key")) {
    try {
      await database.prepare("ALTER TABLE client_financial_transactions ADD COLUMN source_key TEXT NOT NULL DEFAULT ''").run();
    } catch (error) {
      if (!/duplicate column name/i.test(error instanceof Error ? error.message : String(error))) throw error;
    }
  }
  await database.batch(schemaStatements.slice(1).map((statement) => database.prepare(statement)));
}

type ClientRow = Record<string, unknown>;

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

function documentTransactionTotals(transactions: ClientFinancialTransaction[], documentId: number) {
  return transactions.filter((transaction) => transaction.documentId === documentId).reduce((totals, transaction) => {
    if (transaction.type === "payment") totals.paid += transaction.amount;
    if (transaction.type === "credit") totals.credited += transaction.amount;
    if (transaction.type === "refund") totals.refunded += transaction.amount;
    return totals;
  }, { paid: 0, credited: 0, refunded: 0 });
}

function mapDocument(record: ClientRow, transactions: ClientFinancialTransaction[]): ClientAccountDocument {
  const total = numberValue(record.total);
  const status = String(record.status ?? "Draft");
  const movement = documentTransactionTotals(transactions, numberValue(record.id));
  const inferredPaid = status === "Paid" ? Math.max(0, total - movement.paid - movement.credited) : 0;
  const financiallyActive = !["Draft", "Rejected"].includes(status);
  const remaining = financiallyActive
    ? Math.max(0, total - movement.paid - movement.credited - inferredPaid + movement.refunded)
    : 0;
  return {
    id: numberValue(record.id),
    type: String(record.type) as "invoice" | "quotation",
    companyKey: (String(record.companyKey || "fmg") as CompanyKey),
    generatedCode: String(record.generatedCode ?? ""),
    date: String(record.date ?? ""),
    validUntil: String(record.validUntil ?? ""),
    project: String(record.project ?? ""),
    status,
    total,
    currency: String(record.currency || "EGP"),
    paid: movement.paid + inferredPaid,
    credited: movement.credited,
    refunded: movement.refunded,
    remaining,
    inferredPaid,
  };
}

function currencySummary(currency: string, invoices: ClientAccountDocument[], transactions: ClientFinancialTransaction[]): ClientAccountCurrencySummary {
  const currencyInvoices = invoices.filter((invoice) => invoice.currency === currency);
  const currencyTransactions = transactions.filter((transaction) => transaction.currency === currency);
  const importedCutoff = currencyTransactions
    .filter((transaction) => transaction.sourceKey.startsWith("fmg-clients-2026:"))
    .reduce((latest, transaction) => transaction.transactionDate > latest ? transaction.transactionDate : latest, "");
  const activeInvoices = currencyInvoices.filter((invoice) => !["Draft", "Rejected"].includes(invoice.status) && (!importedCutoff || invoice.date > importedCutoff));
  const totalInvoiced = activeInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const totalCharges = currencyTransactions.filter((transaction) => transaction.type === "charge").reduce((sum, transaction) => sum + transaction.amount, 0);
  const draftValue = currencyInvoices.filter((invoice) => invoice.status === "Draft").reduce((sum, invoice) => sum + invoice.total, 0);
  const explicitPaid = currencyTransactions.filter((transaction) => transaction.type === "payment").reduce((sum, transaction) => sum + transaction.amount, 0);
  const inferredPaid = activeInvoices.reduce((sum, invoice) => sum + invoice.inferredPaid, 0);
  const totalPaid = explicitPaid + inferredPaid;
  const totalCredited = currencyTransactions.filter((transaction) => transaction.type === "credit").reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalRefunded = currencyTransactions.filter((transaction) => transaction.type === "refund").reduce((sum, transaction) => sum + transaction.amount, 0);
  const netBalance = totalInvoiced + totalCharges - totalPaid - totalCredited + totalRefunded;
  return {
    currency,
    totalInvoiced,
    totalCharges,
    draftValue,
    totalPaid,
    totalCredited,
    totalRefunded,
    outstanding: Math.max(0, netBalance),
    clientCredit: Math.max(0, -netBalance),
  };
}

export async function getClientAccount(clientId: number): Promise<ClientAccountState | null> {
  const client = await database.prepare(`SELECT id, name, company_name AS companyName, owner_name AS ownerName,
    phone, email, address, notes, agency_key AS agencyKey, lifecycle_status AS lifecycleStatus,
    activity, start_date AS startDate, payment_schedule AS paymentSchedule, monthly_fee AS monthlyFee,
    contract_status AS contractStatus, relationship_stage AS relationshipStage,
    created_at AS createdAt, updated_at AS updatedAt
    FROM clients WHERE id = ?`).bind(clientId).first<Client>();
  if (!client) return null;

  const [documentResult, transactionResult] = await Promise.all([
    database.prepare(`SELECT id, type, company_key AS companyKey, generated_code AS generatedCode, date,
      valid_until AS validUntil, project, status, total, currency
      FROM documents WHERE client_id = ? ORDER BY date DESC, id DESC`).bind(clientId).all<ClientRow>(),
    database.prepare(`SELECT t.id, t.client_id AS clientId, t.document_id AS documentId,
      COALESCE(d.generated_code, '') AS documentCode, t.type, t.amount, t.currency,
      t.transaction_date AS transactionDate, t.payment_method AS paymentMethod,
      t.reference, t.notes, t.source_key AS sourceKey, t.created_by AS createdBy,
      COALESCE(u.display_name, u.username, '') AS createdByName,
      t.created_at AS createdAt, t.updated_at AS updatedAt
      FROM client_financial_transactions t
      LEFT JOIN documents d ON d.id = t.document_id
      LEFT JOIN auth_users u ON u.id = t.created_by
      WHERE t.client_id = ? ORDER BY t.transaction_date DESC, t.id DESC`).bind(clientId).all<ClientRow>(),
  ]);

  const transactions: ClientFinancialTransaction[] = transactionResult.results.map((record) => ({
    id: numberValue(record.id),
    clientId: numberValue(record.clientId),
    documentId: record.documentId === null || record.documentId === undefined ? null : numberValue(record.documentId),
    documentCode: String(record.documentCode ?? ""),
    type: String(record.type) as ClientFinancialTransactionType,
    amount: numberValue(record.amount),
    currency: String(record.currency || "EGP"),
    transactionDate: String(record.transactionDate ?? ""),
    paymentMethod: String(record.paymentMethod ?? ""),
    reference: String(record.reference ?? ""),
    notes: String(record.notes ?? ""),
    sourceKey: String(record.sourceKey ?? ""),
    createdBy: record.createdBy === null || record.createdBy === undefined ? null : numberValue(record.createdBy),
    createdByName: String(record.createdByName ?? ""),
    createdAt: String(record.createdAt ?? ""),
    updatedAt: String(record.updatedAt ?? ""),
  }));
  const documents = documentResult.results.map((record) => mapDocument(record, transactions));
  const invoices = documents.filter((document) => document.type === "invoice");
  const quotations = documents.filter((document) => document.type === "quotation");
  const currencies = [...new Set([
    ...invoices.map((invoice) => invoice.currency),
    ...transactions.map((transaction) => transaction.currency),
  ])].sort();

  return {
    client,
    invoices,
    quotations,
    transactions,
    summaries: (currencies.length ? currencies : ["EGP"]).map((currency) => currencySummary(currency, invoices, transactions)),
  };
}
