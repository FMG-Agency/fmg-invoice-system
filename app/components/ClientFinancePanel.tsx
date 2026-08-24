"use client";

import { Building2, CalendarRange, Check, CircleDollarSign, FileSpreadsheet, Pencil, Plus, Search, TrendingUp, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Client, ClientFinanceState, ClientMonthlyRetainerStatus } from "../types";
import { ClientAccountPanel } from "./ClientAccountPanel";

type ClientFinanceMode = "accounts" | "monthly";
type PlanDraft = {
  clientId: number;
  amount: number;
  startMonth: number;
  endMonth: number;
  status: ClientMonthlyRetainerStatus;
  notes: string;
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const companyLabels = { fmg: "FMG", digital_empire: "TDE" } as const;
const statusLabels: Record<Client["lifecycleStatus"], string> = { active: "Active", inactive: "Inactive", shoot: "Shoot", prospect: "Prospect" };

function money(value: number) {
  return new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(value);
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "CL";
}

async function financeResponse(response: Response) {
  const payload = await response.json() as ClientFinanceState | { error?: string };
  if (!response.ok) throw new Error("error" in payload && payload.error ? payload.error : "Could not load client finance data.");
  return payload as ClientFinanceState;
}

export function ClientFinancePanel({ mode, initialClients, showToast }: { mode: ClientFinanceMode; initialClients: Client[]; showToast: (message: string) => void }) {
  const [year, setYear] = useState(2026);
  const [data, setData] = useState<ClientFinanceState | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [accountClient, setAccountClient] = useState<Client | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [singleMonth, setSingleMonth] = useState<number | null>(null);
  const [draft, setDraft] = useState<PlanDraft>({ clientId: initialClients[0]?.id ?? 0, amount: 0, startMonth: 1, endMonth: 12, status: "planned", notes: "" });

  useEffect(() => {
    let active = true;
    fetch(`/api/client-finance?year=${year}`, { cache: "no-store" })
      .then(financeResponse)
      .then((result) => active && setData(result))
      .catch((error) => active && showToast(error instanceof Error ? error.message : "Could not load client finance data."));
    return () => { active = false; };
  }, [showToast, year]);

  const clients = data?.clients ?? initialClients;
  const filteredClients = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return clients;
    return clients.filter((client) => [client.companyName, client.name, client.activity, client.paymentSchedule].some((field) => field.toLowerCase().includes(value)));
  }, [clients, query]);
  const summaryByClient = useMemo(() => new Map((data?.summaries ?? []).map((summary) => [summary.clientId, summary])), [data]);
  const retainerByCell = useMemo(() => new Map((data?.retainers ?? []).map((entry) => [`${entry.clientId}:${entry.month}`, entry])), [data]);

  function openRange(clientId = clients[0]?.id ?? 0) {
    const client = clients.find((item) => item.id === clientId);
    setSingleMonth(null);
    setDraft({ clientId, amount: client?.monthlyFee ?? 0, startMonth: 1, endMonth: 12, status: "planned", notes: "" });
    setPlanOpen(true);
  }

  function openCell(client: Client, month: number) {
    const existing = retainerByCell.get(`${client.id}:${month}`);
    setSingleMonth(month);
    setDraft({ clientId: client.id, amount: existing?.amount ?? client.monthlyFee ?? 0, startMonth: month, endMonth: month, status: existing?.status ?? "planned", notes: existing?.notes ?? "" });
    setPlanOpen(true);
  }

  async function savePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.clientId) return showToast("Choose a client first.");
    setBusy(true);
    try {
      const action = singleMonth ? "saveRetainer" : "saveRetainerRange";
      const body = singleMonth
        ? { action, data: { clientId: draft.clientId, year, month: singleMonth, amount: draft.amount, status: draft.status, notes: draft.notes } }
        : { action, data: { clientId: draft.clientId, year, startMonth: draft.startMonth, endMonth: draft.endMonth, amount: draft.amount, status: draft.status, notes: draft.notes } };
      const result = await fetch("/api/client-finance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(financeResponse);
      setData(result);
      setPlanOpen(false);
      showToast(singleMonth ? `${months[singleMonth - 1]} plan saved.` : "Monthly plan applied to the selected period.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save the monthly plan.");
    } finally {
      setBusy(false);
    }
  }

  const totals = (data?.summaries ?? []).reduce((sum, item) => ({
    billed: sum.billed + item.totalInvoiced + item.totalCharges,
    paid: sum.paid + item.totalPaid,
    balance: sum.balance + item.balance,
    planned: sum.planned + item.plannedYear,
  }), { billed: 0, paid: 0, balance: 0, planned: 0 });

  if (!data || data.year !== year) return <div className="account-loading finance-loading"><span /><p>Organizing clients, balances, and monthly plans…</p></div>;

  return <>
    <section className="finance-summary-grid">
      <article className="finance-summary yellow"><CircleDollarSign size={21} /><div><small>{mode === "accounts" ? "Billed & charged" : `${year} annual plan`}</small><strong>{money(mode === "accounts" ? totals.billed : totals.planned)}</strong><span>{data?.importedWorkbook ? "Excel data imported" : "Live database"}</span></div></article>
      <article className="finance-summary"><TrendingUp size={21} /><div><small>{mode === "accounts" ? "Received" : "Average per month"}</small><strong>{money(mode === "accounts" ? totals.paid : totals.planned / 12)}</strong><span>{mode === "accounts" ? "Recorded client payments" : "Across planned retainers"}</span></div></article>
      <article className={`finance-summary ${totals.balance > 0 ? "danger" : "success"}`}><Building2 size={21} /><div><small>{mode === "accounts" ? "Net client balance" : "Clients with plans"}</small><strong>{mode === "accounts" ? money(Math.abs(totals.balance)) : new Set(data?.retainers.map((entry) => entry.clientId)).size}</strong><span>{mode === "accounts" ? totals.balance > 0 ? "Due from clients" : totals.balance < 0 ? "Credit held for clients" : "All accounts settled" : `${data?.retainers.length ?? 0} monthly entries`}</span></div></article>
    </section>

    <section className="panel finance-panel">
      <div className="finance-toolbar">
        <div className="filter-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={mode === "accounts" ? "Search client accounts" : "Search monthly plans"} /></div>
        {mode === "monthly" && <div className="finance-toolbar-actions"><label className="year-picker"><CalendarRange size={16} /><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{[2025, 2026, 2027, 2028].map((value) => <option key={value}>{value}</option>)}</select></label><button className="primary-button" onClick={() => openRange()}><Plus size={16} /> Apply monthly plan</button></div>}
      </div>

      {mode === "accounts" ? <div className="client-finance-grid">
        {filteredClients.map((client) => {
          const summary = summaryByClient.get(client.id);
          const balance = summary?.balance ?? 0;
          return <article className="client-finance-card" key={client.id}>
            <header><span className="client-finance-avatar">{initials(client.companyName || client.name)}</span><div><h3>{client.companyName || client.name}</h3><p>{client.activity || "Activity not set"}</p></div><span className={`client-life client-life-${client.lifecycleStatus}`}>{statusLabels[client.lifecycleStatus]}</span></header>
            <div className="client-finance-metrics"><span><small>Total charges</small><strong>{money((summary?.totalInvoiced ?? 0) + (summary?.totalCharges ?? 0))}</strong></span><span><small>Received</small><strong>{money(summary?.totalPaid ?? 0)}</strong></span></div>
            <div className={`client-card-balance ${balance > 0 ? "due" : balance < 0 ? "credit" : "settled"}`}><span>{balance > 0 ? "Due" : balance < 0 ? "Client credit" : "Settled"}</span><strong>{money(Math.abs(balance))}</strong></div>
            <footer><span><b>{companyLabels[client.agencyKey]}</b>{client.paymentSchedule || (client.monthlyFee ? `${money(client.monthlyFee)} monthly` : "No schedule")}</span><button onClick={() => setAccountClient(client)}>Open account</button></footer>
          </article>;
        })}
      </div> : <div className="monthly-plan-scroll"><table className="monthly-plan-table"><thead><tr><th>Client</th>{months.map((month) => <th key={month}>{month}</th>)}<th>Year total</th></tr></thead><tbody>{filteredClients.map((client) => {
        const summary = summaryByClient.get(client.id);
        return <tr key={client.id}><td><button className="monthly-client" onClick={() => openRange(client.id)}><span>{initials(client.companyName || client.name)}</span><strong>{client.companyName || client.name}</strong><small>{client.paymentSchedule || "Set plan"}</small></button></td>{months.map((month, index) => {
          const entry = retainerByCell.get(`${client.id}:${index + 1}`);
          return <td key={month}><button className={`month-value month-${entry?.status ?? "empty"}`} onClick={() => openCell(client, index + 1)} title={`Edit ${month}`}><strong>{entry ? new Intl.NumberFormat("en-EG", { notation: "compact", maximumFractionDigits: 1 }).format(entry.amount) : "—"}</strong>{entry && <small>{entry.status}</small>}</button></td>;
        })}<td><strong className="year-total">{money(summary?.plannedYear ?? 0)}</strong></td></tr>;
      })}</tbody><tfoot><tr><td>Monthly total</td>{months.map((month, index) => <td key={month}>{money((data?.retainers ?? []).filter((entry) => entry.month === index + 1 && entry.status !== "paused").reduce((sum, entry) => sum + entry.amount, 0))}</td>)}<td>{money(totals.planned)}</td></tr></tfoot></table></div>}

      {!filteredClients.length && <div className="finance-empty"><UsersRound size={25} /><h3>No matching clients</h3><p>Try a different client name or activity.</p></div>}
    </section>

    {accountClient && <ClientAccountPanel client={accountClient} onClose={() => setAccountClient(null)} showToast={showToast} />}
    {planOpen && <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPlanOpen(false)}><form className="modal-card monthly-plan-modal" onSubmit={savePlan}>
      <div className="modal-head"><div><span className="eyebrow">SMART MONTHLY PLAN</span><h2>{singleMonth ? `Edit ${months[singleMonth - 1]} plan` : "Apply one plan to multiple months"}</h2><p>Choose the client and amount once; the system fills the selected months automatically.</p></div><button type="button" className="icon-button" onClick={() => setPlanOpen(false)} aria-label="Close"><X size={18} /></button></div>
      <div className="form-grid">
        <label className="field"><span>Client</span><select value={draft.clientId} onChange={(event) => setDraft((current) => ({ ...current, clientId: Number(event.target.value) }))}>{clients.map((client) => <option key={client.id} value={client.id}>{client.companyName || client.name}</option>)}</select></label>
        <label className="field"><span>Monthly amount</span><input required autoFocus type="number" min="0" step="1" value={draft.amount || ""} onChange={(event) => setDraft((current) => ({ ...current, amount: Number(event.target.value) }))} placeholder="50000" /></label>
        {!singleMonth && <><label className="field"><span>From month</span><select value={draft.startMonth} onChange={(event) => setDraft((current) => ({ ...current, startMonth: Number(event.target.value) }))}>{months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label><label className="field"><span>To month</span><select value={draft.endMonth} onChange={(event) => setDraft((current) => ({ ...current, endMonth: Number(event.target.value) }))}>{months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label></>}
        <label className="field"><span>Status</span><select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as ClientMonthlyRetainerStatus }))}><option value="planned">Planned</option><option value="confirmed">Confirmed</option><option value="paused">Paused</option></select></label>
        <label className="field field-wide"><span>Notes <small>Optional</small></span><input value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Contract, scope, or collection note" /></label>
      </div>
      <div className="plan-preview"><FileSpreadsheet size={17} /><span><strong>{money(draft.amount)}</strong>{singleMonth ? ` for ${months[singleMonth - 1]} ${year}` : ` × ${Math.max(0, draft.endMonth - draft.startMonth + 1)} months = ${money(draft.amount * Math.max(0, draft.endMonth - draft.startMonth + 1))}`}</span><Check size={16} /></div>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setPlanOpen(false)}>Cancel</button><button className="primary-button" disabled={busy}><Pencil size={15} /> {busy ? "Saving…" : "Save plan"}</button></div>
    </form></div>}
  </>;
}
