import { z } from "zod";
import { getSession, requirePermission } from "../../lib/auth-server";
import { ensureClientAccountsDatabase, getClientAccount } from "../../lib/client-accounts";
import { database } from "../../lib/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const clientIdValue = z.coerce.number().int().positive();
const transactionData = z.object({
  clientId: z.number().int().positive(),
  documentId: z.number().int().positive().nullable().default(null),
  type: z.enum(["charge", "payment", "credit", "refund"]),
  amount: z.number().finite().positive(),
  currency: z.string().trim().min(3).max(12).transform((value) => value.toUpperCase()),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentMethod: z.string().trim().min(1).max(80),
  reference: z.string().trim().max(160).default(""),
  notes: z.string().trim().max(5000).default(""),
});
const actionPayload = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createTransaction"), data: transactionData }),
  z.object({ action: z.literal("deleteTransaction"), clientId: z.number().int().positive(), id: z.number().int().positive() }),
]);

function responseError(error: unknown) {
  const message = error instanceof z.ZodError
    ? error.issues[0]?.message ?? "Invalid client account data."
    : error instanceof Error ? error.message : "Unexpected client account error.";
  return Response.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
}

async function accountResponse(clientId: number) {
  const account = await getClientAccount(clientId);
  return account
    ? Response.json(account)
    : Response.json({ error: "Client not found." }, { status: 404 });
}

export async function GET(request: Request) {
  try {
    const authError = await requirePermission(request, "clients");
    if (authError) return authError;
    const url = new URL(request.url);
    const parsedClientId = clientIdValue.safeParse(url.searchParams.get("clientId"));
    if (!parsedClientId.success) return Response.json({ error: "Choose a valid client." }, { status: 400 });
    await ensureClientAccountsDatabase();
    return accountResponse(parsedClientId.data);
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request) {
  try {
    const authError = await requirePermission(request, "clients");
    if (authError) return authError;
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    await ensureClientAccountsDatabase();
    const payload = actionPayload.parse(await request.json());

    if (payload.action === "createTransaction") {
      const value = payload.data;
      const client = await database.prepare("SELECT id FROM clients WHERE id = ?").bind(value.clientId).first<{ id: number }>();
      if (!client) return Response.json({ error: "Client not found." }, { status: 404 });
      if (value.type === "charge" && value.documentId) {
        return Response.json({ error: "Manual charges are added to the general client balance, not to a saved invoice." }, { status: 400 });
      }
      if (value.documentId) {
        const document = await database.prepare("SELECT client_id AS clientId, type, currency FROM documents WHERE id = ?").bind(value.documentId).first<{ clientId: number; type: string; currency: string }>();
        if (!document || Number(document.clientId) !== value.clientId || document.type !== "invoice") {
          return Response.json({ error: "The selected invoice does not belong to this client." }, { status: 400 });
        }
        if (document.currency.toUpperCase() !== value.currency) {
          return Response.json({ error: "The transaction currency must match the selected invoice." }, { status: 400 });
        }
      }
      await database.prepare(`INSERT INTO client_financial_transactions
        (client_id, document_id, type, amount, currency, transaction_date, payment_method, reference, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
          value.clientId, value.documentId, value.type, value.amount, value.currency,
          value.transactionDate, value.paymentMethod, value.reference, value.notes, session.userId,
        ).run();
      return accountResponse(value.clientId);
    }

    const existing = await database.prepare("SELECT id FROM client_financial_transactions WHERE id = ? AND client_id = ?")
      .bind(payload.id, payload.clientId).first<{ id: number }>();
    if (!existing) return Response.json({ error: "Financial transaction not found." }, { status: 404 });
    await database.prepare("DELETE FROM client_financial_transactions WHERE id = ? AND client_id = ?").bind(payload.id, payload.clientId).run();
    return accountResponse(payload.clientId);
  } catch (error) {
    return responseError(error);
  }
}
