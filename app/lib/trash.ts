import { database, type DatabaseStatement } from './database';
import type { AuthSession } from './auth-server';
import { del } from '@vercel/blob';

const kinds: Record<string,string> = {documents:'Documents',production_work_orders:'Work Orders',agency_tasks:'Tasks',production_crew_members:'Talent & Crew',clients:'Clients',categories:'Categories',employee_requests:'Employee Requests',payroll_adjustments:'Payroll Adjustments',client_financial_transactions:'Transactions',client_monthly_retainers:'Retainers',client_portal_plans:'Client Plans',system_notifications:'Notifications'};
type Row = Record<string, unknown>;
type Link = {table:string;column:string;ids:number[];created:Record<string,string>};
type Snapshot = {row:Row;children:Record<string,Row[]>;links:Link[]};
const children: Record<string, [string,string][]> = {agency_tasks:[['task_submissions','task_id']],production_work_orders:[['production_work_order_events','work_order_id']],clients:[['client_portal_plans','client_id']]};
const links: Record<string,[string,string][]> = {documents:[['production_work_orders','draft_invoice_id'],['client_financial_transactions','document_id']],production_work_orders:[['documents','production_work_order_id'],['production_crew_reviews','work_order_id']]};
const q = (name:string) => {if(!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('Invalid column');return `"${name}"`;};
async function exists(table:string){return Boolean(await database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(table).first());}
async function columns(table:string){return (await database.prepare(`PRAGMA table_info(${q(table)})`).all<{name:string}>()).results.map(c=>c.name);}
async function rowJson(table:string,alias:string){return `json_object(${(await columns(table)).map(c=>`'${c}',${alias}.${q(c)}`).join(',')})`;}
let ready:Promise<void>|null=null;
export async function ensureTrash(){
  ready ??= database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS trash_items (id INTEGER PRIMARY KEY AUTOINCREMENT, source_table TEXT NOT NULL, source_id INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, snapshot_json TEXT NOT NULL, deleted_by TEXT NOT NULL, deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TEXT NOT NULL DEFAULT (datetime('now','+7 days')))`),
    database.prepare('CREATE INDEX IF NOT EXISTS trash_expiry ON trash_items(expires_at)'),
    database.prepare('CREATE TABLE IF NOT EXISTS trash_blob_cleanup (blob_key TEXT PRIMARY KEY)'),
    database.prepare('CREATE TABLE IF NOT EXISTS trash_restore_guard (value INTEGER CHECK(value=1))')
  ]).then(()=>undefined);
  try{await ready;}catch(e){ready=null;throw e;}
}
// The snapshot SELECT and the original deletion run in the same write transaction.
export async function archiveStatement(table:string,where:string,args:unknown[],session:Pick<AuthSession,'displayName'|'username'>):Promise<DatabaseStatement>{
  if(!kinds[table]) throw new Error('Unsupported trash type');
  await ensureTrash();
  const fields=await columns(table);
  const title=fields.includes('generated_code')?'t.generated_code':fields.includes('title')?'t.title':fields.includes('name')?'t.name':table==='production_work_orders'?"'WO-' || printf('%04d',t.id)":"'Record #' || t.id";
  const childParts:string[]=[];
  for(const [child,key] of children[table]||[]) if(await exists(child)) childParts.push(`'${child}',json((SELECT json_group_array(${await rowJson(child,'c')}) FROM ${q(child)} c WHERE c.${q(key)}=t.id))`);
  const linkParts:string[]=[];
  for(const [target,column] of links[table]||[]) if(await exists(target) && (await columns(target)).includes(column)) {const stamp=(await columns(target)).includes('created_at')?'created_at':"''";linkParts.push(`json_object('table','${target}','column','${column}','ids',json((SELECT json_group_array(id) FROM ${q(target)} WHERE ${q(column)}=t.id)),'created',json((SELECT json_group_object(id,${stamp}) FROM ${q(target)} WHERE ${q(column)}=t.id)))`);}
  const kind=table==='documents'?"CASE WHEN t.type='invoice' THEN 'Invoices' ELSE 'Quotations' END":`'${kinds[table]}'`;
  return database.prepare(`INSERT INTO trash_items(source_table,source_id,kind,title,snapshot_json,deleted_by)
    SELECT '${table}',t.id,${kind},${title},json_object('row',json(${await rowJson(table,'t')}),'children',json_object(${childParts.join(',')}),'links',json_array(${linkParts.join(',')})),? FROM ${q(table)} t WHERE ${where}`).bind(session.displayName||session.username,...args);
}
export async function archivePhoto(table:string,id:number,session:Pick<AuthSession,'displayName'|'username'>,expectedKey:string){
  if(!['production_crew_members','production_locations'].includes(table))throw new Error('Unsupported photo');
  await ensureTrash();
  return database.prepare(`INSERT INTO trash_items(source_table,source_id,kind,title,snapshot_json,deleted_by) SELECT ?,id,'Photos',name || ' — Photo',json_object('row',json_object('id',id,'photo_key',photo_key),'children',json_object(),'links',json_array()),? FROM ${q(table)} WHERE id=? AND photo_key<>'' AND photo_key=?`).bind(table+':photo',session.displayName||session.username,id,expectedKey);
}
export async function trashDelete(table:string,where:string,args:unknown[],session:Pick<AuthSession,'displayName'|'username'>){
  return database.batch([await archiveStatement(table,where,args,session),database.prepare(`DELETE FROM ${q(table)} WHERE ${where}`).bind(...args)]);
}
async function importExistingTrash(){
  await ensureTrash();
  if(await exists('deleted_document_history') && await exists('documents')) {
    const fields=await columns('documents');
    const old=(await database.prepare("SELECT * FROM deleted_document_history WHERE NOT EXISTS(SELECT 1 FROM trash_items WHERE source_table='documents' AND source_id=deleted_document_history.id)").all<Row>()).results;
    for(const item of old){
      const saved=JSON.parse(String(item.snapshot_json)) as Row,row:Row={};
      for(const field of fields){const key=field.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase());if(field==='items_json')row[field]=JSON.stringify(saved.items||[]);else if(saved[key]!==undefined)row[field]=saved[key];}
      await database.prepare("INSERT OR IGNORE INTO trash_items(source_table,source_id,kind,title,snapshot_json,deleted_by,deleted_at,expires_at) SELECT 'documents',?,?,?,?,?,?,datetime(?,'+7 days') WHERE EXISTS(SELECT 1 FROM deleted_document_history WHERE id=?) AND NOT EXISTS(SELECT 1 FROM trash_items WHERE source_table='documents' AND source_id=?)").bind(item.id,saved.type==='invoice'?'Invoices':'Quotations',saved.generatedCode,JSON.stringify({row,children:{},links:[]}),'Unknown',item.deleted_at,item.deleted_at,item.id,item.id).run();
    }
  }
  if(await exists('production_crew_members') && (await columns('production_crew_members')).includes('deleted_at')) {
    const rows=(await database.prepare("SELECT * FROM production_crew_members WHERE deleted_at<>'' AND NOT EXISTS(SELECT 1 FROM trash_items WHERE source_table='production_crew_members' AND source_id=production_crew_members.id)").all<Row>()).results;
    for(const row of rows) await database.prepare("INSERT OR IGNORE INTO trash_items(source_table,source_id,kind,title,snapshot_json,deleted_by,deleted_at,expires_at) SELECT 'production_crew_members',?,'Talent & Crew',?,?, 'Unknown',?,datetime(?,'+7 days') WHERE EXISTS(SELECT 1 FROM production_crew_members WHERE id=? AND deleted_at<>'') AND NOT EXISTS(SELECT 1 FROM trash_items WHERE source_table='production_crew_members' AND source_id=?)").bind(row.id,row.name,JSON.stringify({row:{...row,active:1},children:{},links:[]}),row.deleted_at,row.deleted_at,row.id,row.id).run();
  }
}
export async function listTrash(){
  await importExistingTrash();
  return (await database.prepare("SELECT id,kind,title,deleted_by AS deletedBy,deleted_at AS deletedAt,expires_at AS expiresAt FROM trash_items WHERE expires_at>datetime('now') ORDER BY deleted_at DESC,id DESC").all()).results;
}
export async function restoreTrash(id:number){
  await ensureTrash();
  const item=await database.prepare("SELECT * FROM trash_items WHERE id=? AND expires_at>datetime('now')").bind(id).first<Row>();
  if(!item) throw new Error('This item has expired or is no longer in Trash.');
  const photo=String(item.source_table).endsWith(':photo');
  const table=String(item.source_table).replace(':photo','');if(!kinds[table] && !(photo&&table==='production_locations')) throw new Error('Unsupported trash type');
  const snapshot=JSON.parse(String(item.snapshot_json)) as Snapshot;
  const statements:DatabaseStatement[]=[database.prepare("INSERT INTO trash_restore_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM trash_items WHERE id=? AND expires_at>datetime('now')) THEN 1 ELSE 0 END").bind(id)];
  if(table==='documents') {
    for(const link of snapshot.links.filter(l=>l.table==='production_work_orders')) for(const orderId of link.ids){
      const stamp=link.created?.[String(orderId)];
      if(stamp!==undefined && (await columns('production_work_orders')).includes('created_at')) statements.push(database.prepare("INSERT INTO trash_restore_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM production_work_orders WHERE id=? AND created_at<>?) THEN 0 ELSE 1 END").bind(orderId,stamp));
    }
    const code=String(snapshot.row.generated_code),serial=Number(code.match(/(\d+)$/)?.[1]||0);
    statements.push(database.prepare("INSERT INTO trash_restore_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM documents WHERE category_id=? AND CAST(substr(generated_code,length(rtrim(generated_code,'0123456789'))+1) AS INTEGER)=?) THEN 0 ELSE 1 END").bind(snapshot.row.category_id,serial));
  }
  if(table==='production_work_orders' && await exists('documents')){
    const linked=[Number(snapshot.row.draft_invoice_id)||0,...snapshot.links.filter(l=>l.table==='documents').flatMap(l=>l.ids)];
    statements.push(database.prepare(`INSERT INTO trash_restore_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM documents WHERE category_id IN (SELECT id FROM categories WHERE lower(trim(name))='media guide') AND CAST(substr(generated_code,length(rtrim(generated_code,'0123456789'))+1) AS INTEGER)=? AND id NOT IN (${linked.map(()=>'?').join(',')})) THEN 0 ELSE 1 END`).bind(item.source_id,...linked));
  }
  const guard="EXISTS (SELECT 1 FROM trash_items WHERE id=? AND expires_at>datetime('now'))";
  const insert=(target:string,row:Row)=>{const fields=Object.keys(row);statements.push(database.prepare(`INSERT INTO ${q(target)} (${fields.map(q).join(',')}) SELECT ${fields.map(()=>'?').join(',')} WHERE ${guard}`).bind(...fields.map(f=>row[f]),id));};
  if(photo){
    if(!['production_crew_members','production_locations'].includes(table))throw new Error('Unsupported photo');
    statements.push(database.prepare(`INSERT INTO trash_restore_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM ${q(table)} WHERE id=? AND photo_key='') THEN 1 ELSE 0 END`).bind(item.source_id));
    statements.push(database.prepare(`UPDATE ${q(table)} SET photo_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND photo_key='' AND ${guard}`).bind(snapshot.row.photo_key,item.source_id,id));
  }else if(table==='production_crew_members'){
    statements.push(database.prepare(`UPDATE production_crew_members SET deleted_at='',active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at<>'' AND ${guard}`).bind(snapshot.row.active,item.source_id,id));
  }else{insert(table,snapshot.row);}
  for(const [child,rows] of Object.entries(snapshot.children)){
    if(!(children[table]||[]).some(([name])=>name===child)) throw new Error('Invalid trash relationship');
    for(const row of rows) insert(child,row);
  }
  for(const link of snapshot.links){
    if(!(links[table]||[]).some(([name,col])=>name===link.table&&col===link.column)) throw new Error('Invalid trash link');
    for(const targetId of link.ids) {
      const hasCreated=(await columns(link.table)).includes('created_at');
      const stamp=link.created?.[String(targetId)];
      statements.push(database.prepare(`UPDATE ${q(link.table)} SET ${q(link.column)}=? WHERE id=? AND ${q(link.column)} IS NULL AND ${hasCreated&&stamp!==undefined?'created_at=? AND ':''}${guard}`).bind(item.source_id,targetId,...(hasCreated&&stamp!==undefined?[stamp]:[]),id));
    }
  }
  if(table==='documents'){
    if(await exists('deleted_document_history')) statements.push(database.prepare('DELETE FROM deleted_document_history WHERE id=?').bind(item.source_id));
    const serial=Number(String(snapshot.row.generated_code).match(/(\d+)$/)?.[1]||0);
    if(await exists('reusable_document_serials')) statements.push(database.prepare('DELETE FROM reusable_document_serials WHERE category_id=? AND serial=?').bind(snapshot.row.category_id,serial));
  }
  if(table==='production_work_orders' && await exists('reusable_document_serials')) statements.push(database.prepare("DELETE FROM reusable_document_serials WHERE serial=? AND category_id IN (SELECT id FROM categories WHERE lower(trim(name))='media guide')").bind(item.source_id));
  statements.push(database.prepare("DELETE FROM trash_items WHERE id=? AND expires_at>datetime('now')").bind(id));
  statements.push(database.prepare("DELETE FROM trash_restore_guard"));
  try{await database.batch(statements);}catch(error){if(/constraint|unique|foreign key/i.test(String(error))) throw new Error('Cannot restore: the original number is already used, or a linked record is missing. Restore the linked record first. Existing data has not been changed.');throw error;}
}
const blobColumns:[string,string][]=[['documents','pdf_key'],['employee_requests','attachment_key'],['production_crew_members','photo_key'],['production_locations','photo_key'],['clients','portal_logo_key']];
export async function purgeExpiredTrash(){
  await importExistingTrash();
  const expired=(await database.prepare("SELECT id,source_table,source_id,snapshot_json FROM trash_items WHERE expires_at<=datetime('now') LIMIT 200").all<Row>()).results;
  for(const item of expired){
    const snap=JSON.parse(String(item.snapshot_json)) as Snapshot;
    const statements:DatabaseStatement[]=[];
    for(const [,column] of blobColumns) if(snap.row[column]) statements.push(database.prepare("INSERT OR IGNORE INTO trash_blob_cleanup(blob_key) SELECT ? WHERE EXISTS(SELECT 1 FROM trash_items WHERE id=? AND expires_at<=datetime('now'))").bind(snap.row[column],item.id));
    if(item.source_table==='production_crew_members'){
      if(await exists('production_crew_reviews')) statements.push(database.prepare("DELETE FROM production_crew_reviews WHERE crew_id=? AND EXISTS(SELECT 1 FROM production_crew_members WHERE id=? AND deleted_at<>'')").bind(item.source_id,item.source_id));
      statements.push(database.prepare("DELETE FROM production_crew_members WHERE id=? AND deleted_at<>''").bind(item.source_id));
    }
    if(item.source_table==='documents' && await exists('deleted_document_history')) statements.push(database.prepare('DELETE FROM deleted_document_history WHERE id=?').bind(item.source_id));
    statements.push(database.prepare("DELETE FROM trash_items WHERE id=? AND expires_at<=datetime('now')").bind(item.id));
    await database.batch(statements);
  }
  for(const queued of (await database.prepare('SELECT blob_key FROM trash_blob_cleanup LIMIT 200').all<{blob_key:string}>()).results){
    let referenced=false;
    for(const [table,column] of blobColumns) if(await exists(table) && (await columns(table)).includes(column) && await database.prepare(`SELECT 1 FROM ${q(table)} WHERE ${q(column)}=? LIMIT 1`).bind(queued.blob_key).first()) {referenced=true;break;}
    // Other recoverable snapshots may share this object.
    if(!referenced) referenced=Boolean(await database.prepare('SELECT 1 FROM trash_items WHERE instr(snapshot_json,?)>0 LIMIT 1').bind(queued.blob_key).first());
    if(referenced) continue;
    try{await del(queued.blob_key);await database.prepare('DELETE FROM trash_blob_cleanup WHERE blob_key=?').bind(queued.blob_key).run();}catch{ /* Retry on the next scheduled cleanup. */ }
  }
  return expired.length;
}
