import { database } from "./database";
import { ensureDocumentMetadata } from "./document-metadata";

const productionSchema = [
  `CREATE TABLE IF NOT EXISTS production_work_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_type TEXT NOT NULL DEFAULT 'media_guide' CHECK(document_type = 'media_guide'),
    client_id INTEGER NOT NULL REFERENCES clients(id),
    client_name TEXT NOT NULL,
    bundle_catalog_id INTEGER NOT NULL REFERENCES quotation_catalog(id),
    bundle_name TEXT NOT NULL,
    bundle_price REAL NOT NULL DEFAULT 0,
    bundle_inputs_json TEXT NOT NULL DEFAULT '[]',
    bundle_outputs_json TEXT NOT NULL DEFAULT '[]',
    bundles_json TEXT NOT NULL DEFAULT '[]',
    addon_catalog_id INTEGER REFERENCES quotation_catalog(id),
    addon_name TEXT NOT NULL DEFAULT '',
    addon_price REAL NOT NULL DEFAULT 0,
    addon_inputs_json TEXT NOT NULL DEFAULT '[]',
    addon_outputs_json TEXT NOT NULL DEFAULT '[]',
    addons_json TEXT NOT NULL DEFAULT '[]',
    work_date TEXT NOT NULL,
    call_time TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    model_name TEXT NOT NULL DEFAULT '',
    photographer_name TEXT NOT NULL DEFAULT '',
    account_note TEXT NOT NULL DEFAULT '',
    production_note TEXT NOT NULL DEFAULT '',
    operation_note TEXT NOT NULL DEFAULT '',
    production_options_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending_production' CHECK(status IN ('pending_production','ready_for_operations')),
    created_by_user_id INTEGER NOT NULL REFERENCES auth_users(id),
    created_by_name TEXT NOT NULL,
    created_by_role TEXT NOT NULL,
    production_manager_user_id INTEGER REFERENCES auth_users(id),
    production_manager_name TEXT NOT NULL DEFAULT '',
    operation_manager_user_id INTEGER REFERENCES auth_users(id),
    operation_manager_name TEXT NOT NULL DEFAULT '',
    account_submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    production_submitted_at TEXT NOT NULL DEFAULT '',
    final_approved_at TEXT NOT NULL DEFAULT '',
    draft_invoice_id INTEGER REFERENCES documents(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS production_work_order_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_order_id INTEGER NOT NULL REFERENCES production_work_orders(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK(event_type IN ('account_submitted','production_submitted')),
    actor_user_id INTEGER NOT NULL REFERENCES auth_users(id),
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS production_crew_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL CHECK(category IN ('model','photographer','videographer')),
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    profile_url TEXT NOT NULL DEFAULT '',
    model_nationality TEXT CHECK(model_nationality IN ('egyptian','foreign')),
    hourly_rate REAL,
    daily_rate REAL,
    notes TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS production_settings (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    model_catalog_url TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS idx_production_work_orders_status_date ON production_work_orders(status, work_date)",
  "CREATE INDEX IF NOT EXISTS idx_production_work_orders_creator ON production_work_orders(created_by_user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_production_work_order_events_order ON production_work_order_events(work_order_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_production_crew_category ON production_crew_members(category, name)",
  "CREATE INDEX IF NOT EXISTS idx_production_crew_active ON production_crew_members(active)",
  "INSERT OR IGNORE INTO production_settings (id, model_catalog_url) VALUES (1, '')",
];

const modelDirectorySeed = [
  ["Rana Wagih", "01055875887", ""],
  ["Margret", "01278264486", ""],
  ["Layal", "01115559983", ""],
  ["Youstina", "01279230089", ""],
  ["Nour", "01063820556", ""],
  ["Maha", "01090509247", ""],
  ["Hla", "01055445568", ""],
  ["Sherouk Abdallah", "01153458342", ""],
  ["Ranem", "01111692898", ""],
  ["Neven Tarek", "01118229804", "Ahmed Attia"],
  ["Esraa Elsobky", "01118229804", "Ahmed Attia"],
  ["Samar Heagazy", "01118229804", "Ahmed Attia"],
  ["Aya El Tourki", "01118229804", "Ahmed Attia"],
  ["Manal Fathlla", "01118229804", "Ahmed Attia"],
  ["Tia Zuhair", "01140445763", "Foreign model"],
  ["Angel", "01062485466", "Foreign model"],
  ["Anastasia", "01559911997", "Foreign model"],
] as const;

let productionDatabaseReady: Promise<void> | null = null;

export async function ensureProductionDatabase() {
  productionDatabaseReady ??= (async () => {
    await database.batch(productionSchema.map((statement) => database.prepare(statement)));
    await database.batch(modelDirectorySeed.map(([name, phone, notes]) => database.prepare(`INSERT INTO production_crew_members
        (category, name, phone, profile_url, notes, active)
      SELECT 'model', ?, ?, '', ?, 1
      WHERE NOT EXISTS (SELECT 1 FROM production_crew_members WHERE category = 'model' AND name = ? COLLATE NOCASE)`)
      .bind(name, phone, notes, name)));
    const columns = await database.prepare("PRAGMA table_info(production_work_orders)").all<{ name: string }>();
    const names = new Set(columns.results.map((column) => column.name));
    const additions = [
      ["content_required", "ALTER TABLE production_work_orders ADD COLUMN content_required INTEGER NOT NULL DEFAULT 0"],
      ["content_note", "ALTER TABLE production_work_orders ADD COLUMN content_note TEXT NOT NULL DEFAULT ''"],
      ["content_references_json", "ALTER TABLE production_work_orders ADD COLUMN content_references_json TEXT NOT NULL DEFAULT '[]'"],
      ["content_creator_user_id", "ALTER TABLE production_work_orders ADD COLUMN content_creator_user_id INTEGER"],
      ["content_creator_name", "ALTER TABLE production_work_orders ADD COLUMN content_creator_name TEXT NOT NULL DEFAULT ''"],
      ["content_submitted_at", "ALTER TABLE production_work_orders ADD COLUMN content_submitted_at TEXT NOT NULL DEFAULT ''"],
      ["operation_note", "ALTER TABLE production_work_orders ADD COLUMN operation_note TEXT NOT NULL DEFAULT ''"],
      ["operation_manager_user_id", "ALTER TABLE production_work_orders ADD COLUMN operation_manager_user_id INTEGER"],
      ["operation_manager_name", "ALTER TABLE production_work_orders ADD COLUMN operation_manager_name TEXT NOT NULL DEFAULT ''"],
      ["final_approved_at", "ALTER TABLE production_work_orders ADD COLUMN final_approved_at TEXT NOT NULL DEFAULT ''"],
      ["bundle_price", "ALTER TABLE production_work_orders ADD COLUMN bundle_price REAL NOT NULL DEFAULT 0"],
      ["bundle_inputs_json", "ALTER TABLE production_work_orders ADD COLUMN bundle_inputs_json TEXT NOT NULL DEFAULT '[]'"],
      ["bundle_outputs_json", "ALTER TABLE production_work_orders ADD COLUMN bundle_outputs_json TEXT NOT NULL DEFAULT '[]'"],
      ["bundles_json", "ALTER TABLE production_work_orders ADD COLUMN bundles_json TEXT NOT NULL DEFAULT '[]'"],
      ["addon_price", "ALTER TABLE production_work_orders ADD COLUMN addon_price REAL NOT NULL DEFAULT 0"],
      ["addon_inputs_json", "ALTER TABLE production_work_orders ADD COLUMN addon_inputs_json TEXT NOT NULL DEFAULT '[]'"],
      ["addon_outputs_json", "ALTER TABLE production_work_orders ADD COLUMN addon_outputs_json TEXT NOT NULL DEFAULT '[]'"],
      ["addons_json", "ALTER TABLE production_work_orders ADD COLUMN addons_json TEXT NOT NULL DEFAULT '[]'"],
      ["production_options_json", "ALTER TABLE production_work_orders ADD COLUMN production_options_json TEXT NOT NULL DEFAULT '[]'"],
      ["draft_invoice_id", "ALTER TABLE production_work_orders ADD COLUMN draft_invoice_id INTEGER"],
    ] as const;
    for (const [name, statement] of additions) {
      if (!names.has(name)) {
        try {
          await database.prepare(statement).run();
        } catch (error) {
          if (!/duplicate column name/i.test(error instanceof Error ? error.message : String(error))) throw error;
        }
      }
    }
    const crewColumns = await database.prepare("PRAGMA table_info(production_crew_members)").all<{ name: string }>();
    const crewColumnNames = new Set(crewColumns.results.map((column) => column.name));
    const crewAdditions = [
      ["model_group", "ALTER TABLE production_crew_members ADD COLUMN model_group TEXT NOT NULL DEFAULT ''"],
      ["photo_key", "ALTER TABLE production_crew_members ADD COLUMN photo_key TEXT NOT NULL DEFAULT ''"],
      ["model_nationality", "ALTER TABLE production_crew_members ADD COLUMN model_nationality TEXT CHECK(model_nationality IN ('egyptian','foreign'))"],
      ["hourly_rate", "ALTER TABLE production_crew_members ADD COLUMN hourly_rate REAL"],
      ["daily_rate", "ALTER TABLE production_crew_members ADD COLUMN daily_rate REAL"],
    ] as const;
    for (const [name, statement] of crewAdditions) {
      if (!crewColumnNames.has(name)) {
        try {
          await database.prepare(statement).run();
        } catch (error) {
          if (!/duplicate column name/i.test(error instanceof Error ? error.message : String(error))) throw error;
        }
      }
    }
    await database.prepare(`UPDATE production_crew_members
      SET model_nationality = CASE WHEN LOWER(notes) LIKE '%foreign%' THEN 'foreign' ELSE 'egyptian' END
      WHERE category = 'model' AND model_nationality IS NULL`).run();
    await ensureDocumentMetadata();
    const documentColumns = await database.prepare("PRAGMA table_info(documents)").all<{ name: string }>();
    if (!documentColumns.results.some((column) => column.name === "production_work_order_id")) {
      try {
        await database.prepare("ALTER TABLE documents ADD COLUMN production_work_order_id INTEGER").run();
      } catch (error) {
        if (!/duplicate column name/i.test(error instanceof Error ? error.message : String(error))) throw error;
      }
    }
    await database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_production_work_order ON documents(production_work_order_id)").run();
    await database.prepare(`UPDATE production_work_orders SET
      bundle_price = COALESCE((SELECT price FROM quotation_catalog WHERE id = bundle_catalog_id), bundle_price),
      bundle_inputs_json = COALESCE((SELECT inputs_json FROM quotation_catalog WHERE id = bundle_catalog_id), bundle_inputs_json),
      bundle_outputs_json = COALESCE((SELECT outputs_json FROM quotation_catalog WHERE id = bundle_catalog_id), bundle_outputs_json)
      WHERE bundle_inputs_json = '[]'`).run();
    await database.prepare(`UPDATE production_work_orders SET bundles_json = json_array(json_object(
        'id', 'legacy-bundle-' || id,
        'catalogId', bundle_catalog_id,
        'name', bundle_name,
        'price', bundle_price,
        'inputs', json(bundle_inputs_json),
        'outputs', json(bundle_outputs_json),
        'bundleTotal', NULL
      ))
      WHERE bundles_json = '[]' AND bundle_name <> ''`).run();
    await database.prepare(`UPDATE production_work_orders SET
      addon_price = COALESCE((SELECT price FROM quotation_catalog WHERE id = addon_catalog_id), addon_price),
      addon_inputs_json = COALESCE((SELECT inputs_json FROM quotation_catalog WHERE id = addon_catalog_id), addon_inputs_json),
      addon_outputs_json = COALESCE((SELECT outputs_json FROM quotation_catalog WHERE id = addon_catalog_id), addon_outputs_json)
      WHERE addon_catalog_id IS NOT NULL AND addon_inputs_json = '[]'`).run();
    await database.prepare(`UPDATE production_work_orders SET addons_json = json_array(json_object(
        'id', 'legacy-addon-' || id,
        'catalogId', addon_catalog_id,
        'name', addon_name,
        'price', addon_price,
        'inputs', json(addon_inputs_json),
        'outputs', json(addon_outputs_json),
        'appliesTo', '',
        'bundleTotal', NULL
      ))
      WHERE addons_json = '[]' AND addon_name <> ''`).run();
  })();
  try {
    await productionDatabaseReady;
  } catch (error) {
    productionDatabaseReady = null;
    throw error;
  }
}

