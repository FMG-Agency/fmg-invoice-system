import {database} from './database';
import type {EmployeeRequestType,RequestLimitRule} from '../types';

// Count employee submissions only, in the month of their requested start date.
const employeeOrigin = `(manual_data='' OR json_extract(manual_data,'$.origin')='employee')`;
export async function ensureRequestLimits(){
 await database.prepare(`CREATE TABLE IF NOT EXISTS employee_request_limits(employee_id INTEGER NOT NULL, request_type TEXT NOT NULL, max_requests INTEGER NOT NULL CHECK(max_requests>=0), overflow_mode TEXT NOT NULL CHECK(overflow_mode IN ('block','warn')), updated_by INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(employee_id,request_type))`).run();
 await database.prepare('CREATE TABLE IF NOT EXISTS request_teams(id TEXT PRIMARY KEY,name TEXT NOT NULL,owner_employee_id INTEGER NOT NULL)').run();
 await database.prepare('CREATE TABLE IF NOT EXISTS request_team_members(employee_id INTEGER PRIMARY KEY,team_id TEXT NOT NULL REFERENCES request_teams(id))').run();
 await database.prepare(`CREATE VIEW IF NOT EXISTS request_limit_scopes AS SELECT e.id AS employee_id,COALESCE(t.owner_employee_id,e.id) AS rule_employee_id,CASE WHEN t.id IS NULL THEN 'employee:'||e.id ELSE 'team:'||t.id END AS scope_id,t.name AS team_name FROM employees e LEFT JOIN request_team_members m ON m.employee_id=e.id LEFT JOIN request_teams t ON t.id=m.team_id`).run();
 await database.prepare(`CREATE VIEW IF NOT EXISTS effective_request_limits AS SELECT s.*,l.request_type,l.max_requests,l.overflow_mode FROM request_limit_scopes s JOIN employee_request_limits l ON l.employee_id=s.rule_employee_id`).run();
 await database.prepare('CREATE TABLE IF NOT EXISTS request_review_policy(employee_id INTEGER NOT NULL,user_id INTEGER NOT NULL,PRIMARY KEY(employee_id,user_id))').run();
 await database.prepare('CREATE TABLE IF NOT EXISTS request_review_votes(request_id INTEGER NOT NULL,reviewer_key TEXT NOT NULL,user_id INTEGER NOT NULL,approved_at TEXT NOT NULL,note TEXT NOT NULL,paid INTEGER NOT NULL,PRIMARY KEY(request_id,reviewer_key))').run();
 await database.prepare('CREATE TABLE IF NOT EXISTS request_limit_guard(ok INTEGER CHECK(ok=1))').run();
 const cols=await database.prepare('PRAGMA table_info(employee_requests)').all<{name:string}>();
 for(const [name,definition] of [['limit_exceeded','INTEGER NOT NULL DEFAULT 0'],['limit_value','INTEGER']]){
  if(cols.results.some(c=>c.name===name))continue;
  try{await database.prepare(`ALTER TABLE employee_requests ADD COLUMN ${name} ${definition}`).run();}catch(error){if(!/duplicate column name/i.test(String(error)))throw error;}
 }
}
export async function requestLimitRules(employeeId?:number){
 const sql='SELECT employee_id AS employeeId,request_type AS type,max_requests AS maxRequests,overflow_mode AS overflowMode,team_name AS teamName,scope_id AS scopeId FROM effective_request_limits';
 const rules=(await (employeeId===undefined?database.prepare(sql):database.prepare(sql+' WHERE employee_id=?').bind(employeeId)).all<RequestLimitRule>()).results;
 const members=(await database.prepare('SELECT employee_id AS employeeId,scope_id AS scopeId FROM request_limit_scopes').all<{employeeId:number;scopeId:string}>()).results;
 return rules.map(rule=>({...rule,memberIds:members.filter(m=>m.scopeId===rule.scopeId).map(m=>m.employeeId)}));
}
export async function requestLimitUsage(employeeId:number,type:EmployeeRequestType,date:string){
 const rule=await database.prepare('SELECT scope_id AS scopeId,max_requests AS maxRequests,overflow_mode AS overflowMode FROM effective_request_limits WHERE employee_id=? AND request_type=?').bind(employeeId,type).first<{scopeId:string;maxRequests:number;overflowMode:'block'|'warn'}>();
 if(!rule)return null;
 const used=await database.prepare(`SELECT COUNT(*) AS n FROM employee_requests WHERE employee_id IN (SELECT employee_id FROM request_limit_scopes WHERE scope_id=?) AND type=? AND substr(date_from,1,7)=? AND status IN ('pending','approved') AND ${employeeOrigin}`).bind(rule.scopeId,type,date.slice(0,7)).first<{n:number}>();
 return {...rule,used:Number(used?.n || 0)};
}
// Runs in the same write transaction as INSERT, preventing parallel submissions
// or the combined Early + Extra action from bypassing a limit.
export function requestLimitGuard(employeeId:number,type:EmployeeRequestType,date:string){
 return database.prepare(`INSERT INTO request_limit_guard SELECT CASE WHEN EXISTS (
 SELECT 1 FROM effective_request_limits l WHERE l.employee_id=? AND l.request_type=? AND l.overflow_mode='block'
 AND (SELECT COUNT(*) FROM employee_requests WHERE employee_id IN (SELECT employee_id FROM request_limit_scopes WHERE scope_id=l.scope_id) AND type=l.request_type AND substr(date_from,1,7)=? AND status IN ('pending','approved') AND ${employeeOrigin})>=l.max_requests
 ) THEN 0 ELSE 1 END`).bind(employeeId,type,date.slice(0,7));
}
export function requestLimitSnapshot(employeeId:number,type:EmployeeRequestType,date:string){
 // This statement immediately follows the request INSERT in the transaction.
 return database.prepare(`UPDATE employee_requests SET limit_value=(SELECT max_requests FROM effective_request_limits WHERE employee_id=? AND request_type=?),limit_exceeded=CASE WHEN EXISTS(
 SELECT 1 FROM effective_request_limits l WHERE l.employee_id=? AND l.request_type=? AND
 (SELECT COUNT(*) FROM employee_requests WHERE employee_id IN (SELECT employee_id FROM request_limit_scopes WHERE scope_id=l.scope_id) AND type=l.request_type AND substr(date_from,1,7)=? AND status IN ('pending','approved') AND ${employeeOrigin})>l.max_requests
 ) THEN 1 ELSE 0 END WHERE id=last_insert_rowid()`).bind(employeeId,type,employeeId,type,date.slice(0,7));
}

// Only aggregate counts are exposed: team members never receive each other's request details.
export async function requestSharedUsage(employeeId:number){
 return (await database.prepare(`SELECT r.type,substr(r.date_from,1,7) AS month,COUNT(*) AS used FROM employee_requests r WHERE r.employee_id IN (SELECT employee_id FROM request_limit_scopes WHERE scope_id=(SELECT scope_id FROM request_limit_scopes WHERE employee_id=?)) AND r.status IN ('pending','approved') AND (r.manual_data='' OR json_extract(r.manual_data,'$.origin')='employee') GROUP BY r.type,substr(r.date_from,1,7)`).bind(employeeId).all<{type:EmployeeRequestType;month:string;used:number}>()).results;
}
