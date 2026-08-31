import { z } from "zod";
import { getSession, requirePermission } from "../../../../lib/auth-server";
import { ensureClientPortalDatabase, getClientPortalState } from "../../../../lib/client-portal";
import { database } from "../../../../lib/database";
import { deletePrivateFile, getPrivateFile, putPrivateFile } from "../../../../lib/file-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const uploadPayload = z.object({
  imageBase64: z.string().min(32).max(2_850_000),
  year: z.number().int().min(2020).max(2100).optional(),
});
const deletePayload = z.object({ year: z.number().int().min(2020).max(2100).optional() });

type LogoRow = { id: number; portalLogoKey: string; portalLogoType: string };

function detectLogoType(bytes: Uint8Array) {
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) {
    return { contentType: "image/png", extension: "png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  const signature = String.fromCharCode(...bytes.slice(0, 12));
  if (bytes.length >= 12 && signature.startsWith("RIFF") && signature.slice(8) === "WEBP") {
    return { contentType: "image/webp", extension: "webp" };
  }
  throw new Error("Use a PNG, JPG, or WebP logo.");
}

function decodeLogo(value: string) {
  const match = /^data:image\/(?:png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error("Use a PNG, JPG, or WebP logo.");
  const bytes = new Uint8Array(Buffer.from(match[1], "base64"));
  if (!bytes.length || bytes.length > MAX_LOGO_BYTES) throw new Error("Logo must be 2 MB or smaller.");
  return { bytes, ...detectLogoType(bytes) };
}

function errorResponse(error: unknown) {
  const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid logo data." : error instanceof Error ? error.message : "Unexpected logo error.";
  const isInputError = error instanceof z.ZodError || /PNG|JPG|WebP|2 MB/i.test(message);
  return Response.json({ error: message }, { status: isInputError ? 400 : 500 });
}

async function contextFor(request: Request, context: { params: Promise<{ clientId: string }> }) {
  const authError = await requirePermission(request, "client_portal");
  if (authError) return { response: authError } as const;
  const session = await getSession(request);
  if (!session) return { response: Response.json({ error: "Authentication required." }, { status: 401 }) } as const;
  const { clientId } = await context.params;
  const numericClientId = Number(clientId);
  if (!Number.isInteger(numericClientId) || numericClientId <= 0) return { response: Response.json({ error: "Invalid client." }, { status: 400 }) } as const;
  if (session.clientId !== null && session.clientId !== numericClientId) return { response: Response.json({ error: "Access denied." }, { status: 403 }) } as const;
  await ensureClientPortalDatabase();
  const client = await database.prepare(`SELECT id, portal_logo_key AS portalLogoKey, portal_logo_type AS portalLogoType
    FROM clients WHERE id = ?`).bind(numericClientId).first<LogoRow>();
  if (!client) return { response: Response.json({ error: "Client not found." }, { status: 404 }) } as const;
  return { session, clientId: numericClientId, client } as const;
}

export async function GET(request: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    const scoped = await contextFor(request, context);
    if ("response" in scoped) return scoped.response;
    if (!scoped.client.portalLogoKey) return new Response("Logo not found", { status: 404 });
    const file = await getPrivateFile(scoped.client.portalLogoKey);
    if (!file) return new Response("Logo not found", { status: 404 });
    return new Response(file.stream, { headers: {
      "content-type": scoped.client.portalLogoType || file.contentType,
      "content-disposition": "inline",
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    const scoped = await contextFor(request, context);
    if ("response" in scoped) return scoped.response;
    if (scoped.session.clientId !== null) return Response.json({ error: "Client accounts are read-only." }, { status: 403 });
    const payload = uploadPayload.parse(await request.json());
    const logo = decodeLogo(payload.imageBase64);
    const key = `client-portal/logos/client-${scoped.clientId}/${crypto.randomUUID()}.${logo.extension}`;
    await putPrivateFile(key, logo.bytes, logo.contentType);
    const updatedAt = new Date().toISOString();
    try {
      await database.prepare(`UPDATE clients SET portal_logo_key = ?, portal_logo_type = ?, portal_logo_updated_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(key, logo.contentType, updatedAt, scoped.clientId).run();
    } catch (error) {
      await deletePrivateFile(key).catch(() => undefined);
      throw error;
    }
    if (scoped.client.portalLogoKey) await deletePrivateFile(scoped.client.portalLogoKey).catch(() => undefined);
    return Response.json(await getClientPortalState(scoped.session, scoped.clientId, payload.year ?? new Date().getFullYear()));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    const scoped = await contextFor(request, context);
    if ("response" in scoped) return scoped.response;
    if (scoped.session.clientId !== null) return Response.json({ error: "Client accounts are read-only." }, { status: 403 });
    const payload = deletePayload.parse(await request.json().catch(() => ({})));
    await database.prepare(`UPDATE clients SET portal_logo_key = '', portal_logo_type = '', portal_logo_updated_at = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(scoped.clientId).run();
    if (scoped.client.portalLogoKey) await deletePrivateFile(scoped.client.portalLogoKey).catch(() => undefined);
    return Response.json(await getClientPortalState(scoped.session, scoped.clientId, payload.year ?? new Date().getFullYear()));
  } catch (error) {
    return errorResponse(error);
  }
}
