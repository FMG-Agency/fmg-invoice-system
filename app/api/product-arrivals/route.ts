import {z} from "zod";
import {database} from "../../lib/database";
import {getSession,requirePermission} from "../../lib/auth-server";
import {administratorUserIds,notifyUsers} from "../../lib/notifications";
import {ELEVE_CLIENT_ID} from "../../lib/product-arrivals";
import {trashDelete} from "../../lib/trash";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const details=z.object({title:z.string().trim().min(1).max(160),quantity:z.number().int().min(1).max(100000).nullable().default(null),albumUrl:z.union([z.literal(""),z.string().trim().url().max(2000).refine(v=>/^https:\/\//i.test(v),"Use an https:// album link.")]).default(""),notes:z.string().trim().max(4000).default("")});
const create=details.extend({submissionId:z.string().uuid()});
const change=z.discriminatedUnion("action",[
  z.object({action:z.literal("edit"),id:z.number().int().positive(),data:details}),
  z.object({action:z.literal("status"),id:z.number().int().positive(),status:z.enum(["new","seen","scheduled","photographed"])}),
]);
async function ensureDatabase(){
  await database.prepare(`CREATE TABLE IF NOT EXISTS client_product_arrivals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,client_id INTEGER NOT NULL REFERENCES clients(id),
    submission_id TEXT NOT NULL UNIQUE,title TEXT NOT NULL,quantity INTEGER,album_url TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','seen','scheduled','photographed')),
    created_by INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}
async function access(request:Request){
  const denied=await requirePermission(request,"client_portal");if(denied)return denied;
  const session=await getSession(request);if(!session)return Response.json({error:"Sign in first."},{status:401});
  if(session.clientId!==null&&session.clientId!==ELEVE_CLIENT_ID)return Response.json({error:"This feature is not enabled for this client."},{status:403});
  return session;
}
async function list(){const rows=await database.prepare("SELECT id,title,quantity,album_url,notes,status,created_at,updated_at FROM client_product_arrivals WHERE client_id=? ORDER BY id DESC LIMIT 200").bind(ELEVE_CLIENT_ID).all();return Response.json({arrivals:rows.results},{headers:{"Cache-Control":"private, no-store"}});}
function failure(error:unknown){if(error instanceof z.ZodError)return Response.json({error:error.issues[0]?.message},{status:400});console.error("Product arrivals failed",error);return Response.json({error:"Could not save or load arrivals. Please retry."},{status:500});}
export async function GET(request:Request){try{const session=await access(request);if(session instanceof Response)return session;await ensureDatabase();return await list();}catch(error){return failure(error);}}
export async function DELETE(request:Request){try{
  const session=await access(request);if(session instanceof Response)return session;
  if(session.clientId!==ELEVE_CLIENT_ID)return Response.json({error:"Only Eleve can remove an arrival."},{status:403});
  const {id}=z.object({id:z.number().int().positive()}).parse(await request.json());
  await ensureDatabase();
  await trashDelete("client_product_arrivals","id=? AND client_id=?",[id,ELEVE_CLIENT_ID],session);
  return await list();
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
  const session=await access(request);if(session instanceof Response)return session;
  if(session.clientId!==ELEVE_CLIENT_ID)return Response.json({error:"Only Eleve can submit an arrival."},{status:403});
  const data=create.parse(await request.json());await ensureDatabase();
  const inserted=await database.prepare("INSERT INTO client_product_arrivals(client_id,submission_id,title,quantity,album_url,notes,created_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(submission_id) DO NOTHING").bind(ELEVE_CLIENT_ID,data.submissionId,data.title,data.quantity,data.albumUrl,data.notes,session.userId).run();
  if(inserted.meta.changes) await notifyUsers(await administratorUserIds(),{type:"product_arrival",title:"Eleve · New products arrived",message:data.title+(data.quantity?` · ${data.quantity} products`:""),targetView:"client-portal-admin",entityId:Number(inserted.meta.last_row_id),actorUserId:session.userId});
  return await list();
}catch(error){return failure(error);}}
export async function PATCH(request:Request){try{
  const session=await access(request);if(session instanceof Response)return session;
  const data=change.parse(await request.json());
  if((data.action==="edit"&&session.clientId!==ELEVE_CLIENT_ID)||(data.action==="status"&&session.clientId!==null))return Response.json({error:"This action is not permitted."},{status:403});
  await ensureDatabase();const existing=await database.prepare("SELECT id FROM client_product_arrivals WHERE id=? AND client_id=?").bind(data.id,ELEVE_CLIENT_ID).first();if(!existing)return Response.json({error:"Arrival not found."},{status:404});
  if(data.action==="edit"){
    await database.prepare("UPDATE client_product_arrivals SET title=?,quantity=?,album_url=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND client_id=?").bind(data.data.title,data.data.quantity,data.data.albumUrl,data.data.notes,data.id,ELEVE_CLIENT_ID).run();
    await notifyUsers(await administratorUserIds(),{type:"product_arrival_updated",title:"Eleve · Product details updated",message:data.data.title,targetView:"client-portal-admin",entityId:data.id,actorUserId:session.userId});
  }else await database.prepare("UPDATE client_product_arrivals SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND client_id=?").bind(data.status,data.id,ELEVE_CLIENT_ID).run();
  return await list();
}catch(error){return failure(error);}}
