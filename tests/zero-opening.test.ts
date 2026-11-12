import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {beforeAll,afterAll,it,expect} from 'vitest';
const db=new PGlite();const actor='11111111-1111-4111-8111-111111111111';const period='22222222-2222-4222-8222-222222222222';const category='33333333-3333-4333-8333-333333333333';
async function operate(op:string,input:Record<string,string>){return db.query<{result:{id:string}}>('select public.perform_operation($1,$2,$3::jsonb,$4) result',[op,op==='report.generate'?period:null,JSON.stringify({basis:'TEST verified zero opening basis',...input}),crypto.randomUUID()]);}
beforeAll(async()=>{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;grant usage on schema auth,storage to authenticated;grant execute on all functions in schema auth to authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;`);
 for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 await db.exec(`insert into auth.users values('${actor}');insert into public.organizations(name,short_name,address,account_reference) values('TEST','TEST','TEST','TEST');insert into public.profiles(auth_user_id,ic_name,title,organization_id,status) select '${actor}','TEST Director','TEST',id,'active' from public.organizations;insert into public.role_assignments(user_id,role,assigned_by) values('${actor}','finance_director','${actor}');insert into public.permission_grants(user_id,permission,assigned_by,reason) select '${actor}',p,'${actor}','TEST authorized' from unnest(enum_range(null::public.permission_key))p;insert into public.budget_periods(id,name,start_date,end_date,basis) values('${period}','TEST','2026-01-01','2026-12-31','TEST');insert into public.budget_categories(id,code,name,kind,source,requires_verification) values('${category}','TEST-INC','TEST','INCOME','TEST',false);`);
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor,aal:'aal2'})]);await db.exec('set role authenticated');
});
afterAll(()=>db.close());
it('does not present an unverified starting zero as an initialized account',async()=>{
 expect((await db.query<{initialized:boolean}>('select initialized from public.treasury_account_read')).rows[0].initialized).toBe(false);
 await expect(operate('treasury.income',{amount:'1',period_id:period,category_id:category,confirmation:'TEST-before-init',counterparty:'TEST',proof:'TEST'})).rejects.toThrow(/opening_balance_required/);
});
it('records a confirmed zero opening as a document, without inventing a cash movement',async()=>{
 await operate('treasury.opening',{amount:'0',period_id:period,category_id:category,confirmation:'TEST-zero-opening',counterparty:'TEST',proof:'TEST verified zero evidence'});
 expect((await db.query<{actual:string;initialized:boolean}>('select * from public.treasury_account_read')).rows[0]).toMatchObject({actual:'0',initialized:true});
 expect((await db.query('select * from public.treasury_entries')).rows).toHaveLength(0);
 const result=await operate('report.generate',{});expect((await db.query<{snapshot:Record<string,string>}>('select snapshot from public.public_report_drafts where id=$1',[result.rows[0].result.id])).rows[0].snapshot).toMatchObject({opening:'0',closing:'0'});
});
it('cannot initialize twice and accepts proven income afterwards',async()=>{
 await expect(operate('treasury.opening',{amount:'1',period_id:period,category_id:category,confirmation:'TEST-second-opening',counterparty:'TEST',proof:'TEST'})).rejects.toThrow(/already_initialized/);
 await operate('treasury.income',{amount:'1',period_id:period,category_id:category,confirmation:'TEST-first-income',counterparty:'TEST',proof:'TEST received'});
 expect((await db.query<{actual:string}>('select actual from public.treasury_account_read')).rows[0].actual).toBe('1');
});
