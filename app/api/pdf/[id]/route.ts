import { get } from "@vercel/blob";
import { database } from "../../../lib/database";
import { requireAuth } from "../../../lib/auth-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const authError = await requireAuth(request);
    if (authError) return authError;
    const { id } = await context.params;
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) return new Response("Invalid document", { status: 400 });
    const row = await database.prepare("SELECT generated_code AS generatedCode, pdf_key AS pdfKey FROM documents WHERE id = ?")
      .bind(numericId).first<{ generatedCode: string; pdfKey: string }>();
    if (!row) return new Response("Document not found", { status: 404 });
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
