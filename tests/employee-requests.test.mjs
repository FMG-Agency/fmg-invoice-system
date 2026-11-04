import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import ExcelJS from 'exceljs';

test('Employee request reviews and Friday exchanges reach payroll safely',async t=>{
  process.env.TURSO_DATABASE_URL='file::memory:';delete process.env.TURSO_AUTH_TOKEN;
  const admin={userId:1,isAdmin:true,permissions:['requests','attendance'],employeeId:null,displayName:'Admin',username:'admin'};
  const employee={userId:2,isAdmin:false,permissions:['requests'],employeeId:1,displayName:'Employee',username:'employee'};
  globalThis.requestSession=admin;
  await mkdir('work',{recursive:true});const bundle=new URL('../work/employee-requests-test.mjs',import.meta.url);
  await build({stdin:{contents:`export * from './app/lib/hr';export * from './app/lib/hr-export';export {database} from './app/lib/database';export {POST} from './app/api/requests/route';export {POST as MANUAL} from './app/api/hr/manual-requests/route';`,resolveDir:process.cwd()},outfile:fileURLToPath(bundle),bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixtures',setup(b){
    b.onResolve({filter:/auth-server$/},()=>({path:'auth',namespace:'fixture'}));
    b.onResolve({filter:/\/notifications$/},()=>({path:'notifications',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='auth'?`export async function getSession(){return globalThis.requestSession} export async function ensureAuthDatabase(){} export function getDatabase(){return globalThis.requestDb} export async function requirePermission(r,p){return !globalThis.requestSession?Response.json({}, {status:401}):!globalThis.requestSession.isAdmin&&!globalThis.requestSession.permissions.includes(p)?Response.json({}, {status:403}):null}`:`export async function administratorUserIds(){return [1]} export async function notifyUsers(){}`}));
  }}]});
  const app=await import(bundle.href),db=app.database;globalThis.requestDb=db;
  await db.prepare(`CREATE TABLE auth_users(id INTEGER PRIMARY KEY,display_name TEXT,role_label TEXT,permissions_json TEXT,active INTEGER,is_admin INTEGER)`).run();
  await db.prepare(`INSERT INTO auth_users VALUES(1,'Admin','Admin','[]',1,1),(2,'Employee','Designer','["requests"]',1,0),(3,'Reviewer','Reviewer','["requests"]',1,0)`).run();
  await app.ensureHrDatabase();await db.prepare("INSERT INTO employees(id,name,base_salary) VALUES(1,'Employee',14400)").run();
  const call=async(body,session=admin)=>{globalThis.requestSession=session;const r=await app.POST(new Request('http://fixture/api/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));const json=await r.json();return {status:r.status,...json};};
  const draft=(patch={})=>({type:'leave',leaveKind:'normal_leave',dateFrom:'2027-01-04',dateTo:'2027-01-04',startTime:'',endTime:'',details:'Fixture request reason',...patch});
  const create=async patch=>{const r=await call({action:'create',data:draft(patch)},employee);assert.equal(r.status,200,JSON.stringify(r));return r.requests[0];};
  const decide=async(id,decision='approved',leavePaid=true)=>{const r=await call({action:'decide',id,decision,leavePaid});assert.equal(r.status,200,JSON.stringify(r));return r.requests.find(r=>r.id===id);};
  await t.test('Only admin can decide or edit, pending and rejected never affect attendance',async()=>{
    const r=await create();await call({action:'assign',id:r.id,reviewerId:3});
    assert.equal((await call({action:'decide',id:r.id,decision:'approved'},{...employee,userId:3,employeeId:null})).status,403);
    assert.equal((await call({action:'edit',id:r.id,version:r.updatedAt,data:draft(),leavePaid:true},employee)).status,403);
    assert.equal((await app.getHrState('2027-01')).attendance.length,0);
    await decide(r.id,'rejected');assert.equal((await app.getHrState('2027-01')).attendance.length,0);
  });
  await t.test('Paid/unpaid decision, edit, repeat apply, reimport and delete recalculate without duplicate pay',async()=>{
    const r=await create({dateFrom:'2027-01-05',dateTo:'2027-01-05'});let saved=await decide(r.id,'approved',false);
    let state=await app.getHrState('2027-01');assert.equal(state.attendance[0].leaveDeduction,480);
    const edited=await call({action:'edit',id:r.id,version:saved.updatedAt,data:draft({dateFrom:'2027-01-05',dateTo:'2027-01-05'}),leavePaid:true});assert.equal(edited.status,200,JSON.stringify(edited));
    assert.equal((await app.getHrState('2027-01')).attendance[0].leaveDeduction,0);
    for(let i=0;i<2;i++)assert.equal((await call({action:'apply',month:'2027-01'})).status,200);
    assert.equal((await app.getHrState('2027-01')).attendance.length,1);
    await db.prepare("UPDATE attendance_records SET first_in='12:00',last_out='17:00',manual_seed=0,status='present' WHERE work_date='2027-01-05'").run();
    assert.equal((await app.getHrState('2027-01')).attendance[0].lateDeduction,0);
    assert.equal((await call({action:'delete',id:r.id})).status,200);
    state=await app.getHrState('2027-01');assert.equal(state.attendance[0].firstIn,'12:00');assert.ok(state.attendance[0].lateDeduction>0);
  });
  await t.test('Friday exchange supports cross-month replacement, normal Friday pay, rest day and conflict checks',async()=>{
    const r=await create({type:'friday_exchange',dateFrom:'2027-01-29',dateTo:'2027-02-01'});await decide(r.id);
    await db.prepare("UPDATE attendance_records SET first_in='11:00',last_out='19:00',status='present',manual_seed=0 WHERE work_date='2027-01-29'").run();
    let jan=await app.getHrState('2027-01'),feb=await app.getHrState('2027-02');
    const friday=jan.attendance.find(r=>r.workDate==='2027-01-29');assert.equal(friday.isRestDay,false);assert.equal(friday.fridayPay,0);assert.equal(friday.leaveDeduction,0);
    assert.equal(feb.attendance.length,1);assert.equal(feb.attendance[0].isRestDay,true);assert.equal(feb.attendance[0].leaveDeduction,0);
    assert.equal(app.monthDayBreakdown('2027-02',feb.attendance).fridayRest,5);
    const duplicate=await call({action:'create',data:draft({type:'friday_exchange',dateFrom:'2027-01-29',dateTo:'2027-02-02'})},employee);assert.equal(duplicate.status,400);
    const book=new ExcelJS.Workbook();await book.xlsx.load(await app.employeePayrollWorkbookBuffer(feb,1));assert.ok(book.worksheets[0]);
    await call({action:'delete',id:r.id});jan=await app.getHrState('2027-01');feb=await app.getHrState('2027-02');assert.equal(jan.attendance.find(r=>r.workDate==='2027-01-29').fridayPay,960);assert.equal(feb.attendance.length,0);
  });
  await t.test('Manual Friday exchange allows earlier replacement and does not seed intervening days',async()=>{
    globalThis.requestSession=admin;
    const body={batchId:crypto.randomUUID(),employeeId:1,requests:[{type:'friday_exchange',dateFrom:'2027-03-05',dateTo:'2027-03-02',details:'Exchange fixture'}]};
    const r=await app.MANUAL(new Request('http://fixture/api/hr/manual-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));assert.equal(r.status,200,await r.text());
    const state=await app.getHrState('2027-03');assert.equal(state.attendance.length,2);assert.equal(state.attendance.find(r=>r.workDate==='2027-03-02').isRestDay,true);
  });
  await t.test('Approved late permission excuses only lateness, overtime after midnight survives reimport',async()=>{
    await db.prepare("INSERT INTO attendance_records(employee_id,work_date,first_in,last_out,status) VALUES(1,'2027-04-05','12:00','17:00','present'),(1,'2027-04-06','11:00','02:00','present')").run();
    await db.prepare("UPDATE attendance_records SET last_out_next_day=1 WHERE work_date='2027-04-06'").run();
    const late=await create({type:'late_arrival',dateFrom:'2027-04-05',dateTo:'2027-04-05',startTime:'12:00'});await decide(late.id);
    const extra=await create({type:'overtime',dateFrom:'2027-04-06',dateTo:'2027-04-06',startTime:'22:00',endTime:'02:00'});await decide(extra.id);
    const state=await app.getHrState('2027-04');const l=state.attendance.find(r=>r.workDate==='2027-04-05'),o=state.attendance.find(r=>r.workDate==='2027-04-06');assert.equal(l.lateDeduction,0);assert.equal(l.earlyLeaveDeduction,240);assert.equal(o.normalOvertimeMinutes,405);assert.equal(o.overtimePay,810);
  });
  await t.test('Legacy approval reapply is idempotent, edit reverses it, and manual entries stay in their own editor',async()=>{
    await db.prepare("INSERT INTO employee_requests(employee_id,requester_user_id,type,date_from,date_to,start_time,details,status,leave_paid) VALUES(1,2,'early_leave','2027-05-03','2027-05-03','17:00','Legacy fixture','approved',1)").run();
    const row=await db.prepare("SELECT * FROM employee_requests WHERE details='Legacy fixture'").first();
    await db.prepare("INSERT INTO attendance_records(employee_id,work_date,first_in,last_out,status,early_leave_excused,notes) VALUES(1,'2027-05-03','11:00','17:00','present',1,?)").bind('Approved early leave request #'+row.id+': Legacy fixture').run();
    for(let i=0;i<2;i++)assert.equal((await call({action:'apply',month:'2027-05'})).status,200);
    let state=await app.getHrState('2027-05');assert.equal(state.attendance[0].earlyLeaveDeduction,0);assert.equal(state.attendance[0].lastOut,'17:00');
    const requests=await call({action:'apply',month:'2027-05'});const r=requests.requests.find(r=>r.id===row.id);
    const result=await call({action:'edit',id:r.id,version:r.updatedAt,data:draft({type:'early_leave',dateFrom:'2027-05-03',dateTo:'2027-05-03',startTime:'17:00'}),leavePaid:false});assert.equal(result.status,200,JSON.stringify(result));
    state=await app.getHrState('2027-05');assert.equal(state.attendance[0].earlyLeaveDeduction,240);
    const oldVersion=await call({action:'edit',id:r.id,version:r.updatedAt,data:draft(),leavePaid:true});assert.equal(oldVersion.status,409);
    assert.ok(!result.requests.some(r=>r.dateFrom==='2027-03-05'));
  });

});
