import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

type AppEnv = { DB: D1Database; FILES: R2Bucket };
const runtime = env as unknown as AppEnv;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) return new Response("Invalid document", { status: 400 });
    const row = await runtime.DB.prepare("SELECT generated_code AS generatedCode, pdf_key AS pdfKey FROM documents WHERE id = ?")
      .bind(numericId).first<{ generatedCode: string; pdfKey: string }>();
    if (!row) return new Response("Document not found", { status: 404 });
    const object = await runtime.FILES.get(row.pdfKey);
    if (!object) return new Response("PDF not found", { status: 404 });
    const download = new URL(request.url).searchParams.get("download") === "1";
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type", "application/pdf");
    headers.set("content-disposition", `${download ? "attachment" : "inline"}; filename=\"${row.generatedCode}.pdf\"`);
    headers.set("cache-control", "private, max-age=60");
    return new Response(object.body, { headers });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Unexpected error", { status: 500 });
  }
}
