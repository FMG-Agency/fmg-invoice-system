import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  companyName: text("company_name").notNull().default(""),
  ownerName: text("owner_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  prefix: text("prefix").notNull().unique(),
  footerText1: text("footer_text_1").notNull().default(""),
  footerText2: text("footer_text_2").notNull().default(""),
  counter: integer("counter").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", { enum: ["invoice", "quotation"] }).notNull(),
  generatedCode: text("generated_code").notNull().unique(),
  clientId: integer("client_id").notNull().references(() => clients.id),
  categoryId: integer("category_id").notNull().references(() => categories.id),
  date: text("date").notNull(),
  validUntil: text("valid_until").notNull().default(""),
  preparedBy: text("prepared_by").notNull().default("Finance Department"),
  currency: text("currency").notNull().default("EGP"),
  project: text("project").notNull().default(""),
  status: text("status").notNull().default("Draft"),
  itemsJson: text("items_json").notNull(),
  subtotal: real("subtotal").notNull().default(0),
  discount: real("discount").notNull().default(0),
  tax: real("tax").notNull().default(0),
  total: real("total").notNull().default(0),
  paymentTerms: text("payment_terms").notNull().default(""),
  notesExclusions: text("notes_exclusions").notNull().default(""),
  pdfKey: text("pdf_key").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  agencyName: text("agency_name").notNull().default("FMG Agency"),
  defaultCurrency: text("default_currency").notNull().default("EGP"),
  preparedBy: text("prepared_by").notNull().default("Finance Department"),
  defaultPaymentTerms: text("default_payment_terms").notNull().default("50% advance payment • 50% upon completion"),
  defaultTax: real("default_tax").notNull().default(0),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const authCredentials = sqliteTable("auth_credentials", {
  id: integer("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const authSessions = sqliteTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id").notNull().default(1).references(() => authCredentials.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_auth_sessions_expires_at").on(table.expiresAt)]);

export const authAttempts = sqliteTable("auth_attempts", {
  attemptKey: text("attempt_key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  resetAt: integer("reset_at").notNull(),
});
