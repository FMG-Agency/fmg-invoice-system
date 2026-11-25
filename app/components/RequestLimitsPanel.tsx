"use client";
import {useState} from 'react';
import {ShieldAlert,X,Save} from 'lucide-react';
import type {EmployeeRequestType,RequestsState} from '../types';
import {monthlyRequestUsage,requestLimitTypes} from '../lib/request-limit-policy';
type RuleDraft={type:EmployeeRequestType;maxRequests:number|null;overflowMode:'block'|'warn'};
export function RequestLimitsPanel({state,saving,onSave,onClose}:{state:RequestsState;saving:boolean;onSave:(employeeId:number,rules:RuleDraft[])=>Promise<boolean>;onClose:()=>void}){
 const employees=state.limitEmployees || [];
 const [employeeId,setEmployeeId]=useState(employees[0]?.id || 0);
 const load=(id:number)=>requestLimitTypes.map(({type})=>{const rule=state.requestLimits?.find(r=>r.employeeId===id&&r.type===type);return {type,maxRequests:rule?.maxRequests??null,overflowMode:rule?.overflowMode || 'block' as const};});
 const [rules,setRules]=useState<RuleDraft[]>(()=>load(employeeId));
 const [month,setMonth]=useState(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7));
 const [dirty,setDirty]=useState(false);
 const patch=(type:EmployeeRequestType,change:Partial<RuleDraft>)=>{setDirty(true);setRules(current=>current.map(r=>r.type===type?{...r,...change}:r));};
 const close=()=>{if(!dirty||window.confirm('Discard unsaved request limit changes?'))onClose();};
 return <div className="modal-layer"><section className="modal-card request-limits-modal" role="dialog" aria-modal="true" aria-label="Employee request limits"><header className="modal-heading"><div><span className="eyebrow">ADMINISTRATOR SETTINGS</span><h2><ShieldAlert size={22}/> Request limits</h2><p>Monthly allowance for each employee and request type.</p></div><button type="button" className="icon-button" aria-label="Close request limits" onClick={close}><X size={19}/></button></header>
 <form onSubmit={async e=>{e.preventDefault();if(await onSave(employeeId,rules)){setDirty(false);}}}>
 <div className="request-limits-selectors"><label className="field"><span>Employee</span><select required value={employeeId} disabled={saving} onChange={e=>{if(dirty&&!window.confirm('Discard unsaved changes for this employee?'))return;const id=Number(e.target.value);setEmployeeId(id);setRules(load(id));setDirty(false);}}>{!employees.length&&<option value={0}>No employees</option>}{employees.map(e=><option key={e.id} value={e.id}>{e.name}{e.active?'':' · Inactive'}</option>)}</select></label><label className="field"><span>Usage month</span><input type="month" required value={month} onChange={e=>setMonth(e.target.value)}/></label></div>
 <p className="request-limits-help">Limits repeat every month and count requests by their start date. Pending + approved requests count; rejected, cancelled and manual entries do not. A multi-day request counts once. Early + Extra counts once in each type.</p>
 <div className="request-limit-rows">{rules.map(rule=>{const used=monthlyRequestUsage(state.requests,employeeId,rule.type,month);return <article className="request-limit-row" key={rule.type}><div><strong>{requestLimitTypes.find(t=>t.type===rule.type)?.label}</strong><small>{used} used in {month}{rule.maxRequests!==null?` · ${Math.max(0,rule.maxRequests-used)} remaining`:' · Unlimited'}</small></div><label className="field"><span>Requests per month</span><input aria-label={`Monthly limit ${rule.type}`} type="number" min={0} max={10000} step={1} placeholder="Unlimited" value={rule.maxRequests??''} disabled={saving} onChange={e=>patch(rule.type,{maxRequests:e.target.value===''?null:Number(e.target.value)})}/></label><label className="field"><span>When the limit is reached</span><select aria-label={`Overflow mode ${rule.type}`} value={rule.overflowMode} disabled={saving||rule.maxRequests===null} onChange={e=>patch(rule.type,{overflowMode:e.target.value as 'block'|'warn'})}><option value="block">Block sending · منع الإرسال</option><option value="warn">Allow + show warning · السماح مع تنبيه</option></select></label></article>;})}</div>
 <p className="request-limits-help">Empty = unlimited. Zero + Block = no requests of this type. Allow + warning keeps the request pending for your review and flags it for you and the employee. Existing requests are not changed.</p>
 <footer className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Close</button><button className="primary-button" disabled={saving||!employeeId||!dirty}><Save size={16}/>{saving?'Saving…':'Save limits'}</button></footer></form></section></div>;
}
