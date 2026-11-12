begin;
alter table private.operation_receipts add column access_fingerprint text not null default '';
create function private.authority_fingerprint() returns text language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object('organization',(select organization_id from public.profiles where auth_user_id=auth.uid()),'roles',(select jsonb_agg(role order by role) from public.role_assignments where user_id=auth.uid() and revoked_at is null and (expires_at is null or expires_at>now())),'permissions',(select jsonb_agg(p order by p) from unnest(enum_range(null::public.permission_key))p where private.has_permission(p)))::text,'UTF8')),'hex') where private.active_identity();
$$;
revoke all on function private.authority_fingerprint() from public,anon,authenticated;
-- Preserve the already deployed implementation and change only its replay authority guard.
do $migration$
declare definition text;begin
 select pg_get_functiondef('private.operation_impl(text,uuid,jsonb,uuid)'::regprocedure) into definition;
 if position('if found then if old_receipt.action<>op' in definition)=0 then raise exception 'Unexpected operation implementation; review replay guard migration';end if;
 definition:=replace(definition,$old$if found then if old_receipt.action<>op$old$,$new$if found then if old_receipt.access_fingerprint<>private.authority_fingerprint() then raise exception 'forbidden' using errcode='42501';end if; if old_receipt.action<>op$new$);
 definition:=replace(definition,'operation_receipts(actor,request_key,action,target,input,result)','operation_receipts(actor,request_key,action,target,input,result,access_fingerprint)');
 definition:=replace(definition,'values(auth.uid(),request_key,op,target,input,result);','values(auth.uid(),request_key,op,target,input,result,private.authority_fingerprint());');
 execute definition;
end;
$migration$;

-- Confirmed income has its own closed case; it never uses expenditure approval.
do $income_migration$
declare definition text;begin
 select pg_get_functiondef('private.operation_impl(text,uuid,jsonb,uuid)'::regprocedure) into definition;
 if position($old$doc:=private.new_document('INC',null,note,jsonb_build_object('amount',amount::text,'kind',op));$old$ in definition)=0 then raise exception 'Unexpected income implementation';end if;
 definition:=replace(definition,$old$doc:=private.new_document('INC',null,note,jsonb_build_object('amount',amount::text,'kind',op));$old$,$new$insert into public.financial_cases(organization_id,created_by,assigned_to,type,status,payload,period_id,category_id) select p.organization_id,auth.uid(),auth.uid(),'INCOME_RECORD','DRAFT',jsonb_build_object('amount',amount::text,'purpose',input->>'counterparty','basis',note,'confirmation',input->>'confirmation','proof',input->>'proof','kind',op),per.id,cat.id from public.profiles p where p.auth_user_id=auth.uid() returning * into c;
  doc:=private.new_document('INC',c.id,note,c.payload);
  update public.financial_cases set document_index=(select document_index from public.documents where documents.id=doc),status='CLOSED' where financial_cases.id=c.id;
  insert into public.case_versions(case_id,version,payload,author) values(c.id,1,c.payload,auth.uid());$new$);
 definition:=replace(definition,$old$insert into public.treasury_entries(period_id,category_id,document_id,kind,direction,amount,confirmation,counterparty,proof) values(per.id,cat.id,doc,$old$,$new$insert into public.treasury_entries(period_id,category_id,case_id,document_id,kind,direction,amount,confirmation,counterparty,proof) values(per.id,cat.id,c.id,doc,$new$);
 execute definition;
end;
$income_migration$;


do $balance_migration$
declare definition text;begin
 select pg_get_functiondef('private.operation_impl(text,uuid,jsonb,uuid)'::regprocedure) into definition;
 definition:=replace(definition,$old$e.created_at<per.start_date::timestamptz or (e.period_id=per.id and e.kind='OPENING')$old$,$new$(select p.start_date from public.budget_periods p where p.id=e.period_id)<per.start_date or (e.period_id=per.id and e.kind='OPENING')$new$);
 execute definition;
end;
$balance_migration$;


alter table public.financial_cases add column requested_amount bigint generated always as (nullif(payload->>'amount','')::bigint) stored;
create index cases_status_created_idx on public.financial_cases(status,created_at desc);
create index cases_amount_idx on public.financial_cases(requested_amount);
alter policy organizations_read on public.organizations using(private.session_allowed() and (id=(select organization_id from public.profiles where auth_user_id=(select auth.uid())) or private.has_permission('users.manage') or private.has_permission('cases.read_all')));

commit;
