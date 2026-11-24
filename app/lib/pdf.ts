import { jsPDF } from "jspdf";
import {cellFormat,textRuns} from "./document-text";
import type {CellFormat,DocumentTextField} from "../types";
import type { Category, Client, DocumentDraft } from "../types";
import { formatDocumentDate } from "./document-date";

const BLACK = "#111111";
const YELLOW = "#ffdf00";
const LIGHT = "#f2f2f2";
const MID = "#707070";

type PdfTheme = { primary: string; primaryText: string; accent: string; dark: string; light: string; mid: string; brandName: string; strapline: string; footerLine: string };
const FMG_THEME: PdfTheme = { primary: YELLOW, primaryText: BLACK, accent: YELLOW, dark: BLACK, light: LIGHT, mid: MID, brandName: "FMG AGENCY", strapline: "CREATIVE • DIGITAL • PRODUCTION", footerLine: "FMG AGENCY  •  SUPERHEROES WHO CREATE" };
const DIGITAL_EMPIRE_THEME: PdfTheme = { primary: "#c7372c", primaryText: "#ffffff", accent: "#c0c0c0", dark: "#c7372c", light: "#d6d7d2", mid: "#4a4743", brandName: "THE DIGITAL EMPIRE", strapline: "BRANDING • CONTENT • PERFORMANCE", footerLine: "THE DIGITAL EMPIRE  •  POWERED BY FMG AGENCY" };

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

function band(doc: jsPDF, label: string, y: number, theme: PdfTheme) {
  doc.setFillColor(theme.primary);
  doc.rect(14, y, 5, 6, "F");
  text(doc, label, 22, y + 4.5, { fontSize: 8.5, bold: true });
  doc.setDrawColor(theme.dark);
  doc.setLineWidth(0.4);
  doc.line(14, y + 7.5, 196, y + 7.5);
}

function addonBand(doc: jsPDF, y: number, theme: PdfTheme) {
  doc.setFillColor(theme.primary);
  doc.rect(14, y, 182, 10, "F");
  text(doc, "ADD-ONS  /", 20, y + 6.5, { fontSize: 9.5, bold: true, color: theme.primaryText });
}

function infoGrid(doc: jsPDF, rows: Array<[string, string, string, string]>, y: number, theme: PdfTheme) {
  const widths = [31, 60, 31, 60];
  let rowY = y;
  for (const row of rows) {
    let x = 14;
    row.forEach((value, index) => {
      doc.setFillColor(index % 2 === 0 ? theme.dark : "#ffffff");
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

function itemHeader(doc: jsPDF, draft: DocumentDraft, y: number, mediaGuideDocument: boolean, theme: PdfTheme, addonGroup = false) {
  const invoice = draft.type === "invoice";
  const widths = mediaGuideDocument
    ? invoice ? [10, 44, 53, 47, 28] : [45, 57, 45, 35]
    : invoice ? [10, 106, 15, 25, 26] : [10, 76, 18, 22, 26, 30];
  const labels = mediaGuideDocument
    ? invoice
      ? ["#", addonGroup ? "ADD-ON NAME" : "BUNDLE NAME", "INPUTS", "OUTPUTS", `PRICE · ${draft.currency}`]
      : [addonGroup ? "ADD-ON NAME" : "BUNDLE NAME", "INPUTS", "OUTPUTS", `PRICE · ${draft.currency}`]
    : invoice
    ? ["#", "SERVICE / DELIVERABLE", "QTY", "PRICE", "TOTAL"]
    : ["#", "SERVICE / DELIVERABLE", "QTY", "UNIT", "PRICE", "TOTAL"];
  const format=draft.items[0]?.tableFormat;
  const fontSize=format?.fontSize || 6.5,bold=format?.bold ?? true,align=format?.align || "center";
  doc.setFont("FMGArial",bold?"bold":"normal");doc.setFontSize(fontSize);
  const lines=labels.map((label,i)=>doc.splitTextToSize(label,widths[i]-5) as string[]);
  const height=Math.max(9,5+Math.max(...lines.map(l=>l.length))*fontSize*0.352778*1.3);
  let x=14;
  labels.forEach((label,index)=>{
    doc.setFillColor(theme.dark);doc.rect(x,y,widths[index],height,"F");
    doc.setTextColor(index===0?theme.accent:"#ffffff");
    const anchor=align==="right"?x+widths[index]-2.5:align==="center"?x+widths[index]/2:x+2.5;
    doc.text(lines[index],anchor,y+2.5+fontSize*0.352778,{align,lineHeightFactor:1.3});x+=widths[index];
  });
  return Object.assign(widths,{headerHeight:height});
}

function quotationNameText(item: DocumentDraft["items"][number]) {
  const details = [item.description || "—"];
  if (item.kind === "addon" && item.appliesTo) details.push(`For ${item.appliesTo}`);
  if (item.kind === "addon" && item.bundleTotal !== null && item.bundleTotal !== undefined) details.push(`Bundle total: ${formatMoney(item.bundleTotal, "EGP")}`);
  return details.join("\n");
}

function quotationInputsText(item: DocumentDraft["items"][number]) {
  const inputs = Array.isArray(item.inputs) ? item.inputs : Array.isArray(item.includedServices) ? item.includedServices : [];
  return inputs.join("  •  ") || "—";
}

function quotationOutputsText(item: DocumentDraft["items"][number]) {
  return (Array.isArray(item.outputs) ? item.outputs : []).join("  •  ") || "—";
}

function quotationScopeText(item: DocumentDraft["items"][number]) {
  const details = Array.isArray(item.includedServices) ? item.includedServices.filter(Boolean) : [];
  return [item.description || "—", ...details.map((detail) => `• ${detail}`)].join("\n");
}

type PdfRun = {text:string;fontSize:number;bold:boolean;width:number};
function wrapRuns(doc:jsPDF,text:string,format:CellFormat,width:number):PdfRun[][] {
 const lines:PdfRun[][]=[[]];let used=0;
 const measure=(text:string,fontSize:number,bold:boolean)=>{doc.setFont("FMGArial",bold?"bold":"normal");doc.setFontSize(fontSize);return doc.getTextWidth(arabicText(doc,text));};
 for(const run of textRuns(text,format)){
  const tokens=run.text.match(/\n|[^\S\n]+|[^\s]+/gu) || [];
  for(const token of tokens){
   if(token==='\n'){lines.push([]);used=0;continue;}
   const w=measure(token,run.fontSize,run.bold);
   if(w<=width){
    if(used+w>width+0.001){lines.push([]);used=0;}
    lines[lines.length-1].push({text:token,fontSize:run.fontSize,bold:run.bold,width:w});used+=w;
   }else{
    for(const ch of token){const cw=measure(ch,run.fontSize,run.bold);if(used+cw>width+0.001){lines.push([]);used=0;}lines[lines.length-1].push({text:ch,fontSize:run.fontSize,bold:run.bold,width:cw});used+=cw;}
   }
  }
 }
 return lines.map(line=>{const joined:PdfRun[]=[];for(const run of line){const last=joined.at(-1);if(last && last.fontSize===run.fontSize && last.bold===run.bold){last.text+=run.text;last.width=measure(last.text,last.fontSize,last.bold);}else joined.push({...run});}return joined;});
}
function itemLayout(doc: jsPDF, draft: DocumentDraft, item: DocumentDraft["items"][number], index: number, widths: number[], media: boolean) {
 const invoice=draft.type==='invoice';
 const field=(name:DocumentTextField,text:string)=>{const format=cellFormat(item,name);return {text,format,blocks:[{text,format}]};};
 const description=field('description',item.description || '—');
 const append=(base:typeof description,extra:typeof description)=>({...base,text:base.text+'\n'+extra.text,blocks:[...base.blocks,...extra.blocks]});
 let name=description;
 if(media && item.kind==='addon' && item.appliesTo)name=append(name,field('description','For '+item.appliesTo));
 if(media && item.kind==='addon' && item.bundleTotal!=null)name=append(name,field('description','Bundle total: '+formatMoney(item.bundleTotal,'EGP')));
 if(!media && !invoice && item.includedServices?.length)name=append(name,field('includedServices',item.includedServices.join('\n')));
 const values=media ? [...(invoice?[field('number',String(index+1))]:[]),name,field('inputs',(item.inputs || []).join('\n') || '—'),field('outputs',(item.outputs || []).join('\n') || '—'),field('total',formatMoney(item.qty*item.unitPrice,draft.currency))] : [field('number',String(index+1)),name,field('qty',String(item.qty)),...(invoice?[]:[field('unit',item.unit)]),field('unitPrice',formatMoney(item.unitPrice,'')),field('total',formatMoney(item.qty*item.unitPrice,''))];
 const cells=values.map(({format,blocks},c)=>{const rows=blocks.flatMap(block=>wrapRuns(doc,block.text,block.format,widths[c]-5).map(runs=>({runs,align:block.format.align || 'left' as const})));const runs=rows.map(r=>r.runs);return {align:format.align || 'left',lineAligns:rows.map(r=>r.align),runs,lines:runs.map(line=>line.map(r=>r.text).join(''))};});
 const fontSize=item.fontSize || 7;
 const largest=Math.max(fontSize,...cells.flatMap(c=>c.runs.flatMap(line=>line.map(r=>r.fontSize))));
 const lineHeight=largest*0.352778*1.3;
 return {cells,fontSize,lineHeight,largest,lineCount:Math.max(...cells.map(c=>c.lines.length))};
}
function drawItemSegment(doc:jsPDF, layout:ReturnType<typeof itemLayout>, widths:number[], index:number, y:number, offset:number, count:number) {
 const height=Math.max(10,5+count*layout.lineHeight);let x=14;
 layout.cells.forEach((cell,c)=>{
  doc.setFillColor(index%2===0?'#ffffff':'#fafafa');doc.setDrawColor('#d8d8d8');doc.rect(x,y,widths[c],height,'FD');doc.setTextColor(BLACK);
  cell.runs.slice(offset,offset+count).forEach((runs,line)=>{
   const total=runs.reduce((sum,r)=>sum+r.width,0);
   const align=cell.lineAligns[offset+line] || cell.align;
   const anchor=align==='right'?x+widths[c]-2.5:align==='center'?x+widths[c]/2:x+2.5;
   const baseline=y+2.5+layout.largest*0.352778+line*layout.lineHeight;
   if(runs.length===1){const r=runs[0];doc.setFont('FMGArial',r.bold?'bold':'normal');doc.setFontSize(r.fontSize);doc.text(arabicText(doc,r.text),anchor,baseline,{align});return;}
   let cursor=align==='right'?anchor-total:align==='center'?anchor-total/2:anchor;
   const ordered=/[\u0600-\u06ff]/.test(runs.map(r=>r.text).join(''))?[...runs].reverse():runs;
   for(const r of ordered){doc.setFont('FMGArial',r.bold?'bold':'normal');doc.setFontSize(r.fontSize);doc.text(arabicText(doc,r.text),cursor,baseline,{align:'left'});cursor+=r.width;}
  });x+=widths[c];
 });return height;
}

function totals(doc: jsPDF, draft: DocumentDraft, y: number, theme: PdfTheme) {
  const subtotal = draft.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const rawTotal = subtotal - draft.discount + draft.tax;
  const grand = draft.type === "invoice" ? rawTotal : Math.max(0, rawTotal);
  const rows: Array<[string, string, boolean]> = [
    ["SUBTOTAL", formatMoney(subtotal, draft.currency), false],
    ["DISCOUNT", formatMoney(draft.discount, draft.currency), false],
    ["TAX / VAT", formatMoney(draft.tax, draft.currency), false],
    ["GRAND TOTAL", formatMoney(grand, draft.currency), true],
  ];
  let rowY = y;
  rows.forEach(([label, value, strong]) => {
    doc.setFillColor(strong ? theme.primary : theme.light);
    doc.rect(118, rowY, 42, 8, "F");
    doc.setFillColor(strong ? theme.dark : "#ffffff");
    doc.setDrawColor("#d8d8d8");
    doc.rect(160, rowY, 36, 8, "FD");
    text(doc, label, 157, rowY + 5.25, { align: "right", fontSize: 7, bold: true, color: strong ? theme.primaryText : BLACK });
    text(doc, value, 193, rowY + 5.25, { align: "right", fontSize: 7, bold: strong, color: strong ? "#ffffff" : BLACK });
    rowY += 8;
  });
  return rowY;
}

function footer(doc: jsPDF, category: Category, theme: PdfTheme, digitalEmpire: boolean) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerText1 = digitalEmpire ? "The Digital Empire — branding, content creation, and performance-driven marketing." : category.footerText1 || "Thank you for your partnership.";
  const footerText2 = digitalEmpire ? "A creative digital agency powered by FMG Agency." : category.footerText2 || "FMG Agency • Superheroes who create";
  text(doc, footerText1, 14, pageHeight - 20, { fontSize: 6.5, color: theme.mid, maxWidth: 182 });
  text(doc, footerText2, 14, pageHeight - 15.5, { fontSize: 6.5, color: theme.mid, maxWidth: 182 });
  doc.setFillColor(theme.dark);
  doc.rect(0, pageHeight - 10, 210, 10, "F");
  doc.setFillColor(theme.primary);
  doc.rect(0, pageHeight - 10, 34, 10, "F");
  text(doc, theme.footerLine, 196, pageHeight - 4.1, { align: "right", fontSize: 6.4, bold: true, color: "#ffffff" });
}

function invoiceSignatureBlock(doc: jsPDF, y: number, theme: PdfTheme, digitalEmpire: boolean) {
  text(doc, digitalEmpire ? "AUTHORIZED BY" : "Executive Director", 31, y + 5, { fontSize: 7, bold: true, color: theme.dark });
  text(doc, digitalEmpire ? "The Digital Empire" : "Name: Fady Maged", 31, y + 10, { fontSize: 7, color: theme.dark });
  text(doc, digitalEmpire ? "CLIENT ACKNOWLEDGEMENT" : "Finance Director", 130, y + 5, { fontSize: 7, bold: true, color: theme.dark });
  text(doc, digitalEmpire ? "Name: __________________" : "Name: Rafik Ezzat", 130, y + 10, { fontSize: 7, color: theme.dark });
}

export async function generateDocumentPdf(draft: DocumentDraft, client: Client, category: Category, generatedCode: string, assets?: { logo: string; regularFont: string; boldFont: string }) {
  const digitalEmpire = draft.companyKey === "digital_empire";
  const theme = digitalEmpire ? DIGITAL_EMPIRE_THEME : FMG_THEME;
  const [logo, regularFont, boldFont] = assets ? [assets.logo, assets.regularFont, assets.boldFont] : await Promise.all([
    toDataUrl(digitalEmpire ? "/digital-empire-logo-pdf.png" : "/fmg-logo-pdf.png"),
    fontBase64("/arial.ttf"),
    fontBase64("/arial-bold.ttf"),
  ]);
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.addFileToVFS("Arial.ttf", regularFont);
  doc.addFont("Arial.ttf", "FMGArial", "normal");
  doc.addFileToVFS("Arial-Bold.ttf", boldFont);
  doc.addFont("Arial-Bold.ttf", "FMGArial", "bold");
  doc.setFont("FMGArial", "normal");

  const drawWatermark = () => {
    if (draft.type !== "quotation") return;
    doc.setGState(doc.GState({ opacity: 0.025 }));
    if (digitalEmpire) {
      doc.addImage(logo, "PNG", 22, 138, 166, 14.2, undefined, "FAST");
    } else {
      doc.addImage(logo, "PNG", 34, 121, 142, 56.9, undefined, "FAST");
    }
    doc.setGState(doc.GState({ opacity: 1 }));
  };

  const drawHeader = (continuation = false) => {
    drawWatermark();
    if (digitalEmpire) {
      doc.setFillColor(theme.primary);
      doc.rect(0, 0, 210, 4, "F");
      doc.setFillColor(theme.light);
      doc.rect(14, 9, 105, 19, "F");
      doc.addImage(logo, "PNG", 20, 14.5, 92, 7.9, undefined, "FAST");
      doc.setFillColor(theme.dark);
      doc.rect(142, 9, 54, 19, "F");
      text(doc, draft.type === "invoice" ? "INVOICE" : "QUOTATION", 192, 17, { align: "right", fontSize: 16, bold: true, color: "#ffffff" });
      text(doc, continuation ? "CONTINUATION" : theme.strapline, 192, 23, { align: "right", fontSize: 5.5, bold: true, color: theme.accent });
    } else {
      doc.addImage(logo, "PNG", 14, 9.5, 52, 20.8, undefined, "FAST");
      doc.setFillColor(theme.primary);
      doc.rect(187, 0, 23, 9, "F");
      text(doc, draft.type === "invoice" ? "INVOICE" : "QUOTATION", 196, 17, { align: "right", fontSize: 20, bold: true });
      text(doc, continuation ? "CONTINUATION" : theme.strapline, 196, 23, { align: "right", fontSize: 6.5, bold: true, color: theme.mid });
    }
  };

  drawHeader();
  band(doc, `${draft.type === "invoice" ? "INVOICE" : "QUOTATION"} INFORMATION  /`, 39, theme);
  const infoRows: Array<[string, string, string, string]> = [
    [draft.type === "invoice" ? "INVOICE NO." : "QUOTATION NO.", generatedCode, "DATE", formatDocumentDate(draft.date)],
    ["VALID UNTIL", formatDocumentDate(draft.validUntil || draft.date), "PREPARED BY", draft.preparedBy],
  ];
  if (draft.type === "quotation") infoRows.push(["CURRENCY", draft.currency, "PROJECT", draft.project || category.name]);
  let y = infoGrid(doc, infoRows, 49, theme) + 5;
  band(doc, "CLIENT INFORMATION  /", y, theme);
  y = infoGrid(doc, [
    ["CLIENT / COMPANY", client.companyName || client.name, "CONTACT PERSON", client.ownerName],
    ["EMAIL", client.email || "—", "PHONE", client.phone],
  ], y + 10, theme) + 5;
  const mediaGuideDocument = category.name.trim().toLowerCase() === "media guide";
  const hasCatalogItems = mediaGuideDocument && draft.items.some((item) => item.kind === "package" || item.kind === "addon");
  const packageItems = mediaGuideDocument ? draft.items.filter((item) => item.kind !== "addon") : draft.items;
  const addonItems = mediaGuideDocument ? draft.items.filter((item) => item.kind === "addon") : [];
  const itemGroups = mediaGuideDocument
    ? [{ label: hasCatalogItems ? "JEWELRY PHOTOGRAPHY PACKAGES · 2026  /" : "SCOPE & PRICING  /", addon: false, items: packageItems }, ...(addonItems.length ? [{ label: "ADD-ONS  /", addon: true, items: addonItems }] : [])]
    : [{ label: "SCOPE & PRICING  /", addon: false, items: packageItems }];

  for (const group of itemGroups) {
    if (group.addon) y += 5;
    if (y > 214) {
      footer(doc, category, theme, digitalEmpire);
      doc.addPage();
      drawHeader(true);
      y = 39;
    }
    if (group.addon) addonBand(doc, y, theme); else band(doc, group.label, y, theme);
    y += group.addon ? 13 : 10;
    if (hasCatalogItems && !group.addon) {
      text(doc, "Curated production packages for jewelry brands • All prices are in Egyptian pounds.", 14, y, { fontSize: 7, color: theme.mid, maxWidth: 182 });
      y += 6;
    }
    let widths = itemHeader(doc, draft, y, mediaGuideDocument, theme, group.addon);
    y += widths.headerHeight;
    for (let index = 0; index < group.items.length; index += 1) {
      const item = group.items[index];
      const layout = itemLayout(doc,draft,item,index,widths,mediaGuideDocument);
      let offset=0;
      while(offset<layout.lineCount) {
        const remainingHeight=5+(layout.lineCount-offset)*layout.lineHeight;
        if(y+10>225 || (offset===0 && remainingHeight<=160 && y+remainingHeight>225)) {
          footer(doc,category,theme,digitalEmpire);doc.addPage();drawHeader(true);
          if(group.addon) addonBand(doc,39,theme); else band(doc,group.label,39,theme);
          y=group.addon ? 52 : 49;
          widths=itemHeader(doc,draft,y,mediaGuideDocument,theme,group.addon);y+=widths.headerHeight;
        }
        const capacity=Math.floor((225-y-5)/layout.lineHeight);
        if(capacity<1){y=225;continue;}
        const count=Math.min(capacity,layout.lineCount-offset);
        y+=drawItemSegment(doc,layout,widths,index,y,offset,count);offset+=count;
      }
    }
  }

  y = totals(doc, draft, y + 3, theme) + 6;
  const showPaymentNotes = draft.type !== "invoice" || Boolean(draft.paymentTerms.trim() || draft.notesExclusions.trim());
  const paymentTermsText = draft.paymentTerms.trim() || (draft.type === "invoice" ? "—" : "50% advance payment • 50% upon completion");
  const notesText = draft.notesExclusions.trim() || "—";
  doc.setFont("FMGArial", "normal");
  doc.setFontSize(7);
  const paymentTermsLines = doc.splitTextToSize(arabicText(doc, paymentTermsText), 134) as string[];
  const notesLines = doc.splitTextToSize(arabicText(doc, notesText), 134) as string[];
  const paymentTermsHeight = Math.max(10, 5 + paymentTermsLines.length * 3.6);
  const notesHeight = Math.max(10, 5 + notesLines.length * 3.6);
  const paymentNotesHeight = showPaymentNotes ? 10 + paymentTermsHeight + notesHeight + 4 : 0;
  const closingHeight = paymentNotesHeight + (draft.type === "quotation" ? 22 : 8);
  const closingBottom = doc.internal.pageSize.getHeight() - 22;
  if (y + closingHeight > closingBottom) {
    footer(doc, category, theme, digitalEmpire);
    doc.addPage();
    drawHeader(true);
    y = 42;
  }
  if (showPaymentNotes) {
    band(doc, "PAYMENT & NOTES  /", y, theme);
    y += 10;
    doc.setFillColor(theme.light);
    doc.rect(14, y, 42, paymentTermsHeight, "F");
    text(doc, "PAYMENT TERMS", 17, y + 6.2, { fontSize: 7, bold: true });
    doc.setDrawColor("#d8d8d8");
    doc.rect(56, y, 140, paymentTermsHeight);
    text(doc, paymentTermsText, 59, y + 6.2, { fontSize: 7, maxWidth: 134 });
    y += paymentTermsHeight;
    doc.setFillColor(theme.light);
    doc.rect(14, y, 42, notesHeight, "F");
    text(doc, "NOTES / EXCLUSIONS", 17, y + 6.2, { fontSize: 7, bold: true });
    doc.rect(56, y, 140, notesHeight);
    text(doc, notesText, 59, y + 6.2, { fontSize: 7, maxWidth: 134 });
    y += notesHeight + 4;
  }
  if (draft.type === "quotation") {
    band(doc, "TERMS & ACCEPTANCE  /", y, theme);
    y += 11;
    text(doc, "• This quotation is valid until the date shown above.   • Work begins after written approval and receipt of the advance payment.   • Any work outside the approved scope will be quoted separately.", 14, y, { fontSize: 6.5, color: theme.mid, maxWidth: 182 });
    y += 11;
  } else {
    text(doc, "• Thank you for your partnership. We truly value the opportunity to support your brand.", 14, y, { fontSize: 6.5, color: theme.mid, maxWidth: 182 });
    y += 8;
  }

  if (draft.type === "invoice") {
    if (y > 245) {
      footer(doc, category, theme, digitalEmpire);
      doc.addPage();
      drawHeader(true);
      y = 55;
    }
    invoiceSignatureBlock(doc, y, theme, digitalEmpire);
  }
  for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
    doc.setPage(page);
    footer(doc, category, theme, digitalEmpire);
  }
  return doc;
}

export function pdfDataUri(doc: jsPDF) {
  return doc.output("datauristring");
}

export function savePdf(doc: jsPDF, filename: string) {
  doc.save(`${filename}.pdf`);
}
