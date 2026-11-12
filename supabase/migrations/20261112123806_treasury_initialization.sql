begin;
alter table public.treasury_accounts add column initialized boolean not null default false;
update public.treasury_accounts set initialized=true where exists(select 1 from public.treasury_entries where kind='OPENING');
create or replace view public.treasury_account_read with(security_invoker=true) as select id,actual::text as actual,reserved::text as reserved,(actual-reserved)::text as available,initialized from public.treasury_accounts;
create unique index income_case_confirmation_unique on public.financial_cases((payload->>'confirmation')) where type='INCOME_RECORD';
do $migration$
declare definition text;begin
 select pg_get_functiondef('private.operation_impl(text,uuid,jsonb,uuid)'::regprocedure) into definition;
 if position($old$if not exists(select 1 from public.treasury_entries where kind='OPENING')$old$ in definition)=0 then raise exception 'Unexpected initialization guard';end if;
 definition:=replace(definition,$old$op not in ('report.utilization_submit','appropriation.set')$old$,$new$op not in ('report.utilization_submit','appropriation.set','treasury.opening')$new$);
 definition:=replace(definition,$old$  insert into public.financial_cases(organization_id,created_by,assigned_to,type,status,payload,period_id,category_id)$old$,$new$  if op='treasury.opening' and acc.initialized then raise exception 'already_initialized';end if;
  if op='treasury.income' and not acc.initialized then raise exception 'opening_balance_required';end if;
  insert into public.financial_cases(organization_id,created_by,assigned_to,type,status,payload,period_id,category_id)$new$);
 definition:=replace(definition,$old$  insert into public.treasury_entries(period_id,category_id,case_id,document_id,kind,direction,amount,confirmation,counterparty,proof) values(per.id,cat.id,c.id,doc,$old$,$new$  if amount>0 then insert into public.treasury_entries(period_id,category_id,case_id,document_id,kind,direction,amount,confirmation,counterparty,proof) values(per.id,cat.id,c.id,doc,$new$);
 definition:=replace(definition,$old$input->>'proof') returning treasury_entries.id into id;
  update public.treasury_accounts set actual=actual+amount where treasury_accounts.id=acc.id;$old$,$new$input->>'proof') returning treasury_entries.id into id;else id:=c.id;end if;
  update public.treasury_accounts set actual=actual+amount,initialized=true where treasury_accounts.id=acc.id;$new$);
 definition:=replace(definition,$old$if not exists(select 1 from public.treasury_entries where kind='OPENING')$old$,$new$if not exists(select 1 from public.treasury_accounts where initialized)$new$);
 execute definition;
end;
$migration$;
commit;
