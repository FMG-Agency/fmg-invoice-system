import { jsPDF } from "jspdf";
import type { Category, Client, DocumentDraft } from "../types";

const BLACK = "#111111";
const YELLOW = "#ffdf00";
const LIGHT = "#f2f2f2";
const MID = "#707070";

async function toDataUrl(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function fontBase64(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  const block = 0x8000;
  for (let index = 0; index < bytes.length; index += block) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + block, bytes.length)));
  }
  return btoa(binary);
}

function formatMoney(value: number, currency: string) {
  return `${new Intl.NumberFormat("en-EG", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

function arabicText(doc: jsPDF, value: string) {
  const processor = (doc as jsPDF & { processArabic?: (input: string) => string }).processArabic;
  return /[\u0600-\u06FF]/.test(value) && processor ? processor(value) : value;
}

function text(doc: jsPDF, value: string, x: number, y: number, options: { align?: "left" | "center" | "right"; maxWidth?: number; fontSize?: number; bold?: boolean; color?: string } = {}) {
  doc.setFont(options.bold ? "FMGArial" : "FMGArial", options.bold ? "bold" : "normal");
  doc.setFontSize(options.fontSize ?? 8);
  doc.setTextColor(options.color ?? BLACK);
  const processed = arabicText(doc, value || "—");
  const align = options.align ?? (/[\u0600-\u06FF]/.test(value) ? "right" : "left");
  doc.text(processed, x, y, { align, maxWidth: options.maxWidth });
}

function band(doc: jsPDF, label: string, y: number) {
  doc.setFillColor(YELLOW);
  doc.rect(14, y, 5, 6, "F");
  text(doc, label, 22, y + 4.5, { fontSize: 8.5, bold: true });
  doc.setDrawColor(BLACK);
  doc.setLineWidth(0.4);
  doc.line(14, y + 7.5, 196, y + 7.5);
}

function infoGrid(doc: jsPDF, rows: Array<[string, string, string, string]>, y: number) {
  const widths = [31, 60, 31, 60];
  let rowY = y;
  for (const row of rows) {
    let x = 14;
    row.forEach((value, index) => {
      doc.setFillColor(index % 2 === 0 ? BLACK : "#ffffff");
      doc.setDrawColor("#d8d8d8");
      doc.rect(x, rowY, widths[index], 8, "FD");
      text(doc, value, x + (index % 2 === 0 ? 3 : 3), rowY + 5.25, {
        fontSize: index % 2 === 0 ? 6.7 : 8,
        bold: index % 2 === 0,
        color: index % 2 === 0 ? "#ffffff" : BLACK,
        maxWidth: widths[index] - 6,
      });
      x += widths[index];
    });
    rowY += 8;
  }
  return rowY;
}

function itemHeader(doc: jsPDF, draft: DocumentDraft, y: number) {
  const invoice = draft.type === "invoice";
  const widths = invoice ? [10, 25, 81, 15, 25, 26] : [10, 82, 15, 18, 28, 29];
  const labels = invoice ? ["NO.", "DATE", "SERVICE / DELIVERABLE", "QTY", "PRICE", "TOTAL"] : ["#", "SERVICE / DELIVERABLE", "QTY", "UNIT", "UNIT PRICE", "TOTAL"];
  let x = 14;
  doc.setFillColor(BLACK);
  labels.forEach((label, index) => {
    doc.rect(x, y, widths[index], 9, "F");
    text(doc, label, x + widths[index] / 2, y + 5.7, { align: "center", fontSize: 6.5, bold: true, color: index === 0 ? YELLOW : "#ffffff" });
    x += widths[index];
  });
  return widths;
}

function itemRow(doc: jsPDF, draft: DocumentDraft, item: DocumentDraft["items"][number], index: number, y: number, widths: number[]) {
  const values = draft.type === "invoice"
    ? [String(index + 1), item.date || draft.date, item.description, String(item.qty), formatMoney(item.unitPrice, ""), formatMoney(item.qty * item.unitPrice, "")]
    : [String(index + 1), item.description, String(item.qty), item.unit || "Unit", formatMoney(item.unitPrice, ""), formatMoney(item.qty * item.unitPrice, "")];
  let x = 14;
  values.forEach((value, cell) => {
    doc.setFillColor(index % 2 === 0 ? "#ffffff" : "#fafafa");
    doc.setDrawColor("#d8d8d8");
    doc.rect(x, y, widths[cell], 10, "FD");
    text(doc, value.trim(), cell === 1 || (draft.type === "invoice" && cell === 2) ? x + 2.5 : x + widths[cell] / 2, y + 6.2, {
      align: cell === 1 || (draft.type === "invoice" && cell === 2) ? "left" : "center",
      fontSize: 7,
      maxWidth: widths[cell] - 5,
    });
    x += widths[cell];
  });
}

function totals(doc: jsPDF, draft: DocumentDraft, y: number) {
  const subtotal = draft.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const grand = Math.max(0, subtotal - draft.discount + draft.tax);
  const rows: Array<[string, string, boolean]> = [
    ["SUBTOTAL", formatMoney(subtotal, draft.currency), false],
    ["DISCOUNT", formatMoney(draft.discount, draft.currency), false],
    ["TAX / VAT", formatMoney(draft.tax, draft.currency), false],
    ["GRAND TOTAL", formatMoney(grand, draft.currency), true],
  ];
  let rowY = y;
  rows.forEach(([label, value, strong]) => {
    doc.setFillColor(strong ? YELLOW : LIGHT);
    doc.rect(118, rowY, 42, 8, "F");
    doc.setFillColor(strong ? BLACK : "#ffffff");
    doc.setDrawColor("#d8d8d8");
    doc.rect(160, rowY, 36, 8, "FD");
    text(doc, label, 157, rowY + 5.25, { align: "right", fontSize: 7, bold: true, color: BLACK });
    text(doc, value, 193, rowY + 5.25, { align: "right", fontSize: 7, bold: strong, color: strong ? "#ffffff" : BLACK });
    rowY += 8;
  });
  return rowY;
}

function footer(doc: jsPDF, category: Category) {
  const pageHeight = doc.internal.pageSize.getHeight();
  text(doc, category.footerText1 || "Thank you for your partnership.", 14, pageHeight - 20, { fontSize: 6.5, color: MID, maxWidth: 182 });
  text(doc, category.footerText2 || "FMG Agency • Superheroes who create", 14, pageHeight - 15.5, { fontSize: 6.5, color: MID, maxWidth: 182 });
  doc.setFillColor(BLACK);
  doc.rect(0, pageHeight - 10, 210, 10, "F");
  doc.setFillColor(YELLOW);
  doc.rect(0, pageHeight - 10, 34, 10, "F");
  text(doc, "FMG AGENCY  •  SUPERHEROES WHO CREATE", 196, pageHeight - 4.1, { align: "right", fontSize: 6.4, bold: true, color: "#ffffff" });
}

function signatureBlock(doc: jsPDF, draft: DocumentDraft, y: number) {
  if (draft.type === "invoice") {
    text(doc, "Executive Director", 31, y + 5, { fontSize: 7, bold: true });
    text(doc, "Name: Fady Maged", 31, y + 10, { fontSize: 7 });
    text(doc, "Finance Director", 130, y + 5, { fontSize: 7, bold: true });
    text(doc, "Name: Rafik Ezzat", 130, y + 10, { fontSize: 7 });
  } else {
    doc.setDrawColor(BLACK);
    doc.line(20, y + 3, 88, y + 3);
    doc.line(122, y + 3, 190, y + 3);
    text(doc, "FOR FMG AGENCY", 20, y + 9, { fontSize: 7, bold: true });
    text(doc, "Name: __________________   Date: __________", 20, y + 14, { fontSize: 6.5 });
    text(doc, "CLIENT APPROVAL", 122, y + 9, { fontSize: 7, bold: true });
    text(doc, "Name: __________________   Date: __________", 122, y + 14, { fontSize: 6.5 });
  }
}

export async function generateDocumentPdf(draft: DocumentDraft, client: Client, category: Category, generatedCode: string) {
  const [logo, regularFont, boldFont] = await Promise.all([
    toDataUrl("/fmg-logo-dark.png"),
    fontBase64("/arial.ttf"),
    fontBase64("/arial-bold.ttf"),
  ]);
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.addFileToVFS("Arial.ttf", regularFont);
  doc.addFont("Arial.ttf", "FMGArial", "normal");
  doc.addFileToVFS("Arial-Bold.ttf", boldFont);
  doc.addFont("Arial-Bold.ttf", "FMGArial", "bold");
  doc.setFont("FMGArial", "normal");

  const drawHeader = (continuation = false) => {
    doc.addImage(logo, "PNG", 14, 10, 59, 24, undefined, "FAST");
    doc.setFillColor(YELLOW);
    doc.rect(187, 0, 23, 9, "F");
    text(doc, draft.type === "invoice" ? "INVOICE" : "QUOTATION", 196, 17, { align: "right", fontSize: 20, bold: true });
    text(doc, continuation ? "CONTINUATION" : "CREATIVE • DIGITAL • PRODUCTION", 196, 23, { align: "right", fontSize: 6.5, bold: true, color: MID });
  };

  drawHeader();
  band(doc, `${draft.type === "invoice" ? "INVOICE" : "QUOTATION"} INFORMATION  /`, 39);
  const infoRows: Array<[string, string, string, string]> = [
    [draft.type === "invoice" ? "INVOICE NO." : "QUOTATION NO.", generatedCode, "DATE", draft.date],
    ["VALID UNTIL", draft.validUntil || draft.date, "PREPARED BY", draft.preparedBy],
  ];
  if (draft.type === "quotation") infoRows.push(["CURRENCY", draft.currency, "PROJECT", draft.project || category.name]);
  let y = infoGrid(doc, infoRows, 49) + 5;
  band(doc, "CLIENT INFORMATION  /", y);
  y = infoGrid(doc, [
    ["CLIENT / COMPANY", client.companyName || client.name, "CONTACT PERSON", client.ownerName],
    ["EMAIL", client.email || "—", "PHONE", client.phone],
  ], y + 10) + 5;
  band(doc, "SCOPE & PRICING  /", y);
  y += 10;
  let widths = itemHeader(doc, draft, y);
  y += 9;
  draft.items.forEach((item, index) => {
    if (y > 225) {
      footer(doc, category);
      doc.addPage();
      drawHeader(true);
      band(doc, "SCOPE & PRICING  /", 39);
      y = 49;
      widths = itemHeader(doc, draft, y);
      y += 9;
    }
    itemRow(doc, draft, item, index, y, widths);
    y += 10;
  });

  y = totals(doc, draft, y + 3) + 6;
  if (draft.type === "quotation") {
    if (y > 226) {
      footer(doc, category);
      doc.addPage();
      drawHeader(true);
      y = 42;
    }
    band(doc, "PAYMENT & NOTES  /", y);
    y += 10;
    doc.setFillColor(LIGHT);
    doc.rect(14, y, 42, 10, "F");
    text(doc, "PAYMENT TERMS", 17, y + 6.2, { fontSize: 7, bold: true });
    doc.setDrawColor("#d8d8d8");
    doc.rect(56, y, 140, 10);
    text(doc, draft.paymentTerms || "50% advance payment • 50% upon completion", 59, y + 6.2, { fontSize: 7, maxWidth: 134 });
    y += 10;
    doc.setFillColor(LIGHT);
    doc.rect(14, y, 42, 18, "F");
    text(doc, "NOTES / EXCLUSIONS", 17, y + 6.2, { fontSize: 7, bold: true });
    doc.rect(56, y, 140, 18);
    text(doc, draft.notesExclusions || "—", 59, y + 6.2, { fontSize: 7, maxWidth: 134 });
    y += 24;
    band(doc, "TERMS & ACCEPTANCE  /", y);
    y += 11;
    text(doc, "• This quotation is valid until the date shown above.   • Work begins after written approval and receipt of the advance payment.   • Any work outside the approved scope will be quoted separately.", 14, y, { fontSize: 6.5, color: MID, maxWidth: 182 });
    y += 11;
  } else {
    text(doc, "• Thank you for your partnership. We truly value the opportunity to support your brand.", 14, y, { fontSize: 6.5, color: MID, maxWidth: 182 });
    y += 8;
  }

  if (y > 245) {
    footer(doc, category);
    doc.addPage();
    drawHeader(true);
    y = 55;
  }
  signatureBlock(doc, draft, y);
  for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
    doc.setPage(page);
    footer(doc, category);
  }
  return doc;
}

export function pdfDataUri(doc: jsPDF) {
  return doc.output("datauristring");
}

export function savePdf(doc: jsPDF, filename: string) {
  doc.save(`${filename}.pdf`);
}
