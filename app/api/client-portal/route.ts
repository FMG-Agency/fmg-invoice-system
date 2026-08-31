import { z } from "zod";
import { getSession, requirePermission } from "../../lib/auth-server";
import { ensureClientPortalDatabase, getClientPortalState } from "../../lib/client-portal";
import { database } from "../../lib/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const httpUrl = z.string().trim().url().max(2000).refine((value) => /^https?:\/\//i.test(value), "Use a valid https:// or http:// link.");
const planData = z.object({
  clientId: z.number().int().positive(),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  part: z.union([z.literal(1), z.literal(2)]),
  title: z.string().trim().min(1).max(160),
  url: httpUrl,
  notes: z.string().trim().max(5000).default(""),
  published: z.boolean().default(true),
});
const actionPayload = z.discriminatedUnion("action", [
  z.object({ action: z.literal("savePlan"), data: planData }),
  z.object({ action: z.literal("deletePlan"), id: z.number().int().positive(), clientId: z.number().int().positive(), year: z.number().int().min(2020).max(2100) }),
]);

function errorResponse(error: unknown) {
  const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid client portal data." : error instanceof Error ? error.message : "Unexpected client portal error.";
  return Response.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
}

export async function GET(request: Request) {
  try {
    const authError = await requirePermission(request, "client_portal");
    if (authError) return authError;
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    const url = new URL(request.url);
    const requestedClientId = Number(url.searchParams.get("clientId")) || null;
    const requestedYear = Number(url.searchParams.get("year")) || new Date().getFullYear();
    return Response.json(await getClientPortalState(session, requestedClientId, requestedYear));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const authError = await requirePermission(request, "client_portal");
    if (authError) return authError;
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    if (session.clientId !== null) return Response.json({ error: "Client accounts are read-only." }, { status: 403 });
    await ensureClientPortalDatabase();
    const payload = actionPayload.parse(await request.json());
    if (payload.action === "savePlan") {
      const value = payload.data;
      const client = await database.prepare("SELECT id FROM clients WHERE id = ?").bind(value.clientId).first<{ id: number }>();
      if (!client) return Response.json({ error: "Client not found." }, { status: 404 });
      await database.prepare(`INSERT INTO client_portal_plans
          (client_id, year, month, part, title, url, notes, published, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(client_id, year, month, part) DO UPDATE SET
          title = excluded.title, url = excluded.url, notes = excluded.notes,
          published = excluded.published, created_by = excluded.created_by, updated_at = CURRENT_TIMESTAMP`)
        .bind(value.clientId, value.year, value.month, value.part, value.title, value.url, value.notes, value.published ? 1 : 0, session.userId).run();
      return Response.json(await getClientPortalState(session, value.clientId, value.year));
    }
    const existing = await database.prepare("SELECT id FROM client_portal_plans WHERE id = ? AND client_id = ?").bind(payload.id, payload.clientId).first<{ id: number }>();
    if (!existing) return Response.json({ error: "Plan part not found." }, { status: 404 });
    await database.prepare("DELETE FROM client_portal_plans WHERE id = ? AND client_id = ?").bind(payload.id, payload.clientId).run();
    return Response.json(await getClientPortalState(session, payload.clientId, payload.year));
  } catch (error) {
    return errorResponse(error);
  }
}
