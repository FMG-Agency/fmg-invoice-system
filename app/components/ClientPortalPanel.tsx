"use client";

import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  ImageUp,
  Link2,
  LogOut,
  Moon,
  ReceiptText,
  Save,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Client, ClientPortalPlanPart, ClientPortalState } from "../types";
import { LoginCredentialsPanel } from "./LoginCredentialsPanel";
import styles from "./ClientPortalPanel.module.css";

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function currentYear() {
  return new Date().getFullYear();
}

function currentMonth() {
  return new Date().getMonth() + 1;
}

function money(value: number, currency = "EGP") {
  return new Intl.NumberFormat("en-EG", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function prettyDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function partRange(year: number, month: number, part: 1 | 2) {
  const finalDay = new Date(year, month, 0).getDate();
  return part === 1 ? `01–15 ${monthNames[month - 1]}` : `16–${String(finalDay).padStart(2, "0")} ${monthNames[month - 1]}`;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "CL";
}

function ClientBrandMark({ client, title, className }: { client: Client | null | undefined; title: string; className: string }) {
  const [failed, setFailed] = useState(false);
  const logoUrl = client?.portalLogoAvailable ? `/api/client-portal/logo/${client.id}?v=${encodeURIComponent(client.portalLogoUpdatedAt || "1")}` : "";
  return <span className={`${styles.clientBrandMark} ${className}`} data-has-logo={logoUrl && !failed ? "true" : "false"}>
    {logoUrl && !failed
      ? <Image src={logoUrl} alt={`${title} logo`} fill sizes="160px" unoptimized onError={() => setFailed(true)} />
      : initials(title)}
  </span>;
}

async function portalJson(response: Response) {
  const payload = await response.json() as ClientPortalState | { error?: string };
  if (!response.ok) throw new Error(("error" in payload && payload.error) || "Could not load the client portal.");
  return payload as ClientPortalState;
}

function MonthPicker({ year, selected, plans, onSelect }: { year: number; selected: number; plans: ClientPortalPlanPart[]; onSelect: (month: number) => void }) {
  return <div className={styles.monthPicker}>{monthNames.map((month, index) => {
    const number = index + 1;
    const published = plans.filter((plan) => plan.month === number && plan.published).length;
    const saved = plans.filter((plan) => plan.month === number).length;
    return <button key={month} className={selected === number ? styles.monthActive : ""} onClick={() => onSelect(number)}>
      <span>{month.slice(0, 3)}</span><strong>{String(number).padStart(2, "0")}</strong><small>{published ? `${published} live` : saved ? `${saved} draft` : year < currentYear() || (year === currentYear() && number < currentMonth()) ? "No plan" : "Upcoming"}</small>
    </button>;
  })}</div>;
}

export function ClientPortalShell({ displayName, username, dark, onToggleTheme, onLogout, onCredentialsChanged }: { displayName: string; username: string; dark: boolean; onToggleTheme: () => void; onLogout: () => Promise<void>; onCredentialsChanged: (username: string) => void }) {
  const [state, setState] = useState<ClientPortalState | null>(null);
  const [year, setYear] = useState(currentYear());
  const [month, setMonth] = useState(currentMonth());
  const [tab, setTab] = useState<"invoices" | "plans" | "settings">("invoices");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/client-portal?year=${year}`, { cache: "no-store" }).then(portalJson).then((result) => {
      if (!active) return;
      setState(result);
      setError("");
    }).catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : "Could not load your portal.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [year]);

  const title = state?.client?.companyName || state?.client?.name || displayName;
  const summary = state?.summaries[0];
  const monthPlans = state?.plans.filter((plan) => plan.month === month && plan.published) ?? [];
  const dueInvoices = state?.invoices.filter((invoice) => invoice.remaining > 0) ?? [];
  const totalDue = summary?.outstanding ?? dueInvoices.reduce((sum, invoice) => sum + invoice.remaining, 0);
  const currency = summary?.currency || state?.invoices[0]?.currency || "EGP";

  return <div className={styles.portal} data-agency={state?.client?.agencyKey || "fmg"}>
    <header className={styles.portalHeader}>
      <div className={styles.portalBrand}><Image src="/fmg-logo-light.png" alt="FMG Agency" width={380} height={130} unoptimized /><span>CLIENT PORTAL</span></div>
      <nav aria-label="Client portal navigation"><button className={tab === "invoices" ? styles.activeTab : ""} onClick={() => setTab("invoices")}><ReceiptText size={17} /> Invoices</button><button className={tab === "plans" ? styles.activeTab : ""} onClick={() => setTab("plans")}><CalendarDays size={17} /> Monthly plans</button><button className={tab === "settings" ? styles.activeTab : ""} onClick={() => setTab("settings")}><Settings2 size={17} /> Settings</button></nav>
      <div className={styles.portalUser}><button onClick={onToggleTheme} aria-label="Toggle theme">{dark ? <Sun size={17} /> : <Moon size={17} />}</button><span><ClientBrandMark key={`header-${state?.client?.id}-${state?.client?.portalLogoUpdatedAt}`} client={state?.client} title={title} className={styles.portalUserMark} /><span><strong>{title}</strong><small>{displayName}</small></span></span><button onClick={() => void onLogout()} aria-label="Sign out"><LogOut size={17} /></button></div>
    </header>

    <main className={styles.portalMain}>
      {loading && !state ? <div className={styles.portalLoading}><span /><strong>Preparing your private workspace…</strong></div> : error ? <div className={styles.portalError}><FileText size={24} /><h2>Portal unavailable</h2><p>{error}</p></div> : state?.client ? <>
        <section className={styles.clientWelcome}>
          <div><span><Sparkles size={14} /> FMG × {title}</span><h1>{tab === "invoices" ? "Your account, made clear." : tab === "plans" ? "Every plan. Every month. One place." : "Keep your account secure."}</h1><p>{tab === "invoices" ? "Review issued invoices, see what has been paid, and open the document whenever you need it." : tab === "plans" ? "Choose a month, then open Part 1 or Part 2 for the exact content period you need." : "Update your own password without access to any FMG company settings."}</p></div>
          <ClientBrandMark key={`hero-${state.client.id}-${state.client.portalLogoUpdatedAt}`} client={state.client} title={title} className={styles.welcomeMark} />
        </section>

        {tab === "invoices" ? <>
          <section className={styles.portalMetrics}>
            <article className={styles.dueMetric}><span><WalletCards size={16} /> CURRENT AMOUNT DUE</span><strong>{money(totalDue, currency)}</strong><small>{dueInvoices.length ? `${dueInvoices.length} invoice${dueInvoices.length === 1 ? "" : "s"} awaiting payment` : "Your account is currently settled"}</small></article>
            <article><span>TOTAL ISSUED</span><strong>{state.invoices.length}</strong><small>Visible invoices in your portal</small></article>
          </section>
          <section className={styles.portalSection}>
            <div className={styles.sectionHeading}><div><span>INVOICE CENTER</span><h2>Your invoices</h2><p>Open any invoice to review the scope, amount, and payment terms.</p></div><span className={styles.securePill}><CheckCircle2 size={14} /> Private & secure</span></div>
            {state.invoices.length ? <div className={styles.invoiceGrid}>{state.invoices.map((invoice) => <article key={invoice.id} className={invoice.remaining > 0 ? styles.invoiceDue : styles.invoicePaid}>
              <div className={styles.invoiceTop}><span className={styles.invoiceIcon}><ReceiptText size={19} /></span><span className={styles.invoiceStatus}>{invoice.remaining > 0 ? "PAYMENT DUE" : "SETTLED"}</span></div>
              <strong className={styles.invoiceCode}>{invoice.generatedCode}</strong><span className={styles.invoiceProject}>{invoice.project || "FMG services"}</span>
              <div className={styles.invoiceAmount}><small>{invoice.remaining > 0 ? "Amount remaining" : "Invoice total"}</small><strong>{money(invoice.remaining > 0 ? invoice.remaining : invoice.total, invoice.currency)}</strong></div>
              <div className={styles.invoiceFacts}><span><small>Issued</small><strong>{prettyDate(invoice.date)}</strong></span><span><small>Paid / credited</small><strong>{money(invoice.paid + invoice.credited, invoice.currency)}</strong></span></div>
              <div className={styles.invoiceActions}><a href={`/api/pdf/${invoice.id}`} target="_blank" rel="noopener noreferrer"><span>{invoice.remaining > 0 ? "Open invoice" : "View invoice"}</span><ArrowUpRight size={16} /></a><a href={`/api/pdf/${invoice.id}?download=1`} aria-label={`Download ${invoice.generatedCode}`}><Download size={16} /></a></div>
            </article>)}</div> : <PortalEmpty icon={ReceiptText} title="No issued invoices yet" body="When FMG issues an invoice for your account, it will appear here automatically." />}
          </section>
        </> : tab === "plans" ? <>
          <section className={styles.planToolbar}><div><span>PLAN LIBRARY</span><h2>{year} content plans</h2></div><label><span>Year</span><select value={year} onChange={(event) => { setLoading(true); setYear(Number(event.target.value)); }}>{state.years.map((value) => <option key={value}>{value}</option>)}</select></label></section>
          <MonthPicker year={year} selected={month} plans={state.plans} onSelect={setMonth} />
          <section className={styles.portalSection}>
            <div className={styles.sectionHeading}><div><span>{monthNames[month - 1].toUpperCase()} {year}</span><h2>Choose a plan part</h2><p>Part 1 covers days 1–15. Part 2 covers day 16 through the end of the month.</p></div><span className={styles.planCount}>{monthPlans.length}/2 ready</span></div>
            <div className={styles.partGrid}>{([1, 2] as const).map((part) => { const plan = monthPlans.find((item) => item.part === part); return <article key={part} className={plan ? styles.partReady : styles.partWaiting}>
              <div className={styles.partNumber}>0{part}</div><span className={styles.partRange}>{partRange(year, month, part)}</span><h3>{plan?.title || `Part ${part}`}</h3><p>{plan?.notes || "This part has not been published yet. It will appear here as soon as it is ready."}</p>
              {plan ? <a href={plan.url} target="_blank" rel="noopener noreferrer"><span>Open Part {part}</span><ExternalLink size={16} /></a> : <span className={styles.waitingLabel}><CalendarDays size={15} /> Coming soon</span>}
            </article>; })}</div>
          </section>
        </> : <section className={styles.portalSection}>
          <div className={styles.sectionHeading}><div><span>ACCOUNT SECURITY</span><h2>Your login</h2><p>Change only your own password. FMG company profile and document settings are not available here.</p></div><span className={styles.securePill}><CheckCircle2 size={14} /> Private & secure</span></div>
          <LoginCredentialsPanel key={username} username={username} onChanged={onCredentialsChanged} />
        </section>}
      </> : <PortalEmpty icon={UserRound} title="Client profile not linked" body="Ask FMG to connect this login to your client account." />}
    </main>
    <footer className={styles.portalFooter}><span>FMG AGENCY · CLIENT EXPERIENCE</span><span>Private workspace for {title}</span></footer>
  </div>;
}

export function ClientPortalAdmin({ showToast }: { showToast: (message: string) => void }) {
  const [state, setState] = useState<ClientPortalState | null>(null);
  const [clientId, setClientId] = useState(0);
  const [year, setYear] = useState(currentYear());
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ year: String(year) });
    if (clientId) query.set("clientId", String(clientId));
    void fetch(`/api/client-portal?${query}`, { cache: "no-store" }).then(portalJson).then((result) => {
      if (!active) return;
      setState(result);
      if (!clientId && result.client) setClientId(result.client.id);
    }).catch((error: unknown) => active && showToast(error instanceof Error ? error.message : "Could not load client plans.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [clientId, showToast, year]);

  const monthPlans = useMemo(() => state?.plans.filter((plan) => plan.month === month) ?? [], [month, state]);
  const selectedClient = state?.clients.find((client) => client.id === clientId) ?? state?.client;
  const portalUsername = state?.clients.find((client) => client.id === clientId)?.portalUsername || "";

  async function updateState(request: Promise<Response>, success: string) {
    try {
      const result = await request.then(portalJson);
      setState(result);
      showToast(success);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not update the client portal.");
      throw error;
    }
  }

  return <section className={styles.admin}>
    <section className={styles.adminHero}>
      <div><span><Sparkles size={15} /> CLIENT EXPERIENCE LAB</span><h2>Build each client’s private content library.</h2><p>Select a client and month, then publish two clear Canva plan parts. Their invoices appear automatically in the same portal.</p></div>
      <div className={styles.adminHeroBadge}><ClientBrandMark key={`admin-${selectedClient?.id}-${selectedClient?.portalLogoUpdatedAt}`} client={selectedClient} title={selectedClient ? selectedClient.companyName || selectedClient.name : "FMG"} className={styles.adminHeroMark} /><small>{portalUsername ? "PORTAL ACTIVE" : "LOGIN NOT CREATED"}</small></div>
    </section>

    <section className={styles.adminControls}>
      <label><span>Client</span><select value={clientId || ""} onChange={(event) => { setLoading(true); setClientId(Number(event.target.value)); }}><option value="">Choose client</option>{state?.clients.map((client) => <option key={client.id} value={client.id}>{client.companyName || client.name}</option>)}</select></label>
      <label><span>Year</span><select value={year} onChange={(event) => { setLoading(true); setYear(Number(event.target.value)); }}>{[...new Set([currentYear() - 1, currentYear(), currentYear() + 1, ...(state?.years ?? [])])].sort((left, right) => right - left).map((value) => <option key={value}>{value}</option>)}</select></label>
      <div className={styles.clientAccessStatus}><UserRound size={17} /><span><strong>{portalUsername || "No portal login yet"}</strong><small>{portalUsername ? "Client can sign in now" : "Create it from Users & Access → Client Portal preset"}</small></span></div>
    </section>

    {loading && !state ? <div className={styles.adminLoading}>Loading portal workspace…</div> : state?.client ? <>
      <ClientLogoManager key={`${state.client.id}-${state.client.portalLogoUpdatedAt || "no-logo"}`} client={state.client} year={year} onUpdate={updateState} showToast={showToast} />
      <MonthPicker year={year} selected={month} plans={state.plans} onSelect={setMonth} />
      <div className={styles.adminMonthHeading}><div><span>{monthNames[month - 1].toUpperCase()} {year}</span><h2>Publish monthly plan parts</h2><p>Each link is private to {state.client.companyName || state.client.name} after sign-in.</p></div><div><strong>{monthPlans.filter((plan) => plan.published).length}/2</strong><small>parts live</small></div></div>
      <div className={styles.editorGrid}>{([1, 2] as const).map((part) => <PlanPartEditor key={`${clientId}-${year}-${month}-${part}-${monthPlans.find((plan) => plan.part === part)?.updatedAt || "new"}`} part={part} year={year} month={month} clientId={clientId} plan={monthPlans.find((item) => item.part === part)} onUpdate={updateState} />)}</div>
    </> : <PortalEmpty icon={UserRound} title="Choose a client" body="Select a client to start building their private monthly plan library." />}
  </section>;
}

function ClientLogoManager({ client, year, onUpdate, showToast }: { client: Client; year: number; onUpdate: (request: Promise<Response>, success: string) => Promise<void>; showToast: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const title = client.companyName || client.name;

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      event.target.value = "";
      showToast("Choose a PNG, JPG, or WebP logo.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      event.target.value = "";
      showToast("Logo must be 2 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read this logo."));
        reader.readAsDataURL(file);
      });
      await onUpdate(fetch(`/api/client-portal/logo/${client.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64, year }),
      }), client.portalLogoAvailable ? "Client logo replaced." : "Client logo added.");
    } catch (error) {
      if (error instanceof Error && error.message === "Could not read this logo.") showToast(error.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!client.portalLogoAvailable || !window.confirm(`Remove ${title}'s logo from the portal?`)) return;
    setBusy(true);
    try {
      await onUpdate(fetch(`/api/client-portal/logo/${client.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ year }),
      }), "Client logo removed.");
    } catch {
      // updateState already reports the API error through the app toast.
    } finally { setBusy(false); }
  }

  return <section className={styles.logoManager}>
    <ClientBrandMark client={client} title={title} className={styles.logoManagerPreview} />
    <div className={styles.logoManagerCopy}><span>CLIENT BRANDING</span><h3>{client.portalLogoAvailable ? "Brand logo is live" : "Add the client’s logo"}</h3><p>It appears inside their private portal instead of the letter mark. PNG, JPG or WebP · up to 2 MB.</p></div>
    <div className={styles.logoManagerActions}>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void upload(event)} disabled={busy} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}><ImageUp size={16} /> {busy ? "Uploading…" : client.portalLogoAvailable ? "Replace logo" : "Upload logo"}</button>
      {client.portalLogoAvailable && <button type="button" className={styles.removeLogo} onClick={() => void remove()} disabled={busy}><Trash2 size={15} /> Remove</button>}
    </div>
  </section>;
}

function PlanPartEditor({ part, year, month, clientId, plan, onUpdate }: { part: 1 | 2; year: number; month: number; clientId: number; plan?: ClientPortalPlanPart; onUpdate: (request: Promise<Response>, success: string) => Promise<void> }) {
  const [title, setTitle] = useState(plan?.title || `${monthNames[month - 1]} Content Plan — Part ${part}`);
  const [url, setUrl] = useState(plan?.url || "");
  const [notes, setNotes] = useState(plan?.notes || "");
  const [published, setPublished] = useState(plan?.published ?? true);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onUpdate(fetch("/api/client-portal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "savePlan", data: { clientId, year, month, part, title, url, notes, published } }) }), `Part ${part} ${published ? "published" : "saved as draft"}.`);
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!plan || !window.confirm(`Remove Part ${part} from this month?`)) return;
    setBusy(true);
    try {
      await onUpdate(fetch("/api/client-portal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "deletePlan", id: plan.id, clientId, year }) }), `Part ${part} removed.`);
    } finally { setBusy(false); }
  }

  return <form className={styles.editorCard} onSubmit={save}>
    <header><div><span className={styles.editorNumber}>0{part}</span><span><strong>PART {part}</strong><small>{partRange(year, month, part)}</small></span></div><label className={styles.publishToggle}><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} /><span>{published ? "Published" : "Draft"}</span></label></header>
    <label><span>Plan title</span><input required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} /></label>
    <label><span>Canva or external link</span><div className={styles.linkInput}><Link2 size={16} /><input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.canva.com/design/..." /></div></label>
    <label><span>Short note for the client <small>Optional</small></span><textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What the client will find in this part…" /></label>
    <footer>{plan && <button type="button" className={styles.deletePlan} onClick={() => void remove()} disabled={busy}><Trash2 size={15} /> Remove</button>}<span />{url && <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Test link</a>}<button disabled={busy}><Save size={15} /> {busy ? "Saving…" : plan ? "Save changes" : "Save part"}</button></footer>
  </form>;
}

function PortalEmpty({ icon: Icon, title, body }: { icon: typeof FileText; title: string; body: string }) {
  return <div className={styles.empty}><span><Icon size={23} /></span><h2>{title}</h2><p>{body}</p></div>;
}
