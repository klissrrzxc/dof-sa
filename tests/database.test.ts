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
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`);
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
  it('legacy submission endpoint cannot bypass validated operational API',async()=>{
    await asUser(agency,'aal1');
    await expect(db.query('select public.submit_case($1)',[draftId])).rejects.toThrow(/use_perform_operation/);
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

// End-to-end business flow in PostgreSQL, using explicit test-only delegated authority.
const financeId='00000000-0000-4000-8000-000000000005';let paymentKey='';let periodId:string,expenseId:string,incomeId:string,caseId:string,secondCaseId:string,commitmentId:string,orderId:string;
async function operation(action:string,target:string|null,input:Record<string,unknown>,key=crypto.randomUUID()){
 const r=await db.query<{result:{id:string}}>('select public.perform_operation($1,$2,$3::jsonb,$4) result',[action,target,JSON.stringify({basis:'TEST confirmed document basis',...input}),key]);return r.rows[0].result;
}
function fundingPayload(amount='600'){return {agencyName:'TEST LSPD',agencyAddress:'Test address',agencyAccount:'TEST',applicantName:'Test Agent',applicantTitle:'Agent',phone:'TEST',basis:'TEST law',basisNumber:'TEST-1',categoryCode:'TEST-EXP',categoryName:'Test expense',amount,purpose:'TEST funding',justification:'TEST justification',recipient:'TEST recipient',recipientAccount:'TEST account',paymentPurpose:'TEST payment'};}
describe('financial workflows and atomic invariants',()=>{
 it('installs test-only finance delegation and verified dictionaries',async()=>{
  await db.exec('reset role');await db.query('insert into auth.users values($1)',[financeId]);
  await db.query("insert into public.profiles(auth_user_id,ic_name,title,organization_id,status) values($1,'Test Director','TEST','10000000-0000-4000-8000-000000000001','active')",[financeId]);
  await db.query("insert into public.role_assignments(user_id,role,assigned_by) values($1,'finance_director',$2)",[financeId,admin]);
  await db.query("insert into public.permission_grants(user_id,permission,assigned_by,reason) select $1,p,$2,'TEST delegated authority' from unnest(enum_range(null::public.permission_key)) p",[financeId,admin]);
  await asUser(admin);periodId=(await operation('period.create',null,{name:'TEST 2026',start_date:'2026-01-01',end_date:'2026-12-31'})).id;
  expenseId=(await operation('category.create',null,{code:'TEST-EXP',name:'Test expense',kind:'EXPENSE',source:'TEST law',verified:'true'})).id;
  incomeId=(await operation('category.create',null,{code:'TEST-INC',name:'Test income',kind:'INCOME',source:'TEST law',verified:'true'})).id;
 });
 it('administrator cannot open a treasury balance',async()=>{
  await asUser(admin);await expect(operation('treasury.opening',null,{amount:'1000',period_id:periodId,category_id:incomeId,confirmation:'TEST-open',counterparty:'TEST',proof:'TEST evidence'})).rejects.toThrow(/forbidden/);
 });
 it('opening funds and appropriation require distinct confirmed actions',async()=>{
  await asUser(financeId);
  await operation('treasury.opening',null,{amount:'1000',period_id:periodId,category_id:incomeId,confirmation:'TEST-open',counterparty:'TEST',proof:'TEST evidence'});
  await operation('appropriation.set',null,{amount:'1200',period_id:periodId,category_id:expenseId});
  expect((await db.query<{actual:string}>('select actual from public.treasury_account_read')).rows[0].actual).toBe('1000');
 });
 it('submission validates required fields, registers an immutable index and permits review',async()=>{
  await asUser(agency,'aal1');
  const c=await db.query<{id:string}>("select public.save_case_draft(null,0,'FUNDING_REQUEST',$1::jsonb) id",[JSON.stringify(fundingPayload())]);caseId=c.rows[0].id;
  await expect(operation('case.submit',caseId,{period_id:periodId})).rejects.toThrow(/truth_confirmation_required/);
  await operation('case.submit',caseId,{period_id:periodId,truth_confirmed:'true'});
  expect((await db.query<{status:string;document_index:string}>('select status,document_index from public.financial_cases where id=$1',[caseId])).rows[0].document_index).toMatch(/^MOF-BFR-\d{4}-\d{4}$/);
  await expect(db.query("select public.save_case_draft($1,1,'FUNDING_REQUEST','{}')",[caseId])).rejects.toThrow(/immutable/);
  await asUser(financeId);await operation('case.review',caseId,{});await operation('case.clarify',caseId,{});
 });
 it('clarification creates a new version and resubmission preserves the case index',async()=>{
  await asUser(agency,'aal1');await db.query("select public.save_case_draft($1,1,'FUNDING_REQUEST',$2::jsonb)",[caseId,JSON.stringify(fundingPayload())]);
  await operation('case.submit',caseId,{period_id:periodId,truth_confirmed:'true'});
  expect((await db.query('select * from public.case_versions where case_id=$1',[caseId])).rows).toHaveLength(2);
  await asUser(financeId);await operation('case.review',caseId,{});await operation('case.approve',caseId,{amount:'600'});
  expect((await db.query<{reserved:string}>('select reserved from public.treasury_account_read')).rows[0].reserved).toBe('0');
 });
 it('two reserves cannot exceed available treasury even when the appropriation is larger',async()=>{
  await asUser(agency,'aal1');const c=await db.query<{id:string}>("select public.save_case_draft(null,0,'FUNDING_REQUEST',$1::jsonb) id",[JSON.stringify(fundingPayload())]);secondCaseId=c.rows[0].id;
  await operation('case.submit',secondCaseId,{period_id:periodId,truth_confirmed:'true'});
  await asUser(financeId);await operation('case.review',secondCaseId,{});await operation('case.approve',secondCaseId,{amount:'600'});
  commitmentId=(await operation('commitment.reserve',caseId,{})).id;
  await expect(operation('commitment.reserve',secondCaseId,{})).rejects.toThrow(/insufficient_available_funds/);
  const a=(await db.query<{actual:string;reserved:string;available:string}>('select * from public.treasury_account_read')).rows[0];expect(a).toMatchObject({actual:'1000',reserved:'600',available:'400'});
 });
 it('an order does not move cash; execution requires proof and is idempotent',async()=>{
  await asUser(financeId);orderId=(await operation('order.create',commitmentId,{})).id;
  expect((await db.query<{actual:string}>('select actual from public.treasury_account_read')).rows[0].actual).toBe('1000');
  await expect(operation('order.execute',orderId,{})).rejects.toThrow(/required_field/);
  const key=paymentKey=crypto.randomUUID(),input={confirmation:'TEST-payment-1',proof:'TEST real transfer evidence'};
  const first=await operation('order.execute',orderId,input,key);expect(await operation('order.execute',orderId,input,key)).toEqual(first);
  await expect(operation('order.execute',orderId,input)).rejects.toThrow(/already_paid/);
  expect((await db.query<{actual:string;reserved:string}>('select * from public.treasury_account_read')).rows[0]).toMatchObject({actual:'400',reserved:'0'});
  expect((await db.query("select * from public.treasury_entries where kind='EXPENSE'")).rows).toHaveLength(1);
 });
 it('cannot close without accepted utilization evidence',async()=>{
  await asUser(financeId);await expect(operation('case.close',caseId,{})).rejects.toThrow(/accepted_report/);
  await asUser(agency,'aal1');await operation('report.utilization_submit',caseId,{amount:'600',returned:'0',proof:'TEST confirmed use documents'});
  await asUser(financeId);await operation('report.utilization_return',caseId,{});
  await asUser(agency,'aal1');await operation('report.utilization_submit',caseId,{amount:'600',returned:'0',proof:'TEST corrected evidence'});
  await asUser(financeId);await operation('report.utilization_accept',caseId,{});await operation('case.close',caseId,{});
  expect((await db.query<{status:string}>('select status from public.financial_cases where id=$1',[caseId])).rows[0].status).toBe('CLOSED');
 });
 it('report freezes only aggregates; opening balance is distinct from income',async()=>{
  await asUser(financeId);const report=(await operation('report.generate',periodId,{})).id;
  const row=(await db.query<{snapshot:Record<string,string>;bbcode:string}>('select snapshot,bbcode from public.public_report_drafts where id=$1',[report])).rows[0];
  expect(row.snapshot).toMatchObject({opening:'1000',income:'0',expense:'600',closing:'400'});expect(row.bbcode).not.toContain('TEST account');expect(row.bbcode).not.toContain('Test Agent');
  await expect(operation('report.export',report,{})).rejects.toThrow(/approval_required/);
  await operation('report.review',report,{});await operation('report.approve',report,{});await operation('report.export',report,{});
  await expect(db.query("update public.public_report_drafts set snapshot='{}'")).rejects.toThrow(/permission denied/);
 });
 it('closed budget period refuses new income and permission revocation acts immediately',async()=>{
  await asUser(financeId);await operation('period.close',periodId,{});
  await expect(operation('treasury.income',null,{amount:'1',period_id:periodId,category_id:incomeId,confirmation:'TEST-after-close',counterparty:'TEST',proof:'TEST proof'})).rejects.toThrow(/period_closed/);
  await db.exec('reset role');await db.query("update public.permission_grants set revoked_at=now() where user_id=$1 and permission='treasury.execute'",[financeId]);await asUser(financeId);
  await expect(operation('order.create',commitmentId,{})).rejects.toThrow(/forbidden/);
  await expect(operation('order.execute',orderId,{confirmation:'TEST-payment-1',proof:'TEST real transfer evidence'},paymentKey)).rejects.toThrow(/forbidden/);
 });
});

describe('private attachments and compensating cash records',()=>{
 let fileId:string,filePath:string,fileCase:string,newPeriod:string;
 it('upload intent requires case ownership and rejects unsupported content types',async()=>{
  await asUser(agency,'aal1');fileCase=(await db.query<{id:string}>("select public.save_case_draft(null,0,'FUNDING_REQUEST','{\"amount\":\"1\"}') id")).rows[0].id;
  await expect(db.query("select public.case_file('begin',$1,$2::jsonb)",[fileCase,JSON.stringify({name:'test.svg',mime:'image/svg+xml',size:'8'})])).rejects.toThrow(/unsupported_file/);
  const r=await db.query<{file:{id:string;path:string}}>("select public.case_file('begin',$1,$2::jsonb) file",[fileCase,JSON.stringify({name:'TEST.pdf',mime:'application/pdf',size:'8'})]);fileId=r.rows[0].file.id;filePath=r.rows[0].file.path;
  await expect(db.query("select public.case_file('access',$1,'{}')",[fileId])).rejects.toThrow(/file_not_ready/);
  await expect(db.query("select public.case_file('complete',$1,'{}')",[fileId])).rejects.toThrow(/file_upload_not_confirmed/);
 });
 it('Storage RLS denies foreign path writes and foreign file download',async()=>{
  await asUser(ems,'aal1');
  await expect(db.query("insert into storage.objects(bucket_id,name,metadata) values('financial-documents',$1,'{\"size\":8,\"mimetype\":\"application/pdf\"}')",[filePath])).rejects.toThrow(/row-level security/);
  await expect(db.query("select public.case_file('access',$1,'{}')",[fileId])).rejects.toThrow(/forbidden/);
  await asUser(agency,'aal1');await db.query("insert into storage.objects(bucket_id,name,metadata) values('financial-documents',$1,'{\"size\":8,\"mimetype\":\"application/pdf\"}')",[filePath]);
  await db.query("select public.case_file('complete',$1,'{}')",[fileId]);expect((await db.query('select * from storage.objects where name=$1',[filePath])).rows).toHaveLength(1);
  await asUser(ems,'aal1');expect((await db.query('select * from storage.objects where name=$1',[filePath])).rows).toHaveLength(0);
 });
 it('income correction preserves the original ledger row and refuses duplicate reversal',async()=>{
  await asUser(admin);newPeriod=(await operation('period.create',null,{name:'TEST next year',start_date:'2027-01-01',end_date:'2027-12-31'})).id;
  await asUser(financeId);await db.exec('reset role');await db.query("update public.permission_grants set revoked_at=null where user_id=$1 and permission='treasury.execute'",[financeId]);await asUser(financeId);
  const income=(await operation('treasury.income',null,{amount:'200',period_id:newPeriod,category_id:incomeId,confirmation:'TEST-income-correction',counterparty:'TEST',proof:'TEST original proof'})).id;
  const before=(await db.query<{actual:string}>('select actual from public.treasury_account_read')).rows[0].actual;
  await operation('treasury.reverse',income,{amount:'200',confirmation:'TEST-reverse-confirmation',proof:'TEST confirmed reverse transfer'});
  expect(BigInt((await db.query<{actual:string}>('select actual from public.treasury_account_read')).rows[0].actual)).toBe(BigInt(before)-200n);
  expect((await db.query('select * from public.treasury_entries where id=$1',[income])).rows).toHaveLength(1);
  await expect(operation('treasury.reverse',income,{amount:'200',confirmation:'TEST-reverse-second',proof:'TEST repeated'})).rejects.toThrow();
  await expect(db.query('delete from public.treasury_entries')).rejects.toThrow(/permission denied/);
 });
});

describe('unused balance settlement and report freshness',()=>{
 it('a confirmed partial return settles the unused balance without rewriting the original expense',async()=>{
  await asUser(financeId);const next=(await db.query<{id:string}>("select id from public.budget_periods where name='TEST next year'")).rows[0].id;
  await operation('appropriation.set',null,{period_id:next,category_id:expenseId,amount:'400'});
  await asUser(agency,'aal1');const cid=(await db.query<{id:string}>("select public.save_case_draft(null,0,'FUNDING_REQUEST',$1::jsonb) id",[JSON.stringify(fundingPayload('100'))])).rows[0].id;
  await operation('case.submit',cid,{period_id:next,truth_confirmed:'true'});await asUser(financeId);
  await operation('case.review',cid,{});await operation('case.approve',cid,{amount:'100'});const cm=(await operation('commitment.reserve',cid,{})).id;
  const ord=(await operation('order.create',cm,{})).id;const expense=(await operation('order.execute',ord,{confirmation:'TEST-partial-return-payment',proof:'TEST proof'})).id;
  await operation('treasury.return',expense,{amount:'20',confirmation:'TEST-unused-return',proof:'TEST actual return proof'});
  expect((await db.query<{actual:string}>('select actual from public.treasury_account_read')).rows[0].actual).toBe('320');
  expect((await db.query<{amount:string}>('select amount::text from public.treasury_entries where id=$1',[expense])).rows[0].amount).toBe('100');
  await asUser(agency,'aal1');await operation('report.utilization_submit',cid,{amount:'80',returned:'20',proof:'TEST use and confirmed return'});
  await asUser(financeId);await operation('report.utilization_accept',cid,{});await operation('case.close',cid,{});
  const rpt=(await operation('report.generate',next,{})).id;
  expect((await db.query<{snapshot:Record<string,string>}>('select snapshot from public.public_report_drafts where id=$1',[rpt])).rows[0].snapshot).toMatchObject({opening:'400',income:'200',expense:'100',corrections:'-180',closing:'320'});
 });
 it('cannot approve an outdated snapshot after a new confirmed movement',async()=>{
  await asUser(financeId);const next=(await db.query<{id:string}>("select id from public.budget_periods where name='TEST next year'")).rows[0].id;
  const rpt=(await operation('report.generate',next,{})).id;await operation('report.review',rpt,{});
  await operation('treasury.income',null,{period_id:next,category_id:incomeId,amount:'1',confirmation:'TEST-report-new-income',counterparty:'TEST',proof:'TEST evidence'});
  await expect(operation('report.approve',rpt,{})).rejects.toThrow(/report_stale_regenerate/);
 });
});

describe('procurement documents and unexecuted order cancellation',()=>{
 let proc:string,next:string,commitment:string;
 it('requires complete procurement data, a file and a matching item total',async()=>{
  await asUser(agency,'aal1');next=(await db.query<{id:string}>("select id from public.budget_periods where name='TEST next year'")).rows[0].id;
  const payload={...fundingPayload('100'),staticId:'123',division:'TEST division',authority:'TEST authority order',custodian:'TEST Custodian',custodianStaticId:'456',custodianTitle:'TEST title',custodianDivision:'TEST division',custodianAgency:'TEST LSPD',supplier:'TEST supplier',supplierAddress:'TEST address',supplierRepresentative:'TEST representative',supplierStaticId:'789',supplierAccount:'TEST supplier account',priceJustification:'TEST quote',interestDisclosure:'TEST no interest',items:[{name:'TEST goods',quantity:'2',unitPrice:'50',purpose:'TEST use',division:'TEST division'}]};
  proc=(await db.query<{id:string}>("select public.save_case_draft(null,0,'PROCUREMENT_REQUEST',$1::jsonb) id",[JSON.stringify(payload)])).rows[0].id;
  await expect(operation('case.submit',proc,{period_id:next,truth_confirmed:'true'})).rejects.toThrow(/procurement_documents_required/);
  const file=(await db.query<{f:{id:string;path:string}}>("select public.case_file('begin',$1,'{\"name\":\"TEST.pdf\",\"mime\":\"application/pdf\",\"size\":\"8\"}') f",[proc])).rows[0].f;
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('financial-documents',$1,'{\"size\":8,\"mimetype\":\"application/pdf\"}')",[file.path]);await db.query("select public.case_file('complete',$1,'{}')",[file.id]);
  await db.query("select public.save_case_draft($1,1,'PROCUREMENT_REQUEST',$2::jsonb)",[proc,JSON.stringify({...payload,amount:'101'})]);
  await expect(operation('case.submit',proc,{period_id:next,truth_confirmed:'true'})).rejects.toThrow(/procurement_total_mismatch/);
  await db.query("select public.save_case_draft($1,2,'PROCUREMENT_REQUEST',$2::jsonb)",[proc,JSON.stringify(payload)]);await operation('case.submit',proc,{period_id:next,truth_confirmed:'true'});
  expect((await db.query<{document_index:string}>('select document_index from public.financial_cases where id=$1',[proc])).rows[0].document_index).toMatch(/^MOF-PR-/);
 });
 it('voids an unexecuted order without changing cash and allows releasing the reservation',async()=>{
  await asUser(financeId);await operation('case.review',proc,{});await operation('case.approve',proc,{amount:'100'});commitment=(await operation('commitment.reserve',proc,{})).id;
  const order=(await operation('order.create',commitment,{})).id;
  await expect(operation('commitment.cancel',commitment,{})).rejects.toThrow(/cancellation_not_permitted/);
  const before=(await db.query<{actual:string}>('select actual from public.treasury_account_read')).rows[0].actual;
  await operation('order.cancel',order,{});await expect(operation('order.execute',order,{confirmation:'TEST-void-order',proof:'TEST'})).rejects.toThrow(/order_cancelled/);
  const replacement=(await operation('order.create',commitment,{})).id;expect(replacement).not.toBe(order);
  await operation('order.cancel',replacement,{});await operation('commitment.cancel',commitment,{});
  expect((await db.query<{actual:string;reserved:string}>('select * from public.treasury_account_read')).rows[0]).toMatchObject({actual:before,reserved:'0'});
  expect((await db.query<{status:string}>('select status from public.financial_cases where id=$1',[proc])).rows[0].status).toBe('WITHDRAWN');
 });
});

it('document management does not bypass the organization boundary of case documents',async()=>{
 await db.exec('reset role');await db.query("insert into public.permission_grants(user_id,permission,assigned_by,reason) values($1,'docs.manage',$2,'TEST scoped document manager')",[ems,admin]);
 const hidden=(await db.query<{id:string}>('select id from public.documents where case_id=$1 limit 1',[caseId])).rows[0].id;
 await asUser(ems,'aal2');
 expect((await db.query('select * from public.documents where case_id=$1',[caseId])).rows).toHaveLength(0);
 expect((await db.query('select * from public.document_versions where document_id=$1',[hidden])).rows).toHaveLength(0);
});
