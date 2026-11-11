import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

test("portal owners see assigned active clients and schedule one designer task per plan part", async () => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  delete process.env.TURSO_AUTH_TOKEN;
  const bundle = new URL("../work/portal-planning-test.mjs", import.meta.url);
  const mocks = {
    "auth-server": "export const getSession=()=>globalThis.viewer; export const requirePermission=()=>null;",
    "client-accounts": "export const ensureClientAccountsDatabase=()=>{}; export const getClientAccount=id=>({client:{id},invoices:[],summaries:[]});",
    "notifications": "export const notifyUsers=ids=>globalThis.recipient=ids;",
  };
  await build({ stdin:{contents:"export * from './app/api/client-portal/route';export {database} from './app/lib/database';export {getTasksState} from './app/lib/tasks';export {prepareStandardMonth} from './app/lib/standard-tasks';", resolveDir:process.cwd()}, outfile:fileURLToPath(bundle),bundle:true,platform:"node",format:"esm",packages:"external",
    plugins:[{name:"portal-fixture",setup(api){
      api.onResolve({filter:/\/(auth-server|client-accounts|notifications)$/},args=>({path:args.path.split("/").pop(),namespace:"mock"}));
      api.onLoad({filter:/.*/,namespace:"mock"},args=>({contents:mocks[args.path]}));
    }}]});
  const {database:db,POST,GET,getTasksState,prepareStandardMonth}=await import(bundle.href);
  const fields="name company_name owner_name phone email address notes agency_key lifecycle_status activity start_date payment_schedule monthly_fee contract_status relationship_stage created_at updated_at".split(" ");
  await db.prepare("CREATE TABLE clients(id INTEGER PRIMARY KEY,"+fields.map(f=>f+" TEXT").join(",")+")").run();
  await db.prepare("CREATE TABLE documents(client_id INTEGER,date TEXT,type TEXT)").run();
  await db.prepare("CREATE TABLE employees(id INTEGER PRIMARY KEY,title TEXT)").run();
  await db.prepare("CREATE TABLE auth_users(id INTEGER PRIMARY KEY,username TEXT,display_name TEXT,role_label TEXT,is_admin INTEGER,active INTEGER,employee_id INTEGER,client_id INTEGER)").run();
  await db.prepare("INSERT INTO clients(id,name,lifecycle_status) VALUES(1,'Zeta','active'),(2,'Alpha','active'),(3,'Hidden','inactive')").run();
  await db.prepare("INSERT INTO auth_users(id,username,display_name,role_label,is_admin,active) VALUES(1,'admin','Admin','Administrator',1,1),(2,'hana','Hana','Operation Manager',0,1),(3,'sandy','Sandy','Account Manager',0,1),(4,'designer','Designer','Graphic Designer',0,1)").run();
  const login=(userId,roleLabel)=>{globalThis.viewer={userId,roleLabel,isAdmin:userId===1,clientId:null,displayName:roleLabel};};
  const post=data=>POST(new Request("https://fixture/api/client-portal",{method:"POST",body:JSON.stringify({year:2026,clientId:1,...data})}));
  login(1,"Administrator");
  const res=await post({action:"manager",managerId:2});
  assert.equal(res.status,200);
  assert.deepEqual((await res.json()).clients.map(c=>c.id),[2,1]);
  login(3,"Account Manager");
  const schedule={action:"schedule",month:11,part:1,designerId:4,startAt:"2026-11-12T11:00",deadlineAt:"2026-11-13T19:00"};
  assert.equal((await post(schedule)).status,403);
  assert.equal((await (await GET(new Request("https://fixture/api/client-portal?clientId=1"))).json()).client,null);
  login(2,"Operation Manager");
  for (const deadlineAt of ["2026-11-13T19:00","2026-11-14T19:00"]) {
    const scheduled=await post({...schedule,deadlineAt});
    assert.equal(scheduled.status,200);
    const state=await scheduled.json();
    assert.deepEqual(state.clients.map(c=>c.id),[1]);
    assert.equal(state.planning.schedules.length,1);
    assert.equal(state.planning.schedules[0].deadlineAt,deadlineAt);
  }
  assert.deepEqual(globalThis.recipient,[4]);
  login(4,"Graphic Designer");
  const tasks=(await getTasksState(globalThis.viewer)).tasks;
  assert.equal(tasks.length,1);
  assert.equal(tasks[0].planTask,true);
  assert.equal(tasks[0].assignedUsers[0].id,4);
  assert.equal((await getTasksState(globalThis.viewer,"regular")).tasks.length,0);
  await db.prepare("UPDATE agency_tasks SET status='submitted' WHERE id=?").bind(tasks[0].id).run();
  await prepareStandardMonth("2026-12");
  await prepareStandardMonth("2026-12");
  const december=(await getTasksState(globalThis.viewer,"2026-12")).tasks;
  assert.equal(december.length,1);
  assert.equal(december[0].startAt,"2026-12-12T11:00");
  assert.equal(december[0].deadlineAt,"2026-12-14T19:00");
  assert.equal(december[0].status,"assigned");
  assert.equal((await getTasksState(globalThis.viewer,"2026-11")).tasks[0].status,"submitted");
  login(3,"Account Manager");
  assert.equal((await getTasksState(globalThis.viewer,"2026-12")).tasks.length,0);
  login(2,"Operation Manager");
  assert.equal((await getTasksState(globalThis.viewer,"2026-12")).tasks.length,1);
});
