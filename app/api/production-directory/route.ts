import { z } from "zod";
import { get, put, del } from "@vercel/blob";
import { database } from "../../lib/database";
import { getSession, requirePermission } from "../../lib/auth-server";
import { ensureProductionDatabase } from "../../lib/production-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const link = z.string().trim().max(2000).url().refine(value => /^https?:\/\//i.test(value));
const payload = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveLocation"), id: z.number().int().positive().nullable(), data: z.object({ name: z.string().trim().min(1).max(200), mapUrl: link, notes: z.string().trim().max(2000), active: z.boolean() }) }),
  z.object({ action: z.literal("saveReview"), data: z.object({ crewId: z.number().int().positive(), workOrderId: z.number().int().positive().nullable(), shootName: z.string().trim().min(1).max(300), shootDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), rating: z.number().int().min(1).max(5).nullable(), comment: z.string().trim().max(5000) }).refine(data => data.rating !== null || !!data.comment, "Add a rating or comment.") }),
]);
let ready: Promise<void> | undefined;
async function ensureDirectory() {
  await ensureProductionDatabase();
  ready ??= database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS production_locations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, map_url TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', photo_key TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    database.prepare(`CREATE TABLE IF NOT EXISTS production_crew_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, crew_id INTEGER NOT NULL REFERENCES production_crew_members(id), work_order_id INTEGER, shoot_name TEXT NOT NULL, shoot_date TEXT NOT NULL, rating INTEGER CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL DEFAULT '', author_id INTEGER NOT NULL, author_name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  ]).then(() => undefined).catch(error => { ready = undefined; throw error; });
  await ready;
}
async function state() {
  const [locations, reviews] = await Promise.all([
    database.prepare("SELECT id, name, map_url AS mapUrl, notes, active, CASE WHEN photo_key <> '' THEN 1 ELSE 0 END AS hasPhoto, updated_at AS updatedAt FROM production_locations ORDER BY active DESC, name COLLATE NOCASE").all(),
    database.prepare("SELECT id, crew_id AS crewId, work_order_id AS workOrderId, shoot_name AS shootName, shoot_date AS shootDate, rating, comment, author_name AS authorName, created_at AS createdAt FROM production_crew_reviews ORDER BY shoot_date DESC, id DESC").all(),
  ]);
  return { locations: locations.results.map(row => ({ ...row, active: Boolean(row.active), photoUrl: row.hasPhoto ? `/api/production-directory?photo=location&id=${row.id}&v=${encodeURIComponent(String(row.updatedAt))}` : "" })), reviews: reviews.results };
}
function failure(error: unknown) {
  if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message || "Invalid details." }, { status: 400 });
  console.error("Production directory operation failed");
  return Response.json({ error: "Could not save or load the directory. Please try again." }, { status: 500 });
}
export async function GET(request: Request) {
  try {
    const denied = await requirePermission(request, "production"); if (denied) return denied;
    const session = await getSession(request);
    if (!session || session.clientId) return new Response("Access denied", { status: 403 });
    await ensureDirectory();
    const query = new URL(request.url).searchParams;
    if (query.has("photo")) {
      const kind = z.enum(["crew", "location"]).parse(query.get("photo"));
      const id = z.coerce.number().int().positive().parse(query.get("id"));
      const table = kind === "crew" ? "production_crew_members" : "production_locations";
      const row = await database.prepare(`SELECT photo_key AS photoKey FROM ${table} WHERE id = ?`).bind(id).first<{ photoKey: string }>();
      if (!row?.photoKey) return new Response("Photo not found", { status: 404 });
      const object = await get(row.photoKey, { access: "private" });
      if (!object || object.statusCode !== 200) return new Response("Photo not found", { status: 404 });
      return new Response(object.stream, { headers: { "content-type": object.blob.contentType, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
    }
    return Response.json(await state());
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const denied = await requirePermission(request, "production"); if (denied) return denied;
    const session = await getSession(request);
    if (!session || session.clientId) return new Response("Access denied", { status: 403 });
    const role = session.roleLabel.toLowerCase().replace(/[^a-z]+/g, " ").trim();
    if (!session.isAdmin && !["production manager", "operation manager", "operations manager"].includes(role)) return Response.json({ error: "Only Production, Operations, or Admin can manage this directory." }, { status: 403 });
    await ensureDirectory();
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      const kind = z.enum(["crew", "location"]).parse(form.get("kind"));
      const id = z.coerce.number().int().positive().parse(form.get("id"));
      const file = form.get("photo");
      if (!(file instanceof File) || file.size === 0 || file.size > 3 * 1024 * 1024) return Response.json({ error: "Choose a JPG, PNG or WebP image under 3 MB." }, { status: 400 });
      const bytes = Buffer.from(await file.arrayBuffer());
      const mime = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg" : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : "";
      if (!mime) return Response.json({ error: "Only JPG, PNG and WebP images are accepted." }, { status: 400 });
      const table = kind === "crew" ? "production_crew_members" : "production_locations";
      const existing = await database.prepare(`SELECT photo_key AS photoKey FROM ${table} WHERE id = ?`).bind(id).first<{ photoKey: string }>();
      if (!existing) return Response.json({ error: "Directory entry not found." }, { status: 404 });
      const key = `production-directory/${kind}/${id}/${crypto.randomUUID()}`;
      await put(key, bytes, { access: "private", contentType: mime, addRandomSuffix: false });
      try { await database.prepare(`UPDATE ${table} SET photo_key = ?, updated_at = ? WHERE id = ?`).bind(key, new Date().toISOString(), id).run(); }
      catch (error) { await del(key).catch(() => undefined); throw error; }
      if (existing.photoKey) await del(existing.photoKey).catch(() => undefined);
      return Response.json({ ok: true });
    }
    const body = payload.parse(await request.json());
    if (body.action === "saveLocation") {
      const { name, mapUrl, notes, active } = body.data;
      if (body.id) {
        const result = await database.prepare("UPDATE production_locations SET name=?, map_url=?, notes=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(name, mapUrl, notes, active ? 1 : 0, body.id).run();
        if (Number(result.meta.changes) !== 1) return Response.json({ error: "Location not found." }, { status: 404 });
      } else await database.prepare("INSERT INTO production_locations (name,map_url,notes,active) VALUES (?,?,?,?)").bind(name,mapUrl,notes,active ? 1 : 0).run();
    } else {
      const data = body.data;
      if (!await database.prepare("SELECT id FROM production_crew_members WHERE id=?").bind(data.crewId).first()) return Response.json({ error: "Crew member not found." }, { status: 404 });
      if (data.workOrderId && !await database.prepare("SELECT id FROM production_work_orders WHERE id=?").bind(data.workOrderId).first()) return Response.json({ error: "Work order not found." }, { status: 404 });
      await database.prepare("INSERT INTO production_crew_reviews (crew_id,work_order_id,shoot_name,shoot_date,rating,comment,author_id,author_name) VALUES (?,?,?,?,?,?,?,?)").bind(data.crewId,data.workOrderId,data.shootName,data.shootDate,data.rating,data.comment,session.userId,session.displayName || session.username).run();
    }
    return Response.json(await state());
  } catch (error) { return failure(error); }
}
