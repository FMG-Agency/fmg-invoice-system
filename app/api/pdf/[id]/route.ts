import { renderSavedDocumentPdf } from "../../../lib/server-document-pdf";
import { get } from "@vercel/blob";
import { database } from "../../../lib/database";
import { getSession, requireAnyPermission } from "../../../lib/auth-server";
import { canAccess } from "../../../lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const authError = await requireAnyPermission(request, ["invoices", "quotations", "all_data", "client_portal"]);
    if (authError) return authError;
    const session = await getSession(request);
    if (!session) return new Response("Authentication required", { status: 401 });
    const { id } = await context.params;
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) return new Response("Invalid document", { status: 400 });
    const row = await database.prepare("SELECT type, client_id AS clientId, generated_code AS generatedCode, pdf_key AS pdfKey FROM documents WHERE id = ?")
      .bind(numericId).first<{ type: "invoice" | "quotation"; clientId: number; generatedCode: string; pdfKey: string }>();
    if (!row) return new Response("Document not found", { status: 404 });
    const documentPermission = row.type === "invoice" ? "invoices" : "quotations";
    if (session.clientId !== null && (row.type !== "invoice" || Number(row.clientId) !== session.clientId)) {
      return new Response("Access denied", { status: 403 });
    }
    if (session.clientId === null && !canAccess(session.permissions, "client_portal", session.isAdmin)
      && !canAccess(session.permissions, "all_data", session.isAdmin)
      && !canAccess(session.permissions, documentPermission, session.isAdmin)) {
      return new Response("Access denied", { status: 403 });
    }
    let body: BodyInit;
    // Work-order drafts and renumbered files are rendered from their saved data.
    const currentFile = row.pdfKey && row.pdfKey.endsWith(`/${row.generatedCode}.pdf`);
    let object = null;
    if (currentFile) {
      try { object = await get(row.pdfKey, { access: "private" }); } catch { /* Recover from saved document data. */ }
    }
    if (object && object.statusCode === 200) body = object.stream;
    else body = await renderSavedDocumentPdf(numericId);
    const download = new URL(request.url).searchParams.get("download") === "1";
    const headers = new Headers();
    headers.set("content-type", "application/pdf");
    headers.set("content-disposition", `${download ? "attachment" : "inline"}; filename="document-${numericId}.pdf"; filename*=UTF-8''${encodeURIComponent(row.generatedCode)}.pdf`);
    headers.set("cache-control", "private, no-store");
    headers.set("x-content-type-options", "nosniff");
    return new Response(body, { headers });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Unexpected error", { status: 500 });
  }
}
