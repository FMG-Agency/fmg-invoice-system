"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Building2,
  CalendarRange,
  Camera,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FilePenLine,
  FilePlus2,
  FileText,
  FolderKanban,
  LayoutDashboard,
  KeyRound,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  TrendingUp,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import Image from "next/image";
import { z } from "zod";
import { generateDocumentPdf, pdfDataUri, savePdf } from "../lib/pdf";
import { formatDocumentDate, maskDocumentDate, parseDocumentDate } from "../lib/document-date";
import { canAccess, type AccessPermission } from "../lib/permissions";
import type { AppState, Category, Client, CompanyKey, DocumentDraft, DocumentRecord, HrState, LineItem, NotificationTargetView, QuotationCatalogItem, Settings } from "../types";
import { AccessPanel } from "./AccessPanel";
import { ClientAccountPanel } from "./ClientAccountPanel";
import { ClientFinancePanel } from "./ClientFinancePanel";
import { ClientPortalAdmin, ClientPortalShell } from "./ClientPortalPanel";
import { AttendancePanel, EmployeesPanel, type HrMutation } from "./HrPanels";
import { LoginCredentialsPanel } from "./LoginCredentialsPanel";
import { NotificationCenter } from "./NotificationCenter";
import { RequestsPanel } from "./RequestsPanel";
import { ProductionDirectoryPanel } from "./ProductionDirectoryPanel";
import { WorkOrderPanel } from "./WorkOrderPanel";

type View = "dashboard" | "invoice" | "quotation" | "media-guide" | "work-order" | "production-directory" | "clients" | "client-accounts" | "monthly-clients" | "client-portal-admin" | "employees" | "attendance" | "requests" | "categories" | "data" | "settings" | "users";
type Mutation = (body: Record<string, unknown>) => Promise<AppState>;
const companyNames: Record<CompanyKey, string> = { fmg: "FMG Agency", digital_empire: "The Digital Empire" };
type AuthState = {
  checking: boolean;
  authenticated: boolean;
  setupRequired: boolean;
  userId: number;
  username: string;
  displayName: string;
  roleLabel: string;
  isAdmin: boolean;
  permissions: AccessPermission[];
  employeeId: number | null;
  clientId: number | null;
};

const signedOutAuth: AuthState = {
  checking: false,
  authenticated: false,
  setupRequired: false,
  userId: 0,
  username: "",
  displayName: "",
  roleLabel: "",
  isAdmin: false,
  permissions: [],
  employeeId: null,
  clientId: null,
};

type AuthPayload = Partial<Omit<AuthState, "checking">> & { error?: string };

function authFromPayload(payload: AuthPayload): AuthState {
  return {
    checking: false,
    authenticated: Boolean(payload.authenticated),
    setupRequired: Boolean(payload.setupRequired),
    userId: Number(payload.userId ?? 0),
    username: payload.username ?? "",
    displayName: payload.displayName ?? payload.username ?? "",
    roleLabel: payload.roleLabel ?? "Team Member",
    isAdmin: Boolean(payload.isAdmin),
    permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
    employeeId: payload.employeeId === null || payload.employeeId === undefined ? null : Number(payload.employeeId),
    clientId: payload.clientId === null || payload.clientId === undefined ? null : Number(payload.clientId),
  };
}

const clientSchema = z.object({
  name: z.string().trim().min(1, "Client name is required"),
  companyName: z.string().trim(),
  ownerName: z.string().trim(),
  phone: z.string().trim(),
  email: z.union([z.string().trim().email("Enter a valid email"), z.literal("")]),
  address: z.string().trim(),
  notes: z.string().trim(),
  agencyKey: z.enum(["fmg", "digital_empire"]),
  lifecycleStatus: z.enum(["active", "inactive", "shoot", "prospect"]),
  activity: z.string().trim(),
  startDate: z.string(),
  paymentSchedule: z.string().trim(),
  monthlyFee: z.number().min(0),
  contractStatus: z.enum(["contract", "no_contract", "not_set"]),
  relationshipStage: z.enum(["new", "old", ""]),
});

const categorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required"),
  prefix: z.string().trim().min(1, "Prefix is required").max(6).regex(/^[A-Za-z0-9]+$/, "Use letters and numbers only"),
  footerText1: z.string().trim(),
  footerText2: z.string().trim(),
});

type ClientInput = z.infer<typeof clientSchema>;
type CategoryInput = z.infer<typeof categorySchema>;

const emptyState: AppState = {
  clients: [],
  categories: [],
  documents: [],
  quotationCatalog: [],
  settings: {
    id: 1,
    agencyName: "FMG Agency",
    defaultCurrency: "EGP",
    preparedBy: "Finance Department",
    defaultPaymentTerms: "50% advance payment • 50% upon completion",
    defaultTax: 0,
    phone: "",
    email: "",
    address: "",
    updatedAt: "",
  },
};

function currentPayrollMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit" }).format(new Date());
}

const emptyHrState: HrState = {
  month: currentPayrollMonth(),
  employees: [],
  attendance: [],
  imports: [],
  adjustments: [],
  payroll: [],
  policy: {
    id: 1, policyVersion: 2, currency: "EGP", salaryDivisor: 30, workdayMinutes: 480, workdayStartsAt: "11:00", freeArrivalUntil: "11:05",
    minorLateUntil: "11:15", quarterDayUntil: "11:45", workdayEndsAt: "19:00", overtimeStartsAt: "19:15",
    overtimeApprovalAfter: "22:00", overtimeArrivalCutoff: "11:30", minutePenaltyMultiplier: 4, overtimeMultiplier: 2,
    earlyOvertimeMultiplier: 2.5,
    fridayMultiplier: 2, earlyLeaveDayMultiplier: 0.5, unpaidLeaveDayMultiplier: 1,
    urgentLeaveDeadline: "12:00", urgentLeaveYearLimit: 12, sickReportAfterDays: 2,
    resortLeaveDays: 7, resortNoticeDays: 14, normalLeaveNoticeDays: 2,
    absenceDeductionEnabled: false, absenceDayMultiplier: 1, updatedAt: "",
  },
};

const navItems: Array<{ id: View; label: string; eyebrow: string; icon: typeof LayoutDashboard; permission: AccessPermission | "users" }> = [
  { id: "dashboard", label: "Dashboard", eyebrow: "Overview", icon: LayoutDashboard, permission: "dashboard" },
  { id: "invoice", label: "New Invoice", eyebrow: "Create", icon: ReceiptText, permission: "invoices" },
  { id: "quotation", label: "New Quotation", eyebrow: "Create", icon: FilePlus2, permission: "quotations" },
  { id: "media-guide", label: "Media Guide Catalog", eyebrow: "Bundles & add-ons", icon: Sparkles, permission: "quotations" },
  { id: "work-order", label: "Work Orders", eyebrow: "Approval pipeline", icon: FilePenLine, permission: "production" },
  { id: "production-directory", label: "Talent & Crew", eyebrow: "Models, photographers & crew", icon: Camera, permission: "production" },
  { id: "clients", label: "Client Directory", eyebrow: "Profiles & contacts", icon: UsersRound, permission: "clients" },
  { id: "client-accounts", label: "Client Accounts", eyebrow: "Balances & ledger", icon: CircleDollarSign, permission: "clients" },
  { id: "monthly-clients", label: "Retainers", eyebrow: "Monthly finance", icon: CalendarRange, permission: "clients" },
  { id: "client-portal-admin", label: "Client Portal", eyebrow: "Invoices & content plans", icon: Sparkles, permission: "client_portal" },
  { id: "employees", label: "Employees", eyebrow: "People & salaries", icon: UserRound, permission: "employees" },
  { id: "attendance", label: "Attendance", eyebrow: "Payroll & biometric", icon: Clock3, permission: "attendance" },
  { id: "requests", label: "Employee Requests", eyebrow: "Leave, excuses & missions", icon: ClipboardList, permission: "requests" },
  { id: "categories", label: "Categories", eyebrow: "Services", icon: Tag, permission: "categories" },
  { id: "data", label: "All Data", eyebrow: "Archive", icon: FolderKanban, permission: "all_data" },
  { id: "settings", label: "Settings", eyebrow: "Workspace", icon: Settings2, permission: "settings" },
  { id: "users", label: "Users & Access", eyebrow: "Administrator", icon: ShieldCheck, permission: "users" },
];

type NavGroupId = "production" | "documents" | "clients" | "services" | "people" | "administration";
type NavSection =
  | { id: "dashboard"; item: View }
  | { id: NavGroupId; label: string; eyebrow: string; icon: typeof LayoutDashboard; items: View[] };

const navSections: NavSection[] = [
  { id: "dashboard", item: "dashboard" },
  { id: "production", label: "Production", eyebrow: "Orders, talent & crew", icon: FilePenLine, items: ["work-order", "production-directory"] },
  { id: "documents", label: "Documents", eyebrow: "Create & archive", icon: FileText, items: ["invoice", "quotation", "data"] },
  { id: "clients", label: "Clients", eyebrow: "Directory & experience", icon: UsersRound, items: ["clients", "client-accounts", "monthly-clients", "client-portal-admin"] },
  { id: "services", label: "Services", eyebrow: "Catalog & categories", icon: Sparkles, items: ["media-guide", "categories"] },
  { id: "people", label: "Employees", eyebrow: "Team & payroll", icon: UserRound, items: ["employees", "attendance", "requests"] },
  { id: "administration", label: "Administration", eyebrow: "Settings & access", icon: Settings2, items: ["settings", "users"] },
];

function canOpenDocumentArchive(access: AuthState) {
  return access.isAdmin || ["all_data", "invoices", "quotations"].some((permission) => access.permissions.includes(permission as AccessPermission));
}

function navGroupForView(next: View): NavGroupId | null {
  const section = navSections.find((entry) => !("item" in entry) && entry.items.includes(next));
  return section && !("item" in section) ? section.id : null;
}

const viewCopy: Record<View, { eyebrow: string; title: string; description: string }> = {
  dashboard: { eyebrow: "FMG CONTROL CENTER", title: "Good evening, FMG.", description: "Your agency documents, clients, and activity in one calm workspace." },
  invoice: { eyebrow: "CREATE DOCUMENT", title: "New invoice", description: "Select a client and category, then add the billable work." },
  quotation: { eyebrow: "CREATE DOCUMENT", title: "New quotation", description: "Turn a scoped project into a polished client proposal." },
  "media-guide": { eyebrow: "MEDIA GUIDE SERVICES", title: "Bundles and add-ons", description: "Manage every reusable Media Guide bundle, included service, add-on, and EGP price." },
  "work-order": { eyebrow: "PRODUCTION WORKFLOW", title: "Work orders", description: "Create, complete, lock, route, and print Media Guide production work orders." },
  "production-directory": { eyebrow: "PRODUCTION RESOURCES", title: "Talent & Crew", description: "Manage models, photographers, videographers, phone numbers, and the shared model catalogue." },
  clients: { eyebrow: "CLIENT DIRECTORY", title: "Clients", description: "Profiles, invoices, payments, outstanding balances, and complete account history." },
  "client-accounts": { eyebrow: "CLIENT FINANCE", title: "Client accounts", description: "See every client's charges, payments, credit, and live balance in one clear overview." },
  "monthly-clients": { eyebrow: "MONTHLY CLIENTS", title: "Retainers", description: "Plan retainers by month, apply one amount across a period, and forecast annual client revenue." },
  "client-portal-admin": { eyebrow: "CLIENT EXPERIENCE", title: "Client Portal", description: "Publish each client's monthly content-plan links and prepare their private invoice dashboard." },
  employees: { eyebrow: "PEOPLE OPERATIONS", title: "Employees", description: "Titles, salaries, commissions, deductions, and biometric identities in one private directory." },
  attendance: { eyebrow: "ATTENDANCE & PAYROLL", title: "Attendance and payroll", description: "Import biometric Excel files, review every punch, and calculate payroll from the FMG Office Policy." },
  requests: { eyebrow: "EMPLOYEE SELF-SERVICE", title: "Employee requests", description: "Send, route, approve, and track leave, early-leave excuses, and work missions with automatic payroll impact." },
  categories: { eyebrow: "SERVICE LOGIC", title: "Categories", description: "Control prefixes, counters, and the PDF footer for each service." },
  data: { eyebrow: "DOCUMENT ARCHIVE", title: "All data", description: "Search, filter, preview, and manage every generated document." },
  settings: { eyebrow: "WORKSPACE SETTINGS", title: "Settings", description: "Set the defaults that power every new FMG document." },
  users: { eyebrow: "ACCESS CONTROL", title: "Employee and client users", description: "Manage internal employee access and private client portal accounts in separate, focused lists." },
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function money(value: number, currency = "EGP") {
  return new Intl.NumberFormat("en-EG", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function prettyDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function DocumentDateInput({ value, onChange, label, required = false, min, max }: { value: string; onChange: (value: string) => void; label: string; required?: boolean; min?: string; max?: string }) {
  const [editedValue, setEditedValue] = useState<string | null>(null);
  const displayValue = editedValue ?? formatDocumentDate(value);

  function updateText(nextValue: string) {
    const masked = maskDocumentDate(nextValue);
    setEditedValue(masked);
    if (!masked) onChange("");
    const parsed = parseDocumentDate(masked);
    if (parsed) onChange(parsed);
  }

  return <div className="document-date-input">
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      required={required}
      pattern="[0-3][0-9]/[0-1][0-9]/[0-9]{4}"
      placeholder="DD/MM/YYYY"
      value={displayValue}
      onChange={(event) => updateText(event.target.value)}
      onBlur={() => setEditedValue(null)}
      aria-label={label}
    />
    <span className="document-date-picker" title="Choose from calendar">
      <CalendarRange size={17} aria-hidden="true" />
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => { setEditedValue(null); onChange(event.target.value); }}
        aria-label={`${label} calendar`}
        tabIndex={-1}
      />
    </span>
  </div>;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FM";
}

function isMediaGuideCategory(category?: Category) {
  return category?.name.trim().toLowerCase() === "media guide";
}

function emptyItem(date = today()): LineItem {
  return { id: crypto.randomUUID(), date, description: "", qty: 1, unit: "Unit", unitPrice: 0, kind: "custom", catalogId: null, includedServices: [], inputs: [], outputs: [], appliesTo: "", bundleTotal: null };
}

function normalizedItem(item: LineItem): LineItem {
  return {
    ...item,
    kind: item.kind ?? "custom",
    catalogId: item.catalogId ?? null,
    includedServices: Array.isArray(item.includedServices) ? item.includedServices : [],
    inputs: Array.isArray(item.inputs) ? item.inputs : Array.isArray(item.includedServices) ? item.includedServices : [],
    outputs: Array.isArray(item.outputs) ? item.outputs : [],
    appliesTo: item.appliesTo ?? "",
    bundleTotal: item.bundleTotal ?? null,
  };
}

function draftFor(type: "invoice" | "quotation", settings: Settings, companyKey: CompanyKey): DocumentDraft {
  const date = today();
  return {
    type,
    companyKey,
    clientId: 0,
    categoryId: 0,
    date,
    validUntil: addDays(date, type === "quotation" ? 14 : 0),
    preparedBy: settings.preparedBy,
    currency: settings.defaultCurrency,
    project: "",
    status: "Draft",
    items: [emptyItem(date)],
    discount: 0,
    tax: 0,
    paymentTerms: settings.defaultPaymentTerms,
    notesExclusions: "",
  };
}

function Modal({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading">
          <div><span className="eyebrow">FMG RECORD</span><h2>{title}</h2>{description && <p>{description}</p>}</div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  return <span className={cx("status-badge", `status-${value.toLowerCase().replace(/\s+/g, "-")}`)}><span />{value}</span>;
}

function EmptyPanel({ icon: Icon, title, body, action }: { icon: typeof FileText; title: string; body: string; action?: React.ReactNode }) {
  return <div className="empty-panel"><div className="empty-icon"><Icon size={24} /></div><h3>{title}</h3><p>{body}</p>{action}</div>;
}

function AuthScreen({ setupRequired, onAuthenticated }: { setupRequired: boolean; onAuthenticated: () => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (setupRequired && password !== confirmPassword) return setError("Passwords do not match.");
    if (setupRequired && password.length < 8) return setError("Use at least 8 characters for the password.");
    setBusy(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: setupRequired ? "setup" : "login", username, password }),
      });
      const result = await response.json() as { authenticated?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not sign in.");
      await onAuthenticated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <div className="auth-slash" />
    <section className="auth-brand">
      <Image src="/fmg-logo-light.png" alt="FMG Agency" width={520} height={180} unoptimized />
      <div><span>PRIVATE AGENCY WORKSPACE</span><h1>Documents protected.<br />Business moving.</h1><p>Clients, invoices, quotations, payroll, and PDFs stay behind secure FMG accounts with controlled access.</p></div>
      <small>FMG AGENCY • SUPERHEROES WHO CREATE</small>
    </section>
    <section className="auth-card-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-icon"><ShieldCheck size={23} /></div>
        <span className="eyebrow">{setupRequired ? "FIRST-TIME SETUP" : "SECURE ACCESS"}</span>
        <h2>{setupRequired ? "Create the admin account" : "Welcome back"}</h2>
        <p>{setupRequired ? "Choose the administrator username and password for the FMG system." : "Enter your FMG account credentials to continue."}</p>
        <label className="auth-field"><span>Username</span><div><UserRound size={17} /><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder={setupRequired ? "Choose a username" : "Your username"} required minLength={setupRequired ? 3 : 1} autoFocus /></div></label>
        <label className="auth-field"><span>Password</span><div><LockKeyhole size={17} /><input type={showPassword ? "text" : "password"} autoComplete={setupRequired ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={setupRequired ? "At least 8 characters" : "Your password"} required minLength={setupRequired ? 8 : 1} /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
        {setupRequired && <label className="auth-field"><span>Confirm password</span><div><KeyRound size={17} /><input type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat the password" required minLength={8} /></div></label>}
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-submit" disabled={busy}>{busy ? "Please wait…" : setupRequired ? "Create account & enter" : "Sign in"}<ArrowLeft size={17} /></button>
        <div className="auth-security"><LockKeyhole size={14} /><span>Your password is encrypted and never stored as readable text.</span></div>
      </form>
    </section>
  </main>;
}

export function FmgSystem() {
  const [state, setState] = useState<AppState>(emptyState);
  const [hrState, setHrState] = useState<HrState>(emptyHrState);
  const [auth, setAuth] = useState<AuthState>({ ...signedOutAuth, checking: true });
  const [view, setView] = useState<View>("dashboard");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openNavGroup, setOpenNavGroup] = useState<NavGroupId | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [companyKey, setCompanyKey] = useState<CompanyKey>("fmg");
  const [toast, setToast] = useState<string | null>(null);
  const [editingDocument, setEditingDocument] = useState<DocumentRecord | null>(null);

  useEffect(() => {
    const storedTheme = localStorage.getItem("fmg-theme");
    const storedCompany = localStorage.getItem("fmg-company");
    const shouldDark = storedTheme === "dark";
    const themeFrame = window.requestAnimationFrame(() => setDark(shouldDark));
    const companyFrame = window.requestAnimationFrame(() => {
      if (storedCompany === "digital_empire" || storedCompany === "fmg") setCompanyKey(storedCompany);
    });
    document.documentElement.dataset.theme = shouldDark ? "dark" : "light";
    void fetch("/api/auth", { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as AuthPayload;
      if (!response.ok) throw new Error(result.error || "Could not check access.");
      const nextAuth = authFromPayload(result);
      setAuth(nextAuth);
      if (nextAuth.authenticated && nextAuth.clientId !== null) setLoading(false);
      else if (nextAuth.authenticated) await loadWorkspace(nextAuth);
      else setLoading(false);
    }).catch((error: Error) => {
      setAuth(signedOutAuth);
      setLoading(false);
      showToast(error.message);
    });
    return () => { window.cancelAnimationFrame(themeFrame); window.cancelAnimationFrame(companyFrame); };
    // Initial access check intentionally runs once; later workspace refreshes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!auth.authenticated || auth.clientId !== null) return;
    const timer = window.setTimeout(() => {
      const requestedView = new URLSearchParams(window.location.search).get("view") as NotificationTargetView | null;
      if (requestedView && canOpenView(requestedView)) {
        setView(requestedView);
        setOpenNavGroup(navGroupForView(requestedView));
        window.history.replaceState({}, "", window.location.pathname);
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // The URL is only consumed after the signed-in user's permissions are known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.authenticated, auth.clientId, auth.permissions, auth.isAdmin]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3600);
  }

  function canOpenView(next: View, access = auth) {
    const item = navItems.find((entry) => entry.id === next);
    if (!item) return false;
    if (next === "data") return canOpenDocumentArchive(access);
    if (next === "settings") return access.authenticated && access.clientId === null;
    return item.permission === "users" ? access.isAdmin : canAccess(access.permissions, item.permission, access.isAdmin);
  }

  function chooseView(next: View) {
    if (!canOpenView(next)) return showToast("You do not have access to this area.");
    if (next !== "invoice" && next !== "quotation") setEditingDocument(null);
    const group = navGroupForView(next);
    if (group) setOpenNavGroup(group);
    setView(next);
    setMenuOpen(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("fmg-theme", next ? "dark" : "light");
  }

  function switchCompany(next: CompanyKey) {
    setCompanyKey(next);
    localStorage.setItem("fmg-company", next);
    setEditingDocument(null);
    showToast(`${companyNames[next]} selected for new documents.`);
  }

  async function loadWorkspace(access = auth) {
    setLoading(true);
    try {
      const loadHrData = access.isAdmin || access.permissions.includes("employees") || access.permissions.includes("attendance");
      const [response, hrResponse] = await Promise.all([
        fetch("/api/state", { cache: "no-store" }),
        loadHrData ? fetch(`/api/hr?month=${encodeURIComponent(currentPayrollMonth())}`, { cache: "no-store" }) : Promise.resolve(null),
      ]);
      const result = await response.json() as AppState | { error?: string; code?: string };
      const hrResult = hrResponse ? await hrResponse.json() as HrState | { error?: string } : emptyHrState;
      if (response.status === 401 || hrResponse?.status === 401) {
        setAuth(signedOutAuth);
        setState(emptyState);
        setHrState(emptyHrState);
        return;
      }
      if (!response.ok) throw new Error("error" in result && result.error ? result.error : "Could not load your workspace");
      if (hrResponse && !hrResponse.ok) throw new Error("error" in hrResult && hrResult.error ? hrResult.error : "Could not load employee and attendance data");
      setState(result as AppState);
      setHrState(loadHrData ? hrResult as HrState : emptyHrState);
      const allowed = navItems.filter((item) => canOpenView(item.id, access));
      setView((current) => allowed.some((item) => item.id === current) ? current : allowed[0]?.id ?? "dashboard");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load your workspace");
    } finally {
      setLoading(false);
    }
  }

  async function handleAuthenticated() {
    const response = await fetch("/api/auth", { cache: "no-store" });
    const result = await response.json() as AuthPayload;
    if (!response.ok || !result.authenticated) throw new Error(result.error || "Could not load account access.");
    const nextAuth = authFromPayload(result);
    setAuth(nextAuth);
    if (nextAuth.clientId !== null) setLoading(false);
    else await loadWorkspace(nextAuth);
  }

  async function logout() {
    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = registration && "pushManager" in registration ? await registration.pushManager.getSubscription() : null;
        if (subscription) {
          await fetch("/api/notifications", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "unsubscribe", endpoint: subscription.endpoint }),
          }).catch(() => undefined);
          await subscription.unsubscribe().catch(() => false);
        }
      }
      await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    } finally {
      setState(emptyState);
      setHrState(emptyHrState);
      setView("dashboard");
      setAuth(signedOutAuth);
      setMenuOpen(false);
    }
  }

  async function mutate(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as AppState | { error?: string };
      if (response.status === 401) {
        setAuth(signedOutAuth);
        setState(emptyState);
        throw new Error("Your session expired. Please sign in again.");
      }
      if (!response.ok) throw new Error("error" in result && result.error ? result.error : "Could not save changes");
      setState(result as AppState);
      return result as AppState;
    } finally {
      setBusy(false);
    }
  }

  const mutateHr: HrMutation = async (body) => {
    setBusy(true);
    try {
      const response = await fetch("/api/hr", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as HrState | { error?: string };
      if (response.status === 401) {
        setAuth(signedOutAuth);
        setState(emptyState);
        setHrState(emptyHrState);
        throw new Error("Your session expired. Please sign in again.");
      }
      if (!response.ok) throw new Error("error" in result && result.error ? result.error : "Could not save HR changes");
      setHrState(result as HrState);
      return result as HrState;
    } finally {
      setBusy(false);
    }
  };

  async function loadHr(month: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/hr?month=${encodeURIComponent(month)}`, { cache: "no-store" });
      const result = await response.json() as HrState | { error?: string };
      if (!response.ok) throw new Error("error" in result && result.error ? result.error : "Could not load this payroll month");
      setHrState(result as HrState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load this payroll month");
    } finally {
      setBusy(false);
    }
  }

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    const clientResults = canAccess(auth.permissions, "clients", auth.isAdmin) ? state.clients.filter((client) => [client.name, client.companyName, client.ownerName, client.phone, client.email].some((value) => value.toLowerCase().includes(query))).slice(0, 3).map((record) => ({ kind: "Client", title: record.companyName || record.name, meta: record.ownerName, view: "clients" as View })) : [];
    const docResults = canOpenDocumentArchive(auth) ? state.documents.filter((document) => [document.generatedCode, document.clientName, document.companyName, document.categoryName, document.type].some((value) => value.toLowerCase().includes(query))).slice(0, 4).map((record) => ({ kind: record.type === "invoice" ? "Invoice" : "Quotation", title: record.generatedCode, meta: record.companyName || record.clientName, view: "data" as View })) : [];
    const employeeResults = canAccess(auth.permissions, "employees", auth.isAdmin) ? hrState.employees.filter((employee) => [employee.name, employee.title, employee.department, employee.biometricCode].some((value) => value.toLowerCase().includes(query))).slice(0, 3).map((record) => ({ kind: "Employee", title: record.name, meta: record.title || `Biometric ID ${record.biometricCode}`, view: "employees" as View })) : [];
    return [...employeeResults, ...docResults, ...clientResults];
  }, [auth, hrState.employees, search, state]);

  const accessibleNavItems = navItems.filter((item) => canOpenView(item.id));
  const accessibleNavIds = new Set(accessibleNavItems.map((item) => item.id));
  const copy = viewCopy[view];

  if (auth.checking || (auth.authenticated && loading)) return <div className="app-loader"><Image src="/fmg-logo-light.png" alt="FMG Agency" width={380} height={130} unoptimized /><span /><p>Preparing your agency workspace…</p></div>;
  if (!auth.authenticated) return <AuthScreen setupRequired={auth.setupRequired} onAuthenticated={handleAuthenticated} />;
  if (auth.clientId !== null) return <ClientPortalShell displayName={auth.displayName || auth.username} dark={dark} onToggleTheme={toggleTheme} onLogout={logout} />;

  return (
    <div className="app-shell" dir="ltr">
      <aside className={cx("sidebar", menuOpen && "sidebar-open")} dir="ltr">
        <div className="brand-block">
          <Image src="/fmg-logo-light.png" alt="FMG Agency" width={380} height={130} unoptimized />
          <button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <p className="side-label">Agency workspace</p>
        <nav aria-label="Main navigation">
          {navSections.map((section) => {
            if ("item" in section) {
              const item = navItems.find((entry) => entry.id === section.item);
              if (!item || !accessibleNavIds.has(item.id)) return null;
              const Icon = item.icon;
              const active = view === item.id;
              return <button key={section.id} className={cx("nav-item", active && "active")} onClick={() => chooseView(item.id)}><Icon size={19} /><span><strong>{item.label}</strong><small>{item.eyebrow}</small></span>{active && <i />}</button>;
            }
            const groupItems = section.items.map((id) => navItems.find((item) => item.id === id)).filter((item): item is (typeof navItems)[number] => Boolean(item && accessibleNavIds.has(item.id)));
            if (!groupItems.length) return null;
            const Icon = section.icon;
            const expanded = openNavGroup === section.id;
            const active = groupItems.some((item) => item.id === view);
            return <div key={section.id} className={cx("nav-group", active && "active", expanded && "expanded")}>
              <button className="nav-group-toggle" onClick={() => setOpenNavGroup((current) => current === section.id ? null : section.id)} aria-expanded={expanded}><Icon size={19} /><span><strong>{section.label}</strong><small>{section.eyebrow}</small></span><ChevronDown className="nav-group-chevron" size={15} /></button>
              {expanded && <div className="nav-submenu">{groupItems.map((item) => { const ItemIcon = item.icon; const itemActive = view === item.id; return <button key={item.id} className={cx("nav-subitem", itemActive && "active")} onClick={() => chooseView(item.id)}><span className="nav-subicon"><ItemIcon size={14} /></span><span><strong>{item.label}</strong><small>{item.eyebrow}</small></span>{itemActive && <i />}</button>; })}</div>}
            </div>;
          })}
        </nav>
        <div className="side-foot">
          <div className="workspace-chip"><div className="avatar">{initials(auth.displayName || auth.username)}</div><div><strong>{auth.displayName || auth.username}</strong><small>{auth.roleLabel}</small></div><button onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button></div>
          <p><span /> All systems operational</p>
        </div>
      </aside>

      {menuOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}

      <main className="main-area" dir="ltr">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
          <label className={cx("company-switcher", companyKey === "digital_empire" && "digital-empire")}><Building2 size={17} /><span>Company</span><select value={companyKey} onChange={(event) => switchCompany(event.target.value as CompanyKey)} aria-label="Select company"><option value="fmg">FMG Agency</option><option value="digital_empire">The Digital Empire</option></select><ChevronDown size={14} /></label>
          <div className="global-search">
            <Search size={18} />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} placeholder="Search the areas you can access…" aria-label="Global search" />
            <kbd>⌘ K</kbd>
            {searchOpen && search && <div className="search-results">
              <div className="search-title"><span>Quick results</span><button onClick={() => setSearchOpen(false)}><X size={15} /></button></div>
              {searchResults.length ? searchResults.map((result, index) => <button key={`${result.kind}-${index}`} onClick={() => chooseView(result.view)}><span className="result-icon">{result.kind === "Client" ? <UserRound size={15} /> : <FileText size={15} />}</span><span><strong>{result.title}</strong><small>{result.kind} · {result.meta}</small></span><ArrowLeft size={15} /></button>) : <p className="no-search">No matching records yet.</p>}
            </div>}
          </div>
          <div className="top-actions">
            <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
            <NotificationCenter onNavigate={(target) => chooseView(target)} showToast={showToast} />
            <div className="top-avatar">{initials(auth.displayName || auth.username)}</div>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div><span className="eyebrow">{copy.eyebrow}</span><h1>{copy.title}</h1><p>{copy.description}</p></div>
            {view === "dashboard" && (canOpenView("invoice") || canOpenView("quotation")) && <button className="primary-button" onClick={() => chooseView(canOpenView("invoice") ? "invoice" : "quotation")}><Plus size={17} /> Create document</button>}
          </div>

          {view === "dashboard" && <Dashboard state={state} hrState={hrState} chooseView={chooseView} canOpenView={canOpenView} />}
          {view === "clients" && <ClientsPanel clients={state.clients} mutate={mutate} busy={busy} showToast={showToast} />}
          {view === "client-accounts" && <ClientFinancePanel mode="accounts" initialClients={state.clients} showToast={showToast} />}
          {view === "monthly-clients" && <ClientFinancePanel mode="monthly" initialClients={state.clients} showToast={showToast} />}
          {view === "client-portal-admin" && <ClientPortalAdmin showToast={showToast} />}
          {view === "employees" && <EmployeesPanel state={hrState} mutate={mutateHr} busy={busy} showToast={showToast} />}
          {view === "attendance" && <AttendancePanel state={hrState} mutate={mutateHr} busy={busy} onMonthChange={loadHr} onStateChange={setHrState} showToast={showToast} />}
          {view === "requests" && <RequestsPanel showToast={showToast} />}
          {view === "categories" && <CategoriesPanel categories={state.categories} mutate={mutate} busy={busy} showToast={showToast} />}
          {view === "media-guide" && <section className="panel catalog-page-panel"><QuotationCatalog catalog={state.quotationCatalog} mutate={mutate} busy={busy} showToast={showToast} /></section>}
          {view === "production-directory" && <ProductionDirectoryPanel showToast={showToast} />}
          {view === "work-order" && <WorkOrderPanel showToast={showToast} onWorkspaceChanged={() => loadWorkspace(auth)} onOpenDraftInvoice={(invoiceId) => {
            const invoice = state.documents.find((document) => document.id === invoiceId);
            if (!invoice) return showToast("Reload the workspace to open this Draft invoice.");
            if (!canOpenView("invoice")) return showToast("This account does not have access to invoices.");
            setEditingDocument(invoice);
            setCompanyKey(invoice.companyKey || "fmg");
            setView("invoice");
          }} />}
          {(view === "invoice" || view === "quotation") && <DocumentEditor key={`${view}-${editingDocument?.id ?? companyKey}`} type={view} companyKey={companyKey} state={state} mutate={mutate} busy={busy} editing={editingDocument} onDone={() => { setEditingDocument(null); chooseView("data"); }} showToast={showToast} />}
          {view === "data" && <DataPanel state={state} mutate={mutate} busy={busy} showToast={showToast} editDocument={(document) => {
            if (!canOpenView(document.type)) return showToast(`This account cannot edit ${document.type === "invoice" ? "invoices" : "quotations"}.`);
            setEditingDocument(document);
            setCompanyKey(document.companyKey || "fmg");
            setView(document.type);
          }} />}
          {view === "settings" && (auth.isAdmin
            ? <SettingsPanel settings={state.settings} mutate={mutate} busy={busy} showToast={showToast} authUsername={auth.username} onCredentialsChanged={(username) => setAuth((current) => ({ ...current, username }))} />
            : <div className="settings-stack"><LoginCredentialsPanel key={auth.username} username={auth.username} onChanged={(username) => setAuth((current) => ({ ...current, username }))} /></div>)}
          {view === "users" && auth.isAdmin && <AccessPanel showToast={showToast} />}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {accessibleNavItems.filter((item) => ["dashboard", "invoice", "quotation", "work-order", "client-portal-admin", "employees", "attendance", "requests"].includes(item.id)).slice(0, 5).map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => chooseView(item.id)}><Icon size={19} /><span>{item.label.replace("New ", "")}</span></button>; })}
      </nav>
      {toast && <div className="toast"><Check size={17} /><span>{toast}</span></div>}
    </div>
  );
}

function Dashboard({ state, hrState, chooseView, canOpenView }: { state: AppState; hrState: HrState; chooseView: (view: View) => void; canOpenView: (view: View) => boolean }) {
  const invoices = state.documents.filter((document) => document.type === "invoice");
  const quotations = state.documents.filter((document) => document.type === "quotation");
  const revenue = invoices.filter((document) => ["Paid", "Approved"].includes(document.status)).reduce((sum, document) => sum + document.total, 0);
  const recent = state.documents.slice(0, 5);
  const maxMonth = Math.max(1, ...Array.from({ length: 6 }, (_, index) => state.documents.filter((document) => new Date(document.date).getMonth() === ((new Date().getMonth() - (5 - index) + 12) % 12)).reduce((sum, document) => sum + document.total, 0)));
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(); date.setMonth(date.getMonth() - (5 - index));
    const total = state.documents.filter((document) => new Date(document.date).getMonth() === date.getMonth()).reduce((sum, document) => sum + document.total, 0);
    return { label: date.toLocaleDateString("en", { month: "short" }), total, height: Math.max(7, (total / maxMonth) * 100) };
  });
  const stats = [
    { label: "Total clients", value: state.clients.length, note: state.clients.length ? "Stored in your directory" : "Add your first client", icon: UsersRound, tone: "yellow" },
    { label: "Invoices", value: invoices.length, note: `${invoices.filter((item) => item.status === "Paid").length} paid`, icon: ReceiptText, tone: "black" },
    { label: "Quotations", value: quotations.length, note: `${quotations.filter((item) => item.status === "Approved").length} approved`, icon: FileCheck2, tone: "white" },
    { label: "Collected revenue", value: money(revenue), note: "Paid & approved invoices", icon: TrendingUp, tone: "white" },
  ];
  return <>
    {(canOpenView("invoice") || canOpenView("quotation")) && <section className="quick-create">
      <div className="quick-copy"><span className="spark"><Sparkles size={18} /></span><div><strong>Create something polished.</strong><p>Start with a client, choose the right category, and FMG handles the document number and layout.</p></div></div>
      <div className="quick-actions">{canOpenView("invoice") && <button onClick={() => chooseView("invoice")}><ReceiptText size={18} /><span><strong>New invoice</strong><small>Bill approved work</small></span><ArrowLeft size={17} /></button>}{canOpenView("quotation") && <button onClick={() => chooseView("quotation")}><FilePenLine size={18} /><span><strong>New quotation</strong><small>Scope a project</small></span><ArrowLeft size={17} /></button>}</div>
    </section>}
    {(canOpenView("employees") || canOpenView("attendance")) && <section className="hr-quick-grid">
      {canOpenView("employees") && <button className="hr-quick-card employees-card" onClick={() => chooseView("employees")}><span className="hr-quick-icon"><UsersRound size={23} /></span><span><small>FMG TEAM</small><strong>Employees & salaries</strong><p>{hrState.employees.filter((employee) => employee.active).length} active employees · titles, salary, commission, deductions</p></span><ArrowLeft size={18} /></button>}
      {canOpenView("attendance") && <button className="hr-quick-card attendance-card" onClick={() => chooseView("attendance")}><span className="hr-quick-icon"><Clock3 size={23} /></span><span><small>PEOPLE OPERATIONS</small><strong>Attendance & payroll</strong><p>{hrState.attendance.length ? `${hrState.attendance.length} attendance records in ${hrState.month}` : "Import the biometric Excel file and calculate the month"}</p></span><ArrowLeft size={18} /></button>}
    </section>}
    <section className="stats-grid">{stats.map((stat) => { const Icon = stat.icon; return <article key={stat.label} className={cx("stat-card", `stat-${stat.tone}`)}><div className="stat-top"><span>{stat.label}</span><i><Icon size={19} /></i></div><strong className="stat-value">{stat.value}</strong><small>{stat.note}</small></article>; })}</section>
    <section className="dashboard-grid">
      <article className="panel chart-panel"><div className="panel-heading"><div><span className="eyebrow">DOCUMENT VALUE</span><h2>Agency momentum</h2></div><span className="period-chip">Last 6 months <ChevronDown size={14} /></span></div><div className="chart-summary"><strong>{money(state.documents.reduce((sum, document) => sum + document.total, 0))}</strong><span>Total document value</span></div><div className="bar-chart">{months.map((month, index) => <div className="bar-column" key={`${month.label}-${index}`}><div className="bar-track"><i style={{ height: `${month.height}%` }} /></div><span>{month.label}</span></div>)}</div></article>
      <article className="panel recent-panel"><div className="panel-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Latest documents</h2></div>{canOpenView("data") && <button className="text-button" onClick={() => chooseView("data")}>View all <ArrowLeft size={15} /></button>}</div>{recent.length ? <div className="recent-list">{recent.map((document) => <button key={document.id} onClick={() => canOpenView("data") && chooseView("data")} disabled={!canOpenView("data")}><span className={cx("file-icon", document.type)}>{document.type === "invoice" ? <ReceiptText size={18} /> : <FileText size={18} />}</span><span className="recent-copy"><strong>{document.generatedCode}</strong><small>{companyNames[document.companyKey || "fmg"]} · {document.companyName || document.clientName} · {prettyDate(document.date)}</small></span><span className="recent-value"><strong>{money(document.total, document.currency)}</strong><StatusBadge value={document.status} /></span></button>)}</div> : <EmptyPanel icon={ClipboardList} title="No documents yet" body="Your latest invoices and quotations will appear here." action={(canOpenView("invoice") || canOpenView("quotation")) ? <button className="small-primary" onClick={() => chooseView(canOpenView("invoice") ? "invoice" : "quotation")}><Plus size={15} /> Create the first</button> : undefined} />}</article>
    </section>
  </>;
}

function ClientsPanel({ clients, mutate, busy, showToast }: { clients: Client[]; mutate: Mutation; busy: boolean; showToast: (message: string) => void }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Client | null>(null);
  const [open, setOpen] = useState(false);
  const [accountClient, setAccountClient] = useState<Client | null>(null);
  const emptyClientInput: ClientInput = { name: "", companyName: "", ownerName: "", phone: "", email: "", address: "", notes: "", agencyKey: "fmg", lifecycleStatus: "prospect", activity: "", startDate: "", paymentSchedule: "", monthlyFee: 0, contractStatus: "not_set", relationshipStage: "" };
  const form = useForm<ClientInput>({ resolver: zodResolver(clientSchema), defaultValues: emptyClientInput });
  const filtered = clients.filter((client) => [client.name, client.companyName, client.ownerName, client.phone, client.email, client.activity, client.paymentSchedule].some((value) => value.toLowerCase().includes(query.toLowerCase())));
  function openForm(client?: Client) {
    setEditing(client ?? null); setOpen(true);
    form.reset(client ? { name: client.name, companyName: client.companyName, ownerName: client.ownerName, phone: client.phone, email: client.email, address: client.address, notes: client.notes, agencyKey: client.agencyKey, lifecycleStatus: client.lifecycleStatus, activity: client.activity, startDate: client.startDate, paymentSchedule: client.paymentSchedule, monthlyFee: client.monthlyFee, contractStatus: client.contractStatus, relationshipStage: client.relationshipStage } : emptyClientInput);
  }
  const submit = form.handleSubmit(async (data) => {
    try { await mutate(editing ? { action: "updateClient", id: editing.id, data } : { action: "createClient", data }); setOpen(false); showToast(editing ? "Client updated." : "Client added to the directory."); } catch (error) { showToast(error instanceof Error ? error.message : "Could not save client"); }
  });
  async function remove(client: Client) {
    if (!window.confirm(`Delete ${client.companyName || client.name}?`)) return;
    try { await mutate({ action: "deleteClient", id: client.id }); showToast("Client deleted."); } catch (error) { showToast(error instanceof Error ? error.message : "Could not delete client"); }
  }
  return <section className="panel data-panel">
    <div className="toolbar"><div className="filter-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the client directory" /></div><button className="primary-button" onClick={() => openForm()}><Plus size={17} /> Add client</button></div>
    {filtered.length ? <div className="table-scroll"><table className="data-table client-directory-table"><thead><tr><th>Client</th><th>Agency & status</th><th>Activity</th><th>Monthly plan</th><th>Contact</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((client) => <tr key={client.id}>
      <td><div className="client-cell"><span className="avatar-soft">{initials(client.companyName || client.name)}</span><span><strong>{client.companyName || client.name}</strong><small>{client.relationshipStage ? `${client.relationshipStage.toUpperCase()} RELATIONSHIP` : client.name}</small></span></div></td>
      <td><div className="client-profile-tags"><span className="company-mini">{client.agencyKey === "digital_empire" ? "TDE" : "FMG"}</span><span className={`client-life client-life-${client.lifecycleStatus}`}>{client.lifecycleStatus}</span></div></td>
      <td><strong className="table-main">{client.activity || "Not set"}</strong><small className="table-sub">{client.contractStatus === "contract" ? "Contract" : client.contractStatus === "no_contract" ? "No contract" : "Contract not set"}</small></td>
      <td><strong className="table-main">{client.monthlyFee ? money(client.monthlyFee) : "—"}</strong><small className="table-sub">{client.paymentSchedule || "No collection schedule"}</small></td>
      <td><strong className="table-main">{client.ownerName || "Not provided"}</strong><small className="table-sub">{client.phone || client.email || "No contact details"}</small></td>
      <td><div className="row-actions"><button className="account-action" onClick={() => setAccountClient(client)} title="Open client account"><CircleDollarSign size={16} /><span>Account</span></button><button onClick={() => openForm(client)} aria-label="Edit client"><Pencil size={16} /></button><button className="danger" onClick={() => remove(client)} aria-label="Delete client"><Trash2 size={16} /></button></div></td>
    </tr>)}</tbody></table></div> : <EmptyPanel icon={UsersRound} title={query ? "No matching clients" : "Build your client directory"} body={query ? "Try a different name, activity, schedule, or contact." : "Add a client once and their details will flow into every invoice and quotation."} action={!query ? <button className="small-primary" onClick={() => openForm()}><Plus size={15} /> Add first client</button> : undefined} />}
    {open && <Modal title={editing ? "Edit client" : "Add a client"} description="Profile, commercial terms, and collection details stay connected to every document and account entry." onClose={() => setOpen(false)}><form className="modal-form client-profile-form" onSubmit={submit}>
      <div className="client-form-section"><span>Identity & contact</span><div className="form-grid"><Field label="Client name" error={form.formState.errors.name?.message}><input {...form.register("name")} placeholder="e.g. Glow" /></Field><Field label="Company name" hint="Optional"><input {...form.register("companyName")} placeholder="e.g. Glow Cosmetics" /></Field><Field label="Contact person" hint="Optional"><input {...form.register("ownerName")} placeholder="Full name" /></Field><Field label="Phone number" hint="Optional"><input {...form.register("phone")} placeholder="+20…" /></Field><Field label="Email" hint="Optional" error={form.formState.errors.email?.message}><input {...form.register("email")} placeholder="hello@company.com" /></Field><Field label="Address" hint="Optional"><input {...form.register("address")} placeholder="City, country" /></Field></div></div>
      <div className="client-form-section"><span>Commercial profile</span><div className="form-grid"><Field label="Agency"><select {...form.register("agencyKey")}><option value="fmg">FMG Agency</option><option value="digital_empire">The Digital Empire</option></select></Field><Field label="Client status"><select {...form.register("lifecycleStatus")}><option value="active">Active</option><option value="inactive">Inactive</option><option value="shoot">One-off shoot</option><option value="prospect">Prospect</option></select></Field><Field label="Activity" hint="Optional"><input {...form.register("activity")} placeholder="Gold, fashion, systems…" /></Field><Field label="Start date" hint="Optional"><input type="date" {...form.register("startDate")} /></Field><Field label="Relationship stage"><select {...form.register("relationshipStage")}><option value="">Not set</option><option value="new">New</option><option value="old">Old</option></select></Field><Field label="Contract"><select {...form.register("contractStatus")}><option value="not_set">Not set</option><option value="contract">Contract</option><option value="no_contract">No contract</option></select></Field></div></div>
      <div className="client-form-section"><span>Billing automation</span><div className="form-grid"><Field label="Default monthly fee"><input type="number" min="0" step="1" {...form.register("monthlyFee", { valueAsNumber: true })} placeholder="50000" /></Field><Field label="Collection schedule" hint="Optional"><input {...form.register("paymentSchedule")} placeholder="25th of every month" /></Field><Field label="Notes" wide hint="Optional"><textarea {...form.register("notes")} rows={3} placeholder="Internal notes about this client" /></Field></div></div>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add client"}</button></div>
    </form></Modal>}
    {accountClient && <ClientAccountPanel key={accountClient.id} client={accountClient} onClose={() => setAccountClient(null)} showToast={showToast} />}
  </section>;
}

function CategoriesPanel({ categories, mutate, busy, showToast }: { categories: Category[]; mutate: Mutation; busy: boolean; showToast: (message: string) => void }) {
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);
  const form = useForm<CategoryInput>({ resolver: zodResolver(categorySchema), defaultValues: { name: "", prefix: "", footerText1: "", footerText2: "" } });
  function openForm(category?: Category) { setEditing(category ?? null); setOpen(true); form.reset(category ? { name: category.name, prefix: category.prefix, footerText1: category.footerText1, footerText2: category.footerText2 } : { name: "", prefix: "", footerText1: "", footerText2: "" }); }
  const submit = form.handleSubmit(async (data) => { try { await mutate(editing ? { action: "updateCategory", id: editing.id, data } : { action: "createCategory", data }); setOpen(false); showToast(editing ? "Category updated." : "Category created."); } catch (error) { showToast(error instanceof Error ? error.message : "Could not save category"); } });
  async function remove(category: Category) { if (!window.confirm(`Delete ${category.name}?`)) return; try { await mutate({ action: "deleteCategory", id: category.id }); showToast("Category deleted."); } catch (error) { showToast(error instanceof Error ? error.message : "Could not delete category"); } }
  return <>
    <div className="section-actions"><div className="info-note"><Tag size={18} /><span><strong>Prefixes stay independent.</strong><small>Each category keeps its own document counter.</small></span></div><button className="primary-button" onClick={() => openForm()}><Plus size={17} /> Add category</button></div>
    <section className="category-grid">{categories.map((category, index) => <article className="category-card" key={category.id}><div className="category-top"><span className={cx("prefix-box", index % 3 === 0 && "yellow")}>{category.prefix}</span><div className="row-actions"><button onClick={() => openForm(category)} aria-label="Edit category"><Pencil size={16} /></button><button className="danger" onClick={() => remove(category)} aria-label="Delete category"><Trash2 size={16} /></button></div></div><h2>{category.name}</h2><p>Next document <strong>{category.prefix}{String(category.counter + 1).padStart(4, "0")}</strong></p><div className="category-footer-preview"><span>PDF footer</span><p>{category.footerText1 || "No first footer line"}</p><p>{category.footerText2 || "No second footer line"}</p></div><div className="category-counter"><span><FileText size={15} /> Issued documents</span><strong>{category.counter}</strong></div></article>)}</section>
    {!categories.length && <EmptyPanel icon={Tag} title="No categories yet" body="Create a category to define its prefix, numbering, and PDF footer." action={<button className="small-primary" onClick={() => openForm()}><Plus size={15} /> Add category</button>} />}
    {open && <Modal title={editing ? "Edit category" : "New category"} description="The prefix and footer are automatically used in generated PDFs." onClose={() => setOpen(false)}><form className="modal-form" onSubmit={submit}><div className="form-grid"><Field label="Category name" error={form.formState.errors.name?.message}><input {...form.register("name")} placeholder="e.g. Events" /></Field><Field label="Invoice prefix" error={form.formState.errors.prefix?.message}><input {...form.register("prefix")} placeholder="EV" onChange={(event) => form.setValue("prefix", event.target.value.toUpperCase())} /></Field><Field label="Footer line 1" wide><input {...form.register("footerText1")} placeholder="First line shown at the bottom of the PDF" /></Field><Field label="Footer line 2" wide><input {...form.register("footerText2")} placeholder="Second line shown at the bottom of the PDF" /></Field></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create category"}</button></div></form></Modal>}
  </>;
}

type CatalogFormState = {
  kind: "package" | "addon";
  name: string;
  price: number;
  inputsText: string;
  outputsText: string;
  appliesTo: string;
  bundleTotal: number | null;
  active: boolean;
  sortOrder: number;
};

function catalogFormState(item?: QuotationCatalogItem): CatalogFormState {
  return item ? {
    kind: item.kind,
    name: item.name,
    price: item.price,
    inputsText: item.inputs.join("\n"),
    outputsText: item.outputs.join("\n"),
    appliesTo: item.appliesTo,
    bundleTotal: item.bundleTotal,
    active: item.active,
    sortOrder: item.sortOrder,
  } : { kind: "package", name: "", price: 0, inputsText: "", outputsText: "", appliesTo: "", bundleTotal: null, active: true, sortOrder: 100 };
}

function QuotationCatalog({ catalog, mutate, busy, showToast, onAdd }: { catalog: QuotationCatalogItem[]; mutate: Mutation; busy: boolean; showToast: (message: string) => void; onAdd?: (item: QuotationCatalogItem) => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<QuotationCatalogItem | null>(null);
  const [form, setForm] = useState<CatalogFormState>(() => catalogFormState());
  const packages = catalog.filter((item) => item.kind === "package");
  const addons = catalog.filter((item) => item.kind === "addon");

  function openForm(item?: QuotationCatalogItem) {
    setEditing(item ?? null);
    setForm(catalogFormState(item));
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const inputs = form.inputsText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    const outputs = form.outputsText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    if (!form.name.trim() || !inputs.length) return showToast("Enter a name and at least one input.");
    try {
      await mutate({
        action: editing ? "updateQuotationCatalogItem" : "createQuotationCatalogItem",
        ...(editing ? { id: editing.id } : {}),
        data: {
          kind: form.kind,
          name: form.name,
          price: form.price,
          inputs,
          outputs,
          appliesTo: form.kind === "addon" ? form.appliesTo : "",
          bundleTotal: form.kind === "addon" ? form.bundleTotal : null,
          active: form.active,
          sortOrder: form.sortOrder,
        },
      });
      setOpen(false);
      showToast(editing ? "Quotation catalog item updated." : "New quotation catalog item added.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save the quotation catalog item.");
    }
  }

  function catalogCard(item: QuotationCatalogItem) {
    return <article key={item.id} className={cx("catalog-card", item.kind, !item.active && "inactive")}>
      <div className="catalog-card-head"><div><span>{item.kind === "package" ? "PACKAGE" : "ADD-ON"}{!item.active ? " · INACTIVE" : ""}</span><h4>{item.name}</h4></div><strong>{money(item.price, "EGP")}</strong></div>
      <div className="catalog-io"><section><span>Inputs</span><ul>{item.inputs.map((value) => <li key={value}><Check size={13} /> {value}</li>)}</ul></section><section><span>Outputs</span>{item.outputs.length ? <ul>{item.outputs.map((value) => <li key={value}><Check size={13} /> {value}</li>)}</ul> : <small>Not specified yet</small>}</section></div>
      {item.kind === "addon" && (item.appliesTo || item.bundleTotal !== null) && <div className="catalog-addon-meta">{item.appliesTo && <span>For {item.appliesTo}</span>}{item.bundleTotal !== null && <strong>Total after add-on: {money(item.bundleTotal, "EGP")}</strong>}</div>}
      <div className="catalog-card-actions"><button type="button" className="secondary-button" onClick={() => openForm(item)}><Pencil size={14} /> Edit</button>{onAdd && <button type="button" className="small-primary" disabled={!item.active} onClick={() => onAdd(item)}><Plus size={14} /> Add to quotation</button>}</div>
    </article>;
  }

  return <>
    <section className="quotation-catalog">
      <div className="catalog-heading"><div><span className="eyebrow">FMG JEWELRY SERVICES · 2026</span><h3>Packages & add-ons</h3><p>{onAdd ? "Select a saved option or edit the catalog." : "Edit the reusable options shown in Media Guide invoices and quotations."} Catalog prices are always stored in Egyptian pounds.</p></div><button type="button" className="secondary-button" onClick={() => openForm()}><Plus size={15} /> New catalog item</button></div>
      <div className="catalog-group"><div className="catalog-group-title"><Sparkles size={16} /><span>Service packages</span><small>{packages.length}</small></div><div className="catalog-grid">{packages.map(catalogCard)}</div></div>
      <div className="catalog-group addons"><div className="catalog-group-title"><Plus size={16} /><span>Add-ons</span><small>{addons.length}</small></div><div className="catalog-grid">{addons.map(catalogCard)}</div></div>
    </section>
    {open && <Modal title={editing ? `Edit ${editing.name}` : "New Media Guide catalog item"} description="Update the reusable package or add-on shown in invoice and quotation creation." onClose={() => setOpen(false)}>
      <form className="modal-form" onSubmit={submit}><div className="form-grid">
        <Field label="Item type"><select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as CatalogFormState["kind"] })}><option value="package">Package</option><option value="addon">Add-on</option></select></Field>
        <Field label="Name"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Package or add-on name" /></Field>
        <Field label="Price · EGP"><input required type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} /></Field>
        <Field label="Display order"><input type="number" min="0" step="1" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} /></Field>
        <Field label="Inputs" hint="One input per line" wide><textarea required rows={5} value={form.inputsText} onChange={(event) => setForm({ ...form, inputsText: event.target.value })} placeholder={"Videographer\nCamera\nModel"} /></Field>
        <Field label="Outputs" hint="One output per line" wide><textarea rows={5} value={form.outputsText} onChange={(event) => setForm({ ...form, outputsText: event.target.value })} placeholder={"Add the final deliverables here"} /></Field>
        {form.kind === "addon" && <><Field label="Applies to"><input value={form.appliesTo} onChange={(event) => setForm({ ...form, appliesTo: event.target.value })} placeholder="e.g. G1 Bundle" /></Field><Field label="Bundle total after add-on · EGP"><input type="number" min="0" step="0.01" value={form.bundleTotal ?? ""} onChange={(event) => setForm({ ...form, bundleTotal: event.target.value ? Number(event.target.value) : null })} /></Field></>}
        <label className="check-field field-wide"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span>Active and available to add to quotations</span></label>
      </div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add item"}</button></div></form>
    </Modal>}
  </>;
}

function DocumentEditor({ type, companyKey, state, mutate, busy, editing, onDone, showToast }: { type: "invoice" | "quotation"; companyKey: CompanyKey; state: AppState; mutate: Mutation; busy: boolean; editing: DocumentRecord | null; onDone: () => void; showToast: (message: string) => void }) {
  const [draft, setDraft] = useState<DocumentDraft>(() => editing && editing.type === type
    ? { id: editing.id, generatedCode: editing.generatedCode, type: editing.type, companyKey: editing.companyKey || "fmg", clientId: editing.clientId, categoryId: editing.categoryId, date: editing.date, validUntil: editing.validUntil, preparedBy: editing.preparedBy, currency: editing.currency, project: editing.project, status: editing.status, items: editing.items.map((item) => normalizedItem({ ...item, id: item.id || crypto.randomUUID() })), discount: editing.discount, tax: editing.tax, paymentTerms: editing.paymentTerms, notesExclusions: editing.notesExclusions }
    : draftFor(type, state.settings, companyKey));
  const [generating, setGenerating] = useState(false);
  const client = state.clients.find((record) => record.id === draft.clientId);
  const category = state.categories.find((record) => record.id === draft.categoryId);
  const mediaGuideSelected = isMediaGuideCategory(category);
  const catalogBundles = state.quotationCatalog.filter((item) => item.kind === "package");
  const selectedBundleLine = draft.items.find((item) => item.kind === "package");
  const selectedBundle = catalogBundles.find((item) => item.id === selectedBundleLine?.catalogId || item.name === selectedBundleLine?.description);
  const activeBundles = catalogBundles.filter((item) => item.active);
  const availableAddons = state.quotationCatalog.filter((item) => item.kind === "addon" && item.active && selectedBundle && (!item.appliesTo || item.appliesTo.toLowerCase() === selectedBundle.name.toLowerCase()));
  const selectedAddonLine = draft.items.find((item) => item.kind === "addon");
  const subtotal = draft.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
  const rawTotal = subtotal - Number(draft.discount || 0) + Number(draft.tax || 0);
  const total = type === "invoice" ? rawTotal : Math.max(0, rawTotal);
  const provisionalCode = editing?.generatedCode || (client && category ? `${(client.companyName || client.name).trim().replace(/[^A-Za-z0-9\u0600-\u06FF]+/g, "-").replace(/^-|-$/g, "")}-${category.prefix}${String(category.counter + 1).padStart(4, "0")}` : "Select client + category");
  function patchDraft<Key extends keyof DocumentDraft>(key: Key, value: DocumentDraft[Key]) { setDraft((current) => ({ ...current, [key]: value })); }
  function patchItem<Key extends keyof LineItem>(id: string, key: Key, value: LineItem[Key]) { setDraft((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, [key]: value } : item) })); }
  function catalogLineItem(item: QuotationCatalogItem, date: string): LineItem {
    return {
      id: crypto.randomUUID(),
      date,
      description: item.name,
      qty: 1,
      unit: item.kind === "addon" ? "Add-on" : "Package",
      unitPrice: item.price,
      kind: item.kind,
      catalogId: item.id,
      includedServices: [...item.inputs],
      inputs: [...item.inputs],
      outputs: [...item.outputs],
      appliesTo: item.appliesTo,
      bundleTotal: item.bundleTotal,
    };
  }
  function customItems(items: LineItem[]) {
    return items.filter((item) => item.kind === "custom" && (item.description.trim() || item.unitPrice !== 0 || item.inputs.length || item.outputs.length));
  }
  function selectCategory(categoryId: number) {
    setDraft((current) => {
      const nextCategory = state.categories.find((record) => record.id === categoryId);
      if (isMediaGuideCategory(nextCategory)) return { ...current, categoryId };
      const remaining = customItems(current.items);
      return { ...current, categoryId, items: remaining.length ? remaining : [emptyItem(current.date)] };
    });
  }
  function selectBundle(catalogId: number) {
    const bundle = activeBundles.find((item) => item.id === catalogId);
    setDraft((current) => {
      const custom = customItems(current.items);
      if (!bundle) return { ...current, items: custom.length ? custom : [emptyItem(current.date)] };
      const compatibleAddons = current.items.filter((item) => item.kind === "addon" && (!item.appliesTo || item.appliesTo.toLowerCase() === bundle.name.toLowerCase()));
      return { ...current, currency: "EGP", items: [catalogLineItem(bundle, current.date), ...compatibleAddons, ...custom] };
    });
    if (bundle) showToast(`${bundle.name} selected for this Media Guide ${type}.`);
  }
  function selectAddon(catalogId: number) {
    const addon = availableAddons.find((item) => item.id === catalogId);
    setDraft((current) => {
      const bundles = current.items.filter((item) => item.kind === "package");
      const custom = customItems(current.items);
      return { ...current, currency: addon ? "EGP" : current.currency, items: [...bundles, ...(addon ? [catalogLineItem(addon, current.date)] : []), ...custom] };
    });
    if (addon) showToast(`${addon.name} added to the selected bundle.`);
  }
  async function submit() {
    if (!client || !category) return showToast("Choose a client and category first.");
    if (type === "quotation" && mediaGuideSelected && !selectedBundle) return showToast("Choose a Media Guide bundle first.");
    if (!draft.items.length || draft.items.some((item) => !item.description.trim())) return showToast("Add a description to every line item.");
    setGenerating(true);
    try {
      const firstPdf = await generateDocumentPdf(draft, client, category, provisionalCode);
      const priorIds = new Set(state.documents.map((document) => document.id));
      let next = await mutate({ action: "saveDocument", data: { ...draft, pdfBase64: pdfDataUri(firstPdf) } });
      let saved = draft.id ? next.documents.find((document) => document.id === draft.id) : next.documents.find((document) => !priorIds.has(document.id));
      if (!saved) throw new Error("The document was saved but could not be reloaded.");
      let finalPdf = firstPdf;
      if (saved.generatedCode !== provisionalCode) {
        finalPdf = await generateDocumentPdf({ ...draft, id: saved.id, generatedCode: saved.generatedCode }, client, category, saved.generatedCode);
        next = await mutate({ action: "saveDocument", data: { ...draft, id: saved.id, pdfBase64: pdfDataUri(finalPdf) } });
        saved = next.documents.find((document) => document.id === saved?.id) ?? saved;
      }
      savePdf(finalPdf, saved.generatedCode);
      showToast(`${type === "invoice" ? "Invoice" : "Quotation"} ${saved.generatedCode} saved and downloaded.`);
      onDone();
    } catch (error) { showToast(error instanceof Error ? error.message : "Could not generate the PDF"); } finally { setGenerating(false); }
  }
  if (!state.clients.length) return <EmptyPanel icon={UsersRound} title="Add a client before creating a document" body="Client information is never typed twice. Add the client to your directory first, then return here." />;
  return <div className="editor-layout">
    <section className="panel editor-panel">
      <div className={cx("document-brand-banner", draft.companyKey === "digital_empire" && "digital-empire")}><Image src={draft.companyKey === "digital_empire" ? "/digital-empire-logo.png" : "/fmg-logo-dark.png"} alt={companyNames[draft.companyKey]} width={380} height={130} unoptimized /><div><span>Issuing company</span><strong>{companyNames[draft.companyKey]}</strong></div></div>
      {editing && <div className="editing-banner"><FilePenLine size={17} /><span>You are editing <strong>{editing.generatedCode}</strong>. Its permanent code will not change.</span></div>}
      <div className="step-heading"><span>01</span><div><h2>Client & category</h2><p>The selected records drive contact details, numbering, and footer content.</p></div></div>
      <div className="form-grid editor-grid"><Field label="Select client"><select value={draft.clientId} onChange={(event) => patchDraft("clientId", Number(event.target.value))}><option value={0}>Choose a client</option>{state.clients.map((record) => <option key={record.id} value={record.id}>{record.companyName || record.name}</option>)}</select></Field><Field label="Select category"><select value={draft.categoryId} onChange={(event) => selectCategory(Number(event.target.value))}><option value={0}>Choose a category</option>{state.categories.map((record) => <option key={record.id} value={record.id}>{record.name} · {record.prefix}</option>)}</select></Field></div>
      {client && <div className="selected-client"><div className="avatar-soft">{initials(client.companyName || client.name)}</div><div><span>Client information</span><strong>{client.companyName || client.name}</strong><p>{client.ownerName} · {client.phone}{client.email ? ` · ${client.email}` : ""}</p></div><Check size={18} /></div>}
      <div className="step-heading"><span>02</span><div><h2>Document details</h2><p>Fields follow the uploaded FMG {type} template.</p></div></div>
      <div className="form-grid editor-grid"><Field label="Date"><DocumentDateInput required label="Document date" value={draft.date} onChange={(value) => { patchDraft("date", value); setDraft((current) => ({ ...current, items: current.items.map((item) => item.date ? item : { ...item, date: value }) })); }} /></Field><Field label="Valid until"><DocumentDateInput required label="Valid until" value={draft.validUntil} onChange={(value) => patchDraft("validUntil", value)} /></Field><Field label="Prepared by"><input value={draft.preparedBy} onChange={(event) => patchDraft("preparedBy", event.target.value)} /></Field><Field label="Currency"><select value={draft.currency} onChange={(event) => patchDraft("currency", event.target.value)}><option>EGP</option><option>USD</option><option>EUR</option><option>SAR</option><option>AED</option></select></Field>{type === "quotation" && <Field label="Project" wide><input value={draft.project} onChange={(event) => patchDraft("project", event.target.value)} placeholder="Project or campaign name" /></Field>}</div>
      {mediaGuideSelected && <><div className="step-heading"><span>03</span><div><h2>Media Guide bundle</h2><p>{type === "invoice" ? "Optional: choose a saved bundle or build the bundle manually in Scope & pricing below." : "Select the bundle first, then choose an available add-on for it."}</p></div></div><section className="media-guide-selector"><div className="bundle-select-grid"><Field label="Bundle"><select value={selectedBundle?.id ?? 0} onChange={(event) => selectBundle(Number(event.target.value))}><option value={0}>{type === "invoice" ? "Manual bundle · no preset" : "Choose a bundle"}</option>{activeBundles.map((item) => <option key={item.id} value={item.id}>{item.name} · {money(item.price, "EGP")}</option>)}</select></Field><Field label="Add-on"><select value={selectedAddonLine?.catalogId ?? 0} onChange={(event) => selectAddon(Number(event.target.value))} disabled={!selectedBundle || !availableAddons.length}><option value={0}>{selectedBundle && !availableAddons.length ? "No add-ons available for this bundle" : "No add-on"}</option>{availableAddons.map((item) => <option key={item.id} value={item.id}>{item.name} · {money(item.price, "EGP")}</option>)}</select></Field></div>{selectedBundle && <div className="bundle-selection-summary"><div><span>Selected bundle</span><strong>{selectedBundle.name}</strong><small>Inputs: {selectedBundle.inputs.join(" · ")}{selectedBundle.outputs.length ? ` · Outputs: ${selectedBundle.outputs.join(" · ")}` : ""}</small></div><strong>{money(selectedBundle.price, "EGP")}</strong></div>}</section></>}
      <div className="step-heading items-heading"><span>{mediaGuideSelected ? "04" : "03"}</span><div><h2>Scope & pricing</h2><p>{type === "invoice" ? "Add line items; use a negative unit price to apply previous client credit." : "Add or remove line items. Totals update automatically."}</p></div><button className="secondary-button" onClick={() => patchDraft("items", [...draft.items, emptyItem(draft.date)])}><Plus size={16} /> Add item</button></div>
      <div className="items-table-wrap"><table className="items-table"><thead><tr><th>#</th><th>Service / deliverable</th><th>Qty</th>{type === "quotation" && <th>Unit</th>}<th>Unit price</th><th>Total</th><th /></tr></thead><tbody>{draft.items.map((item, index) => <tr key={item.id} className={item.kind === "addon" ? "addon-line" : ""}><td><span className="item-number">{String(index + 1).padStart(2, "0")}</span></td><td><div className="item-service-cell"><input value={item.description} onChange={(event) => patchItem(item.id, "description", event.target.value)} placeholder="Describe the service" />{mediaGuideSelected ? <div className="item-io-grid"><textarea rows={Math.max(2, item.inputs.length)} value={item.inputs.join("\n")} onChange={(event) => patchItem(item.id, "inputs", event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))} placeholder="Inputs · one per line" /><textarea rows={Math.max(2, item.outputs.length)} value={item.outputs.join("\n")} onChange={(event) => patchItem(item.id, "outputs", event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))} placeholder="Outputs · one per line" /></div> : type === "quotation" ? <textarea rows={Math.max(2, item.includedServices.length)} value={item.includedServices.join("\n")} onChange={(event) => patchItem(item.id, "includedServices", event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))} placeholder="Included services · one per line" /> : null}{item.kind === "addon" && item.appliesTo && <small>Applies to {item.appliesTo}{item.bundleTotal !== null ? ` · total after add-on ${money(item.bundleTotal, "EGP")}` : ""}</small>}</div></td><td><input type="number" min="0" step="0.01" value={item.qty} onChange={(event) => patchItem(item.id, "qty", Number(event.target.value))} /></td>{type === "quotation" && <td><input value={item.unit} onChange={(event) => patchItem(item.id, "unit", event.target.value)} /></td>}<td><input type="number" min={type === "invoice" ? undefined : 0} step="0.01" value={item.unitPrice} onChange={(event) => patchItem(item.id, "unitPrice", Number(event.target.value))} placeholder={type === "invoice" ? "e.g. -5000" : undefined} /></td><td><strong>{money(item.qty * item.unitPrice, draft.currency)}</strong></td><td><button className="delete-item" aria-label="Remove item" onClick={() => patchDraft("items", draft.items.filter((record) => record.id !== item.id))} disabled={draft.items.length === 1}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>
      <div className="document-bottom"><div className="document-notes"><Field label="Payment terms"><input value={draft.paymentTerms} onChange={(event) => patchDraft("paymentTerms", event.target.value)} placeholder="e.g. 50% advance · 50% upon completion" /></Field><Field label="Notes / exclusions"><textarea value={draft.notesExclusions} onChange={(event) => patchDraft("notesExclusions", event.target.value)} rows={3} placeholder={`Optional notes shown on the ${type}`} /></Field></div><div className="totals-card"><div><span>Subtotal</span><strong>{money(subtotal, draft.currency)}</strong></div><div><span>Discount</span><input type="number" min="0" step="0.01" value={draft.discount} onChange={(event) => patchDraft("discount", Number(event.target.value))} /></div><div><span>Tax / VAT</span><input type="number" min="0" step="0.01" value={draft.tax} onChange={(event) => patchDraft("tax", Number(event.target.value))} /></div><div className="grand-total"><span>Grand total</span><strong>{money(total, draft.currency)}</strong></div></div></div>
      <div className="editor-actions"><span><Clock3 size={15} /> Code: <strong>{provisionalCode}</strong></span><button className="primary-button generate-button" onClick={submit} disabled={busy || generating}><Printer size={17} /> {generating ? "Generating PDF…" : editing ? "Update & download PDF" : `Generate ${type} PDF`}</button></div>
    </section>
    <aside className="preview-panel"><div className="preview-toolbar"><span><Eye size={16} /> Live preview</span><span>A4</span></div><DocumentPreview draft={draft} client={client} category={category} code={provisionalCode} /></aside>
  </div>;
}

function DocumentPreview({ draft, client, category, code }: { draft: DocumentDraft; client?: Client; category?: Category; code: string }) {
  const subtotal = draft.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const total = subtotal - draft.discount + draft.tax;
  const digitalEmpire = draft.companyKey === "digital_empire";
  const mediaGuideDocument = isMediaGuideCategory(category);
  const showPaymentNotes = draft.type !== "invoice" || Boolean(draft.paymentTerms.trim() || draft.notesExclusions.trim());
  const packages = draft.items.filter((item) => item.kind !== "addon");
  const addons = draft.items.filter((item) => item.kind === "addon");
  const catalogTable = (items: LineItem[], nameLabel: string) => <table className={cx("paper-package-table", draft.type === "invoice" && "invoice")}><thead><tr>{draft.type === "invoice" && <th>#</th>}<th>{nameLabel}</th><th>INPUTS</th><th>OUTPUTS</th><th>PRICE · {draft.currency}</th></tr></thead><tbody>{items.map((item, index) => <tr key={item.id}>{draft.type === "invoice" && <td>{index + 1}</td>}<td><strong>{item.description || "—"}</strong>{item.kind === "addon" && item.appliesTo && <small>For {item.appliesTo}</small>}</td><td>{item.inputs.length ? item.inputs.join(" • ") : "—"}</td><td>{item.outputs.length ? item.outputs.join(" • ") : "—"}{item.kind === "addon" && item.bundleTotal !== null && <small>Bundle total: {item.bundleTotal.toLocaleString()} EGP</small>}</td><td>{(item.qty * item.unitPrice).toLocaleString()}</td></tr>)}</tbody></table>;
  return <div className={cx("paper-preview", digitalEmpire && "digital-empire")}>
    <div className="paper-slash" />
    <header><Image src={digitalEmpire ? "/digital-empire-logo.png" : "/fmg-logo-dark.png"} alt={companyNames[draft.companyKey]} width={digitalEmpire ? 900 : 380} height={130} unoptimized /><div><strong>{draft.type.toUpperCase()}</strong><span>{digitalEmpire ? "BRANDING • CONTENT • PERFORMANCE" : "CREATIVE • DIGITAL • PRODUCTION"}</span></div></header>
    <h4><i />{draft.type.toUpperCase()} INFORMATION /</h4>
    <div className="paper-grid"><b>{draft.type === "invoice" ? "INVOICE NO." : "QUOTATION NO."}</b><span>{code}</span><b>DATE</b><span>{formatDocumentDate(draft.date) || "—"}</span><b>VALID UNTIL</b><span>{formatDocumentDate(draft.validUntil) || "—"}</span><b>PREPARED BY</b><span>{draft.preparedBy || "—"}</span></div>
    <h4><i />CLIENT INFORMATION /</h4>
    <div className="paper-grid"><b>CLIENT / COMPANY</b><span>{client?.companyName || client?.name || "Choose client"}</span><b>CONTACT PERSON</b><span>{client?.ownerName || "—"}</span><b>EMAIL</b><span>{client?.email || "—"}</span><b>PHONE</b><span>{client?.phone || "—"}</span></div>
    {mediaGuideDocument ? <><h4><i />JEWELRY PACKAGES · 2026 /</h4><p className="paper-marketing">Curated production packages for jewelry brands · prices in Egyptian pounds.</p>{catalogTable(packages, "BUNDLE NAME")}{addons.length > 0 && <section className="paper-addons"><h4><i />ADD-ONS /</h4>{catalogTable(addons, "ADD-ON NAME")}</section>}</> : <><h4><i />SCOPE & PRICING /</h4><table><thead><tr><th>#</th><th>SERVICE / DELIVERABLE</th><th>QTY</th><th>PRICE</th><th>TOTAL</th></tr></thead><tbody>{draft.items.slice(0, 5).map((item, index) => <tr key={item.id}><td>{index + 1}</td><td className="paper-scope-name"><strong>{item.description || "—"}</strong>{draft.type === "quotation" && item.includedServices.length > 0 && <small>{item.includedServices.join(" • ")}</small>}</td><td>{item.qty}</td><td>{item.unitPrice.toLocaleString()}</td><td>{(item.qty * item.unitPrice).toLocaleString()}</td></tr>)}</tbody></table></>}
    <div className="paper-totals"><span>SUBTOTAL <b>{subtotal.toLocaleString()} {draft.currency}</b></span><span>DISCOUNT <b>{draft.discount.toLocaleString()}</b></span><span>GRAND TOTAL <b>{total.toLocaleString()} {draft.currency}</b></span></div>
    {showPaymentNotes && <section className="paper-payment-notes"><div><b>PAYMENT TERMS</b><span>{draft.paymentTerms.trim() || "—"}</span></div><div><b>NOTES / EXCLUSIONS</b><span>{draft.notesExclusions.trim() || "—"}</span></div></section>}
    <footer><p>{category?.footerText1 || "Category footer line 1"}</p><p>{category?.footerText2 || "Category footer line 2"}</p><strong>{digitalEmpire ? "THE DIGITAL EMPIRE • POWERED BY FMG AGENCY" : "FMG AGENCY • SUPERHEROES WHO CREATE"}</strong></footer>
  </div>;
}

function DataPanel({ state, mutate, busy, showToast, editDocument }: { state: AppState; mutate: Mutation; busy: boolean; showToast: (message: string) => void; editDocument: (document: DocumentRecord) => void }) {
  const [tab, setTab] = useState<"all" | "invoice" | "quotation">("all"); const [query, setQuery] = useState(""); const [category, setCategory] = useState("all"); const [status, setStatus] = useState("all"); const [sort, setSort] = useState("newest");
  const filtered = useMemo(() => state.documents.filter((document) => (tab === "all" || document.type === tab) && (category === "all" || String(document.categoryId) === category) && (status === "all" || document.status === status) && [document.generatedCode, document.clientName, document.companyName, document.categoryName].some((value) => value.toLowerCase().includes(query.toLowerCase()))).sort((a, b) => sort === "amount" ? b.total - a.total : sort === "client" ? (a.companyName || a.clientName).localeCompare(b.companyName || b.clientName) : new Date(b.date).getTime() - new Date(a.date).getTime()), [state.documents, tab, category, status, query, sort]);
  async function setDocumentStatus(document: DocumentRecord, nextStatus: string) { try { await mutate({ action: "setDocumentStatus", id: document.id, status: nextStatus }); showToast("Document status updated."); } catch (error) { showToast(error instanceof Error ? error.message : "Could not update status"); } }
  async function remove(document: DocumentRecord) { if (!window.confirm(`Delete ${document.generatedCode} and its PDF?`)) return; try { await mutate({ action: "deleteDocument", id: document.id }); showToast("Document and PDF deleted."); } catch (error) { showToast(error instanceof Error ? error.message : "Could not delete document"); } }
  return <section className="panel data-panel"><div className="data-tabs"><button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>All documents <span>{state.documents.length}</span></button><button className={tab === "invoice" ? "active" : ""} onClick={() => setTab("invoice")}>Invoices <span>{state.documents.filter((item) => item.type === "invoice").length}</span></button><button className={tab === "quotation" ? "active" : ""} onClick={() => setTab("quotation")}>Quotations <span>{state.documents.filter((item) => item.type === "quotation").length}</span></button></div><div className="filters-row"><div className="filter-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by code or client" /></div><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{state.categories.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{["Draft", "Sent", "Approved", "Paid", "Rejected"].map((record) => <option key={record}>{record}</option>)}</select><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="amount">Highest value</option><option value="client">Client A–Z</option></select></div>{filtered.length ? <div className="table-scroll"><table className="data-table document-table"><thead><tr><th>Document</th><th>Client</th><th>Category</th><th>Date</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map((document) => <tr key={document.id}><td><div className="document-code"><span className={document.type}>{document.type === "invoice" ? <ReceiptText size={17} /> : <FileText size={17} />}</span><span><strong>{document.generatedCode}</strong><small>{companyNames[document.companyKey || "fmg"]} · {document.type}</small></span></div></td><td><strong className="table-main">{document.companyName || document.clientName}</strong><small className="table-sub">{document.ownerName}</small></td><td><span className="category-pill">{document.categoryPrefix}</span> {document.categoryName}</td><td>{prettyDate(document.date)}</td><td><strong className="table-main">{money(document.total, document.currency)}</strong></td><td><select className="status-select" value={document.status} onChange={(event) => setDocumentStatus(document, event.target.value)} disabled={busy}>{["Draft", "Sent", "Approved", "Paid", "Rejected"].map((record) => <option key={record}>{record}</option>)}</select></td><td><div className="document-actions"><button onClick={() => window.open(`/api/pdf/${document.id}`, "_blank")} title="Preview"><Eye size={16} /></button><a href={`/api/pdf/${document.id}?download=1`} title="Download"><Download size={16} /></a><button onClick={() => editDocument(document)} title="Edit"><Pencil size={16} /></button><button className="danger" onClick={() => remove(document)} title="Delete"><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div> : <EmptyPanel icon={FolderKanban} title={state.documents.length ? "No documents match these filters" : "Your archive is ready"} body={state.documents.length ? "Clear a filter or try a different search." : "Every generated invoice and quotation will be permanently stored here."} />}</section>;
}

function SettingsPanel({ settings, mutate, busy, showToast, authUsername, onCredentialsChanged }: { settings: Settings; mutate: Mutation; busy: boolean; showToast: (message: string) => void; authUsername: string; onCredentialsChanged: (username: string) => void }) {
  const schema = z.object({ agencyName: z.string().min(1), defaultCurrency: z.string().min(1), preparedBy: z.string().min(1), defaultPaymentTerms: z.string(), defaultTax: z.number().min(0).max(100), phone: z.string(), email: z.union([z.string().email(), z.literal("")]), address: z.string() });
  type Input = z.infer<typeof schema>;
  const form = useForm<Input>({ resolver: zodResolver(schema), values: { agencyName: settings.agencyName, defaultCurrency: settings.defaultCurrency, preparedBy: settings.preparedBy, defaultPaymentTerms: settings.defaultPaymentTerms, defaultTax: settings.defaultTax, phone: settings.phone, email: settings.email, address: settings.address } });
  const submit = form.handleSubmit(async (data) => { try { await mutate({ action: "updateSettings", data }); showToast("Workspace settings saved."); } catch (error) { showToast(error instanceof Error ? error.message : "Could not save settings"); } });
  return <div className="settings-stack"><form className="settings-layout" onSubmit={submit}><section className="panel settings-card"><div className="settings-heading"><div className="settings-icon"><Building2 size={20} /></div><div><h2>Agency profile</h2><p>Defaults used when preparing FMG documents.</p></div></div><div className="form-grid"><Field label="Agency name"><input {...form.register("agencyName")} /></Field><Field label="Prepared by"><input {...form.register("preparedBy")} /></Field><Field label="Phone" hint="Optional"><input {...form.register("phone")} placeholder="+20…" /></Field><Field label="Email" hint="Optional"><input {...form.register("email")} placeholder="finance@fmg.agency" /></Field><Field label="Address" wide hint="Optional"><input {...form.register("address")} placeholder="Agency address" /></Field></div></section><section className="panel settings-card"><div className="settings-heading"><div className="settings-icon yellow"><CircleDollarSign size={20} /></div><div><h2>Document defaults</h2><p>These values prefill new invoices and quotations.</p></div></div><div className="form-grid"><Field label="Default currency"><select {...form.register("defaultCurrency")}><option>EGP</option><option>USD</option><option>EUR</option><option>SAR</option><option>AED</option></select></Field><Field label="Default tax / VAT %"><input type="number" min="0" max="100" step="0.01" {...form.register("defaultTax", { valueAsNumber: true })} /></Field><Field label="Default payment terms" wide><textarea rows={3} {...form.register("defaultPaymentTerms")} /></Field></div></section><section className="settings-save"><div><Check size={16} /><span>Changes apply to new documents. Existing PDFs stay unchanged.</span></div><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button></section></form><LoginCredentialsPanel key={authUsername} username={authUsername} allowUsernameChange onChanged={onCredentialsChanged} /></div>;
}

function Field({ label, hint, error, wide, children }: { label: string; hint?: string; error?: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={cx("field", wide && "field-wide", error && "field-error")}><span>{label}{hint && <small>{hint}</small>}</span>{children}{error && <em>{error}</em>}</label>;
}
