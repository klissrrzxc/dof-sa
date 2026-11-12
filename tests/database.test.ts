import { PGlite } from '@electric-sql/pglite';
import { readFileSync,readdirSync } from 'node:fs';
import { afterAll,beforeAll,describe,it,expect } from 'vitest';
const db=new PGlite();
const admin='00000000-0000-4000-8000-000000000001', agency='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003',ems='00000000-0000-4000-8000-000000000004';
async function asUser(id:string,aal='aal2'){
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,aal})]);
  await db.exec('set role authenticated');
}
beforeAll(async()=>{
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub' $$;
  `.replace("select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'","select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid"));
  await db.exec(`create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant usage on schema auth to authenticated,anon; grant execute on all functions in schema auth to authenticated,anon;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for(const file of readdirSync('supabase/migrations').sort()) await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
  await db.exec(`insert into auth.users values('${admin}'),('${agency}'),('${other}'),('${ems}');
    insert into public.organizations(id,name,short_name,address,account_reference) values
      ('10000000-0000-4000-8000-000000000001','TEST LSPD','TEST-LSPD','Test address','TEST'),
      ('10000000-0000-4000-8000-000000000002','TEST EMS','TEST-EMS','Test address','TEST');
    insert into public.profiles(auth_user_id,ic_name,title,organization_id,status) values
      ('${admin}','Test Admin','Admin','10000000-0000-4000-8000-000000000001','active'),
      ('${agency}','Test Agent','Agent','10000000-0000-4000-8000-000000000001','active'),
      ('${ems}','EMS Agent','Agent','10000000-0000-4000-8000-000000000002','active'),
      ('${other}','Other Agent','Agent','10000000-0000-4000-8000-000000000002','active');
    insert into public.role_assignments(user_id,role,assigned_by) values ('${admin}','system_admin','${admin}'),('${agency}','agency_representative','${admin}'),('${ems}','agency_representative','${admin}'),('${other}','agency_representative','${admin}');`);
});
afterAll(async()=>{await db.close()});
describe('PostgreSQL authorisation (real SQL with simulated Supabase JWT context)',()=>{
  it('anon cannot read profiles or call access RPC',async()=>{
    await db.exec('set role anon');
    await expect(db.query('select * from public.profiles')).rejects.toThrow(/permission denied/);
    await expect(db.query('select public.my_access()')).rejects.toThrow(/permission denied/);
  });
  it('representative cannot enumerate another organisation',async()=>{
    await asUser(agency,'aal1');
    expect((await db.query('select * from public.profiles')).rows).toHaveLength(1);
    expect((await db.query('select * from public.organizations')).rows).toHaveLength(1);
    await expect(db.query(`update public.profiles set status='active' where auth_user_id='${other}'`)).rejects.toThrow(/permission denied/);
  });
  it('administrator with aal1 cannot access data or mutate roles',async()=>{
    await asUser(admin,'aal1');
    expect((await db.query('select * from public.profiles')).rows).toHaveLength(0);
    await expect(db.query(`select public.set_staff_role('${other}','finance_director','Test reason')`)).rejects.toThrow(/forbidden/);
  });
  it('administrator cannot approve finances and cannot self-promote',async()=>{
    await asUser(admin);
    const result=await db.query<{ok:boolean}>("select private.has_permission('finance.approve') ok");
    expect(result.rows[0].ok).toBe(false);
    await expect(db.query(`select public.set_staff_role('${admin}','finance_director','Test reason')`)).rejects.toThrow(/forbidden/);
  });
  it('role change is audited atomically; financial grants stay separate',async()=>{
    await asUser(admin);
    await db.query(`select public.set_staff_role('${other}','finance_director','Test assignment')`);
    expect((await db.query("select * from public.audit_events where action='staff.role_assigned'")).rows).toHaveLength(1);
    await expect(db.query('delete from public.audit_events')).rejects.toThrow(/permission denied/);
    await asUser(other);
    expect((await db.query<{ok:boolean}>("select private.has_permission('finance.approve') ok")).rows[0].ok).toBe(false);
  });
  it('blocking identity denies an already issued JWT immediately',async()=>{
    await asUser(admin); await db.query(`select public.block_staff('${other}','Dismissal test')`);
    await asUser(other);
    expect((await db.query('select * from public.profiles')).rows).toHaveLength(0);
    expect((await db.query<{access:unknown}>('select public.my_access() access')).rows[0].access).toBeNull();
  });
  it('no public buckets exist',async()=>{
    await db.exec('reset role');
    expect((await db.query('select * from storage.buckets where public')).rows).toHaveLength(0);
  });
  let draftId:string;
  it('persists a draft and its exact monetary value, version, event and audit atomically',async()=>{
    await asUser(agency,'aal1');
    const result=await db.query<{id:string}>("select public.save_case_draft(null,0,'FUNDING_REQUEST',$1::jsonb) id",[JSON.stringify({amount:'9007199254740993',purpose:'TEST'})]);
    draftId=result.rows[0].id;
    const cases=await db.query<{payload:{amount:string};status:string;document_index:string|null}>('select * from public.financial_cases where id=$1',[draftId]);
    expect(cases.rows[0].payload.amount).toBe('9007199254740993');
    expect(cases.rows[0].status).toBe('DRAFT');expect(cases.rows[0].document_index).toBeNull();
    expect((await db.query('select * from public.case_versions where case_id=$1',[draftId])).rows).toHaveLength(1);
    expect((await db.query('select * from public.case_events where case_id=$1',[draftId])).rows).toHaveLength(1);
  });
  it('EMS cannot read or overwrite an LSPD draft via UUID/RPC',async()=>{
    await asUser(ems,'aal1');
    expect((await db.query('select * from public.financial_cases where id=$1',[draftId])).rows).toHaveLength(0);
    expect((await db.query('select * from public.case_versions where case_id=$1',[draftId])).rows).toHaveLength(0);
    await expect(db.query("select public.save_case_draft($1,1,'FUNDING_REQUEST','{}')",[draftId])).rejects.toThrow(/forbidden/);
  });
  it('stale saves and null versions cannot silently overwrite a draft',async()=>{
    await asUser(agency,'aal1');
    await db.query("select public.save_case_draft($1,1,'FUNDING_REQUEST','{\"amount\":\"1\"}')",[draftId]);
    await expect(db.query("select public.save_case_draft($1,1,'FUNDING_REQUEST','{}')",[draftId])).rejects.toThrow(/version_conflict/);
    await expect(db.query("select public.save_case_draft($1,null,'FUNDING_REQUEST','{}')",[draftId])).rejects.toThrow(/invalid_version/);
    expect((await db.query('select * from public.case_versions where case_id=$1',[draftId])).rows).toHaveLength(2);
  });
  it('official submission is blocked in DB pending verified forms',async()=>{
    await asUser(agency,'aal1');
    await expect(db.query('select public.submit_case($1)',[draftId])).rejects.toThrow(/requires_verification/);
    await expect(db.query("update public.financial_cases set status='APPROVED'")).rejects.toThrow(/permission denied/);
    await expect(db.query('delete from public.case_versions')).rejects.toThrow(/permission denied/);
  });
  it('income cannot be routed through the expenditure application workflow',async()=>{
    await asUser(agency,'aal1');
    await expect(db.query("select public.save_case_draft(null,0,'INCOME_RECORD','{}')")).rejects.toThrow(/income_requires_treasury_procedure/);
  });
  it('rejects malicious JSON types, invalid and overflowing money',async()=>{
    await asUser(agency,'aal1');
    for(const payload of [{amount:9007199254740992},{amount:'1.5'},{amount:'9223372036854775808'},{purpose:{text:'x'}}])
      await expect(db.query("select public.save_case_draft(null,0,'FUNDING_REQUEST',$1::jsonb)",[JSON.stringify(payload)])).rejects.toThrow();
  });
  it('normalises procurement items with bigint constraints and rollback on errors',async()=>{
    await asUser(agency,'aal1');
    const payload={amount:'12',items:[{name:'TEST',quantity:'3',unitPrice:'4',purpose:'TEST',division:'TEST'}]};
    const r=await db.query<{id:string}>("select public.save_case_draft(null,0,'PROCUREMENT_REQUEST',$1::jsonb) id",[JSON.stringify(payload)]);
    expect((await db.query('select * from public.procurement_items where case_id=$1',[r.rows[0].id])).rows).toHaveLength(1);
    payload.items[0].unitPrice='9223372036854775807';
    await expect(db.query("select public.save_case_draft($1,1,'PROCUREMENT_REQUEST',$2::jsonb)",[r.rows[0].id,JSON.stringify(payload)])).rejects.toThrow();
    expect((await db.query<{version:number}>('select version from public.financial_cases where id=$1',[r.rows[0].id])).rows[0].version).toBe(1);
  });
  it('permission grants require MFA and revoked grants stop working with the same JWT',async()=>{
    await db.exec('reset role');
    await db.query("insert into public.permission_grants(user_id,permission,assigned_by,reason) values($1,'cases.read_all',$2,'Test delegation')",[ems,admin]);
    await asUser(ems,'aal1');
    expect((await db.query<{ok:boolean}>("select private.has_permission('cases.read_all') ok")).rows[0].ok).toBe(false);
    await asUser(ems,'aal2');
    expect((await db.query<{ok:boolean}>("select private.has_permission('cases.read_all') ok")).rows[0].ok).toBe(true);
    expect((await db.query('select * from public.financial_cases where id=$1',[draftId])).rows).toHaveLength(1);
    await db.exec('reset role');
    await db.query('update public.permission_grants set revoked_at=now() where user_id=$1',[ems]);
    await db.exec('set role authenticated');
    expect((await db.query<{ok:boolean}>("select private.has_permission('cases.read_all') ok")).rows[0].ok).toBe(false);
    expect((await db.query('select * from public.financial_cases where id=$1',[draftId])).rows).toHaveLength(0);
  });
  it('all application tables have RLS and privileged implementations are not exposed',async()=>{
    await db.exec('reset role');
    const unprotected=await db.query("select tablename from pg_tables where schemaname='public' and not rowsecurity");
    expect(unprotected.rows).toHaveLength(0);
    expect((await db.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef")).rows).toHaveLength(0);
  });
});
