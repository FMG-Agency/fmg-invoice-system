import { database } from "./database";

// Keep Cairo wall-clock time when moving a plan to a month of a different length.
function moveMonth(value: string, offset: number) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const last = new Date(Date.UTC(year, month + offset, 0));
  last.setUTCDate(Math.min(day, last.getUTCDate()));
  return last.toISOString().slice(0, 10) + value.slice(10);
}

export async function prepareStandardMonth(calendar: string) {
  const [year, month] = calendar.split("-").map(Number);
  const monthIndex = year * 12 + month;
  const rows = await database.prepare(`SELECT t.id,t.plan_slot,t.start_at,t.deadline_at,
      COALESCE(NULLIF(c.company_name,''),c.name) AS client
    FROM agency_tasks t JOIN clients c ON c.id=CAST(t.plan_slot AS INTEGER)
    JOIN auth_users u ON u.id=t.assigned_user_id
    WHERE t.plan_slot<>'' AND t.plan_generated='' AND c.lifecycle_status='active' AND u.active=1
      AND NOT EXISTS (SELECT 1 FROM agency_tasks instance WHERE instance.plan_slot=c.id||'/'||?||'/'||?||'/'||substr(t.plan_slot,-1))`)
    .bind(year,month).all<{id:number;plan_slot:string;start_at:string;deadline_at:string;client:string}>();
  const templates = new Map<string,{source:typeof rows.results[number];offset:number}>();
  for (const source of rows.results) {
    const [client, sourceYear, sourceMonth, part] = source.plan_slot.split("/").map(Number);
    const offset = monthIndex - (sourceYear * 12 + sourceMonth);
    const slot = [client,year,month,part].join("/");
    if (offset > 0 && offset < (templates.get(slot)?.offset ?? Infinity)) templates.set(slot,{source,offset});
  }
  const inserts = Array.from(templates, ([slot,{source,offset}]) => {
    const start = moveMonth(source.start_at,offset);
    let deadline = moveMonth(source.deadline_at,offset);
    if (deadline <= start) {
      const duration = Date.parse(source.deadline_at+"Z") - Date.parse(source.start_at+"Z");
      deadline = new Date(Date.parse(start+"Z")+duration).toISOString().slice(0,16);
    }
    return database.prepare(`INSERT INTO agency_tasks(plan_slot,plan_generated,title,start_at,deadline_at,
      assigned_user_id,assigned_user_name,assigned_user_role,created_by_user_id,created_by_name,created_by_role,individual_tracking)
      SELECT ?,'1',?,?,?,assigned_user_id,assigned_user_name,assigned_user_role,created_by_user_id,created_by_name,created_by_role,'1'
      FROM agency_tasks WHERE id=? AND NOT EXISTS (SELECT 1 FROM skipped_plan_months WHERE slot=?) ON CONFLICT(plan_slot) WHERE plan_slot<>'' DO NOTHING`)
      .bind(slot,source.client+" · "+month+"/"+year+" content plan · Part "+slot.slice(-1),start,deadline,source.id,slot);
  });
  if (inserts.length) await database.batch(inserts);
}
