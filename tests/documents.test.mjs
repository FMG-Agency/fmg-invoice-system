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
  await build({ stdin: { contents: `export { POST as directorySave, GET as directoryGet } from './app/api/production-directory/route'; export { database } from './app/lib/database'; export { POST as production } from './app/api/production/route'; export { GET as state, POST as save } from './app/api/state/route'; export { reserveWorkOrderNumber } from './app/lib/document-metadata'; export {POST as tasks, GET as taskState} from './app/api/tasks/route'; export {GET as pdf} from './app/api/pdf/[id]/route';`, resolveDir: process.cwd() }, outfile: fileURLToPath(bundle), bundle: true, platform: 'node', format: 'esm', packages: 'external', plugins: [{ name: 'isolated-auth-storage', setup(b) {
    b.onResolve({ filter: /auth-server$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    b.onResolve({ filter: /^@vercel\/blob$/ }, () => ({ path: 'blob', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({path}) => ({ contents: path === 'auth' ? `export async function ensureAuthDatabase(){} export async function getSession(){return globalThis.documentTestSession;} export async function requireAuth(){return globalThis.documentTestSession ? null : Response.json({}, {status:401});} export async function requireAnyPermission(){return requireAuth();} export async function requirePermission(){return requireAuth();}` : `export async function get(){return null;} export async function put(){return {url:'mock-only'};} export async function del(){}` }));
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
  // Directory writes and uploads run against the in-memory DB and mocked Blob only.
  const adminSession = {...globalThis.documentTestSession};
  const crewData = {category:'model',name:'Stories fixture',phone:'01000000000',profileUrl:'',modelGroup:'stories',modelNationality:'egyptian',hourlyRate:null,dailyRate:null,notes:'',active:true};
  const crewState = await call(app.production,{action:'saveCrew',id:null,data:crewData});
  const person = crewState.crew.find(item=>item.name==='Stories fixture');
  assert.equal(person.modelGroup,'stories');
  let directory = await call(app.directorySave,{action:'saveLocation',id:null,data:{name:'Fixture studio',mapUrl:'https://maps.google.com/?q=studio',notes:'Indoor set',active:true}});
  assert.equal(directory.locations[0].name,'Fixture studio');
  directory = await call(app.directorySave,{action:'saveReview',data:{crewId:person.id,workOrderId:order.id,shootName:'Fixture shoot',shootDate:'2026-09-20',rating:4,comment:'On time'}});
  assert.equal(directory.reviews[0].rating,4);
  assert.equal(directory.reviews[0].authorName,'Original Author');
  assert.equal((await app.directorySave(request({action:'saveReview',data:{crewId:person.id,workOrderId:null,shootName:'Old shoot',shootDate:'2026-09-20',rating:9,comment:''}}))).status,400);
  globalThis.documentTestSession={...adminSession,isAdmin:false,roleLabel:'Content Creator',permissions:['production']};
  assert.equal((await app.directorySave(request({action:'saveLocation',id:null,data:{name:'Forbidden',mapUrl:'https://example.com',notes:'',active:true}}))).status,403);
  globalThis.documentTestSession=adminSession;
  function photoRequest(bytes,type='image/png') {const form=new FormData();form.set('kind','crew');form.set('id',String(person.id));form.set('photo',new File([bytes],'photo.png',{type}));return new Request('https://fixture.test/api/production-directory',{method:'POST',body:form});}
  assert.equal((await app.directorySave(photoRequest('not an image'))).status,400);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64');
  assert.equal((await app.directorySave(photoRequest(png))).status,200);
  assert.ok((await app.database.prepare('SELECT photo_key AS key FROM production_crew_members WHERE id=?').bind(person.id).first()).key.startsWith('production-directory/crew/'));
  globalThis.documentTestSession={...adminSession,isAdmin:false,roleLabel:'Content Creator',permissions:['production']};
  assert.equal((await app.directorySave(request({action:'removePhoto',kind:'crew',id:person.id}))).status,403);
  globalThis.documentTestSession=adminSession;
  await call(app.directorySave,{action:'removePhoto',kind:'crew',id:person.id});
  assert.equal((await app.database.prepare('SELECT photo_key AS key FROM production_crew_members WHERE id=?').bind(person.id).first()).key,'');
  assert.equal((await app.directoryGet(new Request('https://fixture.test/api/production-directory?photo=crew&id='+person.id))).status,404);
  globalThis.documentTestSession=null;
  assert.equal((await app.directoryGet(new Request('https://fixture.test/api/production-directory?photo=crew&id='+person.id))).status,401);
  globalThis.documentTestSession=adminSession;
  globalThis.documentTestSession={...adminSession,isAdmin:false,roleLabel:'Content Creator',permissions:['production']};
  assert.equal((await app.production(request({action:'deleteCrew',id:person.id}))).status,403);
  globalThis.documentTestSession=adminSession;
  const afterCrewDelete=await call(app.production,{action:'deleteCrew',id:person.id});
  assert.equal(afterCrewDelete.crew.some(item=>item.id===person.id),false);
  assert.equal((await app.production(request({action:'deleteCrew',id:person.id}))).status,404);
  assert.equal((await app.database.prepare('SELECT COUNT(*) AS count FROM production_crew_reviews WHERE crew_id=?').bind(person.id).first()).count,1);
  assert.equal((await app.production(request({action:'saveCrew',id:person.id,data:crewData}))).status,404);
  const options=[{id:'location',type:'location',name:'Fixture studio',price:0,billingMode:'included'}];
  // A manual invoice in between must not consume this work order's reserved number.
  state=await call(app.save,{action:'saveDocument',data:{...data,type:'invoice'}});
  const manual=state.documents[0];
  assert.notEqual(Number(manual.generatedCode.match(/(\d+)$/)[1]),order.id);
  globalThis.documentTestSession={...globalThis.documentTestSession,userId:102,displayName:'Approving Manager'};
  await call(app.production,{action:'submitContent',id:order.id,data:{contentNote:'Creative direction',contentReferences:['https://example.com/reference']}});
  await call(app.production,{action:'complete',id:order.id,data:{callTime:'13:00',options,productionNote:''}});
  await call(app.production,{action:'finalApprove',id:order.id,data:{...scope,callTime:'13:00',options,productionNote:'',operationNote:''}});
  state=await app.state(new Request('https://fixture.test/api/state')).then(r=>r.json());
  const linked=state.documents.find(d=>d.productionWorkOrderId===order.id);
  const clientPart = (client.companyName || client.name).trim().replace(/[^A-Za-z0-9\u0600-\u06FF]+/g, '-').replace(/^-|-$/g, '') || 'CLIENT';
  assert.equal(linked.generatedCode, `${clientPart}-MG${order.code.slice(3)}`);
  assert.equal(Number(linked.generatedCode.match(/(\d+)$/)[1]), order.id);
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
  // Recover the known sender of legacy shared deliveries without closing teammates' work.
  for (const [name,value] of [['assigned_users_json','[]'],['submitted_by_name',''],['submission_method','link'],['submission_notes','']]) {
    await app.database.prepare("ALTER TABLE agency_tasks ADD COLUMN " + name + " TEXT NOT NULL DEFAULT '" + value + "'").run();
  }
  const legacyTeam=JSON.stringify([{id:101,displayName:'Old Designer',roleLabel:'Designer'},{id:102,displayName:'Old Editor',roleLabel:'Editor'}]);
  await app.database.prepare("INSERT INTO agency_tasks (title,start_at,deadline_at,assigned_user_id,assigned_user_name,created_by_user_id,created_by_name,status,submitted_at,assigned_users_json,submitted_by_name,submission_method) VALUES ('Legacy shared','2026-09-13T09:00','2026-09-14T18:00',101,'Old Designer',101,'Manager','submitted','2026-09-14T17:00',?,'Old Designer','flash_drive')").bind(legacyTeam).run();
  const recovered=(await app.taskState(request({})).then(r=>r.json())).tasks.find(t=>t.title==='Legacy shared');
  assert.equal(recovered.status,'assigned');
  assert.equal(recovered.submissions.length,1);
  assert.equal(recovered.submissions[0].userId,101);
  assert.equal(recovered.submissions[0].submittedAt,'2026-09-14T17:00');
  await call(app.tasks,{action:'delete',id:recovered.id});
  // Shared task visibility, optional grids and delivery authorization use isolated storage.
  globalThis.documentTestSession={...globalThis.documentTestSession,userId:101,displayName:'Task Creator'};
  const taskResult=await call(app.tasks,{action:'create',data:{title:'Shared grid',notes:'First line\nSecond line',details:'Create three posts',assignedUserId:101,additionalUserIds:[102,102],gridCells:['design','carousel','video'],gridPostNotes:['Design note\nسطر ثاني','','Video note'],startAt:'2026-09-13T09:00',deadlineAt:'2026-09-14T18:00'}});
  const shared=taskResult.tasks[0];
  assert.equal(shared.notes,'First line\nSecond line');
  assert.equal(shared.assignedUsers.length,2);
  assert.deepEqual(shared.gridCells,['design','carousel','video']);
  assert.deepEqual(shared.gridPostNotes,['Design note\nسطر ثاني','','Video note']);
  globalThis.documentTestSession={...globalThis.documentTestSession,userId:103,isAdmin:false,roleLabel:'Designer'};
  assert.equal((await app.taskState(request({})).then(r=>r.json())).tasks.length,0);
  assert.equal((await app.tasks(request({action:'submit',id:shared.id,submissionMethod:'flash_drive'}))).status,403);
  globalThis.documentTestSession={...globalThis.documentTestSession,userId:102,displayName:'Second Employee'};
  assert.equal((await app.taskState(request({})).then(r=>r.json())).tasks.length,1);
  const submitted=await call(app.tasks,{action:'submit',id:shared.id,submissionMethod:'flash_drive',submissionUrl:'unfinished link',submissionNotes:'USB handed to manager'});
  assert.equal(submitted.tasks[0].submissions[0].method,'flash_drive');
  assert.equal(submitted.tasks[0].submissions[0].userName,'Second Employee');
  assert.equal(submitted.tasks[0].status,'assigned');
  assert.equal(submitted.tasks[0].submissions.length,1);
  assert.equal((await app.tasks(request({action:'submit',id:shared.id,submissionMethod:'flash_drive'}))).status,409);
  globalThis.documentTestSession={...globalThis.documentTestSession,userId:101,isAdmin:true,roleLabel:'Administrator'};
  const finished=await call(app.tasks,{action:'submit',id:shared.id,submissionMethod:'link',submissionUrl:'https://example.com/video',submissionPart:'Video'});
  assert.equal(finished.tasks[0].status,'submitted');
  assert.equal(finished.tasks[0].submissions.length,2);
  assert.equal(finished.tasks[0].submissions.find(s=>s.userId===102).notes,'USB handed to manager');
  assert.ok(finished.tasks[0].submissions.every(s=>s.submittedAt && s.lateMinutes>0));
  const noGrid=await call(app.tasks,{action:'create',data:{title:'No grid',details:'Ordinary work',assignedUserId:101,startAt:'2026-09-13T09:00',deadlineAt:'2026-09-14T18:00'}});
  assert.deepEqual(noGrid.tasks.find(t=>t.title==='No grid').gridCells,[]);
  const deleteId=noGrid.tasks.find(t=>t.title==='No grid').id;
  const offline=await call(app.tasks,{action:'submit',id:deleteId,submissionMethod:'other',submissionUrl:'not a url',submissionNotes:'Handed over in person'});
  assert.equal(offline.tasks.find(t=>t.id===deleteId).submissionUrl,'');
  assert.equal(offline.tasks.find(t=>t.id===deleteId).submissionMethod,'other');
  for (const roleLabel of ['Account Manager','Operation Manager','Administrator']) {
    globalThis.documentTestSession={...globalThis.documentTestSession,isAdmin:false,roleLabel};
    assert.equal((await app.tasks(request({action:'delete',id:deleteId}))).status,403);
  }
  assert.ok(await app.database.prepare('SELECT id FROM agency_tasks WHERE id=?').bind(deleteId).first());
  globalThis.documentTestSession={...globalThis.documentTestSession,isAdmin:true};
  const afterDelete=await call(app.tasks,{action:'delete',id:deleteId});
  assert.ok(!afterDelete.tasks.some(t=>t.id===deleteId));
  assert.ok(afterDelete.tasks.some(t=>t.id===shared.id));
  assert.equal((await app.tasks(request({action:'delete',id:deleteId}))).status,404);
  // Missing PDFs render from saved data without requiring a save or changing status.
  globalThis.documentTestSession={...globalThis.documentTestSession,isAdmin:true,clientId:null};
  for (const docId of [linked.id,manual.id]) {
    const response=await app.pdf(request({}),{params:Promise.resolve({id:String(docId)})});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'application/pdf');
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
    assert.ok(bytes.length>10000);
  }
  globalThis.documentTestSession={...globalThis.documentTestSession,isAdmin:false,clientId:999999};
  assert.equal((await app.pdf(request({}),{params:Promise.resolve({id:String(linked.id)})})).status,403);
  globalThis.documentTestSession={...globalThis.documentTestSession,isAdmin:true,clientId:null};
  const beforeCounter=(await app.database.prepare('SELECT counter FROM categories WHERE id=?').bind(category.id).first()).counter;
  const deletedState=await call(app.save,{action:'deleteDocument',id:manual.id});
  assert.ok(!deletedState.documents.some(d=>d.id===manual.id));
  assert.equal(deletedState.deletedDocuments.find(d=>d.id===manual.id).generatedCode,manual.generatedCode);
  assert.equal(deletedState.deletedDocuments.find(d=>d.id===manual.id).status,'Deleted');
  assert.equal((await app.database.prepare('SELECT counter FROM categories WHERE id=?').bind(category.id).first()).counter,beforeCounter);
  const reusedState=await call(app.save,{action:'saveDocument',data:{...data,type:'invoice'}});
  const reusedDoc=reusedState.documents.find(d=>d.generatedCode===manual.generatedCode);
  assert.ok(reusedDoc && reusedDoc.id!==manual.id);
  assert.notEqual(reusedDoc.pdfKey,manual.pdfKey, "Reused serials must not overwrite a recoverable PDF");
  await call(app.save,{action:'deleteDocument',id:reusedDoc.id});
  globalThis.documentTestSession=null;
  assert.equal((await app.pdf(request({}),{params:Promise.resolve({id:String(linked.id)})})).status,401);
  const reserved=await Promise.all(Array.from({length:6},()=>app.reserveWorkOrderNumber()));
  assert.equal(new Set(reserved).size,6);
  assert.ok(reserved.includes(Number(manual.generatedCode.match(/(\d+)$/)[1])));
  assert.ok(reserved.every(n=>n>order.id));
  globalThis.documentTestSession=adminSession;
  await call(app.save,{action:'deleteDocument',id:linked.id});
  assert.equal(await app.database.prepare('SELECT serial FROM reusable_document_serials WHERE category_id=? AND serial=?').bind(category.id,order.id).first(),null);
  await call(app.production,{action:'delete',id:order.id});
  assert.equal(await app.reserveWorkOrderNumber(),order.id);
  globalThis.documentTestSession=adminSession;
  const paymentState=await call(app.save,{action:'saveDocument',data:{...data,type:'invoice',items:[{id:'payment',description:'Payment fixture',qty:1,unitPrice:1000}]}});
  const invoice=paymentState.documents.find(d=>d.total===1000);
  const partial={action:'setDocumentStatus',id:invoice.id,status:'Partially paid',paidAmount:300};
  for(let i=0;i<2;i++) {const s=await call(app.save,partial);const d=s.documents.find(d=>d.id===invoice.id);assert.equal(d.paid,300);assert.equal(d.remaining,700);}
  assert.equal((await app.database.prepare('SELECT count(*) AS n FROM client_financial_transactions WHERE document_id=?').bind(invoice.id).first()).n,1);
  for(const paidAmount of [0,-1,1000,1200]) assert.equal((await app.save(request({...partial,paidAmount}))).status,400);
  await app.database.prepare("INSERT INTO client_financial_transactions(client_id,document_id,type,amount,currency,transaction_date) VALUES(?,?,'payment',100,'EGP','2026-10-01')").bind(client.id,invoice.id).run();
  assert.equal((await app.save(request({...partial,paidAmount:50}))).status,400);
  let paid=await call(app.save,{...partial,paidAmount:500});assert.equal(paid.documents.find(d=>d.id===invoice.id).remaining,500);
  paid=await call(app.save,{action:'setDocumentStatus',id:invoice.id,status:'Paid'});assert.equal(paid.documents.find(d=>d.id===invoice.id).paid,1000);assert.equal(paid.documents.find(d=>d.id===invoice.id).remaining,0);
  assert.equal((await app.database.prepare("SELECT SUM(amount) AS n FROM client_financial_transactions WHERE document_id=? AND type='payment'").bind(invoice.id).first()).n,1000);
  globalThis.documentTestSession={...adminSession,isAdmin:false,permissions:['tasks']};assert.equal((await app.save(request(partial))).status,403);
  globalThis.documentTestSession=null;
  assert.equal((await app.save(request(partial))).status,401);
  assert.equal((await app.save(request({action:'saveDocument',data}))).status,401);
});
