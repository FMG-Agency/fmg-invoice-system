import { readFile } from "node:fs/promises";
import path from "node:path";
import { database } from "./database";
import { generateDocumentPdf } from "./pdf";
import type { Client, Category, DocumentDraft } from "../types";

export async function renderSavedDocumentPdf(id: number) {
  const row = await database.prepare(`SELECT type, company_key AS companyKey,
    generated_code AS generatedCode, client_id AS clientId, category_id AS categoryId,
    date, valid_until AS validUntil, prepared_by AS preparedBy, currency, project, status,
    items_json AS itemsJson, discount, tax, payment_terms AS paymentTerms,
    notes_exclusions AS notesExclusions FROM documents WHERE id = ?`)
    .bind(id).first<DocumentDraft & { itemsJson: string; generatedCode: string }>();
  if (!row) throw new Error("Document not found");
  const client = await database.prepare(`SELECT *, company_name AS companyName,
    owner_name AS ownerName FROM clients WHERE id = ?`).bind(row.clientId).first<Client>();
  const category = await database.prepare(`SELECT *, footer_text_1 AS footerText1,
    footer_text_2 AS footerText2 FROM categories WHERE id = ?`).bind(row.categoryId).first<Category>();
  if (!client || !category) throw new Error("Document details are incomplete");
  const asset = (name: string) => readFile(path.join(process.cwd(), "public", name));
  const [logo, regular, bold] = await Promise.all([
    asset(row.companyKey === "digital_empire" ? "digital-empire-logo-pdf.png" : "fmg-logo-pdf.png"),
    asset("arial.ttf"), asset("arial-bold.ttf"),
  ]);
  const pdf = await generateDocumentPdf({ ...row, items: JSON.parse(row.itemsJson) }, client, category, row.generatedCode, {
    logo: `data:image/png;base64,${logo.toString("base64")}`,
    regularFont: regular.toString("base64"), boldFont: bold.toString("base64"),
  });
  return pdf.output("arraybuffer");
}
