"use client";

import {
  Building2,
  CircleDollarSign,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Plus,
  ReceiptText,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Client, ClientAccountState, ClientFinancialTransactionType } from "../types";

type AccountTab = "invoices" | "quotations" | "transactions";

const companyNames = { fmg: "FMG Agency", digital_empire: "The Digital Empire" } as const;
const transactionLabels: Record<ClientFinancialTransactionType, string> = {
  charge: "Charge / debit",
  payment: "Payment received",
  credit: "Credit note",
  refund: "Refund paid",
};

function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function money(value: number, currency = "EGP") {
  return new Intl.NumberFormat("en-EG", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function prettyDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "CL";
}

async function responseJson(response: Response) {
  const payload = await response.json() as ClientAccountState | { error?: string };
  if (!response.ok) throw new Error(("error" in payload && payload.error) || "Could not load the client account.");
  return payload as ClientAccountState;
}

export function ClientAccountPanel({ client, onClose, showToast }: { client: Client; onClose: () => void; showToast: (message: string) => void }) {
  const [account, setAccount] = useState<ClientAccountState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<AccountTab>("invoices");
  const [activeCurrency, setActiveCurrency] = useState("");
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [type, setType] = useState<ClientFinancialTransactionType>("payment");
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState("EGP");
  const [transactionDate, setTransactionDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState("Bank transfer");
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/client-accounts?clientId=${client.id}`, { cache: "no-store" })
      .then(responseJson)
      .then((result) => {
        if (!active) return;
        setAccount(result);
        setActiveCurrency(result.summaries[0]?.currency || "EGP");
      })
      .catch((error) => active && showToast(error instanceof Error ? error.message : "Could not load the client account."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [client.id, showToast]);

  const linkableInvoices = useMemo(() => account?.invoices.filter((invoice) => invoice.status !== "Rejected") ?? [], [account]);

  function resetForm() {
    setType("payment");
    setAmount(0);
    setCurrency(account?.summaries[0]?.currency || "EGP");
    setTransactionDate(today());
    setPaymentMethod("Bank transfer");
    setDocumentId(null);
    setReference("");
    setNotes("");
  }

  function chooseInvoice(value: string) {
    const id = value ? Number(value) : null;
    setDocumentId(id);
    const invoice = linkableInvoices.find((item) => item.id === id);
    if (invoice) setCurrency(invoice.currency);
  }

  async function saveTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!(amount > 0)) return showToast("Enter a transaction amount greater than zero.");
    setBusy(true);
    try {
      const result = await fetch("/api/client-accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "createTransaction", data: {
          clientId: client.id, documentId, type, amount, currency,
          transactionDate, paymentMethod, reference, notes,
        } }),
      }).then(responseJson);
      setAccount(result);
      setShowEntryForm(false);
      resetForm();
      setTab("transactions");
      showToast(`${transactionLabels[type]} saved to ${client.companyName || client.name}.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save the financial transaction.");
    } finally {
      setBusy(false);
    }
  }

  async function removeTransaction(id: number) {
    if (!window.confirm("Delete this financial transaction? The client balance will be recalculated.")) return;
    setBusy(true);
    try {
      const result = await fetch("/api/client-accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "deleteTransaction", clientId: client.id, id }),
      }).then(responseJson);
      setAccount(result);
      showToast("Financial transaction deleted and balance recalculated.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not delete the financial transaction.");
    } finally {
      setBusy(false);
    }
  }

  const title = client.companyName || client.name;
  const summary = account?.summaries.find((item) => item.currency === activeCurrency) ?? account?.summaries[0];
  const balanceMode = summary ? summary.outstanding > 0 ? "due" : summary.clientCredit > 0 ? "credit" : "settled" : "settled";
  const balanceTitle = balanceMode === "due" ? "Client needs to pay" : balanceMode === "credit" ? "Credit available for client" : "Account is settled";
  const balanceValue = summary ? balanceMode === "credit" ? summary.clientCredit : summary.outstanding : 0;
  const netBalance = summary ? summary.outstanding - summary.clientCredit : 0;
  return <div className="modal-layer client-account-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal-card client-account-modal" role="dialog" aria-modal="true" aria-label={`Client account for ${title}`}>
      <header className="client-account-head">
        <div className="client-account-identity"><span className="client-account-avatar">{initials(title)}</span><div><span className="eyebrow">CLIENT ACCOUNT</span><h2>{title}</h2><p>{client.ownerName} · {client.phone}{client.email ? ` · ${client.email}` : ""}</p></div></div>
        <div className="client-account-head-actions"><button className="primary-button" onClick={() => { resetForm(); setShowEntryForm((open) => !open); }}><Plus size={16} /> Record transaction</button><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
      </header>

      {loading ? <div className="account-loading"><span /><p>Calculating invoices, payments, and balances…</p></div> : account && summary ? <div className="client-account-body">
        <section className={`account-balance-hero balance-${balanceMode}`}>
          <div className="account-balance-main">
            <div className="account-balance-top"><span>CURRENT BALANCE</span>{account.summaries.length > 1 ? <select value={summary.currency} onChange={(event) => setActiveCurrency(event.target.value)} aria-label="Account currency">{account.summaries.map((item) => <option key={item.currency}>{item.currency}</option>)}</select> : <strong>{summary.currency}</strong>}</div>
            <h3>{balanceTitle}</h3>
            <div className="account-balance-value">{money(balanceValue, summary.currency)}</div>
            <p>{balanceMode === "due" ? "This is the amount still outstanding after invoices, manual charges, payments, and credit notes." : balanceMode === "credit" ? "The client has paid more than the issued balance or has available credit." : "Issued invoices and recorded movements currently balance to zero."}</p>
          </div>
          <div className="account-overview-metrics">
            <article><span>Total billed</span><strong>{money(summary.totalInvoiced + summary.totalCharges, summary.currency)}</strong><small>Invoices + account charges</small></article>
            <article><span>Total received</span><strong>{money(summary.totalPaid, summary.currency)}</strong><small>Payments from client</small></article>
            <article><span>Documents</span><strong>{account.invoices.length + account.quotations.length}</strong><small>{account.invoices.length} invoices · {account.quotations.length} quotations</small></article>
          </div>
        </section>

        <section className="account-equation" aria-label="Balance calculation">
          <div><span>Invoices + charges</span><strong>{money(summary.totalInvoiced + summary.totalCharges, summary.currency)}</strong></div><i>−</i>
          <div><span>Payments</span><strong>{money(summary.totalPaid, summary.currency)}</strong></div><i>−</i>
          <div><span>Credit notes</span><strong>{money(summary.totalCredited, summary.currency)}</strong></div><i>+</i>
          <div><span>Refunds</span><strong>{money(summary.totalRefunded, summary.currency)}</strong></div><i>=</i>
          <div className="account-equation-result"><span>Net balance</span><strong>{money(netBalance, summary.currency)}</strong></div>
        </section>

        <section className="account-client-facts">
          <div><Building2 size={15} /><span><small>Contact</small><strong>{client.ownerName}</strong></span></div>
          <div><span><small>Phone</small><strong>{client.phone}</strong></span></div>
          <div><span><small>Email</small><strong>{client.email || "Not provided"}</strong></span></div>
          <div><span><small>Address</small><strong>{client.address || "Not provided"}</strong></span></div>
        </section>

        {summary.draftValue > 0 && <div className="account-draft-note"><FileText size={14} /><span><strong>{money(summary.draftValue, summary.currency)} in draft invoices</strong> — not included in the current balance until the invoice is sent or approved.</span></div>}

        <nav className="account-tabs" aria-label="Client account sections">
          <button className={tab === "invoices" ? "active" : ""} onClick={() => setTab("invoices")}><ReceiptText size={15} /> Invoices <span>{account.invoices.length}</span></button>
          <button className={tab === "quotations" ? "active" : ""} onClick={() => setTab("quotations")}><FileCheck2 size={15} /> Quotations <span>{account.quotations.length}</span></button>
          <button className={tab === "transactions" ? "active" : ""} onClick={() => setTab("transactions")}><CircleDollarSign size={15} /> Payments & ledger <span>{account.transactions.length}</span></button>
        </nav>

        {tab === "invoices" && (account.invoices.length ? <div className="table-scroll"><table className="data-table account-table"><thead><tr><th>Invoice</th><th>Date</th><th>Total</th><th>Paid / credited</th><th>Remaining</th><th>Status</th><th>PDF</th></tr></thead><tbody>{account.invoices.map((invoice) => <tr key={invoice.id}><td><div className="document-code"><span className="invoice"><ReceiptText size={16} /></span><span><strong>{invoice.generatedCode}</strong><small>{companyNames[invoice.companyKey]}{invoice.project ? ` · ${invoice.project}` : ""}</small></span></div></td><td>{prettyDate(invoice.date)}</td><td><strong className="table-main">{money(invoice.total, invoice.currency)}</strong></td><td><strong className="positive-value">{money(invoice.paid + invoice.credited, invoice.currency)}</strong>{invoice.inferredPaid > 0 && <small className="table-sub">Includes paid status</small>}</td><td><strong className={invoice.remaining > 0 ? "negative-value" : "positive-value"}>{money(invoice.remaining, invoice.currency)}</strong></td><td><span className={`status-badge status-${invoice.status.toLowerCase()}`}><span />{invoice.status}</span></td><td><div className="document-actions"><button onClick={() => window.open(`/api/pdf/${invoice.id}`, "_blank")} title="Preview"><Eye size={15} /></button><a href={`/api/pdf/${invoice.id}?download=1`} title="Download"><Download size={15} /></a></div></td></tr>)}</tbody></table></div> : <AccountEmpty icon={ReceiptText} title="No invoices for this client" body="New invoices will appear here automatically." />)}

        {tab === "quotations" && (account.quotations.length ? <div className="table-scroll"><table className="data-table account-table"><thead><tr><th>Quotation</th><th>Company</th><th>Date</th><th>Valid until</th><th>Value</th><th>Status</th><th>PDF</th></tr></thead><tbody>{account.quotations.map((quotation) => <tr key={quotation.id}><td><div className="document-code"><span className="quotation"><FileText size={16} /></span><span><strong>{quotation.generatedCode}</strong><small>{quotation.project || "Quotation"}</small></span></div></td><td>{companyNames[quotation.companyKey]}</td><td>{prettyDate(quotation.date)}</td><td>{prettyDate(quotation.validUntil)}</td><td><strong className="table-main">{money(quotation.total, quotation.currency)}</strong></td><td><span className={`status-badge status-${quotation.status.toLowerCase()}`}><span />{quotation.status}</span></td><td><div className="document-actions"><button onClick={() => window.open(`/api/pdf/${quotation.id}`, "_blank")} title="Preview"><Eye size={15} /></button><a href={`/api/pdf/${quotation.id}?download=1`} title="Download"><Download size={15} /></a></div></td></tr>)}</tbody></table></div> : <AccountEmpty icon={FileCheck2} title="No quotations for this client" body="Saved quotations will appear here automatically." />)}

        {tab === "transactions" && (account.transactions.length ? <div className="table-scroll"><table className="data-table account-table"><thead><tr><th>Movement</th><th>Date</th><th>Invoice</th><th>Method / reference</th><th>Amount</th><th>Entered by</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{account.transactions.map((transaction) => { const increasesBalance = transaction.type === "charge" || transaction.type === "refund"; return <tr key={transaction.id}><td><span className={`ledger-type ledger-${transaction.type}`}>{transactionLabels[transaction.type]}</span>{transaction.notes && <small className="table-sub">{transaction.notes}</small>}</td><td>{prettyDate(transaction.transactionDate)}</td><td>{transaction.documentCode || "On account"}</td><td><strong className="table-main">{transaction.paymentMethod}</strong><small className="table-sub">{transaction.reference || "No reference"}</small></td><td><strong className={increasesBalance ? "negative-value" : "positive-value"}>{increasesBalance ? "+" : "−"}{money(transaction.amount, transaction.currency)}</strong></td><td>{transaction.createdByName || "Account user"}<small className="table-sub">{prettyDate(transaction.createdAt)}</small></td><td><div className="row-actions"><button className="danger" onClick={() => removeTransaction(transaction.id)} disabled={busy} aria-label="Delete transaction"><Trash2 size={15} /></button></div></td></tr>; })}</tbody></table></div> : <AccountEmpty icon={CircleDollarSign} title="No recorded money movements" body="Record a charge, payment, credit note, or refund to build this client's ledger." />)}

        <footer className="account-footnote">The imported 2026 ledger is treated as the historical source of truth. New invoices after its latest entry are added automatically, so old spreadsheet charges are never counted twice.</footer>
      </div> : <AccountEmpty icon={FileText} title="Account unavailable" body="Close this window and try again." />}

      {showEntryForm && account && <div className="account-entry-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowEntryForm(false)}><form className="account-entry-form" onSubmit={saveTransaction}>
        <div className="account-entry-heading"><div><span className="eyebrow">NEW LEDGER ENTRY</span><h3>Record a financial movement</h3><p>Choose what happened, enter the amount, and optionally link it to an invoice.</p></div><button type="button" className="icon-button" onClick={() => setShowEntryForm(false)} aria-label="Close transaction form"><X size={17} /></button></div>
        <div className="transaction-type-picker">
          {(["charge", "payment", "credit", "refund"] as ClientFinancialTransactionType[]).map((value) => <button key={value} type="button" className={type === value ? "active" : ""} onClick={() => { setType(value); if (value === "charge") setDocumentId(null); setPaymentMethod(value === "charge" ? "Account charge" : value === "credit" ? "Credit note" : "Bank transfer"); }}><CircleDollarSign size={16} /><span><strong>{transactionLabels[value]}</strong><small>{value === "charge" ? "Add a fee or service to the balance" : value === "payment" ? "Money received from client" : value === "credit" ? "Reduce the client's balance" : "Money returned to client"}</small></span></button>)}
        </div>
        <div className="form-grid">
          <label className="field"><span>Amount</span><input required autoFocus type="number" min="0.01" step="0.01" value={amount || ""} onChange={(event) => setAmount(Number(event.target.value))} placeholder="0.00" /></label>
          <label className="field"><span>Date</span><input required type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} /></label>
          <label className="field"><span>Link to invoice <small>Optional</small></span><select value={documentId ?? ""} onChange={(event) => chooseInvoice(event.target.value)} disabled={type === "charge"}><option value="">{type === "charge" ? "Manual charge on client account" : "General balance / advance payment"}</option>{linkableInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.generatedCode} · {money(invoice.total, invoice.currency)} · {invoice.status}</option>)}</select></label>
          <label className="field"><span>Currency</span><input required value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={12} disabled={documentId !== null} /></label>
          <label className="field"><span>Method / category</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option>Account charge</option><option>Monthly retainer</option><option>Shoot</option><option>Bank transfer</option><option>Cash</option><option>Card</option><option>Cheque</option><option>Credit note</option><option>Other</option></select></label>
          <label className="field"><span>Reference <small>Optional</small></span><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Transfer or receipt number" /></label>
          <label className="field field-wide"><span>Internal notes <small>Optional</small></span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Any useful details about this movement" /></label>
        </div>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowEntryForm(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : `Save ${transactionLabels[type].toLowerCase()}`}</button></div>
      </form></div>}
    </section>
  </div>;
}

function AccountEmpty({ icon: Icon, title, body }: { icon: typeof FileText; title: string; body: string }) {
  return <div className="account-empty"><Icon size={24} /><h3>{title}</h3><p>{body}</p></div>;
}
