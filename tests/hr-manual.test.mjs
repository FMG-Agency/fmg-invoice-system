import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import ExcelJS from 'exceljs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

test('Attendance boundaries and manual batches use isolated payroll data',async t=>{
  process.env.TURSO_DATABASE_URL='file::memory:';delete process.env.TURSO_AUTH_TOKEN;
  globalThis.hrSession={userId:1,permissions:['attendance'],isAdmin:true};
  await mkdir(new URL('../work/',import.meta.url),{recursive:true});
  const bundle=new URL('../work/hr-manual-test.mjs',import.meta.url);
  await build({stdin:{contents:"export * from './app/lib/hr'; export * from './app/lib/hr-export'; export * from './app/lib/manual-attendance'; export {database} from './app/lib/database'; export {POST} from './app/api/hr/manual-requests/route';",resolveDir:process.cwd()},outfile:fileURLToPath(bundle),bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'auth',setup(b){b.onResolve({filter:/auth-server$/},()=>({path:'auth',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export async function getSession(){return globalThis.hrSession} export async function requirePermission(request,permission){return !globalThis.hrSession ? Response.json({error:'Login'}, {status:401}): !globalThis.hrSession.permissions.includes(permission) ? Response.json({error:'Denied'},{status:403}):null}"}));}}]});
  const app=await import(bundle.href),db=app.database;
  await db.prepare('CREATE TABLE auth_users(id INTEGER PRIMARY KEY)').run();await db.prepare('INSERT INTO auth_users VALUES(1)').run();
  await app.ensureHrDatabase();
  await db.prepare("INSERT INTO employees(id,name,base_salary) VALUES(1,'Fixture employee',14400)").run();
  const state=await app.getHrState('2026-10'),policy=state.policy,employee=state.employees[0];
  const source={id:1,employeeId:1,employeeName:'Fixture',biometricCode:'',importId:null,workDate:'2026-10-01',firstIn:'11:30',lastOut:'23:00',punches:[],status:'present',lateExcused:false,earlyLeaveExcused:false,leavePaid:true,overtimeApproved:false,earlyOvertimeApproved:false,missionOvertimeMinutes:0,notes:'',createdAt:'',updatedAt:''};
  const entry=(patch={})=>app.manualRequestSchema.parse({type:'mission',dateFrom:'2026-10-01',dateTo:'2026-10-01',startTime:'11:00',endTime:'19:00',details:'Approved fixture assignment',...patch});
  const math=(r,requests)=>app.manualAttendance(r,requests,employee,policy,app.attendanceMath);
  await t.test('11:30 inclusive, 11:31 excluded, automatic overtime capped at 22:00 on every date',()=>{
    for(const workDate of ['2026-10-01','2026-10-17']){
      assert.equal(app.attendanceMath({...source,workDate},employee,policy).normalOvertimeMinutes,165);
      assert.equal(app.attendanceMath({...source,workDate,firstIn:'11:31'},employee,policy).normalOvertimeMinutes,0);
    }
    assert.equal(app.attendanceMath({...source,lastOut:'22:01'},employee,policy).overtimePay,330);
    assert.equal(app.attendanceMath({...source,lastOut:'22:00'},employee,policy).overtimePay,330);
    assert.equal(app.attendanceMath({...source,lastOut:'19:15'},employee,policy).overtimePay,0);
  });
  await t.test('Extra and early intervals are paid once at their respective rates',()=>{
    const extra=entry({type:'overtime',startTime:'22:00',endTime:'23:00'});
    assert.equal(math(source,[extra,extra]).overtimePay,450);
    const early=entry({type:'early_arrival',startTime:'09:00',endTime:'11:00'});
    assert.equal(math({...source,firstIn:'09:00',lastOut:'19:00'},[early]).overtimePay,300);
    assert.equal(math({...source,firstIn:'09:00',lastOut:'19:00'},[]).overtimePay,0);
    assert.equal(app.manualRequestSchema.safeParse({...extra,startTime:'21:00'}).success,false);
    assert.equal(app.manualRequestSchema.safeParse({...early,dateFrom:'2026-02-30'}).success,false);
  });
  await t.test('Missions count as present without duplicating salary; Friday and holiday time doubles',()=>{
    const blank={...source,firstIn:'',lastOut:'',status:'absent'};
    const normal=math(blank,[entry()]);assert.equal(normal.status,'present');assert.equal(normal.overtimePay,0);assert.equal(normal.lateDeduction,0);assert.equal(normal.earlyLeaveDeduction,0);
    assert.equal(math({...blank,workDate:'2026-10-02'},[entry()]).fridayPay,960);
    assert.equal(math(blank,[entry({dayType:'holiday'})]).fridayPay,960);
    assert.equal(math(blank,[entry({startTime:'19:00',endTime:'21:00'})]).overtimePay,120);
  });
  await t.test('Paid/unpaid absences and early departure permissions affect deductions',()=>{
    assert.equal(math(source,[entry({type:'leave',leavePaid:true})]).leaveDeduction,0);
    assert.equal(math(source,[entry({type:'leave',leavePaid:false,reason:'sick'})]).leaveDeduction,480);
    assert.equal(math({...source,lastOut:'17:00'},[entry({type:'early_leave',startTime:'17:00'})]).earlyLeaveDeduction,0);
  });
  const post=body=>app.POST(new Request('http://fixture/api/hr/manual-requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
  await t.test('Authorization, atomic add, replay, conflict checks and biometric reimport',async()=>{
    const admin=globalThis.hrSession;globalThis.hrSession=null;
    assert.equal((await post({})).status,401);globalThis.hrSession={...admin,permissions:[]};assert.equal((await post({})).status,403);globalThis.hrSession=admin;
    const body={batchId:crypto.randomUUID(),employeeId:1,requests:[entry(),entry({type:'leave',dateFrom:'2026-10-04',dateTo:'2026-10-05',leavePaid:false})]};
    assert.equal((await post(body)).status,200);assert.equal((await post(body)).status,200);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM employee_requests').first()).n,2);
    assert.equal((await post({...body,batchId:crypto.randomUUID()})).status,409);
    const before=await app.getHrState('2026-10');assert.equal(before.attendance.find(r=>r.workDate==='2026-10-01').status,'present');assert.equal(before.payroll[0].leaveDeduction,960);
    await db.prepare("UPDATE attendance_records SET first_in='',last_out='',status='absent'").run();
    const after=await app.getHrState('2026-10');assert.equal(after.attendance.find(r=>r.workDate==='2026-10-01').status,'present');assert.equal(after.payroll[0].leaveDeduction,960);
    const invalid={batchId:crypto.randomUUID(),employeeId:1,requests:[entry({dateFrom:'2026-10-06',dateTo:'2026-10-06'}),{...entry(),dateFrom:'2026-02-30'}]};
    assert.equal((await post(invalid)).status,400);assert.equal((await db.prepare('SELECT count(*) AS n FROM employee_requests').first()).n,2);
    globalThis.hrSession={...admin,userId:999};
    const rollback={batchId:crypto.randomUUID(),employeeId:1,requests:[entry({dateFrom:'2026-10-06',dateTo:'2026-10-06'})]};
    assert.equal((await post(rollback)).status,500);assert.equal(await db.prepare('SELECT id FROM hr_manual_batches WHERE id=?').bind(rollback.batchId).first(),null);globalThis.hrSession=admin;
  });
  await t.test('Penalty days recalculate with salary and employee report keeps private data separate',async()=>{
    const penalty=days=>entry({type:'penalty',days,dateFrom:'2026-10-10',dateTo:'2026-10-10'});
    assert.equal((await post({batchId:crypto.randomUUID(),employeeId:1,requests:[penalty(.25),penalty(.5),penalty(2)]})).status,200);
    let state=await app.getHrState('2026-10');assert.equal(state.payroll[0].manualDeductions,1320);
    assert.equal(app.manualRequestSchema.safeParse({...penalty(1),days:0}).success,false);
    await db.prepare('UPDATE employees SET base_salary=28800 WHERE id=1').run();
    await db.prepare("INSERT INTO employees(id,name,base_salary) VALUES(2,'Private other employee',50000)").run();
    await db.prepare("INSERT INTO attendance_records(employee_id,work_date,first_in,last_out,status) VALUES(1,'2026-10-11','11:30','22:00','present')").run();
    state=await app.getHrState('2026-10');assert.equal(state.payroll.find(p=>p.employeeId===1).manualDeductions,2640);
    const buffer=await app.employeePayrollWorkbookBuffer(state,1);
    const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);assert.equal(book.worksheets.length,1);
    const sheet=book.worksheets[0];assert.equal(sheet.getCell('B10').value,28800);assert.equal(sheet.getCell('E23').value,2.75);
    assert.ok([10,11,12].some(n=>sheet.getCell(`I${n}`).formula==='ROUND($B$10/$E$24*0.25,2)'));
    let impact=false,time=false;
    sheet.eachRow(row=>{if(row.getCell(1).value instanceof Date && row.getCell(1).value.toISOString().startsWith('2026-10-11')) {if(row.getCell(2).formula){impact=true;assert.match(row.getCell(5).formula,/ROUND\(\$B\$10\*/);}else{time=true;assert.equal(row.getCell(3).value,'11:30');}}});
    assert.ok(impact&&time);assert.ok(!JSON.stringify(sheet.model).includes('Private other employee'));
    await writeFile(new URL('../work/employee-report-fixture.xlsx',import.meta.url),buffer);
    await db.prepare('UPDATE employees SET base_salary=0 WHERE id=1').run();
    state=await app.getHrState('2026-10');const zero=state.attendance.find(r=>r.workDate==='2026-10-11');assert.equal(zero.overtimePay,0);assert.ok(zero.salaryFactors.overtimePay>0);
  });

});
