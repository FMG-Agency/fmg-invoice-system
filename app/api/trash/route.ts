import { z } from "zod";
import { getSession } from '../../lib/auth-server';
import { listTrash, restoreTrash } from '../../lib/trash';
export async function GET(request:Request){
  const session=await getSession(request);
  if(!session) return Response.json({error:'Authentication required.'},{status:401});
  if(!session.isAdmin) return Response.json({error:'Only administrators can manage Trash.'},{status:403});
  return Response.json({items:await listTrash()});
}
export async function POST(request:Request){
  const session=await getSession(request);
  if(!session) return Response.json({error:'Authentication required.'},{status:401});
  if(!session.isAdmin) return Response.json({error:'Only administrators can manage Trash.'},{status:403});
  try{
    const body=z.object({action:z.literal("restore"),id:z.number().int().positive()}).parse(await request.json());
    if(body.action!=='restore'||!Number.isSafeInteger(body.id)||body.id<=0) return Response.json({error:'Invalid request.'},{status:400});
    await restoreTrash(body.id);
    return Response.json({items:await listTrash()});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Could not restore this item.'},{status:409});}
}
