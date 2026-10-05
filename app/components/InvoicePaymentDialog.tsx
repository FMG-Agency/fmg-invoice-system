"use client";
import {useState} from "react";
import type {DocumentRecord} from "../types";

export function InvoicePaymentDialog({document,onSave,onClose}:{document:DocumentRecord;onSave:(amount:number)=>Promise<void>;onClose:()=>void}) {
  const [amount,setAmount]=useState(document.status === "Paid" ? "" : String(document.paid || ""));
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const value=Number(amount);
  const balance=(document.remaining ?? document.total)+(document.paid || 0)-value;
  return <div className="modal-layer"><section className="modal-card modal-form" role="dialog" aria-modal="true" aria-labelledby="invoice-payment-heading" style={{width:"min(480px, calc(100vw - 32px))"}}>
    <div className="panel-heading"><h2 id="invoice-payment-heading">Partially paid</h2><button className="icon-button" type="button" disabled={busy} onClick={onClose} aria-label="Close payment">×</button></div>
    <p>{document.generatedCode} · Total {document.total.toLocaleString()} {document.currency}</p>
    <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{await onSave(value);onClose();}catch(error){setError(error instanceof Error?error.message:"Could not save payment.");}finally{setBusy(false);}}}>
      <label className="field"><span>Total amount paid so far ({document.currency})</span><input autoFocus required type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy}/></label>
      <p>Remaining: <strong>{Math.max(0,balance).toLocaleString()} {document.currency}</strong></p>
      <p className="table-sub">Enter the total paid, including previous payments. It is recorded in the client account once.</p>
      {error&&<p role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy||value<=0||balance<=0}>{busy?"Saving…":"Save payment"}</button></div>
    </form>
  </section></div>;
}
