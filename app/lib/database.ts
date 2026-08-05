import { createClient, type Client, type InStatement, type InValue } from "@libsql/client";

let client: Client | null = null;

function getClient() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("Turso database is not configured.");
  client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
    intMode: "number",
  });
  return client;
}

function normalizeValue(value: unknown): InValue {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") return value;
  if (value instanceof Uint8Array || value instanceof ArrayBuffer || value instanceof Date) return value;
  throw new TypeError(`Unsupported database value: ${typeof value}`);
}

export class DatabaseStatement {
  constructor(readonly sql: string, readonly args: InValue[] = []) {}

  bind(...values: unknown[]) {
    return new DatabaseStatement(this.sql, values.map(normalizeValue));
  }

  asInput(): InStatement {
    return { sql: this.sql, args: this.args };
  }

  async run() {
    const result = await getClient().execute(this.asInput());
    return { success: true, meta: { changes: result.rowsAffected, last_row_id: result.lastInsertRowid } };
  }

  async all<T extends Record<string, unknown> = Record<string, unknown>>() {
    const result = await getClient().execute(this.asInput());
    return { results: result.rows as unknown as T[] };
  }

  async first<T extends Record<string, unknown> = Record<string, unknown>>() {
    const result = await getClient().execute(this.asInput());
    return (result.rows[0] as unknown as T | undefined) ?? null;
  }
}

export const database = {
  prepare(sql: string) {
    return new DatabaseStatement(sql);
  },

  async batch(statements: DatabaseStatement[]) {
    return getClient().batch(statements.map((statement) => statement.asInput()), "write");
  },
};
