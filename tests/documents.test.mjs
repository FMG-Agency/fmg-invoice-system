import assert from 'node:assert/strict';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('new work orders reserve matching invoice numbers; creators survive edits and legacy codes stay unchanged', async () => {
  process.env.TURSO_DATABASE_URL = 'file::memory:';
  delete process.env.TURSO_AUTH_TOKEN;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_PUBLIC_KEY;
  globalThis.documentTestSession = { userId: 101, username: 'fixture', displayName: 'Original Author', roleLabel: 'Administrator', isAdmin: true, permissions: [], clientId: null, employeeId: null };
  await mkdir(new URL('../work/', import.meta.url), { recursive: true });
  const bundle = new URL('../work/document-test.mjs', import.meta.url);
  await build({ stdin: { contents: `export { database } from './app/lib/database'; export { POST as production } from './app/api/production/route'; export { GET as state, POST as save } from './app/api/state/route'; export { reserveWorkOrderNumber } from './app/lib/document-metadata';`, resolveDir: process.cwd() }, outfile: fileURLToPath(bundle), bundle: true, platform: 'node', format: 'esm', packages: 'external', plugins: [{ name: 'isolated-auth-storage', setup(b) {
    b.onResolve({ filter: /auth-server$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    b.onResolve({ filter: /^@vercel\/blob$/ }, () => ({ path: 'blob', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({path}) => ({ contents: path === 'auth' ? `export async function getSession(){return globalThis.documentTestSession;} export async function requireAuth(){return globalThis.documentTestSession ? null : Response.json({}, {status:401});} export async function requirePermission(){return requireAuth();}` : `export async function put(){return {url:'mock-only'};} export async function del(){}` }));
  }}] });
  const app = await import(bundle.href);
  for (const f of (await readdir(new URL('../drizzle/', import.meta.url))).filter(f => f.endsWith('.sql')).sort()) {
    for (const sql of (await readFile(new URL('../drizzle/'+f, import.meta.url),'utf8')).split('--> statement-breakpoint').filter(s=>s.trim())) await app.database.prepare(sql).run();
  }
  for (const id of [101,102]) await app.database.prepare("INSERT INTO auth_users (id,username,role_label,password_hash,password_salt,password_iterations,is_admin) VALUES (?,?,'Administrator','fixture','fixture',1,1)").bind(id,'fixture-'+id).run();
  const request = body => new Request('https://fixture.test/api/state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  async function call(fn,body) { const r=await fn(request(body)); const result=await r.json(); assert.equal(r.status,200,JSON.stringify(result)); return result; }
  let state=await app.state(new Request('https://fixture.test/api/state')).then(async r=>{const b=await r.json();assert.equal(r.status,200,JSON.stringify(b));return b;});
  const category=state.categories.find(c=>c.name==='Media Guide');
  const client=state.clients[0];
  const data={type:'quotation',companyKey:'fmg',clientId:client.id,categoryId:category.id,date:'2026-09-10',preparedBy:'Finance Department',currency:'EGP',status:'Draft',items:[{id:'item',description:'Fixture',qty:1,unitPrice:10}],pdfBase64:Buffer.from('Isolated PDF placeholder').toString('base64')};
  state=await call(app.save,{action:'saveDocument',data});
  const legacy=state.documents[0];
  assert.equal(legacy.createdByName,'Original Author');
  assert.equal(legacy.createdByUserId,101);
  // Simulate an old record with no author tracking, preserving its real code.
  await app.database.prepare("UPDATE documents SET created_by_name='', created_by_user_id=NULL WHERE id=?").bind(legacy.id).run();
  const scope={clientId:client.id,bundles:[{id:'bundle',catalogId:3,name:'Fixture package',price:10,inputs:[],outputs:[]}],addons:[],workDate:'2026-09-10',accountNote:''};
  const prod=await call(app.production,{action:'create',data:{...scope,documentType:'media_guide'}});
  const order=prod.orders[0];
  assert.ok(order.id>category.counter);
  const options=[{id:'location',type:'location',name:'Fixture studio',price:0,billingMode:'included'}];
  // A manual invoice in between must not consume this work order's reserved number.
  state=await call(app.save,{action:'saveDocument',data:{...data,type:'invoice'}});
  const manual=state.documents[0];
  assert.notEqual(Number(manual.generatedCode.match(/(\d+)$/)[1]),order.id);
  globalThis.documentTestSession={...globalThis.documentTestSession,userId:102,displayName:'Approving Manager'};
  await call(app.production,{action:'complete',id:order.id,data:{callTime:'13:00',options,productionNote:''}});
  await call(app.production,{action:'finalApprove',id:order.id,data:{...scope,callTime:'13:00',options,productionNote:'',operationNote:''}});
  state=await app.state(new Request('https://fixture.test/api/state')).then(r=>r.json());
  const linked=state.documents.find(d=>d.productionWorkOrderId===order.id);
  assert.equal(linked.generatedCode,order.code.replace(/^WO-/,'MG-'));
  assert.equal(linked.createdByName,'Approving Manager');
  assert.equal(linked.createdByUserId,102);
  assert.equal(state.documents.find(d=>d.id===legacy.id).generatedCode,legacy.generatedCode);
  assert.equal(state.documents.find(d=>d.id===legacy.id).createdByName,'');
  // Editing as another account must not overwrite the creator or permanent code.
  state=await call(app.save,{action:'saveDocument',data:{...data,id:manual.id,type:'invoice'}});
  const edited=state.documents.find(d=>d.id===manual.id);
  assert.equal(edited.createdByName,'Original Author');
  assert.equal(edited.generatedCode,manual.generatedCode);
  await app.database.prepare("UPDATE documents SET generated_code='Legacy-MG0099' WHERE id=?").bind(linked.id).run();
  await call(app.production,{action:'managerEdit',id:order.id,data:{...scope,callTime:'13:00',options,productionNote:'',operationNote:''}});
  assert.equal((await app.database.prepare('SELECT generated_code AS code FROM documents WHERE id=?').bind(linked.id).first()).code,'Legacy-MG0099');
  const count=await app.database.prepare('SELECT COUNT(*) AS total FROM documents WHERE production_work_order_id=?').bind(order.id).first();
  assert.equal(count.total,1);
  const reserved=await Promise.all(Array.from({length:6},()=>app.reserveWorkOrderNumber()));
  assert.equal(new Set(reserved).size,6);
  assert.ok(reserved.every(n=>n>order.id));
  globalThis.documentTestSession=null;
  assert.equal((await app.save(request({action:'saveDocument',data}))).status,401);
});
