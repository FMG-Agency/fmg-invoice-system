import { database } from "./database";

export async function ensureDocumentMetadata() {
  await database.prepare("CREATE TABLE IF NOT EXISTS reusable_document_serials (category_id INTEGER NOT NULL, serial INTEGER NOT NULL, PRIMARY KEY(category_id, serial))").run();
  await database.prepare("CREATE TABLE IF NOT EXISTS deleted_document_history (id INTEGER PRIMARY KEY, generated_code TEXT NOT NULL UNIQUE, snapshot_json TEXT NOT NULL, deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  const columns = await database.prepare("PRAGMA table_info(documents)").all<{ name: string }>();
  for (const [name, definition] of [["created_by_user_id", "INTEGER"], ["created_by_name", "TEXT NOT NULL DEFAULT ''"]]) {
    if (columns.results.some((column) => column.name === name)) continue;
    try {
      await database.prepare(`ALTER TABLE documents ADD COLUMN ${name} ${definition}`).run();
    } catch (error) {
      if (!/duplicate column name/i.test(error instanceof Error ? error.message : String(error))) throw error;
    }
  }
}

// Reserve from the Media Guide counter before inserting a work order. Manual
// documents use the same atomic counter, so they cannot consume a reserved number.
export async function reserveWorkOrderNumber() {
  const media = await database.prepare("SELECT id FROM categories WHERE LOWER(TRIM(name)) = 'media guide'").first<{id:number}>();
  if (!media) throw new Error("Media Guide category is required.");
  const reused = await takeReusableSerial(media.id);
  if (reused !== null) return reused;
  const category = await database.prepare(`UPDATE categories
    SET counter = MAX(counter,
      COALESCE((SELECT MAX(id) FROM production_work_orders), 0),
      COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'production_work_orders'), 0)) + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE LOWER(TRIM(name)) = 'media guide' RETURNING counter`).first<{ counter: number }>();
  if (!category) throw new Error("The Media Guide category is required before creating a work order.");
  return category.counter;
}

async function takeReusableSerial(categoryId: number) {
  const row = await database.prepare("DELETE FROM reusable_document_serials WHERE category_id = ? AND serial = (SELECT MIN(serial) FROM reusable_document_serials WHERE category_id = ?) RETURNING serial").bind(categoryId, categoryId).first<{serial:number}>();
  return row?.serial ?? null;
}
export async function reserveDocumentNumber(categoryId: number) {
  const reused = await takeReusableSerial(categoryId);
  if (reused !== null) {
    const category = await database.prepare("SELECT prefix FROM categories WHERE id = ?").bind(categoryId).first<{prefix:string}>();
    return category ? {...category, counter: reused} : null;
  }
  return database.prepare("UPDATE categories SET counter = counter + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING prefix, counter").bind(categoryId).first<{prefix:string;counter:number}>();
}
// Run in the same write batch as deletion: a live document or work order keeps its number.
export function releaseDocumentSerial(categoryId: number, serial: number) {
  return database.prepare(`INSERT OR IGNORE INTO reusable_document_serials (category_id, serial)
    SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM documents d JOIN categories c ON c.id=d.category_id
      WHERE d.category_id=? AND CAST(SUBSTR(d.generated_code, LENGTH(RTRIM(d.generated_code, '0123456789')) + 1) AS INTEGER)=?)
    AND NOT EXISTS (SELECT 1 FROM production_work_orders p JOIN categories c ON LOWER(TRIM(c.name))='media guide' WHERE c.id=? AND p.id=?)`).bind(categoryId,serial,categoryId,serial,categoryId,serial);
}
