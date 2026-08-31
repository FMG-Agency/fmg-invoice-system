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
    if (!row.pdfKey) return new Response("This is a Draft invoice. Open it in the editor and save it to generate the PDF.", { status: 409 });
    const object = await get(row.pdfKey, { access: "private" });
    if (!object || object.statusCode !== 200) return new Response("PDF not found", { status: 404 });
    const download = new URL(request.url).searchParams.get("download") === "1";
    const headers = new Headers();
    headers.set("content-type", "application/pdf");
    headers.set("content-disposition", `${download ? "attachment" : "inline"}; filename=\"${row.generatedCode}.pdf\"`);
    headers.set("cache-control", "private, max-age=60");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.stream, { headers });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Unexpected error", { status: 500 });
  }
}
