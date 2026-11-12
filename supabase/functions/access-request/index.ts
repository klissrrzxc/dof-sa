import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {z} from 'npm:zod@4.6.7';
const schema=z.object({static_id:z.string().regex(/^[1-9]\d{0,11}$/),ic_name:z.string().trim().min(3).max(150),game_phone:z.string().trim().min(3).max(40),organization_name:z.string().trim().min(2).max(200),requested_level:z.enum(['REPRESENTATIVE','AGENCY_HEAD','FINANCE_OFFICER','FINANCE_DIRECTOR']),authority_document:z.string().trim().max(2000).default(''),password:z.string().min(12).max(128)}).refine(d=>d.requested_level!=='REPRESENTATIVE'||d.authority_document.length>=5);
const respond=(status:number)=>new Response(JSON.stringify({message:status===200?'Request received':'Request unavailable'}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return respond(405);
 let requestId:string|undefined,createdUser:string|undefined;
 const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  if(Number(req.headers.get('content-length')||0)>16384)return respond(413);const raw=await req.text();if(raw.length>16384)return respond(413);
  const parsed=schema.safeParse(JSON.parse(raw));if(!parsed.success)return respond(400);
  const {password,...data}=parsed.data;
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unavailable';
  const hmac=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',hmac,new TextEncoder().encode('access-request:'+ip));
  const fingerprint=Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('');
  const {data:reservation,error}=await admin.rpc('reserve_access_request',{data,fingerprint});
  if(error)return respond(error.message.includes('rate_limit')?429:503);
  if(!reservation.create)return respond(200);requestId=reservation.id;
  if(reservation.previous_user){const {error:cleanupError}=await admin.auth.admin.deleteUser(reservation.previous_user);if(cleanupError&&cleanupError.status!==404)throw new Error('Previous rejected identity cleanup failed');}
  // .invalid is an internal username namespace, not a contact email or verified mailbox.
  const {data:identity,error:createError}=await admin.auth.admin.createUser({email:'id-'+data.static_id+'@users.dof-sa.invalid',password,email_confirm:true});
  if(createError||!identity.user)throw new Error('Identity creation failed');createdUser=identity.user.id;
  const {error:finishError}=await admin.rpc('finish_access_request',{target:requestId,auth_user:createdUser,successful:true});
  if(finishError)throw new Error('Request linking failed');return respond(200);
 }catch{
  if(createdUser)await admin.auth.admin.deleteUser(createdUser);
  if(requestId)await admin.rpc('finish_access_request',{target:requestId,auth_user:null,successful:false});
  return respond(503);
 }
});
