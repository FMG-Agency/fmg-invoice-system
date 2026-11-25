import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import ExcelJS from 'exceljs';

test('Monthly per-employee request limits enforce blocking, warnings and atomic submissions',async t=>{
  process.env.TURSO_DATABASE_URL='file::memory:';delete process.env.TURSO_AUTH_TOKEN;
  const admin={userId:1,isAdmin:true,permissions:['requests','attendance'],employeeId:null,displayName:'Admin',username:'admin'};
  const employee={userId:2,isAdmin:false,permissions:['requests'],employeeId:1,displayName:'Employee',username:'employee'};
  globalThis.requestSession=admin;
  globalThis.requestNotices=[];
  await mkdir('work',{recursive:true});const bundle=new URL('../work/request-limits-test.mjs',import.meta.url);
  await build({stdin:{contents:`export * from './app/lib/hr';export * from './app/lib/hr-export';export {database} from './app/lib/database';export {POST,GET} from './app/api/requests/route';export {requestLimitGuard,requestLimitSnapshot} from './app/lib/request-limits';export {POST as MANUAL} from './app/api/hr/manual-requests/route';`,resolveDir:process.cwd()},outfile:fileURLToPath(bundle),bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixtures',setup(b){
    b.onResolve({filter:/auth-server$/},()=>({path:'auth',namespace:'fixture'}));
    b.onResolve({filter:/\/notifications$/},()=>({path:'notifications',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='auth'?`export async function getSession(){return globalThis.requestSession} export async function ensureAuthDatabase(){} export function getDatabase(){return globalThis.requestDb} export async function requirePermission(r,p){return !globalThis.requestSession?Response.json({}, {status:401}):!globalThis.requestSession.isAdmin&&!globalThis.requestSession.permissions.includes(p)?Response.json({}, {status:403}):null}`:`export async function administratorUserIds(){return [1]} export async function notifyUsers(ids,input){globalThis.requestNotices.push({ids,input})}`}));
  }}]});
  const app=await import(bundle.href),db=app.database;globalThis.requestDb=db;
  await db.prepare(`CREATE TABLE auth_users(id INTEGER PRIMARY KEY,display_name TEXT,role_label TEXT,permissions_json TEXT,active INTEGER,is_admin INTEGER)`).run();
  await db.prepare(`INSERT INTO auth_users VALUES(1,'Admin','Admin','[]',1,1),(2,'Employee','Designer','["requests"]',1,0),(3,'Reviewer','Reviewer','["requests"]',1,0)`).run();
  await app.ensureHrDatabase();await db.prepare("INSERT INTO employees(id,name,base_salary) VALUES(1,'Employee',14400)").run();
  const call=async(body,session=admin)=>{globalThis.requestSession=session;const r=await app.POST(new Request('http://fixture/api/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));const json=await r.json();return {status:r.status,...json};};
  const draft=(patch={})=>({type:'leave',leaveKind:'normal_leave',dateFrom:'2027-01-04',dateTo:'2027-01-04',startTime:'',endTime:'',details:'Fixture request reason',...patch});
  const create=async patch=>{const r=await call({action:'create',data:draft(patch)},employee);assert.equal(r.status,200,JSON.stringify(r));return r.requests[0];};
  const decide=async(id,decision='approved',leavePaid=true)=>{const r=await call({action:'decide',id,decision,leavePaid});assert.equal(r.status,200,JSON.stringify(r));return r.requests.find(r=>r.id===id);};
  const types=['leave','early_leave','late_arrival','friday_exchange','friday_work','mission','overtime','early_arrival'];
  const rules=(patch={})=>types.map(type=>({type,maxRequests:null,overflowMode:'block',...patch[type]}));
  const limits=async(patch={},employeeId=1,session=admin)=>call({action:'saveLimits',employeeId,rules:rules(patch)},session);
  const reset=async()=>{await db.prepare('DELETE FROM employee_requests').run();await limits();};
  const get=async session=>{globalThis.requestSession=session;const r=await app.GET(new Request('http://fixture/api/requests'));return {status:r.status,...await r.json()};};
  await t.test('Admin-only settings and employee-scoped visibility; zero blocks all eight types',async()=>{
    assert.equal((await limits({},1,employee)).status,403);
    assert.equal((await limits({},999)).status,404);
    assert.equal((await call({action:'saveLimits',employeeId:1,rules:rules({leave:{maxRequests:-1}})})).status,400);
    assert.equal((await limits(Object.fromEntries(types.map(type=>[type,{maxRequests:0}])))).status,200);
    for(const type of types){const r=await call({action:'create',data:draft({type})},employee);assert.equal(r.status,409,JSON.stringify(r));assert.equal(r.code,'REQUEST_LIMIT_REACHED');}
    const state=await get(employee);assert.equal(state.requestLimits.length,8);assert.ok(state.requestLimits.every(r=>r.employeeId===1));assert.deepEqual(state.limitEmployees,[]);
    assert.equal((await get(null)).status,401);
  });
  await t.test('Warning submits pending, records the original allowance and alerts administrators',async()=>{
    await reset();await limits({leave:{maxRequests:1,overflowMode:'warn'}});
    const first=await create({dateFrom:'2027-01-04',dateTo:'2027-01-04'});assert.equal(first.limitExceeded,false);assert.equal(first.limitValue,1);
    const second=await create({dateFrom:'2027-01-05',dateTo:'2027-01-05'});assert.equal(second.limitExceeded,true);assert.equal(second.status,'pending');assert.equal(second.limitValue,1);
    assert.match(globalThis.requestNotices.at(-1).input.message,/Monthly limit exceeded/);
    await limits({leave:{maxRequests:0,overflowMode:'block'}});
    assert.equal((await get(employee)).requests.find(r=>r.id===first.id).limitExceeded,false);
    await decide(second.id);assert.equal((await get(employee)).requests.find(r=>r.id===second.id).status,'approved');
  });
  await t.test('Monthly accounting uses start month, includes pending and approved, excludes manual/rejected/cancelled',async()=>{
    await reset();await limits({leave:{maxRequests:1,overflowMode:'block'}});
    const jan=await create({dateFrom:'2027-01-30',dateTo:'2027-02-01'});
    assert.equal((await call({action:'create',data:draft({dateFrom:'2027-01-20',dateTo:'2027-01-20'})},employee)).status,409);
    await create({dateFrom:'2027-02-03',dateTo:'2027-02-03'});
    await decide(jan.id,'rejected');const replacement=await create({dateFrom:'2027-01-10',dateTo:'2027-01-10'});
    assert.equal((await call({action:'cancel',id:replacement.id},employee)).status,200);
    await db.prepare("INSERT INTO employee_requests(employee_id,requester_user_id,type,leave_kind,date_from,date_to,details,status,manual_data) VALUES(1,1,'leave','normal_leave','2027-01-11','2027-01-11','Manual fixture','approved','{\"type\":\"leave\"}')").run();
    const next=await create({dateFrom:'2027-01-12',dateTo:'2027-01-12'});await decide(next.id);
    assert.equal((await call({action:'create',data:draft({dateFrom:'2027-01-13',dateTo:'2027-01-13'})},employee)).status,409);
    assert.equal((await call({action:'create',data:draft({type:'late_arrival',dateFrom:'2027-01-13',dateTo:'2027-01-13',startTime:'12:00'})},employee)).status,200);
    await limits();assert.equal((await call({action:'create',data:draft({dateFrom:'2027-01-14',dateTo:'2027-01-14'})},employee)).status,200);
  });
  await t.test('One employee cannot consume another allowance; settings do not leak',async()=>{
    await reset();await db.prepare("INSERT INTO employees(id,name,base_salary) VALUES(2,'Other employee',10000)").run();
    await limits({leave:{maxRequests:0}});await limits({leave:{maxRequests:2}},2);
    const other={...employee,userId:3,employeeId:2};
    assert.equal((await call({action:'create',data:draft()},other)).status,200);
    assert.ok((await get(employee)).requestLimits.every(r=>r.employeeId===1));
    assert.ok((await get(other)).requestLimits.every(r=>r.employeeId===2));
  });
  await t.test('Early + Extra are checked separately and cannot partially save',async()=>{
    await reset();await limits({overtime:{maxRequests:1},early_arrival:{maxRequests:0}});
    const both=draft({type:'overtime',dateFrom:'2027-03-01',dateTo:'2027-03-01',startTime:'22:00',endTime:'23:00',bothOvertime:true,earlyStartTime:'09:00',earlyEndTime:'11:00'});
    assert.equal((await call({action:'create',data:both},employee)).status,409);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM employee_requests').first()).n,0);
    await limits({overtime:{maxRequests:1},early_arrival:{maxRequests:0,overflowMode:'warn'}});
    const state=await call({action:'create',data:both},employee);assert.equal(state.status,200,JSON.stringify(state));assert.equal(state.requests.length,2);
    assert.equal(state.requests.find(r=>r.type==='early_arrival').limitExceeded,true);assert.equal(state.requests.find(r=>r.type==='overtime').limitExceeded,false);
    assert.match(globalThis.requestNotices.at(-1).input.message,/Monthly limit exceeded/);
  });
  await t.test('Concurrent API calls respect the cap and transactional guards roll back earlier inserts',async()=>{
    await reset();await limits({leave:{maxRequests:1}});
    globalThis.requestSession=employee;
    const responses=await Promise.all([4,5].map(day=>app.POST(new Request('http://fixture/api/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create',data:draft({dateFrom:'2027-04-0'+day,dateTo:'2027-04-0'+day})})}))));
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM employee_requests WHERE substr(date_from,1,7)='2027-04'").first()).n,1);
    await limits({early_arrival:{maxRequests:0}});
    const count=(await db.prepare('SELECT COUNT(*) AS n FROM employee_requests').first()).n;
    await assert.rejects(db.batch([db.prepare("INSERT INTO employee_requests(employee_id,requester_user_id,type,date_from,date_to,details) VALUES(1,2,'leave','2027-05-01','2027-05-01','Must roll back')"),app.requestLimitGuard(1,'early_arrival','2027-05-01')]));
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM employee_requests').first()).n,count);
  });
  await t.test('Shared team quotas warn across members without exposing request details',async()=>{
    await reset();
    await db.prepare("INSERT INTO employees(id,name) VALUES(4,'Rawan'),(5,'Sandy'),(6,'Sara'),(7,'Shady'),(8,'Sameh')").run();
    await db.prepare(`INSERT INTO auth_users VALUES(4,'Rawan','Designer','["requests"]',1,0),(5,'Sandy','Manager','["requests"]',1,0),(6,'Sara','Designer','["requests"]',1,0),(7,'Shady','Designer','["requests"]',1,0),(8,'Sameh','Employee','["requests"]',1,0)`).run();
    await db.prepare("INSERT INTO request_teams VALUES('hana','Hana + Marina + Rawan',1),('sandy','Sandy + Sara + Shady',5)").run();
    await db.prepare("INSERT INTO request_team_members VALUES(1,'hana'),(2,'hana'),(4,'hana'),(5,'sandy'),(6,'sandy'),(7,'sandy')").run();
    await limits(Object.fromEntries(types.map(type=>[type,{maxRequests:1,overflowMode:'warn'}])),1);
    await limits(Object.fromEntries(types.map(type=>[type,{maxRequests:1,overflowMode:'warn'}])),5);
    const hana=await create({type:'early_leave',startTime:'17:00'});
    const marina={...employee,employeeId:2,userId:3};
    let state=await get(marina);assert.equal(state.sharedUsage.find(r=>r.type==='early_leave').used,1);assert.equal(state.requests.length,0);assert.equal(state.requestLimits[0].teamName,'Hana + Marina + Rawan');
    const second=await call({action:'create',data:draft({type:'early_leave',startTime:'17:00'})},marina);assert.equal(second.status,200,JSON.stringify(second));assert.equal(second.requests[0].limitExceeded,true);
    const sandy={...employee,employeeId:5,userId:5};
    const other=await call({action:'create',data:draft({type:'early_leave',startTime:'17:00'})},sandy);assert.equal(other.requests[0].limitExceeded,false);
    const feb=await call({action:'create',data:draft({type:'early_leave',startTime:'17:00',dateFrom:'2027-02-03',dateTo:'2027-02-03'})},marina);assert.equal(feb.requests[0].limitExceeded,false);
    await decide(hana.id,'rejected');assert.equal((await get(marina)).sharedUsage.find(r=>r.type==='early_leave'&&r.month==='2027-01').used,1);
    await limits({early_leave:{maxRequests:2,overflowMode:'warn'}},2);assert.equal((await get(employee)).requestLimits.find(r=>r.type==='early_leave').maxRequests,2);
  });
  await t.test('Sameh requires administrator, Hana and Sandy; only final approval applies attendance',async()=>{
    await db.prepare('DELETE FROM employee_requests').run();
    await db.prepare('INSERT INTO request_review_policy VALUES(8,2),(8,5)').run();
    const sameh={...employee,employeeId:8,userId:8},sandy={...employee,employeeId:5,userId:5},outsider={...employee,employeeId:2,userId:3};
    const createSameh=async date=>{const state=await call({action:'create',data:draft({type:'early_leave',startTime:'17:00',dateFrom:date,dateTo:date})},sameh);assert.equal(state.status,200,JSON.stringify(state));return state.requests.find(r=>r.dateFrom===date);};
    const r=await createSameh('2027-06-03');
    assert.deepEqual(globalThis.requestNotices.at(-1).ids.sort(),[1,2,5]);
    assert.equal((await get(employee)).requests.find(v=>v.id===r.id).canReview,true);
    assert.equal((await get(outsider)).requests.some(v=>v.id===r.id),false);
    const approve=async(session,id=r.id,leavePaid=true)=>call({action:'decide',id,decision:'approved',leavePaid},session);
    assert.equal((await approve(outsider)).status,403);
    assert.equal((await approve(employee)).requests.find(v=>v.id===r.id).status,'pending');
    assert.equal((await approve(employee)).status,409);
    assert.equal((await approve(admin,r.id,false)).requests.find(v=>v.id===r.id).status,'pending');
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM attendance_records WHERE employee_id=8 AND work_date='2027-06-03'").first()).n,0);
    const final=await approve(sandy,r.id,true);assert.equal(final.status,200,JSON.stringify(final));const approved=final.requests.find(v=>v.id===r.id);assert.equal(approved.status,'approved');assert.equal(approved.leavePaid,false);assert.equal(approved.approvalSteps.filter(s=>s.approvedAt).length,3);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM attendance_records WHERE employee_id=8 AND work_date='2027-06-03'").first()).n,1);
    const edit=await call({action:'edit',id:r.id,version:approved.updatedAt,data:draft({type:'early_leave',startTime:'16:00',dateFrom:r.dateFrom,dateTo:r.dateTo}),leavePaid:true});assert.equal(edit.status,200,JSON.stringify(edit));assert.equal(edit.requests.find(v=>v.id===r.id).status,'pending');assert.ok(edit.requests.find(v=>v.id===r.id).approvalSteps.every(s=>!s.approvedAt));
    const rejected=await call({action:'decide',id:r.id,decision:'rejected',note:'Please change the timing'},sandy);assert.equal(rejected.status,200,JSON.stringify(rejected));assert.equal(rejected.requests.find(v=>v.id===r.id).status,'rejected');assert.equal((await approve(admin)).status,409);
    const concurrent=await createSameh('2027-06-04');globalThis.requestSession=admin;
    const results=await Promise.all([1,2].map(()=>app.POST(new Request('http://fixture/api/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'decide',id:concurrent.id,decision:'approved',leavePaid:true})}))));
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM request_review_votes WHERE request_id=?').bind(concurrent.id).first()).n,1);
  });

});
