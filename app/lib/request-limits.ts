import {database} from './database';
import type {EmployeeRequestType,RequestLimitRule} from '../types';

// Count employee submissions only, in the month of their requested start date.
const employeeOrigin = `(manual_data='' OR json_extract(manual_data,'$.origin')='employee')`;
export async function ensureRequestLimits(){
 await database.prepare(`CREATE TABLE IF NOT EXISTS employee_request_limits(employee_id INTEGER NOT NULL, request_type TEXT NOT NULL, max_requests INTEGER NOT NULL CHECK(max_requests>=0), overflow_mode TEXT NOT NULL CHECK(overflow_mode IN ('block','warn')), updated_by INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(employee_id,request_type))`).run();
 await database.prepare('CREATE TABLE IF NOT EXISTS request_limit_guard(ok INTEGER CHECK(ok=1))').run();
 const cols=await database.prepare('PRAGMA table_info(employee_requests)').all<{name:string}>();
 for(const [name,definition] of [['limit_exceeded','INTEGER NOT NULL DEFAULT 0'],['limit_value','INTEGER']]){
  if(cols.results.some(c=>c.name===name))continue;
  try{await database.prepare(`ALTER TABLE employee_requests ADD COLUMN ${name} ${definition}`).run();}catch(error){if(!/duplicate column name/i.test(String(error)))throw error;}
 }
}
export async function requestLimitRules(employeeId?:number){
 const sql='SELECT employee_id AS employeeId,request_type AS type,max_requests AS maxRequests,overflow_mode AS overflowMode FROM employee_request_limits';
 return (await (employeeId===undefined?database.prepare(sql):database.prepare(sql+' WHERE employee_id=?').bind(employeeId)).all<RequestLimitRule>()).results;
}
export async function requestLimitUsage(employeeId:number,type:EmployeeRequestType,date:string){
 const rule=await database.prepare('SELECT max_requests AS maxRequests,overflow_mode AS overflowMode FROM employee_request_limits WHERE employee_id=? AND request_type=?').bind(employeeId,type).first<{maxRequests:number;overflowMode:'block'|'warn'}>();
 if(!rule)return null;
 const used=await database.prepare(`SELECT COUNT(*) AS n FROM employee_requests WHERE employee_id=? AND type=? AND substr(date_from,1,7)=? AND status IN ('pending','approved') AND ${employeeOrigin}`).bind(employeeId,type,date.slice(0,7)).first<{n:number}>();
 return {...rule,used:Number(used?.n || 0)};
}
// Runs in the same write transaction as INSERT, preventing parallel submissions
// or the combined Early + Extra action from bypassing a limit.
export function requestLimitGuard(employeeId:number,type:EmployeeRequestType,date:string){
 return database.prepare(`INSERT INTO request_limit_guard SELECT CASE WHEN EXISTS (
 SELECT 1 FROM employee_request_limits l WHERE l.employee_id=? AND l.request_type=? AND l.overflow_mode='block'
 AND (SELECT COUNT(*) FROM employee_requests WHERE employee_id=l.employee_id AND type=l.request_type AND substr(date_from,1,7)=? AND status IN ('pending','approved') AND ${employeeOrigin})>=l.max_requests
 ) THEN 0 ELSE 1 END`).bind(employeeId,type,date.slice(0,7));
}
export function requestLimitSnapshot(employeeId:number,type:EmployeeRequestType,date:string){
 // This statement immediately follows the request INSERT in the transaction.
 return database.prepare(`UPDATE employee_requests SET limit_value=(SELECT max_requests FROM employee_request_limits WHERE employee_id=? AND request_type=?),limit_exceeded=CASE WHEN EXISTS(
 SELECT 1 FROM employee_request_limits l WHERE l.employee_id=? AND l.request_type=? AND
 (SELECT COUNT(*) FROM employee_requests WHERE employee_id=l.employee_id AND type=l.request_type AND substr(date_from,1,7)=? AND status IN ('pending','approved') AND ${employeeOrigin})>l.max_requests
 ) THEN 1 ELSE 0 END WHERE id=last_insert_rowid()`).bind(employeeId,type,employeeId,type,date.slice(0,7));
}
