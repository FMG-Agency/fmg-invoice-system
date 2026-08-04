"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Bell,
  Building2,
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
import type { AppState, Category, Client, DocumentDraft, DocumentRecord, LineItem, Settings } from "../types";

type View = "dashboard" | "invoice" | "quotation" | "clients" | "categories" | "data" | "settings";
type Mutation = (body: Record<string, unknown>) => Promise<AppState>;
type AuthState = { checking: boolean; authenticated: boolean; setupRequired: boolean; username: string };

const clientSchema = z.object({
  name: z.string().trim().min(1, "Client name is required"),
  companyName: z.string().trim(),
  ownerName: z.string().trim().min(1, "Owner name is required"),
  phone: z.string().trim().min(3, "Phone number is required"),
  email: z.union([z.string().trim().email("Enter a valid email"), z.literal("")]),
  address: z.string().trim(),
  notes: z.string().trim(),
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

const navItems: Array<{ id: View; label: string; eyebrow: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Dashboard", eyebrow: "Overview", icon: LayoutDashboard },
  { id: "invoice", label: "New Invoice", eyebrow: "Create", icon: ReceiptText },
  { id: "quotation", label: "New Quotation", eyebrow: "Create", icon: FilePlus2 },
  { id: "clients", label: "Clients", eyebrow: "Directory", icon: UsersRound },
  { id: "categories", label: "Categories", eyebrow: "Services", icon: Tag },
  { id: "data", label: "All Data", eyebrow: "Archive", icon: FolderKanban },
  { id: "settings", label: "Settings", eyebrow: "Workspace", icon: Settings2 },
];

const viewCopy: Record<View, { eyebrow: string; title: string; description: string }> = {
  dashboard: { eyebrow: "FMG CONTROL CENTER", title: "Good evening, FMG.", description: "Your agency documents, clients, and activity in one calm workspace." },
  invoice: { eyebrow: "CREATE DOCUMENT", title: "New invoice", description: "Select a client and category, then add the billable work." },
  quotation: { eyebrow: "CREATE DOCUMENT", title: "New quotation", description: "Turn a scoped project into a polished client proposal." },
  clients: { eyebrow: "CLIENT DIRECTORY", title: "Clients", description: "One trusted source for every client and contact." },
  categories: { eyebrow: "SERVICE LOGIC", title: "Categories", description: "Control prefixes, counters, and the PDF footer for each service." },
  data: { eyebrow: "DOCUMENT ARCHIVE", title: "All data", description: "Search, filter, preview, and manage every generated document." },
  settings: { eyebrow: "WORKSPACE SETTINGS", title: "Settings", description: "Set the defaults that power every new FMG document." },
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

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FM";
}

function emptyItem(date = today()): LineItem {
  return { id: crypto.randomUUID(), date, description: "", qty: 1, unit: "Unit", unitPrice: 0 };
}

function draftFor(type: "invoice" | "quotation", settings: Settings): DocumentDraft {
  const date = today();
  return {
    type,
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

function AuthScreen({ setupRequired, onAuthenticated }: { setupRequired: boolean; onAuthenticated: (username: string) => Promise<void> }) {
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
      const result = await response.json() as { authenticated?: boolean; username?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not sign in.");
      await onAuthenticated(result.username || username);
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
      <div><span>PRIVATE AGENCY WORKSPACE</span><h1>Documents protected.<br />Business moving.</h1><p>Clients, invoices, quotations, and PDFs stay behind one secure FMG administrator account.</p></div>
      <small>FMG AGENCY • SUPERHEROES WHO CREATE</small>
    </section>
    <section className="auth-card-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-icon"><ShieldCheck size={23} /></div>
        <span className="eyebrow">{setupRequired ? "FIRST-TIME SETUP" : "SECURE ACCESS"}</span>
        <h2>{setupRequired ? "Create the admin account" : "Welcome back"}</h2>
        <p>{setupRequired ? "Choose the username and password you will use to enter the FMG system." : "Enter your FMG administrator credentials to continue."}</p>
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
  const [auth, setAuth] = useState<AuthState>({ checking: true, authenticated: false, setupRequired: false, username: "" });
  const [view, setView] = useState<View>("dashboard");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editingDocument, setEditingDocument] = useState<DocumentRecord | null>(null);

  useEffect(() => {
    const storedTheme = localStorage.getItem("fmg-theme");
    const shouldDark = storedTheme ? storedTheme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    const themeFrame = window.requestAnimationFrame(() => setDark(shouldDark));
    document.documentElement.dataset.theme = shouldDark ? "dark" : "light";
    void fetch("/api/auth", { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as { setupRequired?: boolean; authenticated?: boolean; username?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not check access.");
      const nextAuth = { checking: false, setupRequired: Boolean(result.setupRequired), authenticated: Boolean(result.authenticated), username: result.username ?? "" };
      setAuth(nextAuth);
      if (nextAuth.authenticated) await loadWorkspace(); else setLoading(false);
    }).catch((error: Error) => {
      setAuth({ checking: false, authenticated: false, setupRequired: false, username: "" });
      setLoading(false);
      showToast(error.message);
    });
    return () => window.cancelAnimationFrame(themeFrame);
    // Initial access check intentionally runs once; later workspace refreshes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3600);
  }

  function chooseView(next: View) {
    if (next !== "invoice" && next !== "quotation") setEditingDocument(null);
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

  async function loadWorkspace() {
    setLoading(true);
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const result = await response.json() as AppState | { error?: string; code?: string };
      if (response.status === 401) {
        setAuth({ checking: false, authenticated: false, setupRequired: false, username: "" });
        setState(emptyState);
        return;
      }
      if (!response.ok) throw new Error("error" in result && result.error ? result.error : "Could not load your workspace");
      setState(result as AppState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load your workspace");
    } finally {
      setLoading(false);
    }
  }

  async function handleAuthenticated(username: string) {
    setAuth({ checking: false, authenticated: true, setupRequired: false, username });
    await loadWorkspace();
  }

  async function logout() {
    try { await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "logout" }) }); } finally {
      setState(emptyState);
      setView("dashboard");
      setAuth({ checking: false, authenticated: false, setupRequired: false, username: "" });
      setMenuOpen(false);
    }
  }

  async function mutate(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as AppState | { error?: string };
      if (response.status === 401) {
        setAuth({ checking: false, authenticated: false, setupRequired: false, username: "" });
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

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    const clientResults = state.clients.filter((client) => [client.name, client.companyName, client.ownerName, client.phone, client.email].some((value) => value.toLowerCase().includes(query))).slice(0, 3).map((record) => ({ kind: "Client", title: record.companyName || record.name, meta: record.ownerName, view: "clients" as View }));
    const docResults = state.documents.filter((document) => [document.generatedCode, document.clientName, document.companyName, document.categoryName, document.type].some((value) => value.toLowerCase().includes(query))).slice(0, 4).map((record) => ({ kind: record.type === "invoice" ? "Invoice" : "Quotation", title: record.generatedCode, meta: record.companyName || record.clientName, view: "data" as View }));
    return [...docResults, ...clientResults];
  }, [search, state]);

  const copy = viewCopy[view];

  if (auth.checking || (auth.authenticated && loading)) return <div className="app-loader"><Image src="/fmg-logo-light.png" alt="FMG Agency" width={380} height={130} unoptimized /><span /><p>Preparing your agency workspace…</p></div>;
  if (!auth.authenticated) return <AuthScreen setupRequired={auth.setupRequired} onAuthenticated={handleAuthenticated} />;

  return (
    <div className="app-shell" dir="ltr">
      <aside className={cx("sidebar", menuOpen && "sidebar-open")} dir="ltr">
        <div className="brand-block">
          <Image src="/fmg-logo-light.png" alt="FMG Agency" width={380} height={130} unoptimized />
          <button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <p className="side-label">Agency workspace</p>
        <nav aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return <button key={item.id} className={cx("nav-item", active && "active")} onClick={() => chooseView(item.id)}><Icon size={19} /><span><strong>{item.label}</strong><small>{item.eyebrow}</small></span>{active && <i />}</button>;
          })}
        </nav>
        <div className="side-foot">
          <div className="workspace-chip"><div className="avatar">{initials(auth.username)}</div><div><strong>{auth.username}</strong><small>FMG administrator</small></div><button onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button></div>
          <p><span /> All systems operational</p>
        </div>
      </aside>

      {menuOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}

      <main className="main-area" dir="ltr">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
          <div className="global-search">
            <Search size={18} />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} placeholder="Search clients, codes, categories…" aria-label="Global search" />
            <kbd>⌘ K</kbd>
            {searchOpen && search && <div className="search-results">
              <div className="search-title"><span>Quick results</span><button onClick={() => setSearchOpen(false)}><X size={15} /></button></div>
              {searchResults.length ? searchResults.map((result, index) => <button key={`${result.kind}-${index}`} onClick={() => chooseView(result.view)}><span className="result-icon">{result.kind === "Client" ? <UserRound size={15} /> : <FileText size={15} />}</span><span><strong>{result.title}</strong><small>{result.kind} · {result.meta}</small></span><ArrowLeft size={15} /></button>) : <p className="no-search">No matching records yet.</p>}
            </div>}
          </div>
          <div className="top-actions">
            <button className="icon-button" onClick={toggleTheme} aria-label="Toggle theme">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button className="icon-button notification" aria-label="Notifications"><Bell size={18} /><span /></button>
            <div className="top-avatar">{initials(auth.username)}</div>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div><span className="eyebrow">{copy.eyebrow}</span><h1>{copy.title}</h1><p>{copy.description}</p></div>
            {view === "dashboard" && <button className="primary-button" onClick={() => chooseView("invoice")}><Plus size={17} /> Create document</button>}
          </div>

          {view === "dashboard" && <Dashboard state={state} chooseView={chooseView} />}
          {view === "clients" && <ClientsPanel clients={state.clients} mutate={mutate} busy={busy} showToast={showToast} />}
          {view === "categories" && <CategoriesPanel categories={state.categories} mutate={mutate} busy={busy} showToast={showToast} />}
          {(view === "invoice" || view === "quotation") && <DocumentEditor key={`${view}-${editingDocument?.id ?? "new"}`} type={view} state={state} mutate={mutate} busy={busy} editing={editingDocument} onDone={() => { setEditingDocument(null); chooseView("data"); }} showToast={showToast} />}
          {view === "data" && <DataPanel state={state} mutate={mutate} busy={busy} showToast={showToast} editDocument={(document) => { setEditingDocument(document); setView(document.type); }} />}
          {view === "settings" && <SettingsPanel settings={state.settings} mutate={mutate} busy={busy} showToast={showToast} authUsername={auth.username} onCredentialsChanged={(username) => setAuth((current) => ({ ...current, username }))} />}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.slice(0, 5).map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => chooseView(item.id)}><Icon size={19} /><span>{item.label.replace("New ", "")}</span></button>; })}
      </nav>
      {toast && <div className="toast"><Check size={17} /><span>{toast}</span></div>}
    </div>
  );
}

function Dashboard({ state, chooseView }: { state: AppState; chooseView: (view: View) => void }) {
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
    <section className="quick-create">
      <div className="quick-copy"><span className="spark"><Sparkles size={18} /></span><div><strong>Create something polished.</strong><p>Start with a client, choose the right category, and FMG handles the document number and layout.</p></div></div>
      <div className="quick-actions"><button onClick={() => chooseView("invoice")}><ReceiptText size={18} /><span><strong>New invoice</strong><small>Bill approved work</small></span><ArrowLeft size={17} /></button><button onClick={() => chooseView("quotation")}><FilePenLine size={18} /><span><strong>New quotation</strong><small>Scope a project</small></span><ArrowLeft size={17} /></button></div>
    </section>
    <section className="stats-grid">{stats.map((stat) => { const Icon = stat.icon; return <article key={stat.label} className={cx("stat-card", `stat-${stat.tone}`)}><div className="stat-top"><span>{stat.label}</span><i><Icon size={19} /></i></div><strong className="stat-value">{stat.value}</strong><small>{stat.note}</small></article>; })}</section>
    <section className="dashboard-grid">
      <article className="panel chart-panel"><div className="panel-heading"><div><span className="eyebrow">DOCUMENT VALUE</span><h2>Agency momentum</h2></div><span className="period-chip">Last 6 months <ChevronDown size={14} /></span></div><div className="chart-summary"><strong>{money(state.documents.reduce((sum, document) => sum + document.total, 0))}</strong><span>Total document value</span></div><div className="bar-chart">{months.map((month, index) => <div className="bar-column" key={`${month.label}-${index}`}><div className="bar-track"><i style={{ height: `${month.height}%` }} /></div><span>{month.label}</span></div>)}</div></article>
      <article className="panel recent-panel"><div className="panel-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Latest documents</h2></div><button className="text-button" onClick={() => chooseView("data")}>View all <ArrowLeft size={15} /></button></div>{recent.length ? <div className="recent-list">{recent.map((document) => <button key={document.id} onClick={() => chooseView("data")}><span className={cx("file-icon", document.type)}>{document.type === "invoice" ? <ReceiptText size={18} /> : <FileText size={18} />}</span><span className="recent-copy"><strong>{document.generatedCode}</strong><small>{document.companyName || document.clientName} · {prettyDate(document.date)}</small></span><span className="recent-value"><strong>{money(document.total, document.currency)}</strong><StatusBadge value={document.status} /></span></button>)}</div> : <EmptyPanel icon={ClipboardList} title="No documents yet" body="Your latest invoices and quotations will appear here." action={<button className="small-primary" onClick={() => chooseView("invoice")}><Plus size={15} /> Create the first</button>} />}</article>
    </section>
  </>;
}

function ClientsPanel({ clients, mutate, busy, showToast }: { clients: Client[]; mutate: Mutation; busy: boolean; showToast: (message: string) => void }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Client | null>(null);
  const [open, setOpen] = useState(false);
  const form = useForm<ClientInput>({ resolver: zodResolver(clientSchema), defaultValues: { name: "", companyName: "", ownerName: "", phone: "", email: "", address: "", notes: "" } });
  const filtered = clients.filter((client) => [client.name, client.companyName, client.ownerName, client.phone, client.email].some((value) => value.toLowerCase().includes(query.toLowerCase())));
  function openForm(client?: Client) {
    setEditing(client ?? null); setOpen(true);
    form.reset(client ? { name: client.name, companyName: client.companyName, ownerName: client.ownerName, phone: client.phone, email: client.email, address: client.address, notes: client.notes } : { name: "", companyName: "", ownerName: "", phone: "", email: "", address: "", notes: "" });
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
    {filtered.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Client</th><th>Contact person</th><th>Phone</th><th>Email</th><th>Location</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((client) => <tr key={client.id}><td><div className="client-cell"><span className="avatar-soft">{initials(client.companyName || client.name)}</span><span><strong>{client.companyName || client.name}</strong><small>{client.companyName ? client.name : "Independent client"}</small></span></div></td><td><strong className="table-main">{client.ownerName}</strong></td><td>{client.phone}</td><td>{client.email || "—"}</td><td>{client.address || "—"}</td><td><div className="row-actions"><button onClick={() => openForm(client)} aria-label="Edit client"><Pencil size={16} /></button><button className="danger" onClick={() => remove(client)} aria-label="Delete client"><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div> : <EmptyPanel icon={UsersRound} title={query ? "No matching clients" : "Build your client directory"} body={query ? "Try a different name, phone number, or email." : "Add a client once and their details will flow into every invoice and quotation."} action={!query ? <button className="small-primary" onClick={() => openForm()}><Plus size={15} /> Add first client</button> : undefined} />}
    {open && <Modal title={editing ? "Edit client" : "Add a client"} description="These details automatically populate every FMG document." onClose={() => setOpen(false)}><form className="modal-form" onSubmit={submit}><div className="form-grid"><Field label="Client name" error={form.formState.errors.name?.message}><input {...form.register("name")} placeholder="e.g. Glow" /></Field><Field label="Company name" hint="Optional"><input {...form.register("companyName")} placeholder="e.g. Glow Cosmetics" /></Field><Field label="Owner / contact person" error={form.formState.errors.ownerName?.message}><input {...form.register("ownerName")} placeholder="Full name" /></Field><Field label="Phone number" error={form.formState.errors.phone?.message}><input {...form.register("phone")} placeholder="+20…" /></Field><Field label="Email" hint="Optional" error={form.formState.errors.email?.message}><input {...form.register("email")} placeholder="hello@company.com" /></Field><Field label="Address" hint="Optional"><input {...form.register("address")} placeholder="City, country" /></Field><Field label="Notes" wide hint="Optional"><textarea {...form.register("notes")} rows={3} placeholder="Internal notes about this client" /></Field></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add client"}</button></div></form></Modal>}
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

function DocumentEditor({ type, state, mutate, busy, editing, onDone, showToast }: { type: "invoice" | "quotation"; state: AppState; mutate: Mutation; busy: boolean; editing: DocumentRecord | null; onDone: () => void; showToast: (message: string) => void }) {
  const [draft, setDraft] = useState<DocumentDraft>(() => editing && editing.type === type
    ? { id: editing.id, generatedCode: editing.generatedCode, type: editing.type, clientId: editing.clientId, categoryId: editing.categoryId, date: editing.date, validUntil: editing.validUntil, preparedBy: editing.preparedBy, currency: editing.currency, project: editing.project, status: editing.status, items: editing.items.map((item) => ({ ...item, id: item.id || crypto.randomUUID() })), discount: editing.discount, tax: editing.tax, paymentTerms: editing.paymentTerms, notesExclusions: editing.notesExclusions }
    : draftFor(type, state.settings));
  const [generating, setGenerating] = useState(false);
  const client = state.clients.find((record) => record.id === draft.clientId);
  const category = state.categories.find((record) => record.id === draft.categoryId);
  const subtotal = draft.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
  const total = Math.max(0, subtotal - Number(draft.discount || 0) + Number(draft.tax || 0));
  const provisionalCode = editing?.generatedCode || (client && category ? `${(client.companyName || client.name).trim().replace(/[^A-Za-z0-9\u0600-\u06FF]+/g, "-").replace(/^-|-$/g, "")}-${category.prefix}${String(category.counter + 1).padStart(4, "0")}` : "Select client + category");
  function patchDraft<Key extends keyof DocumentDraft>(key: Key, value: DocumentDraft[Key]) { setDraft((current) => ({ ...current, [key]: value })); }
  function patchItem(id: string, key: keyof LineItem, value: string | number) { setDraft((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, [key]: value } : item) })); }
  async function submit() {
    if (!client || !category) return showToast("Choose a client and category first.");
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
      {editing && <div className="editing-banner"><FilePenLine size={17} /><span>You are editing <strong>{editing.generatedCode}</strong>. Its permanent code will not change.</span></div>}
      <div className="step-heading"><span>01</span><div><h2>Client & category</h2><p>The selected records drive contact details, numbering, and footer content.</p></div></div>
      <div className="form-grid editor-grid"><Field label="Select client"><select value={draft.clientId} onChange={(event) => patchDraft("clientId", Number(event.target.value))}><option value={0}>Choose a client</option>{state.clients.map((record) => <option key={record.id} value={record.id}>{record.companyName || record.name}</option>)}</select></Field><Field label="Select category"><select value={draft.categoryId} onChange={(event) => patchDraft("categoryId", Number(event.target.value))}><option value={0}>Choose a category</option>{state.categories.map((record) => <option key={record.id} value={record.id}>{record.name} · {record.prefix}</option>)}</select></Field></div>
      {client && <div className="selected-client"><div className="avatar-soft">{initials(client.companyName || client.name)}</div><div><span>Client information</span><strong>{client.companyName || client.name}</strong><p>{client.ownerName} · {client.phone}{client.email ? ` · ${client.email}` : ""}</p></div><Check size={18} /></div>}
      <div className="step-heading"><span>02</span><div><h2>Document details</h2><p>Fields follow the uploaded FMG {type} template.</p></div></div>
      <div className="form-grid editor-grid"><Field label="Date"><input type="date" value={draft.date} onChange={(event) => { patchDraft("date", event.target.value); setDraft((current) => ({ ...current, items: current.items.map((item) => item.date ? item : { ...item, date: event.target.value }) })); }} /></Field><Field label="Valid until"><input type="date" value={draft.validUntil} onChange={(event) => patchDraft("validUntil", event.target.value)} /></Field><Field label="Prepared by"><input value={draft.preparedBy} onChange={(event) => patchDraft("preparedBy", event.target.value)} /></Field><Field label="Currency"><select value={draft.currency} onChange={(event) => patchDraft("currency", event.target.value)}><option>EGP</option><option>USD</option><option>EUR</option><option>SAR</option><option>AED</option></select></Field>{type === "quotation" && <Field label="Project" wide><input value={draft.project} onChange={(event) => patchDraft("project", event.target.value)} placeholder="Project or campaign name" /></Field>}</div>
      <div className="step-heading items-heading"><span>03</span><div><h2>Scope & pricing</h2><p>Add or remove line items. Totals update automatically.</p></div><button className="secondary-button" onClick={() => patchDraft("items", [...draft.items, emptyItem(draft.date)])}><Plus size={16} /> Add item</button></div>
      <div className="items-table-wrap"><table className="items-table"><thead><tr><th>#</th>{type === "invoice" && <th>Date</th>}<th>Service / deliverable</th><th>Qty</th>{type === "quotation" && <th>Unit</th>}<th>Unit price</th><th>Total</th><th /></tr></thead><tbody>{draft.items.map((item, index) => <tr key={item.id}><td><span className="item-number">{String(index + 1).padStart(2, "0")}</span></td>{type === "invoice" && <td><input type="date" value={item.date} onChange={(event) => patchItem(item.id, "date", event.target.value)} /></td>}<td><input value={item.description} onChange={(event) => patchItem(item.id, "description", event.target.value)} placeholder="Describe the service" /></td><td><input type="number" min="0" step="0.01" value={item.qty} onChange={(event) => patchItem(item.id, "qty", Number(event.target.value))} /></td>{type === "quotation" && <td><input value={item.unit} onChange={(event) => patchItem(item.id, "unit", event.target.value)} /></td>}<td><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => patchItem(item.id, "unitPrice", Number(event.target.value))} /></td><td><strong>{money(item.qty * item.unitPrice, draft.currency)}</strong></td><td><button className="delete-item" aria-label="Remove item" onClick={() => patchDraft("items", draft.items.filter((record) => record.id !== item.id))} disabled={draft.items.length === 1}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>
      <div className="document-bottom"><div className="document-notes">{type === "quotation" ? <><Field label="Payment terms"><input value={draft.paymentTerms} onChange={(event) => patchDraft("paymentTerms", event.target.value)} /></Field><Field label="Notes / exclusions"><textarea value={draft.notesExclusions} onChange={(event) => patchDraft("notesExclusions", event.target.value)} rows={3} placeholder="Optional notes shown on the quotation" /></Field></> : <div className="template-note"><FileCheck2 size={18} /><p><strong>Template matched.</strong><span>Header, client block, totals, signatures, and category footer are included.</span></p></div>}</div><div className="totals-card"><div><span>Subtotal</span><strong>{money(subtotal, draft.currency)}</strong></div><div><span>Discount</span><input type="number" min="0" step="0.01" value={draft.discount} onChange={(event) => patchDraft("discount", Number(event.target.value))} /></div><div><span>Tax / VAT</span><input type="number" min="0" step="0.01" value={draft.tax} onChange={(event) => patchDraft("tax", Number(event.target.value))} /></div><div className="grand-total"><span>Grand total</span><strong>{money(total, draft.currency)}</strong></div></div></div>
      <div className="editor-actions"><span><Clock3 size={15} /> Code: <strong>{provisionalCode}</strong></span><button className="primary-button generate-button" onClick={submit} disabled={busy || generating}><Printer size={17} /> {generating ? "Generating PDF…" : editing ? "Update & download PDF" : `Generate ${type} PDF`}</button></div>
    </section>
    <aside className="preview-panel"><div className="preview-toolbar"><span><Eye size={16} /> Live preview</span><span>A4</span></div><DocumentPreview draft={draft} client={client} category={category} code={provisionalCode} /></aside>
  </div>;
}

function DocumentPreview({ draft, client, category, code }: { draft: DocumentDraft; client?: Client; category?: Category; code: string }) {
  const subtotal = draft.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0); const total = subtotal - draft.discount + draft.tax;
  return <div className="paper-preview"><div className="paper-slash" /><header><Image src="/fmg-logo-dark.png" alt="" width={380} height={130} unoptimized /><div><strong>{draft.type.toUpperCase()}</strong><span>CREATIVE • DIGITAL • PRODUCTION</span></div></header><h4><i />{draft.type.toUpperCase()} INFORMATION /</h4><div className="paper-grid"><b>{draft.type === "invoice" ? "INVOICE NO." : "QUOTATION NO."}</b><span>{code}</span><b>DATE</b><span>{draft.date || "—"}</span><b>VALID UNTIL</b><span>{draft.validUntil || "—"}</span><b>PREPARED BY</b><span>{draft.preparedBy || "—"}</span></div><h4><i />CLIENT INFORMATION /</h4><div className="paper-grid"><b>CLIENT / COMPANY</b><span>{client?.companyName || client?.name || "Choose client"}</span><b>CONTACT PERSON</b><span>{client?.ownerName || "—"}</span><b>EMAIL</b><span>{client?.email || "—"}</span><b>PHONE</b><span>{client?.phone || "—"}</span></div><h4><i />SCOPE & PRICING /</h4><table><thead><tr><th>#</th><th>SERVICE / DELIVERABLE</th><th>QTY</th><th>PRICE</th><th>TOTAL</th></tr></thead><tbody>{draft.items.slice(0, 5).map((item, index) => <tr key={item.id}><td>{index + 1}</td><td>{item.description || "—"}</td><td>{item.qty}</td><td>{item.unitPrice.toLocaleString()}</td><td>{(item.qty * item.unitPrice).toLocaleString()}</td></tr>)}</tbody></table><div className="paper-totals"><span>SUBTOTAL <b>{subtotal.toLocaleString()} {draft.currency}</b></span><span>DISCOUNT <b>{draft.discount.toLocaleString()}</b></span><span>GRAND TOTAL <b>{total.toLocaleString()} {draft.currency}</b></span></div><footer><p>{category?.footerText1 || "Category footer line 1"}</p><p>{category?.footerText2 || "Category footer line 2"}</p><strong>FMG AGENCY • SUPERHEROES WHO CREATE</strong></footer></div>;
}

function DataPanel({ state, mutate, busy, showToast, editDocument }: { state: AppState; mutate: Mutation; busy: boolean; showToast: (message: string) => void; editDocument: (document: DocumentRecord) => void }) {
  const [tab, setTab] = useState<"all" | "invoice" | "quotation">("all"); const [query, setQuery] = useState(""); const [category, setCategory] = useState("all"); const [status, setStatus] = useState("all"); const [sort, setSort] = useState("newest");
  const filtered = useMemo(() => state.documents.filter((document) => (tab === "all" || document.type === tab) && (category === "all" || String(document.categoryId) === category) && (status === "all" || document.status === status) && [document.generatedCode, document.clientName, document.companyName, document.categoryName].some((value) => value.toLowerCase().includes(query.toLowerCase()))).sort((a, b) => sort === "amount" ? b.total - a.total : sort === "client" ? (a.companyName || a.clientName).localeCompare(b.companyName || b.clientName) : new Date(b.date).getTime() - new Date(a.date).getTime()), [state.documents, tab, category, status, query, sort]);
  async function setDocumentStatus(document: DocumentRecord, nextStatus: string) { try { await mutate({ action: "setDocumentStatus", id: document.id, status: nextStatus }); showToast("Document status updated."); } catch (error) { showToast(error instanceof Error ? error.message : "Could not update status"); } }
  async function remove(document: DocumentRecord) { if (!window.confirm(`Delete ${document.generatedCode} and its PDF?`)) return; try { await mutate({ action: "deleteDocument", id: document.id }); showToast("Document and PDF deleted."); } catch (error) { showToast(error instanceof Error ? error.message : "Could not delete document"); } }
  return <section className="panel data-panel"><div className="data-tabs"><button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>All documents <span>{state.documents.length}</span></button><button className={tab === "invoice" ? "active" : ""} onClick={() => setTab("invoice")}>Invoices <span>{state.documents.filter((item) => item.type === "invoice").length}</span></button><button className={tab === "quotation" ? "active" : ""} onClick={() => setTab("quotation")}>Quotations <span>{state.documents.filter((item) => item.type === "quotation").length}</span></button></div><div className="filters-row"><div className="filter-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by code or client" /></div><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{state.categories.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{["Draft", "Sent", "Approved", "Paid", "Rejected"].map((record) => <option key={record}>{record}</option>)}</select><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="amount">Highest value</option><option value="client">Client A–Z</option></select></div>{filtered.length ? <div className="table-scroll"><table className="data-table document-table"><thead><tr><th>Document</th><th>Client</th><th>Category</th><th>Date</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map((document) => <tr key={document.id}><td><div className="document-code"><span className={document.type}>{document.type === "invoice" ? <ReceiptText size={17} /> : <FileText size={17} />}</span><span><strong>{document.generatedCode}</strong><small>{document.type}</small></span></div></td><td><strong className="table-main">{document.companyName || document.clientName}</strong><small className="table-sub">{document.ownerName}</small></td><td><span className="category-pill">{document.categoryPrefix}</span> {document.categoryName}</td><td>{prettyDate(document.date)}</td><td><strong className="table-main">{money(document.total, document.currency)}</strong></td><td><select className="status-select" value={document.status} onChange={(event) => setDocumentStatus(document, event.target.value)} disabled={busy}>{["Draft", "Sent", "Approved", "Paid", "Rejected"].map((record) => <option key={record}>{record}</option>)}</select></td><td><div className="document-actions"><button onClick={() => window.open(`/api/pdf/${document.id}`, "_blank")} title="Preview"><Eye size={16} /></button><a href={`/api/pdf/${document.id}?download=1`} title="Download"><Download size={16} /></a><button onClick={() => editDocument(document)} title="Edit"><Pencil size={16} /></button><button className="danger" onClick={() => remove(document)} title="Delete"><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div> : <EmptyPanel icon={FolderKanban} title={state.documents.length ? "No documents match these filters" : "Your archive is ready"} body={state.documents.length ? "Clear a filter or try a different search." : "Every generated invoice and quotation will be permanently stored here."} />}</section>;
}

function SettingsPanel({ settings, mutate, busy, showToast, authUsername, onCredentialsChanged }: { settings: Settings; mutate: Mutation; busy: boolean; showToast: (message: string) => void; authUsername: string; onCredentialsChanged: (username: string) => void }) {
  const schema = z.object({ agencyName: z.string().min(1), defaultCurrency: z.string().min(1), preparedBy: z.string().min(1), defaultPaymentTerms: z.string(), defaultTax: z.number().min(0).max(100), phone: z.string(), email: z.union([z.string().email(), z.literal("")]), address: z.string() });
  type Input = z.infer<typeof schema>;
  const form = useForm<Input>({ resolver: zodResolver(schema), values: { agencyName: settings.agencyName, defaultCurrency: settings.defaultCurrency, preparedBy: settings.preparedBy, defaultPaymentTerms: settings.defaultPaymentTerms, defaultTax: settings.defaultTax, phone: settings.phone, email: settings.email, address: settings.address } });
  const submit = form.handleSubmit(async (data) => { try { await mutate({ action: "updateSettings", data }); showToast("Workspace settings saved."); } catch (error) { showToast(error instanceof Error ? error.message : "Could not save settings"); } });
  return <div className="settings-stack"><form className="settings-layout" onSubmit={submit}><section className="panel settings-card"><div className="settings-heading"><div className="settings-icon"><Building2 size={20} /></div><div><h2>Agency profile</h2><p>Defaults used when preparing FMG documents.</p></div></div><div className="form-grid"><Field label="Agency name"><input {...form.register("agencyName")} /></Field><Field label="Prepared by"><input {...form.register("preparedBy")} /></Field><Field label="Phone" hint="Optional"><input {...form.register("phone")} placeholder="+20…" /></Field><Field label="Email" hint="Optional"><input {...form.register("email")} placeholder="finance@fmg.agency" /></Field><Field label="Address" wide hint="Optional"><input {...form.register("address")} placeholder="Agency address" /></Field></div></section><section className="panel settings-card"><div className="settings-heading"><div className="settings-icon yellow"><CircleDollarSign size={20} /></div><div><h2>Document defaults</h2><p>These values prefill new invoices and quotations.</p></div></div><div className="form-grid"><Field label="Default currency"><select {...form.register("defaultCurrency")}><option>EGP</option><option>USD</option><option>EUR</option><option>SAR</option><option>AED</option></select></Field><Field label="Default tax / VAT %"><input type="number" min="0" max="100" step="0.01" {...form.register("defaultTax", { valueAsNumber: true })} /></Field><Field label="Default payment terms" wide><textarea rows={3} {...form.register("defaultPaymentTerms")} /></Field></div></section><section className="settings-save"><div><Check size={16} /><span>Changes apply to new documents. Existing PDFs stay unchanged.</span></div><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button></section></form><CredentialsPanel username={authUsername} onChanged={onCredentialsChanged} showToast={showToast} /></div>;
}

function CredentialsPanel({ username, onChanged, showToast }: { username: string; onChanged: (username: string) => void; showToast: (message: string) => void }) {
  const schema = z.object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newUsername: z.string().trim().min(3, "Use at least 3 characters.").max(80).regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dots, dashes, or underscores."),
    newPassword: z.union([z.string().min(8, "Use at least 8 characters."), z.literal("")]),
    confirmPassword: z.string(),
  }).refine((value) => value.newPassword === value.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });
  type Input = z.infer<typeof schema>;
  const form = useForm<Input>({ resolver: zodResolver(schema), defaultValues: { currentPassword: "", newUsername: username, newPassword: "", confirmPassword: "" } });
  const [saving, setSaving] = useState(false);
  const submit = form.handleSubmit(async (data) => {
    setSaving(true);
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "change", currentPassword: data.currentPassword, newUsername: data.newUsername, newPassword: data.newPassword }) });
      const result = await response.json() as { username?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not update credentials.");
      const nextUsername = result.username || data.newUsername;
      onChanged(nextUsername);
      form.reset({ currentPassword: "", newUsername: nextUsername, newPassword: "", confirmPassword: "" });
      showToast("Login credentials updated. Other sessions were signed out.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not update credentials.");
    } finally {
      setSaving(false);
    }
  });
  return <form className="panel settings-card security-card" onSubmit={submit}><div className="settings-heading"><div className="settings-icon yellow"><ShieldCheck size={20} /></div><div><h2>Login credentials</h2><p>Change the username or set a new password for the FMG administrator account.</p></div></div><div className="form-grid security-grid"><Field label="Current password" error={form.formState.errors.currentPassword?.message}><input type="password" autoComplete="current-password" {...form.register("currentPassword")} placeholder="Required to confirm changes" /></Field><Field label="Username" error={form.formState.errors.newUsername?.message}><input autoComplete="username" {...form.register("newUsername")} /></Field><Field label="New password" hint="Leave blank to keep it" error={form.formState.errors.newPassword?.message}><input type="password" autoComplete="new-password" {...form.register("newPassword")} placeholder="At least 8 characters" /></Field><Field label="Confirm new password" error={form.formState.errors.confirmPassword?.message}><input type="password" autoComplete="new-password" {...form.register("confirmPassword")} placeholder="Repeat the new password" /></Field></div><div className="security-actions"><div><LockKeyhole size={15} /><span>Changing credentials signs out every other active session.</span></div><button className="primary-button" disabled={saving}>{saving ? "Updating…" : "Update login"}</button></div></form>;
}

function Field({ label, hint, error, wide, children }: { label: string; hint?: string; error?: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={cx("field", wide && "field-wide", error && "field-error")}><span>{label}{hint && <small>{hint}</small>}</span>{children}{error && <em>{error}</em>}</label>;
}
