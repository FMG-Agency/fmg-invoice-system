// One-time, explicitly requested FMG configuration. Dry-run by default.
// Run from the repository root with configured TURSO env; add --apply to save.
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
if(!process.env.TURSO_DATABASE_URL)Object.assign(process.env,parseEnv(await readFile('.env.local','utf8')));
await mkdir('work',{recursive:true});
await build({stdin:{contents:"export {database} from './app/lib/database';export {ensureRequestLimits} from './app/lib/request-limits';",resolveDir:process.cwd()},outfile:'work/configure-request-teams-bundle.mjs',bundle:true,platform:'node',format:'esm',packages:'external'});
const {database:db,ensureRequestLimits}=await import(pathToFileURL(resolve('work/configure-request-teams-bundle.mjs')).href);
const names=['hana','marina','rawan','sandy','sara','shady','sameh'];
const users=(await db.prepare(`SELECT id,username,employee_id,permissions_json FROM auth_users WHERE active=1 AND username IN (${names.map(()=>'?').join(',')})`).bind(...names).all()).results;
for(const name of names){const matches=users.filter(u=>u.username===name);if(matches.length!==1||!matches[0].employee_id)throw Error('Missing or ambiguous employee account: '+name);}
if(new Set(users.map(u=>u.employee_id)).size!==7)throw Error('Expected seven distinct employees.');
const user=name=>users.find(u=>u.username===name);
for(const name of ['hana','sandy'])if(!JSON.parse(user(name).permissions_json).includes('requests'))throw Error(name+' needs Employee Requests access.');
const teams=[{id:'hana-team',name:'Hana · Marina · Rawan',members:['hana','marina','rawan']},{id:'sandy-team',name:'Sandy · Sara · Shady',members:['sandy','sara','shady']}];
console.log(JSON.stringify({teams:teams.map(t=>({name:t.name,members:t.members,monthlyLimitPerType:1,limitedTypes:['leave','early_leave','late_arrival'],overflow:'warn'})),samehReviewers:['Administrator','hana','sandy'],apply:process.argv.includes('--apply')}));
if(process.argv.includes('--apply')){
 await ensureRequestLimits();
 const existing={};for(const table of ['employee_request_limits','request_teams','request_team_members','request_review_policy'])existing[table]=(await db.prepare('SELECT * FROM '+table).all()).results;
 await writeFile('work/request-teams-config-before-'+Date.now()+'.json',JSON.stringify(existing,null,2));
 const types=['leave','early_leave','late_arrival'];
 const admin=await db.prepare('SELECT id FROM auth_users WHERE active=1 AND is_admin=1 ORDER BY id LIMIT 1').first();if(!admin)throw Error('Existing administrator not found.');
 const statements=[];
 for(const team of teams){
  const owner=user(team.members[0]).employee_id;
  statements.push(db.prepare('INSERT INTO request_teams(id,name,owner_employee_id) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,owner_employee_id=excluded.owner_employee_id').bind(team.id,team.name,owner));
  for(const name of team.members)statements.push(db.prepare('INSERT INTO request_team_members(employee_id,team_id) VALUES(?,?) ON CONFLICT(employee_id) DO UPDATE SET team_id=excluded.team_id').bind(user(name).employee_id,team.id));
  for(const name of team.members)statements.push(db.prepare("DELETE FROM employee_request_limits WHERE employee_id=? AND request_type NOT IN ('leave','early_leave','late_arrival')").bind(user(name).employee_id));
  for(const type of types)statements.push(db.prepare("INSERT INTO employee_request_limits(employee_id,request_type,max_requests,overflow_mode,updated_by) VALUES(?,?,1,'warn',?) ON CONFLICT(employee_id,request_type) DO UPDATE SET max_requests=1,overflow_mode='warn',updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(owner,type,admin.id));
 }
 // Sameh remains independent; preserve any personal caps but use warning mode.
 statements.push(db.prepare('DELETE FROM request_team_members WHERE employee_id=?').bind(user('sameh').employee_id));
 statements.push(db.prepare("UPDATE employee_request_limits SET overflow_mode='warn',updated_by=? WHERE employee_id=?").bind(admin.id,user('sameh').employee_id));
 statements.push(db.prepare('DELETE FROM request_review_policy WHERE employee_id=?').bind(user('sameh').employee_id));
 for(const name of ['hana','sandy'])statements.push(db.prepare('INSERT INTO request_review_policy(employee_id,user_id) VALUES(?,?)').bind(user('sameh').employee_id,user(name).id));
 await db.batch(statements);
 const verified=(await db.prepare("SELECT team_name,COUNT(DISTINCT employee_id) AS members,COUNT(*) AS rules,MIN(max_requests) AS minLimit,MAX(max_requests) AS maxLimit,MIN(overflow_mode) AS mode FROM effective_request_limits WHERE team_name IS NOT NULL GROUP BY team_name").all()).results;
 if(verified.length!==2||verified.some(t=>t.members!==3||t.rules!==9||t.minLimit!==1||t.maxLimit!==1||t.mode!=='warn'))throw Error('Team configuration verification failed');
 console.log(JSON.stringify({verified,samehReviewers:(await db.prepare('SELECT COUNT(*) AS n FROM request_review_policy WHERE employee_id=?').bind(user('sameh').employee_id).first()).n}));
}
