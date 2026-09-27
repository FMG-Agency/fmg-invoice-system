'use client';
import { useEffect, useState } from 'react';
import { ArchiveRestore, Clock3, Search, Trash2 } from 'lucide-react';
import styles from './TrashPanel.module.css';
type Item={id:number;kind:string;title:string;deletedBy:string;deletedAt:string;expiresAt:string};
const date=(value:string)=>new Date(value.replace(' ','T')+'Z').toLocaleString('en-GB',{timeZone:'Africa/Cairo',dateStyle:'medium',timeStyle:'short'});
export function TrashPanel({showToast,onRestored}:{showToast:(text:string)=>void;onRestored:()=>void}){
  const [items,setItems]=useState<Item[]>([]),[kind,setKind]=useState('All'),[search,setSearch]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState<number|null>(null),[error,setError]=useState('');
  useEffect(()=>{let active=true;fetch('/api/trash',{cache:'no-store'}).then(async r=>{const data=await r.json() as {items:Item[];error?:string};if(!r.ok)throw new Error(data.error||'Could not load Trash');if(active)setItems(data.items);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  async function restore(item:Item){
    if(!window.confirm(`Restore “${item.title}” to the system?`))return;
    setBusy(item.id);setError('');
    try{const response=await fetch('/api/trash',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'restore',id:item.id})});const data=await response.json() as {items:Item[];error?:string};if(!response.ok)throw new Error(data.error||'Could not restore');setItems(data.items);showToast('Item restored.');onRestored();}catch(e){setError(e instanceof Error?e.message:'Could not restore');}finally{setBusy(null);}
  }
  const kinds=['All','Invoices','Quotations','Work Orders','Tasks','Talent & Crew','Photos',...Array.from(new Set(items.map(i=>i.kind))).filter(k=>!['Invoices','Quotations','Work Orders','Tasks','Talent & Crew','Photos'].includes(k)).sort()];
  const visible=items.filter(i=>(kind==='All'||i.kind===kind)&&`${i.title} ${i.deletedBy}`.toLowerCase().includes(search.toLowerCase()));
  return <section className={styles.panel}>
    <div className={styles.notice}><span className={styles.icon}><Trash2 size={23}/></span><div><h2>A second chance for deleted work</h2><p>Restore items for 7 days after deletion. Expired items cannot be restored and are permanently removed by the daily automatic cleanup.</p><small>Administrator access only · All times are Cairo time</small></div></div>
    <div className={styles.tools}><label><Search size={17}/><input aria-label="Search Trash" placeholder="Search by name, number or deleted by…" value={search} onChange={e=>setSearch(e.target.value)}/></label><strong>Total: {visible.length}</strong></div>
    <nav className={styles.tabs} aria-label="Trash categories">{kinds.map(k=><button key={k} className={kind===k?styles.selected:''} onClick={()=>setKind(k)}>{k}<span>{k==='All'?items.length:items.filter(i=>i.kind===k).length}</span></button>)}</nav>
    {error&&<p className={styles.error} role="alert">{error}</p>}
    {loading?<p className={styles.empty}>Loading Trash…</p>:visible.length?<div className={styles.list}>{visible.map(item=><article key={item.id}><div className={styles.record}><span className={styles.badge}>{item.kind}</span><h3>{item.title}</h3><p>Deleted by {item.deletedBy||'Unknown'} · {date(item.deletedAt)}</p><small><Clock3 size={14}/> Restore before {date(item.expiresAt)}</small></div><button className="secondary-button" disabled={busy!==null} onClick={()=>void restore(item)}><ArchiveRestore size={17}/>{busy===item.id?'Restoring…':'Restore'}</button></article>)}</div>:<div className={styles.empty}><Trash2 size={30}/><h3>{items.length?'No matching items':'Trash is empty'}</h3><p>Deleted records will appear here, grouped by type.</p></div>}
  </section>;
}
