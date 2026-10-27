import {getActorSession,getDatabase} from '../../lib/auth-server';
import {z} from 'zod';
export const runtime='nodejs';
export const dynamic='force-dynamic';
function cookie(request:Request,value:number){return `fmg_account_view=${value||''}; Path=/; HttpOnly; SameSite=Strict${value?'': '; Max-Age=0'}${new URL(request.url).protocol==='https:'?'; Secure':''}`}
export async function POST(request:Request){
 const actor=await getActorSession(request);if(!actor?.isAdmin)return Response.json({error:'Administrator access required.'},{status:403});
 const input=z.object({userId:z.number().int().positive()}).safeParse(await request.json());if(!input.success)return Response.json({error:'Invalid user.'},{status:400});
 const row=await getDatabase().prepare('SELECT id FROM auth_users WHERE id=? AND active=1').bind(input.data.userId).first();if(!row)return Response.json({error:'User is inactive or unavailable.'},{status:404});
 return Response.json({ok:true},{headers:{'set-cookie':cookie(request,input.data.userId),'Cache-Control':'no-store'}});
}
export async function DELETE(request:Request){return Response.json({ok:true},{headers:{'set-cookie':cookie(request,0),'Cache-Control':'no-store'}})}
