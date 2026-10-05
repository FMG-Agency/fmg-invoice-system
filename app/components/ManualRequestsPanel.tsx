"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, ClipboardList, Pencil } from "lucide-react";
import type { Employee } from "../types";
import { manualRequestSchema, type ManualRequest, type SavedManualEntry } from "../lib/manual-attendance";
import styles from "./ManualRequestsPanel.module.css";
const labels = {penalty:"Penalty · deduction days",paid_weekend:"Paid weekend · ×2",mission:"Assignment / mission",overtime:"Extra overtime · after 22:00",early_arrival:"Early overtime · before 11:00",early_leave:"Early departure permission",leave:"Absence permission"};
const today = () => new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const initial = (): ManualRequest => ({type:"mission",dateFrom:today(),dateTo:today(),startTime:"11:00",endTime:"19:00",dayType:"normal",days:0.25,leavePaid:true,reason:"normal",details:""});
export function ManualRequestsPanel({employees,onSaved}:{employees:Employee[];onSaved:()=>Promise<void>}) {
  const formRef=useRef<HTMLFormElement>(null);
  const [employeeId,setEmployeeId]=useState("");
  const [draft,setDraft]=useState(initial);
  const [queue,setQueue]=useState<ManualRequest[]>([]);
  const [batchId,setBatchId]=useState(()=>crypto.randomUUID());
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [editing,setEditing]=useState<SavedManualEntry|null>(null);
  const [queueEdit,setQueueEdit]=useState<number|null>(null);
  const [revision,setRevision]=useState(0);
  const [history,setHistory]=useState<{employeeId:string;entries:SavedManualEntry[];error?:string}>({employeeId:"",entries:[]});
  const [historyMonth,setHistoryMonth]=useState("");
  useEffect(()=>{
    if(!employeeId)return;
    const controller=new AbortController();
    fetch(`/api/hr/manual-requests?employeeId=${employeeId}`,{cache:"no-store",signal:controller.signal})
      .then(async response=>{const result=await response.json() as {entries?:SavedManualEntry[];error?:string};if(!response.ok)throw new Error(result.error || "Could not load entries.");return result.entries || [];})
      .then(entries=>setHistory({employeeId,entries}))
      .catch(error=>{if(!controller.signal.aborted)setHistory({employeeId,entries:[],error:String(error.message || error)});});
    return ()=>controller.abort();
  },[employeeId,revision]);
  async function changeSaved(entry:SavedManualEntry,method:"PATCH"|"DELETE",data?:ManualRequest){
    if(method==="DELETE"&&!window.confirm("Delete this entry and remove its payroll effect? It can be restored from Trash for 7 days."))return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/hr/manual-requests",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:entry.kind,id:entry.id,version:entry.version,data})});
      const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error || "Could not update entry.");
      if(method==="PATCH" || (editing?.id===entry.id && editing.kind===entry.kind)){setEditing(null);setDraft(initial());}setRevision(value=>value+1);
      setMessage(method==="DELETE"?"Entry moved to Trash. Payroll updated.":"Changes saved. Payroll updated.");await onSaved();
    }catch(error){setMessage(error instanceof Error?error.message:"Could not update entry.");setRevision(value=>value+1);}finally{setBusy(false);}
  }
  const edit=(patch:Partial<ManualRequest>)=>setDraft({...draft,...patch});
  async function enqueue(event:React.FormEvent) {
    event.preventDefault();setMessage("");
    const parsed=manualRequestSchema.safeParse({...draft,dateTo:draft.type === "leave" ? draft.dateTo:draft.dateFrom});
    if(!parsed.success){setMessage(parsed.error.issues[0].message);return;}
    if(editing){await changeSaved(editing,"PATCH",parsed.data);return;}
    setQueue(queueEdit===null?[...queue,parsed.data]:queue.map((entry,index)=>index===queueEdit?parsed.data:entry));setQueueEdit(null);setBatchId(crypto.randomUUID());setDraft({...initial(),dateFrom:draft.dateFrom,dateTo:draft.dateFrom});
  }
  async function save() {
    setBusy(true);setMessage("");
    try {
      const response=await fetch("/api/hr/manual-requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({batchId,employeeId:Number(employeeId),requests:queue})});
      const data=await response.json() as {error?:string};if(!response.ok) throw new Error(data.error || "Could not save requests.");
      setQueue([]);setBatchId(crypto.randomUUID());setMessage("All requests added to attendance successfully.");setRevision(value=>value+1);
      await onSaved();
    } catch(error){setMessage(error instanceof Error?error.message:"Could not save requests.");} finally{setBusy(false);}
  }
  return <div className={styles.layout}>
    <section className={styles.intro}><ClipboardList size={24}/><div><h2>Manual employee requests</h2><p>Select an employee, queue their requests, then press Add. Requests are approved immediately and included in attendance and payroll.</p></div></section>
    <label className="field"><span>Employee</span><select required disabled={busy || queue.length>0 || !!editing} value={employeeId} onChange={e=>{setEmployeeId(e.target.value);setHistoryMonth("");}}><option value="">Choose an employee</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name} — {e.title || e.biometricCode}</option>)}</select></label>
    <div className={styles.columns}><form ref={formRef} className={styles.card} onSubmit={enqueue}><fieldset disabled={!employeeId || busy}><h3>{editing?"Edit saved entry":queueEdit!==null?"Edit queued request":"Request details"}</h3><label className="field"><span>Request type</span><select value={draft.type} onChange={e=>{const type=e.target.value as ManualRequest["type"];edit({type,startTime:type==="overtime"?"22:00":type==="early_arrival"?"09:00":type==="early_leave"?"17:00":"11:00",endTime:type==="overtime"?"23:00":type==="early_arrival"?"11:00":"19:00"});}}>{Object.entries(labels).filter(([v])=>!editing || (editing.kind==="penalty"?v==="penalty":v!=="penalty")).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <div className={styles.fields}><label className="field"><span>{draft.type==="leave"?"From date":"Date"}</span><input type="date" required value={draft.dateFrom} onChange={e=>edit({dateFrom:e.target.value,dateTo:e.target.value})}/></label>{draft.type==="leave"&&<label className="field"><span>Through date (inclusive)</span><input type="date" required min={draft.dateFrom} value={draft.dateTo} onChange={e=>edit({dateTo:e.target.value})}/></label>}</div>
    {!["leave","penalty"].includes(draft.type)&&<div className={styles.fields}><label className="field"><span>{draft.type==="early_leave"?"Leave at":"From"}</span><input type="time" required value={draft.startTime} onChange={e=>edit({startTime:e.target.value})}/></label>{draft.type!=="early_leave"&&<label className="field"><span>To</span><input type="time" required disabled={draft.endTime==="24:00"} value={draft.endTime==="24:00"?"00:00":draft.endTime} onChange={e=>edit({endTime:e.target.value})}/><span className={styles.check}><input type="checkbox" checked={draft.endTime==="24:00"} onChange={e=>edit({endTime:e.target.checked?"24:00":"23:00"})} aria-label="End at midnight"/>End at midnight</span></label>}</div>}
    {draft.type==="penalty"&&<label className="field"><span>Penalty days</span><input type="number" required min="0.01" max="366" step="any" value={draft.days} onChange={e=>edit({days:Number(e.target.value)})}/><span className={styles.check}>{[0.25,0.5,1,2].map(days=><button type="button" className="secondary-button" key={days} onClick={()=>edit({days})}>{days} day</button>)}</span><small>The deduction uses this month’s salary divided by the salary day divisor. Enter any number of days.</small></label>}
    {draft.type==="mission"&&<><label className="field"><span>Working day or holiday</span><select value={draft.dayType} onChange={e=>edit({dayType:e.target.value as "normal"|"holiday"})}><option value="normal">Normal working day · ×1</option><option value="holiday">Holiday · ×2</option></select></label><p className={styles.hint}>Assignments count as attendance. Regular working hours are covered by salary; additional assignment hours are ×1. Holiday assignment hours are ×2. Friday is always a holiday.</p></>}
    {draft.type==="paid_weekend"&&<p className={styles.hint}>Actual hours ×2, included once in overtime pay. 8 hours = 480 OT minutes and 960 weighted Mission Time minutes.</p>}
    {draft.type==="leave"&&<div className={styles.fields}><label className="field"><span>Reason</span><select value={draft.reason} onChange={e=>edit({reason:e.target.value as ManualRequest["reason"]})}><option value="sick">Sick</option><option value="normal">Normal</option><option value="other">Other</option></select></label><label className="field"><span>Pay</span><select value={String(draft.leavePaid)} onChange={e=>edit({leavePaid:e.target.value==="true"})}><option value="true">Paid</option><option value="false">Unpaid</option></select></label></div>}
    <label className="field"><span>Description / reason</span><textarea required minLength={3} maxLength={2000} rows={3} value={draft.details} onChange={e=>edit({details:e.target.value})}/></label>
    <button className="secondary-button" disabled={queue.length>=50}><Plus size={16}/>{editing?"Save changes":queueEdit!==null?"Update queued request":"Queue request"}</button>{(editing || queueEdit!==null)&&<button type="button" className="secondary-button" onClick={()=>{setEditing(null);setQueueEdit(null);setDraft(initial());}}>Cancel edit</button>}</fieldset></form>
    <section className={styles.card}><div className={styles.heading}><h3>Ready to add</h3><span>{queue.length} requests</span></div>{!queue.length&&<p className={styles.empty}>Your queued requests will appear here before you save.</p>}<ol className={styles.queue}>{queue.map((r,index)=><li key={index}><div><strong>{labels[r.type]}</strong><p>{r.dateFrom}{r.dateTo!==r.dateFrom?" → "+r.dateTo:""} · {r.type==="penalty"?r.days+" penalty days":r.type==="leave"?(r.leavePaid?"Paid":"Unpaid"):r.startTime+ (r.type!=="early_leave"?"–"+r.endTime:"")}</p><p>{r.details}</p></div><button type="button" className="icon-button" disabled={busy || !!editing} aria-label={"Edit queued request "+(index+1)} onClick={()=>{setQueueEdit(index);setDraft({...r});formRef.current?.scrollIntoView({block:"start"});}}><Pencil size={16}/></button><button type="button" className="icon-button" disabled={busy || queueEdit!==null} aria-label={"Remove queued request "+(index+1)} onClick={()=>{setQueue(queue.filter((_,i)=>i!==index));setBatchId(crypto.randomUUID());}}><Trash2 size={16}/></button></li>)}</ol><button className="primary-button" disabled={busy || !!editing || queueEdit!==null || !employeeId || !queue.length} onClick={save}>{busy?"Adding…":"Add"}{!busy&&queue.length>0?" ("+queue.length+")":""}</button><p className={styles.hint}>Evening overtime after 22:00 ×2 · approved early overtime before 11:00 ×2.5. For overnight work, queue one request per date.</p></section></div>
    {employeeId&&<section className={styles.card}><div className={styles.heading}><h3>Saved entries</h3><button type="button" className="secondary-button" disabled={busy} onClick={()=>setRevision(v=>v+1)}>Reload</button></div><label className="field"><span>Filter by month (optional)</span><input type="month" value={historyMonth} onChange={e=>setHistoryMonth(e.target.value)}/></label>
      {history.employeeId!==employeeId?<p>Loading saved entries…</p>:history.error?<p role="alert">{history.error}</p>:<><p className={styles.hint}>Edit or delete saved requests and day penalties. Other monetary adjustments can be edited in Attendance → Adjustments.</p><ul className={styles.queue}>{history.entries.filter(entry=>!historyMonth || (entry.data.dateFrom.slice(0,7)<=historyMonth && entry.data.dateTo.slice(0,7)>=historyMonth)).map(entry=><li key={entry.kind+entry.id}><div><strong>{labels[entry.data.type]}</strong><p>{entry.data.dateFrom}{entry.data.dateTo!==entry.data.dateFrom?" → "+entry.data.dateTo:""} · {entry.kind==="penalty"?entry.data.days+" days":entry.data.type==="leave"?(entry.data.leavePaid?"Paid":"Unpaid"):entry.data.startTime+"–"+entry.data.endTime}</p><p>{entry.data.details}</p></div><div className={styles.actions}><button type="button" className="secondary-button" disabled={busy || queue.length>0} onClick={()=>{setEditing(entry);setQueueEdit(null);setDraft({...entry.data});setMessage("");formRef.current?.scrollIntoView({block:"start"});}}><Pencil size={15}/>Edit</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>changeSaved(entry,"DELETE")}><Trash2 size={15}/>Delete</button></div></li>)}</ul>{history.entries.length===0&&<p className={styles.empty}>No saved manual requests or day penalties for this employee.</p>}</>}
    </section>}
    {message&&<p role="status" className={styles.message}>{message}</p>}
  </div>;
}
