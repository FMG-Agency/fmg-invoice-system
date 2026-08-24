import { get } from "@vercel/blob";
import { ensureAuthDatabase, getSession } from "../../../../lib/auth-server";
import { database } from "../../../../lib/database";
import { ensureHrDatabase } from "../../../../lib/hr";
import { canAccess } from "../../../../lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthDatabase();
    await ensureHrDatabase();
    const session = await getSession(request);
    if (!session) return new Response("Authentication required", { status: 401 });
    if (!canAccess(session.permissions, "requests", session.isAdmin)) return new Response("Access denied", { status: 403 });

    const { id } = await context.params;
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) return new Response("Invalid request", { status: 400 });
    const row = await database.prepare(`SELECT employee_id AS employeeId, assigned_reviewer_id AS assignedReviewerId,
        attachment_key AS attachmentKey, attachment_name AS attachmentName, attachment_type AS attachmentType
      FROM employee_requests WHERE id = ?`).bind(numericId).first<{
        employeeId: number;
        assignedReviewerId: number | null;
        attachmentKey: string;
        attachmentName: string;
        attachmentType: string;
      }>();
    if (!row) return new Response("Request not found", { status: 404 });
    if (!session.isAdmin && row.employeeId !== session.employeeId && row.assignedReviewerId !== session.userId) {
      return new Response("Access denied", { status: 403 });
    }
    if (!row.attachmentKey) return new Response("Attachment not found", { status: 404 });

    const object = await get(row.attachmentKey, { access: "private" });
    if (!object || object.statusCode !== 200) return new Response("Attachment not found", { status: 404 });
    const filename = (row.attachmentName || `request-${numericId}-attachment`).replace(/[\r\n"]/g, "");
    const headers = new Headers();
    headers.set("content-type", row.attachmentType || object.blob.contentType || "application/octet-stream");
    headers.set("content-disposition", `inline; filename="${filename}"`);
    headers.set("cache-control", "private, max-age=60");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.stream, { headers });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Unexpected error", { status: 500 });
  }
}
