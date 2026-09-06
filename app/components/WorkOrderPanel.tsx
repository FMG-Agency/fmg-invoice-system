"use client";

import Image from "next/image";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  Inbox,
  LoaderCircle,
  ListFilter,
  LockKeyhole,
  NotebookPen,
  PackageCheck,
  Pencil,
  Plus,
  Printer,
  Search,
  Send,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProductionCatalogOption, ProductionCostOption, ProductionCrewCategory, ProductionOptionType, ProductionState, ProductionWorkOrder, ProductionWorkOrderAddon, ProductionWorkOrderBundle } from "../types";
import styles from "./WorkOrderPanel.module.css";

type AccountDraft = {
  documentType: "media_guide";
  clientId: number;
  bundles: ProductionWorkOrderBundle[];
  addons: ProductionWorkOrderAddon[];
  workDate: string;
  accountNote: string;
};

type ProductionDraft = {
  callTime: string;
  options: ProductionCostOption[];
  productionNote: string;
};

type OperationDraft = {
  clientId: number;
  bundles: ProductionWorkOrderBundle[];
  addons: ProductionWorkOrderAddon[];
  workDate: string;
  callTime: string;
  options: ProductionCostOption[];
  accountNote: string;
  productionNote: string;
  operationNote: string;
};

const emptyState: ProductionState = {
  role: "viewer",
  orders: [],
  clients: [],
  catalog: [],
  crew: [],
  modelCatalogUrl: "",
  canManageDirectory: false,
  pendingProductionCount: 0,
  pendingOperationsCount: 0,
  finalApprovedCount: 0,
};

function cairoToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function blankAccountDraft(): AccountDraft {
  return { documentType: "media_guide", clientId: 0, bundles: [], addons: [], workDate: cairoToday(), accountNote: "" };
}

function blankProductionDraft(): ProductionDraft {
  return { callTime: "", options: [], productionNote: "" };
}

function productionDraftFrom(order: ProductionWorkOrder): ProductionDraft {
  return {
    callTime: order.callTime,
    options: order.productionOptions.map((option) => ({ ...option, price: productionOptionPrice(option) })),
    productionNote: order.productionNote,
  };
}

function productionOptionPrice(option: ProductionCostOption) {
  return option.billingMode === "included" && option.price === 0.1 ? 0 : option.price;
}

function operationDraftFrom(order: ProductionWorkOrder): OperationDraft {
  return {
    clientId: order.clientId,
    bundles: order.bundles.map((bundle) => ({ ...bundle, inputs: [...bundle.inputs], outputs: [...bundle.outputs] })),
    addons: order.addons.map((addon) => ({ ...addon, inputs: [...addon.inputs], outputs: [...addon.outputs] })),
    workDate: order.workDate,
    callTime: order.callTime,
    options: order.productionOptions.map((option) => ({ ...option, price: productionOptionPrice(option) })),
    accountNote: order.accountNote,
    productionNote: order.productionNote,
    operationNote: order.operationNote,
  };
}

const optionLabels: Record<ProductionOptionType, string> = {
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

const optionTypes = Object.keys(optionLabels) as ProductionOptionType[];

function newProductionOption(): ProductionCostOption {
  return { id: crypto.randomUUID(), type: "photographer", crewMemberId: null, name: "", price: 0, billingMode: "included" };
}

function money(value: number) {
  return `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} EGP`;
}

function modelDirectoryLabel(member: ProductionState["crew"][number]) {
  if (member.category !== "model") return "";
  return member.modelNationality === "foreign" ? "Foreign" : "Egyptian";
}

function modelRateSummary(member: ProductionState["crew"][number]) {
  if (member.category !== "model") return "";
  return [
    modelDirectoryLabel(member),
    member.hourlyRate !== null ? `${money(member.hourlyRate)} / hour` : "",
    member.dailyRate !== null ? `${money(member.dailyRate)} / day` : "",
  ].filter(Boolean).join(" · ");
}

function CatalogDetails({ label, name, price, inputs, outputs }: { label: string; name: string; price: number; inputs: string[]; outputs: string[] }) {
  return <article className={styles.catalogDetails}>
    <header><span>{label}</span><strong>{name}</strong><b>{money(price)}</b></header>
    <div><span><small>INPUTS</small>{inputs.length ? inputs.join(" · ") : "—"}</span><span><small>OUTPUTS</small>{outputs.length ? outputs.join(" · ") : "—"}</span></div>
  </article>;
}

function bundleFromCatalog(bundle: ProductionCatalogOption): ProductionWorkOrderBundle {
  return {
    id: `catalog-bundle-${bundle.id}`,
    catalogId: bundle.id,
    name: bundle.name,
    price: bundle.price,
    inputs: [...bundle.inputs],
    outputs: [...bundle.outputs],
    bundleTotal: bundle.bundleTotal,
  };
}

function newBundleSelection(): ProductionWorkOrderBundle {
  return { id: crypto.randomUUID(), catalogId: 0, name: "", price: 0, inputs: [], outputs: [], bundleTotal: null };
}

function BundlesEditor({ available, selected, onChange }: {
  available: ProductionCatalogOption[];
  selected: ProductionWorkOrderBundle[];
  onChange: (bundles: ProductionWorkOrderBundle[]) => void;
}) {
  const selectedIds = new Set(selected.filter((bundle) => bundle.catalogId > 0).map((bundle) => bundle.catalogId));
  const total = selected.reduce((sum, bundle) => sum + Number(bundle.price || 0), 0);
  const patchBundle = (id: string, values: Partial<ProductionWorkOrderBundle>) => onChange(selected.map((bundle) => bundle.id === id ? { ...bundle, ...values } : bundle));
  return <section className={styles.addonsEditor}>
    <header><div><span>BUNDLE BUILDER</span><strong>Add bundles, then customize every detail</strong><small>Choose from your saved bundles and freely edit the name, price, inputs, and outputs for this work order.</small></div><button type="button" className="secondary-button" disabled={!available.some((bundle) => !selectedIds.has(bundle.id)) || selected.length >= 10} onClick={() => onChange([...selected, newBundleSelection()])}><Plus size={15} /> Add new bundle</button></header>
    {selected.length ? <div className={styles.bundleBuilderList}>{selected.map((bundle, index) => {
      const currentAvailable = available.some((item) => item.id === bundle.catalogId);
      return <article className={styles.bundleBuilderRow} key={bundle.id}>
        <span className={styles.customAddonNumber}>BUNDLE {String(index + 1).padStart(2, "0")}</span>
        <label className={styles.bundlePicker}><span>Choose saved bundle</span><select required value={bundle.catalogId || ""} onChange={(event) => {
          const catalogBundle = available.find((item) => item.id === Number(event.target.value));
          if (catalogBundle) onChange(selected.map((item) => item.id === bundle.id ? { ...bundleFromCatalog(catalogBundle), id: bundle.id } : item));
        }}><option value="">Select bundle</option>{!currentAvailable && bundle.catalogId > 0 && <option value={bundle.catalogId}>{bundle.name} · unavailable</option>}{available.map((item) => <option key={item.id} value={item.id} disabled={item.id !== bundle.catalogId && selectedIds.has(item.id)}>{item.name} · {money(item.price)}</option>)}</select></label>
        <label><span>Bundle name</span><input required maxLength={300} value={bundle.name} onChange={(event) => patchBundle(bundle.id, { name: event.target.value })} placeholder="Bundle name" /></label>
        <label><span>Price · EGP</span><input required type="number" min="0" step="0.01" value={Number.isFinite(bundle.price) ? bundle.price : ""} onChange={(event) => patchBundle(bundle.id, { price: Number(event.target.value) })} placeholder="0" /></label>
        <label><span>Inputs <small>One per line</small></span><textarea rows={4} maxLength={3000} value={bundle.inputs.join("\n")} onChange={(event) => patchBundle(bundle.id, { inputs: detailLines(event.target.value) })} placeholder="Photographer&#10;Camera&#10;Model" /></label>
        <label><span>Outputs <small>One per line</small></span><textarea rows={4} maxLength={3000} value={bundle.outputs.join("\n")} onChange={(event) => patchBundle(bundle.id, { outputs: detailLines(event.target.value) })} placeholder="10 edited photos&#10;4 videos" /></label>
        <button type="button" onClick={() => onChange(selected.filter((item) => item.id !== bundle.id))} aria-label={`Remove bundle ${index + 1}`}><Trash2 size={16} /></button>
      </article>;
    })}</div> : <div className={styles.addonsEmpty}>Click “Add new bundle” to choose your first saved bundle.</div>}
    <footer><span>{selected.length} bundle{selected.length === 1 ? "" : "s"} selected</span><strong>{money(total)}</strong></footer>
  </section>;
}

function addonFromCatalog(addon: ProductionCatalogOption): ProductionWorkOrderAddon {
  return {
    id: `catalog-addon-${addon.id}`,
    catalogId: addon.id,
    name: addon.name,
    price: addon.price,
    inputs: [...addon.inputs],
    outputs: [...addon.outputs],
    appliesTo: addon.appliesTo,
    bundleTotal: addon.bundleTotal,
  };
}

function newCustomAddon(): ProductionWorkOrderAddon {
  return { id: crypto.randomUUID(), catalogId: null, name: "", price: 0, inputs: [], outputs: [], appliesTo: "", bundleTotal: null };
}

function detailLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function selectedBundleNames(selected: ProductionWorkOrderBundle[], available: ProductionCatalogOption[]) {
  return new Set(selected.flatMap((bundle) => [
    bundle.name.trim().toLowerCase(),
    available.find((item) => item.id === bundle.catalogId)?.name.trim().toLowerCase() ?? "",
  ]).filter(Boolean));
}

function compatibleAddons(selected: ProductionWorkOrderAddon[], bundles: ProductionWorkOrderBundle[], available: ProductionCatalogOption[]) {
  const names = selectedBundleNames(bundles, available);
  return selected.filter((addon) => !addon.appliesTo || names.has(addon.appliesTo.trim().toLowerCase()));
}

function AddonsEditor({ available, selected, bundleSelected, onChange }: {
  available: ProductionCatalogOption[];
  selected: ProductionWorkOrderAddon[];
  bundleSelected: boolean;
  onChange: (addons: ProductionWorkOrderAddon[]) => void;
}) {
  const selectedCatalogIds = new Set(selected.flatMap((addon) => addon.catalogId ? [addon.catalogId] : []));
  const availableIds = new Set(available.map((addon) => addon.id));
  const catalogChoices = [...available, ...selected.filter((addon) => addon.catalogId && !availableIds.has(addon.catalogId)).map((addon): ProductionCatalogOption => ({
    id: addon.catalogId as number,
    kind: "addon",
    name: addon.name,
    price: addon.price,
    inputs: addon.inputs,
    outputs: addon.outputs,
    appliesTo: addon.appliesTo,
    bundleTotal: addon.bundleTotal,
  }))];
  const customAddons = selected.filter((addon) => addon.catalogId === null);
  const total = selected.reduce((sum, addon) => sum + Number(addon.price || 0), 0);
  const patchCustom = (id: string, values: Partial<ProductionWorkOrderAddon>) => onChange(selected.map((addon) => addon.id === id ? { ...addon, ...values } : addon));
  return <section className={styles.addonsEditor}>
    <header><div><span>ADD-ONS</span><strong>Choose more than one or create a custom item</strong><small>Every selected item is saved separately with its inputs, outputs, and price.</small></div><button type="button" className="secondary-button" disabled={!bundleSelected || selected.length >= 20} onClick={() => onChange([...selected, newCustomAddon()])}><Plus size={15} /> Custom add-on</button></header>
    {!bundleSelected ? <div className={styles.addonsEmpty}>Choose at least one bundle first to see its add-ons.</div> : <>
      {catalogChoices.length ? <div className={styles.addonChoices}>{catalogChoices.map((addon) => {
        const checked = selectedCatalogIds.has(addon.id);
        const unavailable = !availableIds.has(addon.id);
        return <label key={addon.id} className={checked ? styles.addonChoiceSelected : styles.addonChoice}>
          <input type="checkbox" checked={checked} disabled={!checked && selected.length >= 20} onChange={(event) => onChange(event.target.checked
            ? [...selected, addonFromCatalog(addon)]
            : selected.filter((item) => item.catalogId !== addon.id))} />
          <span><strong>{addon.name}</strong><small>{unavailable ? "No longer available · remove or choose another" : addon.inputs.join(" · ") || "Saved add-on"}</small></span><b>{money(addon.price)}</b>
        </label>;
      })}</div> : <div className={styles.addonsEmpty}>No saved add-ons match the selected bundles. You can still add a custom one.</div>}
      {customAddons.length > 0 && <div className={styles.customAddonList}>{customAddons.map((addon, index) => <div className={styles.customAddonRow} key={addon.id}>
        <span className={styles.customAddonNumber}>CUSTOM {String(index + 1).padStart(2, "0")}</span>
        <label><span>Name</span><input required maxLength={300} value={addon.name} onChange={(event) => patchCustom(addon.id, { name: event.target.value })} placeholder="Custom add-on name" /></label>
        <label><span>Price · EGP</span><input required type="number" min="0" step="0.01" value={Number.isFinite(addon.price) ? addon.price : ""} onChange={(event) => patchCustom(addon.id, { price: Number(event.target.value) })} placeholder="0" /></label>
        <label><span>Inputs <small>One per line</small></span><textarea rows={3} maxLength={3000} value={addon.inputs.join("\n")} onChange={(event) => patchCustom(addon.id, { inputs: detailLines(event.target.value) })} placeholder="Photographer&#10;Camera" /></label>
        <label><span>Outputs <small>One per line</small></span><textarea rows={3} maxLength={3000} value={addon.outputs.join("\n")} onChange={(event) => patchCustom(addon.id, { outputs: detailLines(event.target.value) })} placeholder="10 edited photos" /></label>
        <button type="button" onClick={() => onChange(selected.filter((item) => item.id !== addon.id))} aria-label={`Remove custom add-on ${index + 1}`}><Trash2 size={16} /></button>
      </div>)}</div>}
    </>}
    <footer><span>{selected.length} selected</span><strong>{money(total)}</strong></footer>
  </section>;
}

const crewCategoryByOption: Partial<Record<ProductionOptionType, ProductionCrewCategory>> = {
  model: "model",
  photographer: "photographer",
  videographer: "videographer",
};

function ProductionOptionsEditor({ options, crew, modelCatalogUrl, onChange }: {
  options: ProductionCostOption[];
  crew: ProductionState["crew"];
  modelCatalogUrl: string;
  onChange: (options: ProductionCostOption[]) => void;
}) {
  const extraTotal = options.reduce((sum, option) => sum + (option.billingMode === "extra" ? Number(option.price || 0) : 0), 0);
  const patch = (id: string, values: Partial<ProductionCostOption>) => onChange(options.map((option) => option.id === id ? { ...option, ...values } : option));
  return <section className={styles.optionsEditor}>
    <header><div><span>PRODUCTION OPTIONS</span><strong>Add every resource separately</strong><small>Choose whether each price is already included in the bundle or must be billed as an extra.</small></div><button type="button" className="secondary-button" onClick={() => onChange([...options, newProductionOption()])}><Plus size={15} /> Add option</button></header>
    {options.length ? <div className={styles.optionRows}>{options.map((option, index) => {
      const directoryCategory = crewCategoryByOption[option.type];
      const isCameraCrew = directoryCategory === "photographer" || directoryCategory === "videographer";
      const availableCrew = directoryCategory ? crew.filter((member) => member.active && (isCameraCrew
        ? member.category === "photographer" || member.category === "videographer"
        : member.category === directoryCategory)) : [];
      const selectedMember = option.crewMemberId ? crew.find((member) => member.id === option.crewMemberId) : undefined;
      return <div className={styles.optionRow} key={option.id}>
        <span className={styles.optionNumber}>{String(index + 1).padStart(2, "0")}</span>
        <label><span>Option</span><select value={option.type} onChange={(event) => patch(option.id, { type: event.target.value as ProductionOptionType, crewMemberId: null, name: "" })}>{optionTypes.map((type) => <option key={type} value={type}>{optionLabels[type]}</option>)}</select></label>
        <div className={styles.resourceField}>
          {directoryCategory && <label><span>Saved talent / crew</span><select value={option.crewMemberId ? String(option.crewMemberId) : "manual"} onChange={(event) => {
            const crewMemberId = event.target.value === "manual" ? null : Number(event.target.value);
            const member = crew.find((item) => item.id === crewMemberId);
            patch(option.id, { crewMemberId, name: member?.name ?? "" });
          }}><option value="manual">Use someone not listed</option>{availableCrew.map((member) => <option key={member.id} value={member.id}>{member.name}{isCameraCrew ? ` · ${optionLabels[member.category]}` : member.category === "model" ? ` · ${modelDirectoryLabel(member)}` : ""}{member.phone ? ` · ${member.phone}` : ""}</option>)}</select></label>}
          <label><span>Name / details</span><input required maxLength={300} value={option.name} onChange={(event) => patch(option.id, { name: event.target.value })} placeholder={`Enter ${optionLabels[option.type].toLowerCase()} name`} /></label>
          {selectedMember?.phone && <small className={styles.memberPhone}>Saved phone · {selectedMember.phone}</small>}
          {selectedMember?.category === "model" && <small className={styles.memberRate}>{modelRateSummary(selectedMember)}</small>}
          {option.type === "model" && (selectedMember?.profileUrl || modelCatalogUrl) && <div className={styles.catalogueHint}><span>Need to check the model first?</span>{selectedMember?.profileUrl && <a href={selectedMember.profileUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> View {selectedMember.name}&apos;s portfolio</a>}{modelCatalogUrl && <a href={modelCatalogUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open model catalogue</a>}</div>}
        </div>
        <label><span>Price treatment</span><select value={option.billingMode} onChange={(event) => patch(option.id, { billingMode: event.target.value as ProductionCostOption["billingMode"] })}><option value="included">Included in bundle</option><option value="extra">Extra cost</option></select></label>
        <label><span>{option.billingMode === "extra" ? "Extra price" : "Resource price"} · EGP</span><input required type="number" min="0" step="0.01" value={Number.isFinite(option.price) ? option.price : ""} onChange={(event) => patch(option.id, { price: Number(event.target.value) })} placeholder="0" /></label>
        <button type="button" className={styles.removeOption} onClick={() => onChange(options.filter((item) => item.id !== option.id))} aria-label="Remove production option"><Trash2 size={16} /></button>
      </div>;
    })}</div> : <div className={styles.noOptions}><Plus size={18} /><span>No production options yet. Press <strong>Add option</strong> to start.</span></div>}
    <footer><span>Extra amount added to bundle <small>Included resources do not increase the invoice</small></span><strong>{money(extraTotal)}</strong></footer>
  </section>;
}

function prettyDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function createdDate(value: string) {
  const parsed = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function statusLabel(order: ProductionWorkOrder) {
  if (order.status === "pending_production") return "Waiting for Production Manager";
  if (order.status === "pending_operations") return "Waiting for Operation Manager";
  return "Final approved";
}

function roleLabel(role: ProductionState["role"]) {
  if (role === "account_manager") return "Account Manager";
  if (role === "production_manager") return "Production Manager";
  if (role === "operation_manager") return "Operation Manager";
  if (role === "administrator") return "Administrator";
  return "Production viewer";
}

function WorkflowModal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  return <div className={styles.modalLayer} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={styles.modalCard} role="dialog" aria-modal="true" aria-label={title}>
      <header><div><span>FMG PRODUCTION WORKFLOW</span><h2>{title}</h2><p>{description}</p></div><button type="button" onClick={onClose} aria-label="Close"><X size={19} /></button></header>
      {children}
    </section>
  </div>;
}

function ValueField({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div className={styles.valueField}><span>{icon}{label}</span><strong>{value || "—"}</strong></div>;
}

export function WorkOrderPanel({ showToast, onWorkspaceChanged, onOpenDraftInvoice }: {
  showToast: (message: string) => void;
  onWorkspaceChanged?: () => Promise<void>;
  onOpenDraftInvoice?: (invoiceId: number) => void;
}) {
  const [state, setState] = useState<ProductionState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [completing, setCompleting] = useState<ProductionWorkOrder | null>(null);
  const [reviewing, setReviewing] = useState<ProductionWorkOrder | null>(null);
  const [adminEditing, setAdminEditing] = useState<ProductionWorkOrder | null>(null);
  const [previewOrder, setPreviewOrder] = useState<ProductionWorkOrder | null>(null);
  const [filter, setFilter] = useState<"all" | ProductionWorkOrder["status"]>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "production_date">("newest");
  const [expandedOrderIds, setExpandedOrderIds] = useState<number[]>([]);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [accountDraft, setAccountDraft] = useState<AccountDraft>(blankAccountDraft);
  const [productionDraft, setProductionDraft] = useState<ProductionDraft>(blankProductionDraft);
  const [operationDraft, setOperationDraft] = useState<OperationDraft | null>(null);
  const [adminDraft, setAdminDraft] = useState<OperationDraft | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/production", { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as ProductionState | { error?: string };
      if (!response.ok) throw new Error("error" in result && result.error ? result.error : "Could not load production work orders.");
      if (!cancelled) setState(result as ProductionState);
    }).catch((error: unknown) => {
      if (!cancelled) showToast(error instanceof Error ? error.message : "Could not load production work orders.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // Loading is tied to mounting this permission-protected page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!previewOrder) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !downloadingPdf) setPreviewOrder(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [downloadingPdf, previewOrder]);

  const bundles = useMemo(() => state.catalog.filter((item) => item.kind === "package"), [state.catalog]);
  const addons = useMemo(() => state.catalog.filter((item) => item.kind === "addon"), [state.catalog]);
  const matchingAddons = useMemo(() => {
    const selectedNames = selectedBundleNames(accountDraft.bundles, bundles);
    return addons.filter((item) => !item.appliesTo || selectedNames.has(item.appliesTo.toLowerCase()));
  }, [accountDraft.bundles, addons, bundles]);
  const operationAddons = useMemo(() => {
    const selectedNames = selectedBundleNames(operationDraft?.bundles ?? [], bundles);
    return addons.filter((item) => !item.appliesTo || selectedNames.has(item.appliesTo.toLowerCase()));
  }, [addons, bundles, operationDraft?.bundles]);
  const adminAddons = useMemo(() => {
    const selectedNames = selectedBundleNames(adminDraft?.bundles ?? [], bundles);
    return addons.filter((item) => !item.appliesTo || selectedNames.has(item.appliesTo.toLowerCase()));
  }, [addons, adminDraft?.bundles, bundles]);
  const visibleOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matches = state.orders.filter((order) => {
      if (filter !== "all" && order.status !== filter) return false;
      if (dateFrom && order.workDate < dateFrom) return false;
      if (dateTo && order.workDate > dateTo) return false;
      if (!query) return true;
      return [order.code, order.clientName, order.bundles.map((bundle) => bundle.name).join(" "), order.addons.map((addon) => addon.name).join(" "), order.createdByName, order.productionManagerName, order.operationManagerName]
        .some((value) => value.toLowerCase().includes(query));
    });
    return [...matches].sort((left, right) => sortOrder === "production_date"
      ? left.workDate.localeCompare(right.workDate) || right.createdAt.localeCompare(left.createdAt)
      : right.createdAt.localeCompare(left.createdAt));
  }, [dateFrom, dateTo, filter, searchQuery, sortOrder, state.orders]);
  const canCreate = state.role === "account_manager" || state.role === "operation_manager" || state.role === "administrator";
  const canComplete = state.role === "production_manager" || state.role === "operation_manager" || state.role === "administrator";
  const canFinalApprove = state.role === "operation_manager" || state.role === "administrator";
  const canManagerEdit = state.role === "operation_manager" || state.role === "administrator";

  function toggleOrderDetails(orderId: number) {
    setExpandedOrderIds((current) => current.includes(orderId)
      ? []
      : [orderId]);
  }

  async function mutate(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const response = await fetch("/api/production", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as ProductionState | { error?: string };
      if (!response.ok) throw new Error("error" in result && result.error ? result.error : "Could not save this work order.");
      setState(result as ProductionState);
      return result as ProductionState;
    } finally {
      setSaving(false);
    }
  }

  async function createOrder(event: React.FormEvent) {
    event.preventDefault();
    if (!accountDraft.clientId || !accountDraft.bundles.length || !accountDraft.workDate) return showToast("Choose the client, at least one bundle, and production date.");
    const confirmed = window.confirm("تأكيد إرسال أمر الشغل؟ بعد الإرسال لن يمكنك تعديله أو إلغاؤه، وسيصل مباشرة إلى Production Manager.\n\nConfirm submission? You cannot edit or cancel this work order after sending it.");
    if (!confirmed) return;
    try {
      await mutate({ action: "create", data: accountDraft });
      setAccountDraft(blankAccountDraft());
      setCreateOpen(false);
      setFilter("all");
      showToast("Work order approved and sent to the Production Manager. It is now locked.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not submit the work order.");
    }
  }

  function openCompletion(order: ProductionWorkOrder) {
    setCompleting(order);
    setProductionDraft(productionDraftFrom(order));
  }

  async function completeOrder(event: React.FormEvent) {
    event.preventDefault();
    if (!completing) return;
    if (!productionDraft.options.length) return showToast("Add at least one production option.");
    const confirmed = window.confirm("تأكيد اعتماد بيانات الإنتاج؟ بعد الاعتماد سيصل أمر الشغل إلى Operation Manager ولن يمكنك تعديله أو إلغاؤه.\n\nConfirm production approval? This action is final and cannot be edited or cancelled.");
    if (!confirmed) return;
    try {
      const nextState = await mutate({ action: "complete", id: completing.id, data: productionDraft });
      setCompleting(null);
      setProductionDraft(blankProductionDraft());
      setFilter(nextState.orders.some((order) => order.id === completing.id && order.status === "pending_operations") ? "pending_operations" : "all");
      showToast("Production details approved and delivered to the Operation Manager. The order is now locked.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not approve the production details.");
    }
  }

  function openFinalReview(order: ProductionWorkOrder) {
    setReviewing(order);
    setOperationDraft(operationDraftFrom(order));
  }

  async function finalApproveOrder(event: React.FormEvent) {
    event.preventDefault();
    if (!reviewing || !operationDraft) return;
    if (!operationDraft.clientId || !operationDraft.bundles.length || !operationDraft.workDate) return showToast("Choose the client, at least one bundle, and production date.");
    if (!operationDraft.options.length) return showToast("Add at least one production option before final approval.");
    const confirmed = window.confirm("تأكيد الاعتماد النهائي؟ بعد الاعتماد لن يتمكن أي مستخدم من تعديل أو إلغاء أمر الشغل، وسيصبح جاهزًا للطباعة.\n\nConfirm final approval? No user can edit or cancel this work order afterwards.");
    if (!confirmed) return;
    try {
      const nextState = await mutate({ action: "finalApprove", id: reviewing.id, data: operationDraft });
      const approved = nextState.orders.find((order) => order.id === reviewing.id) ?? null;
      setReviewing(null);
      setOperationDraft(null);
      setPreviewOrder(approved);
      setFilter("final_approved");
      await onWorkspaceChanged?.();
      showToast(`Final approval completed. Draft invoice ${approved?.draftInvoiceCode || "created"} is ready for review.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not give final approval.");
    }
  }

  function openAdminEdit(order: ProductionWorkOrder) {
    setAdminEditing(order);
    setAdminDraft(operationDraftFrom(order));
  }

  async function saveAdminEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!adminEditing || !adminDraft) return;
    if (!adminDraft.clientId || !adminDraft.bundles.length || !adminDraft.workDate) return showToast("Choose the client, at least one bundle, and production date.");
    const confirmed = window.confirm("Save these manager corrections? The work order will stay in its current approval stage.");
    if (!confirmed) return;
    try {
      const nextState = await mutate({ action: "managerEdit", id: adminEditing.id, data: adminDraft });
      const editedOrder = nextState.orders.find((order) => order.id === adminEditing.id);
      if (adminEditing.status === "final_approved") await onWorkspaceChanged?.();
      if (previewOrder?.id === adminEditing.id && editedOrder) setPreviewOrder(editedOrder);
      setAdminEditing(null);
      setAdminDraft(null);
      showToast(`${adminEditing.code} was updated and remains ${statusLabel(adminEditing)}.${adminEditing.status === "final_approved" ? " Its linked Draft invoice was synchronized." : ""}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not edit the work order.");
    }
  }

  async function deleteOrder(order: ProductionWorkOrder) {
    const invoiceNote = order.draftInvoiceId ? "\n\nThe linked Draft invoice will remain available in Invoices." : "";
    if (!window.confirm(`Delete ${order.code} for ${order.clientName}? This cannot be undone.${invoiceNote}`)) return;
    try {
      await mutate({ action: "delete", id: order.id });
      setExpandedOrderIds((current) => current.filter((id) => id !== order.id));
      if (previewOrder?.id === order.id) setPreviewOrder(null);
      if (reviewing?.id === order.id) { setReviewing(null); setOperationDraft(null); }
      if (adminEditing?.id === order.id) { setAdminEditing(null); setAdminDraft(null); }
      if (completing?.id === order.id) setCompleting(null);
      showToast(`${order.code} was deleted. ${order.draftInvoiceId ? "Its Draft invoice was kept." : ""}`.trim());
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not delete the work order.");
    }
  }

  function printWorkOrder() {
    if (!previewOrder) return;
    const cleanup = () => document.body.classList.remove("work-order-printing");
    document.body.classList.add("work-order-printing");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 30_000);
  }

  async function downloadWorkOrder() {
    if (!previewOrder || !sheetRef.current || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const images = Array.from(sheetRef.current.querySelectorAll("img"));
      await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(sheetRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const document = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      const pageWidth = document.internal.pageSize.getWidth();
      const pageHeight = document.internal.pageSize.getHeight();
      document.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
      const filename = `${previewOrder.code.replace(/[^A-Za-z0-9_-]+/g, "-")}-${previewOrder.clientName.replace(/[^A-Za-z0-9_-]+/g, "-")}.pdf`;
      document.save(filename);
      showToast(`${previewOrder.code} downloaded as PDF.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not download this work order.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  if (loading) return <section className={styles.loading}><LoaderCircle size={28} /><h2>Loading Production…</h2><p>Preparing the work-order inbox.</p></section>;

  return <section className={styles.workspace}>
    <div className={styles.workflowHeader}>
      <div className={styles.roleCard}><span><FileCheck2 size={18} /></span><div><small>YOUR WORKFLOW ROLE</small><strong>{roleLabel(state.role)}</strong><p>Submitted stages stay locked for their sender; Operations and Admin can correct them.</p></div></div>
      <div className={styles.stageStats}>
        <article><span className={styles.pendingDot} /><div><small>PRODUCTION INBOX</small><strong>{state.pendingProductionCount}</strong></div></article>
        <article><span className={styles.operationsDot} /><div><small>OPERATIONS REVIEW</small><strong>{state.pendingOperationsCount}</strong></div></article>
        <article><span className={styles.readyDot} /><div><small>FINAL APPROVED</small><strong>{state.finalApprovedCount}</strong></div></article>
      </div>
      {canCreate && <button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={16} /> New work order</button>}
    </div>

    {state.role === "viewer" && <div className={styles.roleWarning}><LockKeyhole size={21} /><div><strong>Production role is not configured</strong><p>Ask the administrator to set this account&apos;s role to Account Manager, Production Manager, or Operation Manager.</p></div></div>}

    <section className={styles.inboxPanel}>
      <div className={styles.inboxHeading}><div><span>PRODUCTION PIPELINE</span><h2>Media Guide work orders</h2><p>Account submission → Production completion → Operations review → Final approval</p></div><div className={styles.filters}>
        <button className={filter === "all" ? styles.active : ""} onClick={() => setFilter("all")}>All <span>{state.orders.length}</span></button>
        <button className={filter === "pending_production" ? styles.active : ""} onClick={() => setFilter("pending_production")}>Production <span>{state.pendingProductionCount}</span></button>
        <button className={filter === "pending_operations" ? styles.active : ""} onClick={() => setFilter("pending_operations")}>Operations <span>{state.pendingOperationsCount}</span></button>
        <button className={filter === "final_approved" ? styles.active : ""} onClick={() => setFilter("final_approved")}>Final <span>{state.finalApprovedCount}</span></button>
      </div></div>

      <div className={styles.orderToolbar}>
        <label className={styles.orderSearch}><Search size={16} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by client, order code, bundle, or manager…" aria-label="Search work orders" />{searchQuery && <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear work-order search"><X size={14} /></button>}</label>
        <div className={styles.dateRange} aria-label="Filter work orders by production date">
          <label><span>FROM</span><input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} aria-label="Work orders from date" /></label>
          <ArrowRight size={14} />
          <label><span>TO</span><input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} aria-label="Work orders to date" /></label>
          {(dateFrom || dateTo) && <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }} aria-label="Clear date range"><X size={14} /></button>}
        </div>
        <label className={styles.orderSort}><ListFilter size={15} /><span>Sort</span><select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}><option value="newest">Newest first</option><option value="production_date">Production date</option></select></label>
        <span className={styles.resultCount}><strong>{visibleOrders.length}</strong> {visibleOrders.length === 1 ? "order" : "orders"} shown</span>
      </div>

      {visibleOrders.length ? <div className={styles.orderGrid}>{visibleOrders.map((order) => {
        const pending = order.status === "pending_production";
        const pendingOperations = order.status === "pending_operations";
        const finalApproved = order.status === "final_approved";
        const expanded = expandedOrderIds.includes(order.id);
        return <article key={order.id} className={`${styles.orderCard} ${pending ? styles.cardPending : pendingOperations ? styles.cardOperations : styles.cardReady}`}>
          <header className={`${styles.orderCardHeader} ${expanded ? styles.orderCardHeaderOpen : ""}`}>
            <button type="button" className={styles.orderCardToggle} aria-expanded={expanded} aria-controls={`work-order-details-${order.id}`} onClick={() => toggleOrderDetails(order.id)}>
              <div className={styles.orderIdentity}><span className={pending ? styles.statusPending : pendingOperations ? styles.statusOperations : styles.statusReady}>{finalApproved ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}{statusLabel(order)}</span><div><h3>{order.clientName}</h3><span className={styles.orderCode}>{order.code}</span></div><p>Media Guide work order</p></div>
              <div className={styles.orderDates}>
                <div className={styles.orderSchedule}><CalendarDays size={18} /><span><small>PRODUCTION DATE</small><strong>{prettyDate(order.workDate)}</strong>{!pending && order.callTime && <em><Clock3 size={11} /> {order.callTime}</em>}</span></div>
                <div className={styles.orderSchedule}><NotebookPen size={18} /><span><small>ORDER CREATED</small><strong>{createdDate(order.createdAt)}</strong><em>By {order.createdByName || "Account Manager"}</em></span></div>
              </div>
              <span className={styles.locked}><LockKeyhole size={14} /> {finalApproved ? canManagerEdit ? "Final · editable" : "Final locked" : "Stage locked"}</span>
              <span className={styles.expandControl}><span>{expanded ? "Hide details" : "View details"}</span><ChevronDown className={expanded ? styles.chevronOpen : ""} size={18} /></span>
            </button>
          </header>

          {expanded && <div id={`work-order-details-${order.id}`} className={styles.orderDetails}>
          <div className={styles.orderScope}>
            <div><PackageCheck size={17} /><span><small>BUNDLES</small><strong>{order.bundles.length === 1 ? order.bundles[0].name : `${order.bundles.length} bundles selected`}</strong><em>{money(order.bundlesTotal)}</em></span></div>
            <div><Plus size={17} /><span><small>ADD-ONS</small><strong>{order.addons.length ? `${order.addons.length} selected` : "No add-ons selected"}</strong><em>{order.addons.length ? money(order.addonsTotal) : "Not added"}</em></span></div>
            <div className={styles.totalScope}><CircleDollarSign size={17} /><span><small>WORK ORDER TOTAL</small><strong>{money(order.workOrderTotal)}</strong><em>{order.productionOptionsTotal ? `${money(order.productionOptionsTotal)} extra production` : "No extra production cost"}</em></span></div>
          </div>

          <div className={styles.workflowTrack} aria-label="Work-order approval route">
            <div className={styles.stepComplete}><i>1</i><span><small>ACCOUNT</small><strong>{order.createdByName || "Account Manager"}</strong><em>Submitted</em></span></div><ArrowRight size={15} />
            <div className={pending ? styles.stepCurrent : styles.stepComplete}><i>2</i><span><small>PRODUCTION</small><strong>{pending ? "Action required" : order.productionManagerName || "Production Manager"}</strong><em>{pending ? "Waiting for completion" : "Approved"}</em></span></div><ArrowRight size={15} />
            <div className={pendingOperations ? styles.stepCurrent : finalApproved ? styles.stepComplete : styles.stepWaiting}><i>3</i><span><small>OPERATIONS</small><strong>{finalApproved ? order.operationManagerName || "Operation Manager" : pendingOperations ? "Action required" : "Operation Manager"}</strong><em>{finalApproved ? "Final approved" : pendingOperations ? "Waiting for review" : "Next stage"}</em></span></div>
          </div>

          {order.accountNote && <p className={styles.cardNote}><NotebookPen size={14} /><span><strong>Account note</strong>{order.accountNote}</span></p>}
          {!pending && <section className={styles.productionSummary}><header><span><UsersRound size={15} /> PRODUCTION RESOURCES</span><strong>{order.productionOptions.length} assigned</strong></header><div>{order.productionOptions.slice(0, 5).map((option) => <span key={option.id}><small>{optionLabels[option.type]}</small><strong>{option.name}</strong><em>{option.billingMode === "extra" ? `${money(option.price)} extra` : "Included"}</em></span>)}{order.productionOptions.length > 5 && <span className={styles.moreResources}><strong>+{order.productionOptions.length - 5}</strong><small>more resources</small></span>}</div></section>}
          {finalApproved && order.draftInvoiceCode && <div className={styles.invoiceDraftBadge}><FileCheck2 size={15} /><span><small>DRAFT INVOICE CREATED</small><strong>{order.draftInvoiceCode}</strong></span></div>}
          <footer>
            <small>{pending ? `Submitted ${order.accountSubmittedAt.slice(0, 10)}` : pendingOperations ? `Production approved by ${order.productionManagerName}` : `Final approved by ${order.operationManagerName}`}</small>
            <div>
              {pending && canComplete && <button className={styles.completeButton} onClick={() => openCompletion(order)}><FileCheck2 size={15} /> Complete & approve</button>}
              {pendingOperations && canFinalApprove && <button className={styles.completeButton} onClick={() => openFinalReview(order)}><FileCheck2 size={15} /> Review & final approve</button>}
              {canManagerEdit && <button className={styles.previewButton} onClick={() => openAdminEdit(order)}><Pencil size={15} /> Edit work order</button>}
              {finalApproved && <button className={styles.previewButton} onClick={() => setPreviewOrder(order)}><Eye size={15} /> Open final order</button>}
              {finalApproved && order.draftInvoiceId && onOpenDraftInvoice && <button className={styles.completeButton} onClick={() => onOpenDraftInvoice(order.draftInvoiceId!)}><FileCheck2 size={15} /> Open Draft invoice</button>}
              {state.role === "administrator" && <button className={styles.deleteButton} disabled={saving} onClick={() => void deleteOrder(order)}><Trash2 size={15} /> Delete</button>}
            </div>
          </footer>
          </div>}
        </article>;
      })}</div> : <div className={styles.empty}><Inbox size={27} /><h3>No work orders in this view</h3><p>{canCreate ? "Create the first Media Guide work order and send it to Production." : "New work orders will appear here when they reach your workflow stage."}</p>{canCreate && <button className="small-primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> New work order</button>}</div>}
    </section>

    {previewOrder && <div className={styles.previewModalLayer} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !downloadingPdf && setPreviewOrder(null)}>
      <section className={styles.previewModalCard} role="dialog" aria-modal="true" aria-label={`Final work order ${previewOrder.code}`}>
        <div className={styles.previewToolbar}><div><span>FINAL PRODUCTION DOCUMENT</span><strong>{previewOrder.code} · {previewOrder.clientName}</strong></div><div><button className="primary-button" disabled={downloadingPdf} onClick={() => void downloadWorkOrder()}>{downloadingPdf ? <><LoaderCircle size={16} /> Preparing PDF…</> : <><Download size={16} /> Download PDF</>}</button><button className="secondary-button" onClick={printWorkOrder}><Printer size={16} /> Print</button><button className="secondary-button" disabled={downloadingPdf} onClick={() => setPreviewOrder(null)}><X size={15} /> Close</button></div></div>
        <div className={styles.previewModalBody}><div className={styles.sheetFrame}>
        <article ref={sheetRef} className={styles.sheet} aria-label="Final Media Guide production work order">
          <header className={styles.sheetHeader}>
            <div className={styles.brand}><Image src="/fmg-logo-light.png" alt="FMG Agency" width={380} height={130} unoptimized priority /></div>
            <div className={styles.documentTitle}><span>CLIENT SERVICE DOCUMENT</span><h2>MEDIA GUIDE</h2><p>PRODUCTION WORK ORDER</p></div>
            <div />
          </header>
          <div className={styles.sheetBody}>
            <section className={styles.clientRow}><div className={styles.sectionNumber}>01</div><ValueField icon={<UserRound size={14} />} label="CLIENT NAME" value={previewOrder.clientName} /><div className={styles.mediaTag}><span>DRAFT INVOICE</span><strong>{previewOrder.draftInvoiceCode || "PENDING"}</strong></div></section>
            <section className={styles.formSection}><div className={styles.sectionHeading}><span>02</span><div><strong>Schedule & total</strong><small>Final approved work-order value</small></div></div><div className={styles.detailsGrid}>
              <ValueField label="DATE" value={prettyDate(previewOrder.workDate)} /><ValueField label="CALL TIME" value={previewOrder.callTime} /><ValueField label="TOTAL · EGP" value={money(previewOrder.workOrderTotal)} />
            </div></section>
            <section className={styles.formSection}><div className={styles.sectionHeading}><span>03</span><div><strong>Scope & pricing</strong><small>Bundles and add-on inputs, outputs, and prices</small></div></div><table className={styles.scopeTable}><thead><tr><th>TYPE</th><th>NAME</th><th>INPUTS</th><th>OUTPUTS</th><th>PRICE · EGP</th></tr></thead><tbody>{previewOrder.bundles.map((bundle) => <tr key={bundle.id}><td>BUNDLE</td><td>{bundle.name}</td><td>{bundle.inputs.join(" · ") || "—"}</td><td>{bundle.outputs.join(" · ") || "—"}</td><td>{money(bundle.price)}</td></tr>)}{previewOrder.addons.map((addon) => <tr key={addon.id}><td>{addon.catalogId ? "ADD-ON" : "CUSTOM"}</td><td>{addon.name}</td><td>{addon.inputs.join(" · ") || "—"}</td><td>{addon.outputs.join(" · ") || "—"}</td><td>{money(addon.price)}</td></tr>)}</tbody></table></section>
            <section className={styles.formSection}><div className={styles.sectionHeading}><span>04</span><div><strong>Production options</strong><small>Approved resources and their billing treatment</small></div></div><table className={styles.optionsTable}><thead><tr><th>#</th><th>OPTION</th><th>NAME / DETAILS</th><th>TREATMENT</th><th>PRICE · EGP</th></tr></thead><tbody>{previewOrder.productionOptions.map((option, index) => <tr key={option.id}><td>{index + 1}</td><td>{optionLabels[option.type]}</td><td>{option.name}</td><td><span className={option.billingMode === "extra" ? styles.extraTreatment : styles.includedTreatment}>{option.billingMode === "extra" ? "EXTRA COST" : "INCLUDED IN BUNDLE"}</span></td><td>{money(productionOptionPrice(option))}</td></tr>)}</tbody><tfoot><tr><td colSpan={4}>EXTRA PRODUCTION CHARGES</td><td>{money(previewOrder.productionOptionsTotal)}</td></tr></tfoot></table></section>
            <section className={`${styles.formSection} ${styles.notesSection}`}><div className={styles.sectionHeading}><span>05</span><div><strong>Additional notes</strong><small>Final instructions approved by Operations</small></div></div><div className={styles.finalNotes}><span>NOTES</span><p><strong>Account Manager:</strong> {previewOrder.accountNote || "—"}</p><p><strong>Production Manager:</strong> {previewOrder.productionNote || "—"}</p><p className={styles.operationNote}><strong>Operation Manager:</strong> {previewOrder.operationNote || "—"}</p></div></section>
          </div>
          <footer className={styles.sheetFooter}><span>FMG AGENCY<br /><strong>MEDIA GUIDE PRODUCTION</strong></span><p><small>INSTRUCTION</small>Keep this work order with the production team on the shoot day.</p><strong><small>STATUS</small>FINAL APPROVED</strong></footer>
        </article>
        </div></div>
      </section>
    </div>}

    {createOpen && <WorkflowModal title="Create Media Guide work order" description="Account Manager stage · every field below becomes read-only after submission." onClose={() => !saving && setCreateOpen(false)}>
      <form className={styles.workflowForm} onSubmit={createOrder}>
        <div className={styles.formGrid}>
          <label><span>Work order type</span><select value={accountDraft.documentType} disabled><option value="media_guide">Media Guide work order</option></select></label>
          <label><span>Client</span><select required value={accountDraft.clientId || ""} onChange={(event) => setAccountDraft({ ...accountDraft, clientId: Number(event.target.value) })}><option value="">Choose client</option>{state.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <label><span>Production date</span><input required type="date" min={cairoToday()} value={accountDraft.workDate} onChange={(event) => setAccountDraft({ ...accountDraft, workDate: event.target.value })} /></label>
          <div className={styles.wide}><BundlesEditor available={bundles} selected={accountDraft.bundles} onChange={(selectedBundles) => setAccountDraft((current) => ({ ...current, bundles: selectedBundles, addons: compatibleAddons(current.addons, selectedBundles, bundles) }))} /></div>
          <div className={styles.wide}><AddonsEditor available={matchingAddons} selected={accountDraft.addons} bundleSelected={Boolean(accountDraft.bundles.length)} onChange={(selectedAddons) => setAccountDraft({ ...accountDraft, addons: selectedAddons })} /></div>
          <label className={styles.wide}><span>Account Manager note <small>Optional</small></span><textarea rows={4} maxLength={5000} value={accountDraft.accountNote} onChange={(event) => setAccountDraft({ ...accountDraft, accountNote: event.target.value })} placeholder="Add client instructions, references, or anything Production should know." /></label>
        </div>
        <div className={styles.finalWarning}><LockKeyhole size={18} /><span><strong>Final submission</strong><small>After approval, you cannot edit or cancel this work order.</small></span></div>
        <footer><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)} disabled={saving}>Back</button><button className="primary-button" disabled={saving}>{saving ? <><LoaderCircle size={16} /> Sending…</> : <><Send size={16} /> Approve & send to Production</>}</button></footer>
      </form>
    </WorkflowModal>}

    {completing && <WorkflowModal title={`Complete ${completing.code}`} description={`${completing.clientName} · ${completing.bundles.length} bundle${completing.bundles.length === 1 ? "" : "s"} · ${prettyDate(completing.workDate)}`} onClose={() => !saving && setCompleting(null)}>
      <div className={styles.lockedScope}><LockKeyhole size={16} /><span><strong>Account Manager fields are locked</strong><small>{completing.bundles.length} bundle{completing.bundles.length === 1 ? "" : "s"}{completing.addons.length ? ` + ${completing.addons.length} add-on${completing.addons.length === 1 ? "" : "s"}` : ""} · {money(completing.bundlesTotal + completing.addonsTotal)}</small></span></div>
      <form className={styles.workflowForm} onSubmit={completeOrder}>
        <div className={styles.formGrid}>
          <label><span>Call time</span><input required type="time" value={productionDraft.callTime} onChange={(event) => setProductionDraft({ ...productionDraft, callTime: event.target.value })} /></label>
          {completing.bundles.map((bundle, index) => <div className={styles.wide} key={bundle.id}><CatalogDetails label={`BUNDLE ${index + 1}`} name={bundle.name} price={bundle.price} inputs={bundle.inputs} outputs={bundle.outputs} /></div>)}
          {completing.addons.map((addon, index) => <div className={styles.wide} key={addon.id}><CatalogDetails label={addon.catalogId ? `ADD-ON ${index + 1}` : `CUSTOM ${index + 1}`} name={addon.name} price={addon.price} inputs={addon.inputs} outputs={addon.outputs} /></div>)}
          <div className={styles.wide}><ProductionOptionsEditor options={productionDraft.options} crew={state.crew} modelCatalogUrl={state.modelCatalogUrl} onChange={(options) => setProductionDraft({ ...productionDraft, options })} /></div>
          <label className={styles.wide}><span>Production Manager note <small>Optional</small></span><textarea rows={4} maxLength={5000} value={productionDraft.productionNote} onChange={(event) => setProductionDraft({ ...productionDraft, productionNote: event.target.value })} placeholder="Add production instructions, equipment notes, or special arrangements." /></label>
        </div>
        <div className={styles.finalWarning}><LockKeyhole size={18} /><span><strong>Final production approval</strong><small>After approval, the order goes to Operation Manager and cannot be edited or cancelled.</small></span></div>
        <footer><button type="button" className="secondary-button" onClick={() => setCompleting(null)} disabled={saving}>Back</button><button className="primary-button" disabled={saving}>{saving ? <><LoaderCircle size={16} /> Approving…</> : <><CheckCircle2 size={16} /> Approve & send to Operations</>}</button></footer>
      </form>
    </WorkflowModal>}

    {adminEditing && adminDraft && <WorkflowModal title={`${state.role === "administrator" ? "Administrator" : "Operations"} edit · ${adminEditing.code}`} description={`Correct Account, Production, or Operations data while keeping ${statusLabel(adminEditing)} as the current workflow stage.${adminEditing.status === "final_approved" ? " The linked Draft invoice will be synchronized." : ""}`} onClose={() => !saving && setAdminEditing(null)}>
      <form className={styles.workflowForm} onSubmit={saveAdminEdit}>
        <div className={styles.formGrid}>
          <label><span>Work order type</span><select value="media_guide" disabled><option value="media_guide">Media Guide work order</option></select></label>
          <label><span>Client</span><select required value={adminDraft.clientId || ""} onChange={(event) => setAdminDraft({ ...adminDraft, clientId: Number(event.target.value) })}><option value="">Choose client</option>{state.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <label><span>Production date</span><input required type="date" value={adminDraft.workDate} onChange={(event) => setAdminDraft({ ...adminDraft, workDate: event.target.value })} /></label>
          <label><span>Call time <small>Optional before Production completes</small></span><input type="time" value={adminDraft.callTime} onChange={(event) => setAdminDraft({ ...adminDraft, callTime: event.target.value })} /></label>
          <div className={styles.wide}><BundlesEditor available={bundles} selected={adminDraft.bundles} onChange={(selectedBundles) => setAdminDraft((current) => current ? ({ ...current, bundles: selectedBundles, addons: compatibleAddons(current.addons, selectedBundles, bundles) }) : current)} /></div>
          <div className={styles.wide}><AddonsEditor available={adminAddons} selected={adminDraft.addons} bundleSelected={Boolean(adminDraft.bundles.length)} onChange={(selectedAddons) => setAdminDraft({ ...adminDraft, addons: selectedAddons })} /></div>
          <div className={styles.wide}><ProductionOptionsEditor options={adminDraft.options} crew={state.crew} modelCatalogUrl={state.modelCatalogUrl} onChange={(options) => setAdminDraft({ ...adminDraft, options })} /></div>
          <label className={styles.wide}><span>Account Manager note <small>Manager correction</small></span><textarea rows={3} maxLength={5000} value={adminDraft.accountNote} onChange={(event) => setAdminDraft({ ...adminDraft, accountNote: event.target.value })} /></label>
          <label className={styles.wide}><span>Production Manager note <small>Manager correction</small></span><textarea rows={3} maxLength={5000} value={adminDraft.productionNote} onChange={(event) => setAdminDraft({ ...adminDraft, productionNote: event.target.value })} /></label>
          <label className={styles.wide}><span>Operation Manager note <small>Manager correction</small></span><textarea rows={3} maxLength={5000} value={adminDraft.operationNote} onChange={(event) => setAdminDraft({ ...adminDraft, operationNote: event.target.value })} /></label>
        </div>
        <div className={styles.finalWarning}><Pencil size={18} /><span><strong>Authorized manager correction</strong><small>Saving updates the order without changing its approval stage.{adminEditing.status === "final_approved" ? " The linked Draft invoice updates automatically." : ""}</small></span></div>
        <footer><button type="button" className="secondary-button" onClick={() => setAdminEditing(null)} disabled={saving}>Back</button><button className="primary-button" disabled={saving}>{saving ? <><LoaderCircle size={16} /> Saving…</> : <><CheckCircle2 size={16} /> Save corrections</>}</button></footer>
      </form>
    </WorkflowModal>}

    {reviewing && operationDraft && <WorkflowModal title={`Final review · ${reviewing.code}`} description="Operation Manager stage · review and edit every work-order field before the final lock." onClose={() => !saving && setReviewing(null)}>
      <form className={styles.workflowForm} onSubmit={finalApproveOrder}>
        <div className={styles.formGrid}>
          <label><span>Work order type</span><select value="media_guide" disabled><option value="media_guide">Media Guide work order</option></select></label>
          <label><span>Client</span><select required value={operationDraft.clientId || ""} onChange={(event) => setOperationDraft({ ...operationDraft, clientId: Number(event.target.value) })}><option value="">Choose client</option>{state.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <label><span>Production date</span><input required type="date" value={operationDraft.workDate} onChange={(event) => setOperationDraft({ ...operationDraft, workDate: event.target.value })} /></label>
          <label><span>Call time</span><input required type="time" value={operationDraft.callTime} onChange={(event) => setOperationDraft({ ...operationDraft, callTime: event.target.value })} /></label>
          <div className={styles.wide}><BundlesEditor available={bundles} selected={operationDraft.bundles} onChange={(selectedBundles) => setOperationDraft((current) => current ? ({ ...current, bundles: selectedBundles, addons: compatibleAddons(current.addons, selectedBundles, bundles) }) : current)} /></div>
          <div className={styles.wide}><AddonsEditor available={operationAddons} selected={operationDraft.addons} bundleSelected={Boolean(operationDraft.bundles.length)} onChange={(selectedAddons) => setOperationDraft({ ...operationDraft, addons: selectedAddons })} /></div>
          <div className={styles.wide}><ProductionOptionsEditor options={operationDraft.options} crew={state.crew} modelCatalogUrl={state.modelCatalogUrl} onChange={(options) => setOperationDraft({ ...operationDraft, options })} /></div>
          <label className={styles.wide}><span>Account Manager note <small>Editable by Operations</small></span><textarea rows={3} maxLength={5000} value={operationDraft.accountNote} onChange={(event) => setOperationDraft({ ...operationDraft, accountNote: event.target.value })} /></label>
          <label className={styles.wide}><span>Production Manager note <small>Editable by Operations</small></span><textarea rows={3} maxLength={5000} value={operationDraft.productionNote} onChange={(event) => setOperationDraft({ ...operationDraft, productionNote: event.target.value })} /></label>
          <label className={styles.wide}><span>Operation Manager note <small>Optional</small></span><textarea rows={3} maxLength={5000} value={operationDraft.operationNote} onChange={(event) => setOperationDraft({ ...operationDraft, operationNote: event.target.value })} placeholder="Add the final operational instruction or approval note." /></label>
        </div>
        <div className={styles.finalWarning}><LockKeyhole size={18} /><span><strong>Final approval, permanent lock & Draft invoice</strong><small>After final approval, nobody can edit or cancel this order. Only production options marked Extra cost are added above the selected bundle prices.</small></span></div>
        <footer><button type="button" className="secondary-button" onClick={() => setReviewing(null)} disabled={saving}>Back</button><button className="primary-button" disabled={saving}>{saving ? <><LoaderCircle size={16} /> Finalizing…</> : <><CheckCircle2 size={16} /> Final approve & lock</>}</button></footer>
      </form>
    </WorkflowModal>}
  </section>;
}
