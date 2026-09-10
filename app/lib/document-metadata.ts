import { database } from "./database";

export async function ensureDocumentMetadata() {
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
  const category = await database.prepare(`UPDATE categories
    SET counter = MAX(counter,
      COALESCE((SELECT MAX(id) FROM production_work_orders), 0),
      COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'production_work_orders'), 0)) + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE LOWER(TRIM(name)) = 'media guide' RETURNING counter`).first<{ counter: number }>();
  if (!category) throw new Error("The Media Guide category is required before creating a work order.");
  return category.counter;
}
