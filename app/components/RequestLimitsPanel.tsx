"use client";
import {useState} from 'react';
import {ShieldAlert,X,Save,Clock3,LogIn,LogOut,CalendarDays,Sunrise,BriefcaseBusiness,ArrowLeftRight,AlarmClock} from 'lucide-react';
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
 const icons={early_leave:LogOut,late_arrival:LogIn,leave:CalendarDays,overtime:AlarmClock,early_arrival:Sunrise,friday_work:Clock3,friday_exchange:ArrowLeftRight,mission:BriefcaseBusiness};
 const close=()=>{if(!dirty||window.confirm('Discard unsaved request limit changes?'))onClose();};
 return <div className="modal-layer"><section className="modal-card request-limits-modal" role="dialog" aria-modal="true" aria-label="Employee request limits"><header className="modal-heading"><span className="limits-title-icon"><ShieldAlert size={24}/></span><div><span className="eyebrow">ADMINISTRATOR SETTINGS</span><h2>Request limits</h2><p>Monthly allowance for each employee and request type.</p></div><button type="button" className="icon-button" aria-label="Close request limits" onClick={close}><X size={19}/></button></header>
 <form onSubmit={async e=>{e.preventDefault();if(await onSave(employeeId,rules)){setDirty(false);}}}>
 <div className="request-limits-body"><div className="request-limits-selectors"><label className="field"><span>Employee</span><select required value={employeeId} disabled={saving} onChange={e=>{if(dirty&&!window.confirm('Discard unsaved changes for this employee?'))return;const id=Number(e.target.value);setEmployeeId(id);setRules(load(id));setDirty(false);}}>{!employees.length&&<option value={0}>No employees</option>}{employees.map(e=><option key={e.id} value={e.id}>{e.name}{e.active?'':' · Inactive'}</option>)}</select></label><label className="field"><span>Usage month</span><input type="month" required value={month} onChange={e=>setMonth(e.target.value)}/></label></div>
 <div className="limits-section-heading"><div><span className="eyebrow">MONTHLY ALLOWANCES</span><h3>Set the rules for each request</h3></div><span className="limits-count">{rules.filter(r=>r.maxRequests!==null).length} of {rules.length} limits set</span></div>
 <div className="request-limit-rows">{rules.map(rule=>{
 const used=monthlyRequestUsage(state.requests,employeeId,rule.type,month);
 const [title,subtitle]=(requestLimitTypes.find(t=>t.type===rule.type)?.label || '').split(' · ');
 const Icon=icons[rule.type],limited=rule.maxRequests!==null;
 const mode=!limited?'unlimited':rule.maxRequests===0&&rule.overflowMode==='block'?'disabled':rule.overflowMode;
 return <article className="request-limit-row" key={rule.type} data-mode={mode}>
 <div className="limit-card-heading"><span className="limit-type-icon"><Icon size={19}/></span><div><strong>{title}</strong><small lang="ar">{subtitle}</small></div><span className={"limit-mode-badge "+mode}>{mode==='unlimited'?'Unlimited':mode==='disabled'?'Disabled':mode==='block'?'Block at limit':'Allow + warn'}</span></div>
 <div className="limit-card-fields"><label className="field"><span>Monthly allowance</span><div className="limit-number-input"><input aria-label={"Monthly limit "+rule.type} type="number" min={0} max={10000} step={1} placeholder="No limit" value={rule.maxRequests??''} disabled={saving} onChange={e=>patch(rule.type,{maxRequests:e.target.value===''?null:Number(e.target.value)})}/><span>requests</span></div></label>
 <label className="field"><span>When reached</span><select aria-label={"Overflow mode "+rule.type} value={rule.overflowMode} disabled={saving||!limited} onChange={e=>patch(rule.type,{overflowMode:e.target.value as 'block'|'warn'})}><option value="block">Block sending · منع</option><option value="warn">Allow + warning · تنبيه</option></select></label></div>
 <div className="limit-usage"><span><b>{used}</b> used this month</span><span>{limited?Math.max(0,rule.maxRequests!-used)+' remaining':'No monthly cap'}</span></div>
 {limited&&<div className="limit-usage-track" role="meter" aria-label={title+' usage'} aria-valuemin={0} aria-valuemax={Math.max(1,rule.maxRequests!)} aria-valuenow={Math.min(used,Math.max(1,rule.maxRequests!))}><span style={{width:(rule.maxRequests===0?100:Math.min(100,used/rule.maxRequests!*100))+'%'}}/></div>}
 </article>;})}</div>
 <details className="limits-guide"><summary>How limits are calculated</summary><p>Limits repeat monthly, based on the request start date. Pending and approved requests count; rejected, cancelled and manual entries do not. Multi-day requests count once; Early + Extra count separately.</p><p>Leave the allowance empty for unlimited requests. Zero + Block disables that type. Allow + warning keeps the request pending for administrator review. Existing requests remain unchanged.</p></details></div>
 <footer className="modal-actions limits-footer"><span className={dirty?"limits-save-state pending":"limits-save-state"}>{dirty?"● Unsaved changes":"Settings up to date"}</span><button type="button" className="secondary-button" onClick={close}>Close</button><button className="primary-button" disabled={saving||!employeeId||!dirty}><Save size={16}/>{saving?'Saving…':'Save limits'}</button></footer></form></section></div>;
}
