import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
const allowed=new Set(['https://klissrrzxc.github.io','http://127.0.0.1:4173','http://localhost:4173','http://127.0.0.1:3000','http://localhost:3000']);
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';const cors:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};if(allowed.has(origin))cors['Access-Control-Allow-Origin']=origin;
 const respond=(status:number)=>new Response(JSON.stringify({ok:status===200}),{status,headers:cors});
 if(origin&&!allowed.has(origin))return respond(403);if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(req.method!=='POST')return respond(405);
 const token=req.headers.get('authorization');if(!token?.startsWith('Bearer '))return respond(401);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await db.auth.getUser(token.slice(7));if(authError||!user)return respond(401);
 try{
  if(Number(req.headers.get('content-length')||0)>10500000)return respond(413);const form=await req.formData();const file=form.get('file'),caseId=form.get('case_id');
  if(typeof caseId!=='string'||!/^[0-9a-f-]{36}$/i.test(caseId)||!(file instanceof File)||!file.size||file.size>10485760||!['application/pdf','image/png','image/jpeg'].includes(file.type))return respond(400);
  const bytes=new Uint8Array(await file.arrayBuffer());const valid=file.type==='application/pdf'?String.fromCharCode(...bytes.slice(0,5))==='%PDF-':file.type==='image/png'?[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;if(!valid)return respond(400);
  const {data,error}=await db.rpc('case_file',{action:'begin',target:caseId,input:{name:file.name.slice(0,180),mime:file.type,size:String(file.size)}});if(error)return respond(403);
  const upload=await db.storage.from('financial-documents').upload(data.path,bytes,{contentType:file.type,upsert:false});if(upload.error)return respond(503);
  const finish=await db.rpc('case_file',{action:'complete',target:data.id,input:{}});if(finish.error)return respond(503);return respond(200);
 }catch{return respond(400);}
});
