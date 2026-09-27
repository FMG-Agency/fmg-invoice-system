import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

test('Trash enforces admin access, atomically restores related rows, prevents collisions and expires after seven days',async()=>{
  process.env.TURSO_DATABASE_URL='file::memory:';delete process.env.TURSO_AUTH_TOKEN;
  globalThis.trashSession={userId:1,isAdmin:true,displayName:'Administrator',username:'admin'};
  globalThis.deletedBlobs=[];
  await mkdir(new URL('../work/',import.meta.url),{recursive:true});
  const bundle=new URL('../work/trash-test.mjs',import.meta.url);
  await build({stdin:{contents:`export * from './app/lib/trash'; export {database} from './app/lib/database'; export {GET,POST} from './app/api/trash/route'; export {GET as cron} from './app/api/cron/trash/route';`,resolveDir:process.cwd()},outfile:fileURLToPath(bundle),bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/auth-server$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/^@vercel\/blob$/},()=>({path:'blob',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='auth'?'export async function getSession(){return globalThis.trashSession;}':'export async function del(key){globalThis.deletedBlobs.push(key)}'}));}}]});
  const app=await import(bundle.href);const db=app.database;
  for(const sql of [
    'CREATE TABLE agency_tasks(id INTEGER PRIMARY KEY,title TEXT,notes TEXT)',
    'CREATE TABLE task_submissions(task_id INTEGER REFERENCES agency_tasks(id) ON DELETE CASCADE,user_id INTEGER,notes TEXT,PRIMARY KEY(task_id,user_id))',
    'CREATE TABLE documents(id INTEGER PRIMARY KEY,generated_code TEXT UNIQUE,type TEXT,category_id INTEGER REFERENCES categories(id),pdf_key TEXT)',
    'CREATE TABLE categories(id INTEGER PRIMARY KEY,name TEXT)',
    'CREATE TABLE production_work_orders(id INTEGER PRIMARY KEY,draft_invoice_id INTEGER)',
    'CREATE TABLE production_work_order_events(id INTEGER PRIMARY KEY,work_order_id INTEGER REFERENCES production_work_orders(id) ON DELETE CASCADE)',
    'CREATE TABLE production_crew_members(id INTEGER PRIMARY KEY,name TEXT,active INTEGER,deleted_at TEXT,updated_at TEXT,photo_key TEXT)',
    'CREATE TABLE production_crew_reviews(id INTEGER PRIMARY KEY,crew_id INTEGER REFERENCES production_crew_members(id),work_order_id INTEGER)',
    'CREATE TABLE employee_requests(id INTEGER PRIMARY KEY,title TEXT,attachment_key TEXT)',
    "INSERT INTO agency_tasks VALUES(1,'Shared design','Brief')",
    "INSERT INTO task_submissions VALUES(1,2,'Delivered design')",
    "INSERT INTO categories VALUES(1,'Media Guide')",
    "INSERT INTO documents VALUES(1,'Client-MG0001','invoice',1,'private/pdf1')",
    "INSERT INTO production_work_orders VALUES(1,1)"
  ])await db.prepare(sql).run();
  const request=body=>new Request('https://fixture/api/trash',{method:'POST',body:JSON.stringify(body)});
  await app.trashDelete('agency_tasks','id=?',[1],globalThis.trashSession);
  assert.equal(await db.prepare('SELECT * FROM agency_tasks').first(),null);
  const task=(await app.listTrash())[0];
  assert.equal(new Date(task.expiresAt+'Z')-new Date(task.deletedAt+'Z'),7*86400000);
  assert.equal((await app.GET(new Request('https://fixture/api/trash')).then(r=>r.json())).items[0].snapshot_json,undefined);
  const admin=globalThis.trashSession;globalThis.trashSession={...admin,isAdmin:false};
  assert.equal((await app.GET(new Request('https://fixture/api/trash'))).status,403);
  assert.equal((await app.POST(request({action:'restore',id:task.id}))).status,403);
  globalThis.trashSession=null;assert.equal((await app.GET(new Request('https://fixture/api/trash'))).status,401);globalThis.trashSession=admin;
  assert.equal((await app.POST(request({action:'restore',id:task.id}))).status,200);
  assert.equal((await db.prepare('SELECT * FROM task_submissions').first()).notes,'Delivered design');
  assert.equal((await app.listTrash()).length,0);
  // Delete + snapshot roll back together when a linked record blocks deletion.
  await assert.rejects(()=>app.trashDelete('categories','id=?',[1],admin),/FOREIGN KEY/i);
  assert.equal((await app.listTrash()).length,0);
  // Work-order references survive document restoration.
  await db.batch([await app.archiveStatement('documents','id=?',[1],admin),db.prepare('UPDATE production_work_orders SET draft_invoice_id=NULL WHERE id=1'),db.prepare('DELETE FROM documents WHERE id=1')]);
  const doc=(await app.listTrash()).find(i=>i.kind==='Invoices');
  await db.prepare("INSERT INTO documents VALUES(2,'Other-MG0001','invoice',1,'private/other')").run();
  await assert.rejects(()=>app.restoreTrash(doc.id),/Cannot restore/);
  assert.ok((await app.listTrash()).some(i=>i.id===doc.id));
  await db.prepare('DELETE FROM documents WHERE id=2').run();await app.restoreTrash(doc.id);
  assert.equal((await db.prepare('SELECT draft_invoice_id AS id FROM production_work_orders WHERE id=1').first()).id,1);
  // Reusing a released work-order ID can create separate Trash entries safely.
  await app.trashDelete('production_work_orders','id=?',[1],admin);
  await db.prepare('INSERT INTO production_work_orders VALUES(1,1)').run();
  await app.trashDelete('production_work_orders','id=?',[1],admin);
  const orders=(await app.listTrash()).filter(i=>i.kind==='Work Orders');
  assert.equal(orders.length,2);
  const competing=await Promise.allSettled(orders.map(i=>app.restoreTrash(i.id)));
  assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(competing.filter(r=>r.status==='rejected').length,1);
  // Removed photos can be restored without replacing newer images.
  await db.prepare("INSERT INTO production_crew_members VALUES(2,'Photo model',1,'','','private/photo')").run();
  await db.batch([await app.archivePhoto('production_crew_members',2,admin,'private/photo'),db.prepare("UPDATE production_crew_members SET photo_key='' WHERE id=2")]);
  const photo=(await app.listTrash()).find(i=>i.kind==='Photos');
  await db.prepare("UPDATE production_crew_members SET photo_key='private/new' WHERE id=2").run();
  await assert.rejects(()=>app.restoreTrash(photo.id),/Cannot restore/);
  assert.equal((await db.prepare('SELECT photo_key AS key FROM production_crew_members WHERE id=2').first()).key,'private/new');
  await db.prepare("UPDATE production_crew_members SET photo_key='' WHERE id=2").run();
  await app.restoreTrash(photo.id);
  assert.equal((await db.prepare('SELECT photo_key AS key FROM production_crew_members WHERE id=2').first()).key,'private/photo');
  // Crew stays hidden until restoration; expiry removes the crew, reviews and private image.
  await db.prepare("INSERT INTO production_crew_members VALUES(1,'Model',1,'','','private/model')").run();
  await db.prepare('INSERT INTO production_crew_reviews VALUES(1,1,1)').run();
  await db.batch([await app.archiveStatement('production_crew_members','id=?',[1],admin),db.prepare("UPDATE production_crew_members SET deleted_at=CURRENT_TIMESTAMP,active=0 WHERE id=1")]);
  const crew=(await app.listTrash()).find(i=>i.kind==='Talent & Crew');await app.restoreTrash(crew.id);
  assert.equal((await db.prepare('SELECT active FROM production_crew_members WHERE id=1').first()).active,1);
  await db.batch([await app.archiveStatement('production_crew_members','id=?',[1],admin),db.prepare("UPDATE production_crew_members SET deleted_at=CURRENT_TIMESTAMP,active=0 WHERE id=1")]);
  await db.prepare("UPDATE trash_items SET expires_at=datetime('now','-1 second') WHERE source_table='production_crew_members'").run();
  assert.equal((await app.listTrash()).some(i=>i.kind==='Talent & Crew'),false);
  await assert.rejects(async()=>app.restoreTrash((await db.prepare("SELECT id FROM trash_items WHERE source_table='production_crew_members'").first()).id),/expired/);
  delete process.env.CRON_SECRET;assert.equal((await app.cron(new Request('https://fixture/api/cron/trash'))).status,401);
  process.env.CRON_SECRET='isolated-test-secret';assert.equal((await app.cron(new Request('https://fixture/api/cron/trash',{headers:{authorization:'Bearer wrong'}}))).status,401);
  assert.equal((await app.cron(new Request('https://fixture/api/cron/trash',{headers:{authorization:'Bearer isolated-test-secret'}}))).status,200);
  assert.equal(await db.prepare('SELECT * FROM production_crew_members WHERE id=1').first(),null);
  assert.equal(await db.prepare('SELECT * FROM production_crew_reviews').first(),null);
  assert.ok(globalThis.deletedBlobs.includes('private/model'));assert.ok(!globalThis.deletedBlobs.includes('private/pdf1'));
  await app.purgeExpiredTrash(); // retry is safe
});
