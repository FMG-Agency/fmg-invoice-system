import { z } from "zod";
import { requirePermission } from "../../lib/auth-server";
import { deleteRetainer, getClientFinanceState, saveRetainer, saveRetainerRange } from "../../lib/client-finance";
import { database } from "../../lib/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const yearValue = z.coerce.number().int().min(2020).max(2100);
const retainerData = z.object({
  clientId: z.number().int().positive(),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  amount: z.number().finite().min(0),
  status: z.enum(["planned", "confirmed", "paused"]),
  notes: z.string().trim().max(1000).default(""),
});
const actionPayload = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveRetainer"), data: retainerData }),
  z.object({ action: z.literal("saveRetainerRange"), data: retainerData.omit({ month: true }).extend({
    startMonth: z.number().int().min(1).max(12),
    endMonth: z.number().int().min(1).max(12),
  }) }),
  z.object({ action: z.literal("deleteRetainer"), clientId: z.number().int().positive(), year: z.number().int().min(2020).max(2100), month: z.number().int().min(1).max(12) }),
]);

function errorResponse(error: unknown) {
  const message = error instanceof z.ZodError
    ? error.issues[0]?.message ?? "Invalid client finance data."
    : error instanceof Error ? error.message : "Unexpected client finance error.";
  return Response.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
}

async function requireClient(clientId: number) {
  return database.prepare("SELECT id FROM clients WHERE id = ?").bind(clientId).first<{ id: number }>();
}

export async function GET(request: Request) {
  try {
    const authError = await requirePermission(request, "clients");
    if (authError) return authError;
    const parsedYear = yearValue.safeParse(new URL(request.url).searchParams.get("year") || new Date().getFullYear());
    if (!parsedYear.success) return Response.json({ error: "Choose a valid year." }, { status: 400 });
    return Response.json(await getClientFinanceState(parsedYear.data));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const authError = await requirePermission(request, "clients");
    if (authError) return authError;
    const payload = actionPayload.parse(await request.json());
    const clientId = payload.action === "deleteRetainer" ? payload.clientId : payload.data.clientId;
    if (!await requireClient(clientId)) return Response.json({ error: "Client not found." }, { status: 404 });

    if (payload.action === "saveRetainer") await saveRetainer(payload.data);
    if (payload.action === "saveRetainerRange") {
      if (payload.data.startMonth > payload.data.endMonth) return Response.json({ error: "The start month must be before the end month." }, { status: 400 });
      await saveRetainerRange(payload.data);
    }
    if (payload.action === "deleteRetainer") await deleteRetainer(payload.clientId, payload.year, payload.month);
    const year = payload.action === "deleteRetainer" ? payload.year : payload.data.year;
    return Response.json(await getClientFinanceState(year));
  } catch (error) {
    return errorResponse(error);
  }
}
