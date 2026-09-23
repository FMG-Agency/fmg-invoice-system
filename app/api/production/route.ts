import { ensureProductionDatabase } from "../../lib/production-schema";
import { reserveWorkOrderNumber } from "../../lib/document-metadata";
import { z } from "zod";
import { database } from "../../lib/database";
import { getSession, requirePermission, type AuthSession } from "../../lib/auth-server";
import { notifyUsers, workflowRecipientUserIds } from "../../lib/notifications";
import type { ProductionCostOption, ProductionCrewMember, ProductionState, ProductionWorkflowRole, ProductionWorkOrder, ProductionWorkOrderAddon, ProductionWorkOrderBundle } from "../../types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid production date.");
const timeValue = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid call time.");
const noteValue = z.string().trim().max(5000).default("");
const webLink = z.string().trim().max(2000).refine((value) => !value || /^https?:\/\//i.test(value), "Use a full link starting with http:// or https://.");
const optionTypes = ["photographer", "videographer", "model", "blogger", "location", "studio", "hair_stylist", "makeup_stylist", "stylist"] as const;
const crewCategories = ["model", "photographer", "videographer"] as const;
const optionalRate = z.number().finite().min(0, "Rates cannot be negative.").nullable();
const crewDataSchema = z.object({
  category: z.enum(crewCategories),
  name: z.string().trim().min(1, "Enter the crew member's name.").max(200),
  phone: z.string().trim().min(1, "Enter the crew member's phone number.").max(100),
  profileUrl: webLink,
  modelGroup: z.enum(["stories", "egyptian", "foreign"]).optional(),
  modelNationality: z.enum(["egyptian", "foreign"]).nullable(),
  hourlyRate: optionalRate,
  dailyRate: optionalRate,
  notes: z.string().trim().max(2000),
  active: z.boolean(),
}).superRefine((data, context) => {
  if (data.category === "model" && !data.modelNationality) {
    context.addIssue({ code: "custom", path: ["modelNationality"], message: "Choose whether the model is Egyptian or foreign." });
  }
});
const productionOptionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  type: z.enum(optionTypes),
  crewMemberId: z.number().int().positive().nullable().optional().default(null),
  name: z.string().trim().min(1, "Enter a name or detail for every production option.").max(300),
  price: z.number().finite().min(0, "Production option prices cannot be negative."),
  billingMode: z.enum(["included", "extra"]).default("included"),
});
const scopeDetail = z.string().trim().min(1).max(300);
const bundleSelectionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  catalogId: z.number().int().positive(),
  name: z.string().trim().min(1).max(300),
  price: z.number().finite().min(0),
  inputs: z.array(scopeDetail).max(30),
  outputs: z.array(scopeDetail).max(30),
  bundleTotal: z.number().finite().min(0).nullable().default(null),
});
const addonSelectionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  catalogId: z.number().int().positive().nullable(),
  name: z.string().trim().min(1, "Enter a name for every custom add-on.").max(300),
  price: z.number().finite().min(0, "Add-on prices cannot be negative."),
  inputs: z.array(scopeDetail).max(30),
  outputs: z.array(scopeDetail).max(30),
});
const storedAddonSchema = addonSelectionSchema.extend({
  appliesTo: z.string().trim().max(300).default(""),
  bundleTotal: z.number().finite().min(0).nullable().default(null),
});

const payloadSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    data: z.object({
      documentType: z.literal("media_guide"),
      clientId: z.number().int().positive(),
      bundles: z.array(bundleSelectionSchema).min(1, "Choose at least one Media Guide bundle.").max(10, "Choose no more than 10 bundles."),
      addons: z.array(addonSelectionSchema).max(20, "Choose no more than 20 add-ons."),
      workDate: dateValue,
      accountNote: noteValue,
    }),
  }),
  z.object({
    action: z.literal("submitContent"),
    id: z.number().int().positive(),
    data: z.object({
      contentNote: z.string().trim().min(1).max(5000),
      contentReferences: z.array(z.string().trim().url().max(2000).refine(value => /^https?:\/\//i.test(value), "Use an http or https link.")).min(1).max(20),
    }),
  }),
  z.object({
    action: z.literal("complete"),
    id: z.number().int().positive(),
    data: z.object({
      callTime: timeValue,
      options: z.array(productionOptionSchema).min(1, "Add at least one production option.").max(30),
      productionNote: noteValue,
    }),
  }),
  z.object({
    action: z.literal("finalApprove"),
    id: z.number().int().positive(),
    data: z.object({
      clientId: z.number().int().positive(),
      bundles: z.array(bundleSelectionSchema).min(1, "Choose at least one Media Guide bundle.").max(10, "Choose no more than 10 bundles."),
      addons: z.array(addonSelectionSchema).max(20, "Choose no more than 20 add-ons."),
      workDate: dateValue,
      callTime: timeValue,
      options: z.array(productionOptionSchema).min(1, "Add at least one production option.").max(30),
      accountNote: noteValue,
      productionNote: noteValue,
      operationNote: noteValue,
    }),
  }),
  z.object({
    action: z.literal("managerEdit"),
    id: z.number().int().positive(),
    data: z.object({
      clientId: z.number().int().positive(),
      bundles: z.array(bundleSelectionSchema).min(1, "Choose at least one Media Guide bundle.").max(10, "Choose no more than 10 bundles."),
      addons: z.array(addonSelectionSchema).max(20, "Choose no more than 20 add-ons."),
      workDate: dateValue,
      callTime: z.union([timeValue, z.literal("")]),
      options: z.array(productionOptionSchema).max(30),
      accountNote: noteValue,
      productionNote: noteValue,
      operationNote: noteValue,
    }),
  }),
  z.object({
    action: z.literal("delete"),
    id: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("deleteCrew"),
    id: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("saveCrew"),
    id: z.number().int().positive().nullable(),
    data: crewDataSchema,
  }),
  z.object({
    action: z.literal("saveDirectorySettings"),
    data: z.object({ modelCatalogUrl: webLink }),
  }),
]);

function workflowRole(session: AuthSession): ProductionWorkflowRole {
  if (session.isAdmin) return "administrator";
  const normalized = session.roleLabel.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (normalized.includes("content") && normalized.includes("creator")) return "content_creator";
  if (normalized.includes("account") && normalized.includes("manager")) return "account_manager";
  if (normalized.includes("production") && normalized.includes("manager")) return "production_manager";
  if ((normalized.includes("operation") || normalized.includes("operations")) && normalized.includes("manager")) return "operation_manager";
  return "viewer";
}

function displayName(session: AuthSession) {
  return session.displayName.trim() || session.username;
}

function canManageProductionDirectory(role: ProductionWorkflowRole) {
  return role === "production_manager" || role === "operation_manager" || role === "administrator";
}

function codeFor(id: number) {
  return `WO-${String(id).padStart(4, "0")}`;
}

function stringArray(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function workOrderBundles(row: Record<string, unknown>): ProductionWorkOrderBundle[] {
  try {
    const parsed = z.array(bundleSelectionSchema).safeParse(JSON.parse(String(row.bundlesJson ?? "[]")));
    if (parsed.success && parsed.data.length) return parsed.data;
  } catch {
    // Fall through to the legacy single bundle snapshot.
  }
  const name = String(row.bundleName ?? "").trim();
  if (!name) return [];
  return [{
    id: `legacy-bundle-${String(row.id ?? "")}`,
    catalogId: Number(row.bundleCatalogId),
    name,
    price: Number(row.bundlePrice ?? 0),
    inputs: stringArray(row.bundleInputsJson),
    outputs: stringArray(row.bundleOutputsJson),
    bundleTotal: null,
  }];
}

function workOrderAddons(row: Record<string, unknown>): ProductionWorkOrderAddon[] {
  try {
    const parsed = z.array(storedAddonSchema).safeParse(JSON.parse(String(row.addonsJson ?? "[]")));
    if (parsed.success && parsed.data.length) return parsed.data;
  } catch {
    // Fall through to the legacy single add-on snapshot.
  }
  const name = String(row.addonName ?? "").trim();
  if (!name) return [];
  return [{
    id: `legacy-addon-${String(row.id ?? "")}`,
    catalogId: row.addonCatalogId === null || row.addonCatalogId === undefined ? null : Number(row.addonCatalogId),
    name,
    price: Number(row.addonPrice ?? 0),
    inputs: stringArray(row.addonInputsJson),
    outputs: stringArray(row.addonOutputsJson),
    appliesTo: "",
    bundleTotal: null,
  }];
}

function productionOptions(row: Record<string, unknown>): ProductionCostOption[] {
  try {
    const parsed = z.array(productionOptionSchema).safeParse(JSON.parse(String(row.productionOptionsJson ?? "[]")));
    if (parsed.success && parsed.data.length) return parsed.data;
  } catch {
    // Older work orders are reconstructed from their legacy production fields below.
  }
  const legacy: ProductionCostOption[] = [];
  const addLegacy = (type: ProductionCostOption["type"], name: unknown) => {
    const value = String(name ?? "").trim();
    if (value) legacy.push({ id: `legacy-${type}`, type, name: value, price: 0, billingMode: "included" });
  };
  addLegacy("photographer", row.photographerName);
  addLegacy("model", row.modelName);
  addLegacy("location", row.location);
  return legacy;
}

function firstOption(options: ProductionCostOption[], type: ProductionCostOption["type"]) {
  return options.find((option) => option.type === type)?.name ?? "";
}

function mapOrder(row: Record<string, unknown>): ProductionWorkOrder {
  const id = Number(row.id);
  const finalApprovedAt = String(row.finalApprovedAt ?? "");
  const status = row.status === "ready_for_operations"
    ? finalApprovedAt ? "final_approved" : "pending_operations"
    : Number(row.contentRequired) && !row.contentSubmittedAt ? "pending_content" : "pending_production";
  const options = productionOptions(row);
  const bundles = workOrderBundles(row);
  const primaryBundle = bundles[0] ?? null;
  const bundlePrice = primaryBundle?.price ?? Number(row.bundlePrice ?? 0);
  const bundlesTotal = bundles.reduce((total, bundle) => total + bundle.price, 0);
  const addons = workOrderAddons(row);
  const primaryAddon = addons[0] ?? null;
  const addonsTotal = addons.reduce((total, addon) => total + addon.price, 0);
  const productionOptionsTotal = options.reduce((total, option) => total + (option.billingMode === "extra" ? option.price : 0), 0);
  return {
    id,
    code: codeFor(id),
    documentType: "media_guide",
    clientId: Number(row.clientId),
    clientName: String(row.clientName ?? ""),
    bundleCatalogId: primaryBundle?.catalogId ?? Number(row.bundleCatalogId),
    bundleName: primaryBundle?.name ?? String(row.bundleName ?? ""),
    bundlePrice,
    bundleInputs: primaryBundle?.inputs ?? stringArray(row.bundleInputsJson),
    bundleOutputs: primaryBundle?.outputs ?? stringArray(row.bundleOutputsJson),
    bundles,
    bundlesTotal,
    addonCatalogId: primaryAddon?.catalogId ?? null,
    addonName: primaryAddon?.name ?? "",
    addonPrice: primaryAddon?.price ?? 0,
    addonInputs: primaryAddon?.inputs ?? [],
    addonOutputs: primaryAddon?.outputs ?? [],
    addons,
    addonsTotal,
    workDate: String(row.workDate ?? ""),
    callTime: String(row.callTime ?? ""),
    location: String(row.location ?? ""),
    modelName: String(row.modelName ?? ""),
    photographerName: String(row.photographerName ?? ""),
    contentRequired: Boolean(Number(row.contentRequired)),
    contentNote: String(row.contentNote ?? ""),
    contentReferences: stringArray(row.contentReferencesJson),
    contentCreatorName: String(row.contentCreatorName ?? ""),
    contentSubmittedAt: String(row.contentSubmittedAt ?? ""),
    accountNote: String(row.accountNote ?? ""),
    productionNote: String(row.productionNote ?? ""),
    operationNote: String(row.operationNote ?? ""),
    productionOptions: options,
    productionOptionsTotal,
    workOrderTotal: bundlesTotal + addonsTotal + productionOptionsTotal,
    status,
    createdByUserId: Number(row.createdByUserId),
    createdByName: String(row.createdByName ?? ""),
    createdByRole: String(row.createdByRole ?? ""),
    productionManagerUserId: row.productionManagerUserId === null || row.productionManagerUserId === undefined ? null : Number(row.productionManagerUserId),
    productionManagerName: String(row.productionManagerName ?? ""),
    operationManagerUserId: row.operationManagerUserId === null || row.operationManagerUserId === undefined ? null : Number(row.operationManagerUserId),
    operationManagerName: String(row.operationManagerName ?? ""),
    accountSubmittedAt: String(row.accountSubmittedAt ?? ""),
    productionSubmittedAt: String(row.productionSubmittedAt ?? ""),
    finalApprovedAt,
    draftInvoiceId: row.draftInvoiceId === null || row.draftInvoiceId === undefined ? null : Number(row.draftInvoiceId),
    draftInvoiceCode: String(row.draftInvoiceCode ?? ""),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

async function getProductionState(session: AuthSession): Promise<ProductionState> {
  const role = workflowRole(session);
  const [ordersResult, clientsResult, catalogResult, crewResult, settingsResult] = await Promise.all([
    database.prepare(`SELECT p.id, p.document_type AS documentType, p.client_id AS clientId, p.client_name AS clientName,
        p.bundle_catalog_id AS bundleCatalogId, p.bundle_name AS bundleName, p.bundle_price AS bundlePrice,
        p.bundle_inputs_json AS bundleInputsJson, p.bundle_outputs_json AS bundleOutputsJson, p.bundles_json AS bundlesJson,
        p.addon_catalog_id AS addonCatalogId, p.addon_name AS addonName, p.addon_price AS addonPrice,
        p.addon_inputs_json AS addonInputsJson, p.addon_outputs_json AS addonOutputsJson, p.addons_json AS addonsJson,
        p.work_date AS workDate, p.call_time AS callTime, p.location, p.model_name AS modelName,
        p.photographer_name AS photographerName, p.account_note AS accountNote, p.production_note AS productionNote,
        p.content_required AS contentRequired, p.content_note AS contentNote, p.content_references_json AS contentReferencesJson,
        p.content_creator_name AS contentCreatorName, p.content_submitted_at AS contentSubmittedAt,
        p.operation_note AS operationNote, p.production_options_json AS productionOptionsJson,
        p.status, p.created_by_user_id AS createdByUserId, p.created_by_name AS createdByName, p.created_by_role AS createdByRole,
        p.production_manager_user_id AS productionManagerUserId, p.production_manager_name AS productionManagerName,
        p.operation_manager_user_id AS operationManagerUserId, p.operation_manager_name AS operationManagerName,
        p.account_submitted_at AS accountSubmittedAt, p.production_submitted_at AS productionSubmittedAt,
        p.final_approved_at AS finalApprovedAt, p.draft_invoice_id AS draftInvoiceId,
        COALESCE(d.generated_code, '') AS draftInvoiceCode,
        p.created_at AS createdAt, p.updated_at AS updatedAt
      FROM production_work_orders p LEFT JOIN documents d ON d.id = p.draft_invoice_id
      ORDER BY p.work_date DESC, p.id DESC`).all<Record<string, unknown>>(),
    database.prepare(`SELECT id, COALESCE(NULLIF(company_name, ''), name) AS name
      FROM clients ORDER BY COALESCE(NULLIF(company_name, ''), name) COLLATE NOCASE`).all<Record<string, unknown>>(),
    database.prepare(`SELECT id, kind, name, price, inputs_json AS inputsJson, outputs_json AS outputsJson,
        applies_to AS appliesTo, bundle_total AS bundleTotal FROM quotation_catalog
      WHERE active = 1 ORDER BY kind DESC, sort_order, id`).all<Record<string, unknown>>(),
    database.prepare(`SELECT id, category, name, phone, profile_url AS profileUrl,
        model_group AS modelGroup, photo_key AS photoKey, model_nationality AS modelNationality, hourly_rate AS hourlyRate, daily_rate AS dailyRate, notes, active,
        created_at AS createdAt, updated_at AS updatedAt
      FROM production_crew_members WHERE deleted_at = '' ORDER BY active DESC, category, name COLLATE NOCASE`).all<Record<string, unknown>>(),
    database.prepare("SELECT model_catalog_url AS modelCatalogUrl FROM production_settings WHERE id = 1").first<{ modelCatalogUrl: string }>(),
  ]);

  const allOrders = ordersResult.results.map(mapOrder);
  const orders = role === "account_manager"
    ? allOrders.filter((order) => order.createdByUserId === session.userId)
    : role === "viewer"
      ? []
      : allOrders;

  const canManageDirectory = canManageProductionDirectory(role);
  const crew = crewResult.results.map((row): ProductionCrewMember => ({
    id: Number(row.id),
    category: row.category === "photographer" ? "photographer" : row.category === "videographer" ? "videographer" : "model",
    name: String(row.name ?? ""),
    phone: String(row.phone ?? ""),
    profileUrl: String(row.profileUrl ?? ""),
    modelGroup: row.modelGroup === "stories" ? "stories" : row.modelGroup === "foreign" || (!row.modelGroup && row.modelNationality === "foreign") ? "foreign" : "egyptian",
    photoUrl: row.photoKey ? `/api/production-directory?photo=crew&id=${Number(row.id)}&v=${encodeURIComponent(String(row.updatedAt))}` : "",
    modelNationality: row.modelNationality === "foreign" ? "foreign" : row.modelNationality === "egyptian" ? "egyptian" : null,
    hourlyRate: row.hourlyRate === null || row.hourlyRate === undefined ? null : Number(row.hourlyRate),
    dailyRate: row.dailyRate === null || row.dailyRate === undefined ? null : Number(row.dailyRate),
    notes: String(row.notes ?? ""),
    active: Boolean(row.active),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  })).filter((member) => canManageDirectory || member.active);

  return {
    role,
    orders,
    clients: role === "account_manager" || role === "operation_manager" || role === "administrator"
      ? clientsResult.results.map((row) => ({ id: Number(row.id), name: String(row.name ?? "") }))
      : [],
    catalog: role === "account_manager" || role === "operation_manager" || role === "administrator"
      ? catalogResult.results.map((row) => ({
        id: Number(row.id),
        kind: row.kind === "addon" ? "addon" : "package",
        name: String(row.name ?? ""),
        price: Number(row.price ?? 0),
        inputs: stringArray(row.inputsJson),
        outputs: stringArray(row.outputsJson),
        appliesTo: String(row.appliesTo ?? ""),
        bundleTotal: row.bundleTotal === null || row.bundleTotal === undefined ? null : Number(row.bundleTotal),
      }))
      : [],
    crew,
    modelCatalogUrl: settingsResult?.modelCatalogUrl ?? "",
    canManageDirectory,
    pendingContentCount: orders.filter((order) => order.status === "pending_content").length,
    pendingProductionCount: orders.filter((order) => order.status === "pending_production").length,
    pendingOperationsCount: orders.filter((order) => order.status === "pending_operations").length,
    finalApprovedCount: orders.filter((order) => order.status === "final_approved").length,
  };
}

function accessDenied(message: string) {
  return Response.json({ error: message, code: "PRODUCTION_ROLE_REQUIRED" }, { status: 403 });
}

async function resolveScope(data: { clientId: number; bundles: z.infer<typeof bundleSelectionSchema>[]; addons: z.infer<typeof addonSelectionSchema>[] }) {
  const bundleCatalogIds = data.bundles.map((bundle) => bundle.catalogId);
  if (new Set(bundleCatalogIds).size !== bundleCatalogIds.length) throw new Error("The same bundle cannot be selected more than once.");
  const [client, bundleRows] = await Promise.all([
    database.prepare("SELECT COALESCE(NULLIF(company_name, ''), name) AS name, agency_key AS agencyKey FROM clients WHERE id = ?")
      .bind(data.clientId).first<{ name: string; agencyKey: string }>(),
    Promise.all(bundleCatalogIds.map((catalogId) => database.prepare(`SELECT id, name, price, inputs_json AS inputsJson, outputs_json AS outputsJson,
        bundle_total AS bundleTotal
      FROM quotation_catalog WHERE id = ? AND kind = 'package' AND active = 1`)
      .bind(catalogId).first<Record<string, unknown>>())),
  ]);
  if (!client) throw new Error("The selected client is no longer available.");
  if (bundleRows.some((bundleRow) => !bundleRow)) throw new Error("One of the selected Media Guide bundles is no longer available.");
  const bundles = bundleRows.map((bundleRow, index): ProductionWorkOrderBundle => ({
    id: data.bundles[index].id,
    catalogId: Number(bundleRow!.id),
    name: data.bundles[index].name,
    price: data.bundles[index].price,
    inputs: data.bundles[index].inputs,
    outputs: data.bundles[index].outputs,
    bundleTotal: data.bundles[index].bundleTotal,
  }));
  const selectedBundleNames = new Set([
    ...bundles.map((bundle) => bundle.name.toLowerCase()),
    ...bundleRows.map((bundleRow) => String(bundleRow!.name ?? "").toLowerCase()),
  ]);

  const catalogIds = data.addons.flatMap((addon) => addon.catalogId ? [addon.catalogId] : []);
  if (new Set(catalogIds).size !== catalogIds.length) throw new Error("The same add-on cannot be selected more than once.");
  const addons = await Promise.all(data.addons.map(async (selection): Promise<ProductionWorkOrderAddon> => {
    if (!selection.catalogId) return {
      id: selection.id,
      catalogId: null,
      name: selection.name,
      price: selection.price,
      inputs: selection.inputs,
      outputs: selection.outputs,
      appliesTo: "",
      bundleTotal: null,
    };
    const addonRow = await database.prepare(`SELECT id, name, price, inputs_json AS inputsJson, outputs_json AS outputsJson,
        applies_to AS appliesTo, bundle_total AS bundleTotal
      FROM quotation_catalog WHERE id = ? AND kind = 'addon' AND active = 1`)
      .bind(selection.catalogId).first<Record<string, unknown>>();
    if (!addonRow) throw new Error("One of the selected add-ons is no longer available.");
    const addon: ProductionWorkOrderAddon = {
      id: `catalog-addon-${String(addonRow.id)}`,
      catalogId: Number(addonRow.id),
      name: String(addonRow.name ?? ""),
      price: Number(addonRow.price ?? 0),
      inputs: stringArray(addonRow.inputsJson),
      outputs: stringArray(addonRow.outputsJson),
      appliesTo: String(addonRow.appliesTo ?? ""),
      bundleTotal: addonRow.bundleTotal === null || addonRow.bundleTotal === undefined ? null : Number(addonRow.bundleTotal),
    };
    if (addon.appliesTo && !selectedBundleNames.has(addon.appliesTo.toLowerCase())) {
      throw new Error(`${addon.name} is not available for the selected bundles.`);
    }
    return addon;
  }));
  return { client, bundles, addons };
}

const productionOptionLabels: Record<ProductionCostOption["type"], string> = {
  photographer: "Photographer",
  videographer: "Videographer",
  model: "Model",
  blogger: "Blogger",
  location: "Location",
  studio: "Studio",
  hair_stylist: "Hair Stylist",
  makeup_stylist: "Makeup Stylist",
  stylist: "Stylist",
};

type DraftInvoiceInput = {
  workOrderId: number;
  createdByUserId: number;
  createdByName: string;
  clientId: number;
  workDate: string;
  accountNote: string;
  productionNote: string;
  operationNote: string;
  options: ProductionCostOption[];
  scope: Awaited<ReturnType<typeof resolveScope>>;
};

function draftInvoiceContent(input: DraftInvoiceInput) {
  const lineItem = (id: string, description: string, price: number, kind: "package" | "addon" | "custom", catalogId: number | null,
    inputs: string[], outputs: string[], appliesTo = "", bundleTotal: number | null = null) => ({
    id, date: input.workDate, description, qty: 1, unit: kind === "package" ? "Package" : kind === "addon" ? "Add-on" : "Service",
    unitPrice: price, kind, catalogId, includedServices: inputs, inputs, outputs, appliesTo, bundleTotal,
  });
  const items = [
    ...input.scope.bundles.map((bundle, index) => lineItem(`wo-${input.workOrderId}-bundle-${index + 1}`, bundle.name, bundle.price,
      "package", bundle.catalogId, bundle.inputs, bundle.outputs, "", bundle.bundleTotal)),
    ...input.scope.addons.map((addon, index) => lineItem(`wo-${input.workOrderId}-addon-${index + 1}`, addon.name, addon.price,
      addon.catalogId ? "addon" : "custom", addon.catalogId, addon.inputs, addon.outputs, addon.appliesTo, addon.bundleTotal)),
    ...input.options.filter((option) => option.billingMode === "extra").map((option, index) => lineItem(`wo-${input.workOrderId}-option-${index + 1}`,
      `${productionOptionLabels[option.type]} · ${option.name}`, option.price, "custom", null, [option.name], [])),
  ];
  const subtotal = items.reduce((total, item) => total + item.unitPrice, 0);
  const notes = [
    `Created automatically from ${codeFor(input.workOrderId)} after final Operations approval.`,
    input.accountNote ? `Account note: ${input.accountNote}` : "",
    input.productionNote ? `Production note: ${input.productionNote}` : "",
    input.operationNote ? `Operation note: ${input.operationNote}` : "",
  ].filter(Boolean).join("\n");
  return { items, subtotal, notes };
}

async function ensureDraftInvoice(input: DraftInvoiceInput) {
  const companyKey = input.scope.client.agencyKey === "digital_empire" ? "digital_empire" : "fmg";
  const content = draftInvoiceContent(input);
  const existing = await database.prepare("SELECT id, generated_code AS generatedCode, status FROM documents WHERE production_work_order_id = ?")
    .bind(input.workOrderId).first<{ id: number; generatedCode: string; status: string }>();
  if (existing) {
    if (existing.status === "Draft") {
      await database.prepare(`UPDATE documents SET company_key = ?, client_id = ?, date = ?, project = ?, items_json = ?,
          subtotal = ?, total = ? - COALESCE(discount, 0) + COALESCE(tax, 0), notes_exclusions = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`)
        .bind(companyKey, input.clientId, input.workDate, `Media Guide · ${codeFor(input.workOrderId)}`,
          JSON.stringify(content.items), content.subtotal, content.subtotal, content.notes, existing.id).run();
    }
    return existing;
  }

  const category = await database.prepare(`UPDATE categories SET counter = MAX(counter, ?), updated_at = CURRENT_TIMESTAMP
    WHERE LOWER(TRIM(name)) = 'media guide' RETURNING id, prefix, counter`)
    .bind(input.workOrderId).first<{ id: number; prefix: string; counter: number }>();
  if (!category) throw new Error("The Media Guide category is required before a draft invoice can be created.");
  const settings = await database.prepare("SELECT prepared_by AS preparedBy, default_payment_terms AS paymentTerms FROM settings WHERE id = 1")
    .first<{ preparedBy: string; paymentTerms: string }>();
  const clientPart = input.scope.client.name.trim().replace(/[^A-Za-z0-9\u0600-\u06FF]+/g, "-").replace(/^-|-$/g, "") || "CLIENT";
  const generatedCode = `${clientPart}-${category.prefix}${String(input.workOrderId).padStart(4, "0")}`;
  const archived = await database.prepare("SELECT id FROM deleted_document_history WHERE generated_code = ?").bind(generatedCode).first();
  if (archived) throw new Error("This invoice was deleted and its serial is reserved. Create a new work order for a new invoice.");
  await database.prepare(`INSERT OR IGNORE INTO documents
    (type, company_key, generated_code, client_id, category_id, date, valid_until, prepared_by, currency, project,
      status, items_json, subtotal, discount, tax, total, payment_terms, notes_exclusions, pdf_key, production_work_order_id, created_by_user_id, created_by_name)
    VALUES ('invoice', ?, ?, ?, ?, ?, '', ?, 'EGP', ?, 'Draft', ?, ?, 0, 0, ?, ?, ?, '', ?, ?, ?)`)
    .bind(companyKey, generatedCode,
      input.clientId, category.id, input.workDate,
      settings?.preparedBy || "Finance Department", `Media Guide · ${codeFor(input.workOrderId)}`,
      JSON.stringify(content.items), content.subtotal, content.subtotal, settings?.paymentTerms || "", content.notes, input.workOrderId, input.createdByUserId, input.createdByName).run();
  const created = await database.prepare("SELECT id, generated_code AS generatedCode FROM documents WHERE production_work_order_id = ?")
    .bind(input.workOrderId).first<{ id: number; generatedCode: string }>();
  if (!created) throw new Error("The work order was approved, but its draft invoice could not be created.");
  return created;
}

function errorResponse(error: unknown) {
  const message = error instanceof z.ZodError
    ? error.issues[0]?.message ?? "Invalid work order data."
    : error instanceof Error ? error.message : "Unexpected production workflow error.";
  const conflict = /already been completed|no longer pending|already received final approval/i.test(message);
  const invalidSelection = /selected .+ no longer available|add-on is not available|same (?:add-on|bundle) cannot be selected|at least one Media Guide bundle/i.test(message);
  return Response.json({ error: message }, { status: conflict ? 409 : error instanceof z.ZodError || invalidSelection ? 400 : 500 });
}

export async function GET(request: Request) {
  try {
    const authError = await requirePermission(request, "production");
    if (authError) return authError;
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    await ensureProductionDatabase();
    return Response.json(await getProductionState(session));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const authError = await requirePermission(request, "production");
    if (authError) return authError;
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    await ensureProductionDatabase();
    const role = workflowRole(session);
    const payload = payloadSchema.parse(await request.json());

    if (payload.action === "deleteCrew") {
      if (!canManageProductionDirectory(role)) return accessDenied("Only Production, Operations, or an administrator can delete crew members.");
      const result = await database.prepare("UPDATE production_crew_members SET deleted_at = CURRENT_TIMESTAMP, active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at = ''").bind(payload.id).run();
      if (Number(result.meta.changes) !== 1) return Response.json({ error: "Crew member not found." }, { status: 404 });
    } else if (payload.action === "saveCrew") {
      if (!canManageProductionDirectory(role)) return accessDenied("Only Production, Operations, or an administrator can manage the talent and crew directory.");
      const modelNationality = payload.data.category === "model" ? payload.data.modelNationality : null;
      const hourlyRate = payload.data.category === "model" ? payload.data.hourlyRate : null;
      const dailyRate = payload.data.category === "model" ? payload.data.dailyRate : null;
      if (payload.id) {
        const updated = await database.prepare(`UPDATE production_crew_members SET
            category = ?, name = ?, phone = ?, profile_url = ?, model_group = ?, model_nationality = ?, hourly_rate = ?, daily_rate = ?, notes = ?, active = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND deleted_at = ''`)
          .bind(payload.data.category, payload.data.name, payload.data.phone, payload.data.profileUrl,
            payload.data.modelGroup ?? modelNationality ?? "", modelNationality, hourlyRate, dailyRate, payload.data.notes, payload.data.active ? 1 : 0, payload.id).run();
        if (Number(updated.meta.changes) !== 1) return Response.json({ error: "Crew member not found." }, { status: 404 });
      } else {
        await database.prepare(`INSERT INTO production_crew_members
          (category, name, phone, profile_url, model_group, model_nationality, hourly_rate, daily_rate, notes, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(payload.data.category, payload.data.name, payload.data.phone, payload.data.profileUrl,
            payload.data.modelGroup ?? modelNationality ?? "", modelNationality, hourlyRate, dailyRate, payload.data.notes, payload.data.active ? 1 : 0).run();
      }
    } else if (payload.action === "saveDirectorySettings") {
      if (!canManageProductionDirectory(role)) return accessDenied("Only Production, Operations, or an administrator can manage the catalogue link.");
      await database.prepare(`INSERT INTO production_settings (id, model_catalog_url, updated_at)
        VALUES (1, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET model_catalog_url = excluded.model_catalog_url, updated_at = CURRENT_TIMESTAMP`)
        .bind(payload.data.modelCatalogUrl).run();
    } else if (payload.action === "delete") {
      if (!session.isAdmin) return accessDenied("Only an administrator can delete production work orders.");
      const existing = await database.prepare("SELECT id FROM production_work_orders WHERE id = ?").bind(payload.id).first<{ id: number }>();
      if (!existing) return Response.json({ error: "Work order not found." }, { status: 404 });
      await database.batch([
        database.prepare("UPDATE documents SET production_work_order_id = NULL WHERE production_work_order_id = ?").bind(payload.id),
        database.prepare("DELETE FROM production_work_order_events WHERE work_order_id = ?").bind(payload.id),
        database.prepare("DELETE FROM production_work_orders WHERE id = ?").bind(payload.id),
      ]);
    } else if (payload.action === "create") {
      if (role !== "account_manager" && role !== "operation_manager" && role !== "administrator") return accessDenied("Only an Account Manager, Operation Manager, or administrator can create and submit a work order.");
      const { client, bundles, addons } = await resolveScope(payload.data);
      const bundle = bundles[0];
      const primaryAddon = addons[0] ?? null;

      const actorName = displayName(session);
      const reservedNumber = await reserveWorkOrderNumber();
      const inserted = await database.prepare(`INSERT INTO production_work_orders
        (id, document_type, client_id, client_name, bundle_catalog_id, bundle_name, bundle_price, bundle_inputs_json, bundle_outputs_json, bundles_json,
          addon_catalog_id, addon_name, addon_price, addon_inputs_json, addon_outputs_json, addons_json,
          work_date, account_note, content_required, status, created_by_user_id, created_by_name, created_by_role)
        VALUES (?, 'media_guide', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending_production', ?, ?, ?)`)
        .bind(reservedNumber, payload.data.clientId, client.name, bundle.catalogId, bundle.name, bundle.price, JSON.stringify(bundle.inputs), JSON.stringify(bundle.outputs), JSON.stringify(bundles),
          primaryAddon?.catalogId ?? null, primaryAddon?.name ?? "", primaryAddon?.price ?? 0, JSON.stringify(primaryAddon?.inputs ?? []), JSON.stringify(primaryAddon?.outputs ?? []), JSON.stringify(addons),
          payload.data.workDate, payload.data.accountNote, session.userId, actorName, session.roleLabel).run();
      const workOrderId = Number(inserted.meta.last_row_id);
      await database.prepare(`INSERT INTO production_work_order_events
        (work_order_id, event_type, actor_user_id, actor_name, actor_role, note)
        VALUES (?, 'account_submitted', ?, ?, ?, ?)`)
        .bind(workOrderId, session.userId, actorName, session.roleLabel, payload.data.accountNote).run();
      await notifyUsers(await workflowRecipientUserIds("content_creator", session.userId), {
        type: "work_order_pending_content",
        title: `New work order ${codeFor(workOrderId)}`,
        message: `${actorName} sent ${client.name}'s Media Guide order for Content Creator references and notes on ${payload.data.workDate}.`,
        targetView: "work-order",
        entityId: workOrderId,
        actorUserId: session.userId,
      });
    } else if (payload.action === "submitContent") {
      if (role !== "content_creator" && role !== "administrator") return accessDenied("Only a Content Creator or administrator can submit references and notes.");
      const updated = await database.prepare(`UPDATE production_work_orders SET content_note = ?, content_references_json = ?,
        content_creator_user_id = ?, content_creator_name = ?, content_submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending_production' AND content_required = 1 AND content_submitted_at = ''`)
        .bind(payload.data.contentNote, JSON.stringify(payload.data.contentReferences), session.userId, displayName(session), payload.id).run();
      if (Number(updated.meta.changes) !== 1) return Response.json({ error: "This work order is no longer waiting for content." }, { status: 409 });
      await notifyUsers(await workflowRecipientUserIds("production_manager", session.userId), {
        type: "work_order_pending_production", title: `${codeFor(payload.id)} ready for Production`,
        message: `${displayName(session)} submitted references and notes. Select the resources for the shoot.`,
        targetView: "work-order", entityId: payload.id, actorUserId: session.userId,
      });
    } else if (payload.action === "complete") {
      if (role !== "production_manager" && role !== "operation_manager" && role !== "administrator") return accessDenied("Only a Production Manager, Operation Manager, or administrator can complete and approve this work order.");
      const actorName = displayName(session);
      const options = payload.data.options as ProductionCostOption[];
      const updated = await database.prepare(`UPDATE production_work_orders SET
          photographer_name = ?, model_name = ?, location = ?, call_time = ?, production_options_json = ?, production_note = ?,
          status = 'ready_for_operations', production_manager_user_id = ?, production_manager_name = ?,
          production_submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending_production' AND (content_required = 0 OR content_submitted_at <> '')`)
        .bind(firstOption(options, "photographer"), firstOption(options, "model"), firstOption(options, "location") || firstOption(options, "studio"),
          payload.data.callTime, JSON.stringify(options), payload.data.productionNote, session.userId, actorName, payload.id).run();
      if (Number(updated.meta.changes) !== 1) return Response.json({ error: "Content must be submitted first, and the order must still be waiting for Production." }, { status: 409 });
      await database.prepare(`INSERT INTO production_work_order_events
        (work_order_id, event_type, actor_user_id, actor_name, actor_role, note)
        VALUES (?, 'production_submitted', ?, ?, ?, ?)`)
        .bind(payload.id, session.userId, actorName, session.roleLabel, payload.data.productionNote).run();
      const completedOrder = await database.prepare("SELECT client_name AS clientName, work_date AS workDate FROM production_work_orders WHERE id = ?")
        .bind(payload.id).first<{ clientName: string; workDate: string }>();
      await notifyUsers(await workflowRecipientUserIds("operation_manager", session.userId), {
        type: "work_order_pending_operations",
        title: `${codeFor(payload.id)} needs final approval`,
        message: `${actorName} completed Production details for ${completedOrder?.clientName || "the client"} on ${completedOrder?.workDate || "the scheduled date"}.`,
        targetView: "work-order",
        entityId: payload.id,
        actorUserId: session.userId,
      });
    } else if (payload.action === "managerEdit") {
      if (role !== "operation_manager" && role !== "administrator") return accessDenied("Only an Operation Manager or administrator can edit work orders.");
      const existing = await database.prepare(`SELECT id, status, content_required AS contentRequired, content_submitted_at AS contentSubmittedAt, final_approved_at AS finalApprovedAt,
          created_by_user_id AS createdByUserId, production_manager_user_id AS productionManagerUserId
        FROM production_work_orders WHERE id = ?`)
        .bind(payload.id).first<{ id: number; status: string; contentRequired: number; contentSubmittedAt: string; finalApprovedAt: string; createdByUserId: number; productionManagerUserId: number | null }>();
      if (!existing) return Response.json({ error: "Work order not found." }, { status: 404 });
      const scope = await resolveScope(payload.data);
      const { client, bundles, addons } = scope;
      const bundle = bundles[0];
      const primaryAddon = addons[0] ?? null;
      const options = payload.data.options as ProductionCostOption[];
      const syncedDraftInvoice = existing.finalApprovedAt ? await ensureDraftInvoice({
        workOrderId: payload.id,
        createdByUserId: session.userId,
        createdByName: displayName(session),
        clientId: payload.data.clientId,
        workDate: payload.data.workDate,
        accountNote: payload.data.accountNote,
        productionNote: payload.data.productionNote,
        operationNote: payload.data.operationNote,
        options,
        scope,
      }) : null;
      const updated = await database.prepare(`UPDATE production_work_orders SET
          client_id = ?, client_name = ?, bundle_catalog_id = ?, bundle_name = ?, bundle_price = ?, bundle_inputs_json = ?, bundle_outputs_json = ?, bundles_json = ?,
          addon_catalog_id = ?, addon_name = ?, addon_price = ?, addon_inputs_json = ?, addon_outputs_json = ?, addons_json = ?,
          work_date = ?, photographer_name = ?, model_name = ?, location = ?, call_time = ?, production_options_json = ?,
          account_note = ?, production_note = ?, operation_note = ?, draft_invoice_id = COALESCE(draft_invoice_id, ?), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`)
        .bind(payload.data.clientId, client.name, bundle.catalogId, bundle.name, bundle.price, JSON.stringify(bundle.inputs), JSON.stringify(bundle.outputs), JSON.stringify(bundles),
          primaryAddon?.catalogId ?? null, primaryAddon?.name ?? "", primaryAddon?.price ?? 0, JSON.stringify(primaryAddon?.inputs ?? []), JSON.stringify(primaryAddon?.outputs ?? []), JSON.stringify(addons),
          payload.data.workDate, firstOption(options, "photographer"), firstOption(options, "model"), firstOption(options, "location") || firstOption(options, "studio"),
          payload.data.callTime, JSON.stringify(options), payload.data.accountNote, payload.data.productionNote, payload.data.operationNote, syncedDraftInvoice?.id ?? null, payload.id).run();
      if (Number(updated.meta.changes) !== 1) return Response.json({ error: "Work order not found." }, { status: 404 });
      const workflowRecipients = existing.finalApprovedAt
        ? []
        : await workflowRecipientUserIds(existing.status === "pending_production" ? existing.contentRequired && !existing.contentSubmittedAt ? "content_creator" : "production_manager" : "operation_manager", session.userId);
      const recipients = [...new Set([existing.createdByUserId, ...(existing.productionManagerUserId ? [existing.productionManagerUserId] : []), ...workflowRecipients])]
        .filter((userId) => userId !== session.userId);
      await notifyUsers(recipients, {
        type: "work_order_manager_edited",
        title: `${codeFor(payload.id)} updated by ${role === "administrator" ? "Administrator" : "Operations"}`,
        message: `${displayName(session)} corrected ${client.name}'s work order without changing its approval stage.`,
        targetView: "work-order",
        entityId: payload.id,
        actorUserId: session.userId,
      });
    } else {
      if (role !== "operation_manager" && role !== "administrator") return accessDenied("Only an Operation Manager can edit and give final approval to this work order.");
      const scope = await resolveScope(payload.data);
      const { client, bundles, addons } = scope;
      const bundle = bundles[0];
      const primaryAddon = addons[0] ?? null;
      const actorName = displayName(session);
      const options = payload.data.options as ProductionCostOption[];
      const pendingOrder = await database.prepare(`SELECT id, created_by_user_id AS createdByUserId,
          production_manager_user_id AS productionManagerUserId, client_name AS clientName
        FROM production_work_orders WHERE id = ? AND status = 'ready_for_operations' AND final_approved_at = ''`)
        .bind(payload.id).first<{ id: number; createdByUserId: number; productionManagerUserId: number | null; clientName: string }>();
      if (!pendingOrder) throw new Error("This work order has already received final approval or is no longer pending Operations.");
      const draftInvoice = await ensureDraftInvoice({
        workOrderId: payload.id,
        createdByUserId: session.userId,
        createdByName: displayName(session),
        clientId: payload.data.clientId,
        workDate: payload.data.workDate,
        accountNote: payload.data.accountNote,
        productionNote: payload.data.productionNote,
        operationNote: payload.data.operationNote,
        options,
        scope,
      });
      const updated = await database.prepare(`UPDATE production_work_orders SET
          client_id = ?, client_name = ?, bundle_catalog_id = ?, bundle_name = ?, bundle_price = ?, bundle_inputs_json = ?, bundle_outputs_json = ?, bundles_json = ?,
          addon_catalog_id = ?, addon_name = ?, addon_price = ?, addon_inputs_json = ?, addon_outputs_json = ?, addons_json = ?,
          work_date = ?, photographer_name = ?, model_name = ?, location = ?, call_time = ?, production_options_json = ?,
          account_note = ?, production_note = ?, operation_note = ?, draft_invoice_id = ?,
          operation_manager_user_id = ?, operation_manager_name = ?, final_approved_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'ready_for_operations' AND final_approved_at = ''`)
        .bind(payload.data.clientId, client.name, bundle.catalogId, bundle.name, bundle.price, JSON.stringify(bundle.inputs), JSON.stringify(bundle.outputs), JSON.stringify(bundles),
          primaryAddon?.catalogId ?? null, primaryAddon?.name ?? "", primaryAddon?.price ?? 0, JSON.stringify(primaryAddon?.inputs ?? []), JSON.stringify(primaryAddon?.outputs ?? []), JSON.stringify(addons),
          payload.data.workDate, firstOption(options, "photographer"), firstOption(options, "model"), firstOption(options, "location") || firstOption(options, "studio"),
          payload.data.callTime, JSON.stringify(options), payload.data.accountNote, payload.data.productionNote, payload.data.operationNote, draftInvoice.id,
          session.userId, actorName, payload.id).run();
      if (Number(updated.meta.changes) !== 1) throw new Error("This work order has already received final approval or is no longer pending Operations.");
      await notifyUsers([pendingOrder.createdByUserId, ...(pendingOrder.productionManagerUserId ? [pendingOrder.productionManagerUserId] : [])], {
        type: "work_order_final_approved",
        title: `${codeFor(payload.id)} received final approval`,
        message: `${actorName} approved ${pendingOrder.clientName}'s order. Draft invoice ${draftInvoice.generatedCode} is ready.`,
        targetView: "work-order",
        entityId: payload.id,
        actorUserId: session.userId,
      });
    }

    return Response.json(await getProductionState(session));
  } catch (error) {
    return errorResponse(error);
  }
}
