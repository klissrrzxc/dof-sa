import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {z} from 'npm:zod@4.6.7';
const schema=z.object({email:z.email().max(254),ic_name:z.string().trim().min(2).max(150),title:z.string().trim().min(2).max(200),organization_id:z.uuid(),assigned_role:z.enum(['agency_representative','finance_officer','finance_director','system_admin'])});
const respond=(status:number,message:string)=>new Response(JSON.stringify({message}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return respond(405,'Method not allowed');
 const authorization=req.headers.get('Authorization');if(!authorization?.startsWith('Bearer '))return respond(401,'Authentication required');
 try{
  const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
  const db=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await db.auth.getUser(authorization.slice(7));if(authError||!user)return respond(401,'Authentication required');
  const {data:access,error:accessError}=await db.rpc('my_access');if(accessError||!access?.permissions?.includes('users.manage'))return respond(403,'Permission denied');
  if(Number(req.headers.get('content-length')||0)>16384)return respond(413,'Request too large');
  const raw=await req.text();if(raw.length>16384)return respond(413,'Request too large');
  const parsed=schema.safeParse(JSON.parse(raw));if(!parsed.success)return respond(400,'Invalid invitation');
  const origin=new URL(Deno.env.get('APP_ORIGIN')||'http://localhost:3000');
  if(origin.protocol!=='https:'&&!['http://localhost:3000','http://127.0.0.1:3000'].includes(origin.origin))return respond(503,'Invitation origin is not configured');
  const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {email,...profile}=parsed.data;
  const {data,error}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:origin.origin+'/auth/confirm'});
  if(error||!data.user)return respond(409,'Invitation not sent; check SMTP, delivery limits or existing account');
  const {error:provisionError}=await db.rpc('provision_staff',{target_user:data.user.id,...profile});
  if(provisionError){await admin.auth.admin.deleteUser(data.user.id);return respond(409,'Invitation access not provisioned');}
  return respond(200,'Invitation sent');
 }catch{return respond(503,'Invitation service unavailable');}
});
