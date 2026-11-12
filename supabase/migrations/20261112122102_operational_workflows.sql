begin;
create table public.budget_periods(id uuid primary key default gen_random_uuid(),name text not null,start_date date not null,end_date date not null,closed boolean not null default false,basis text not null,check(end_date>=start_date));
create table public.budget_categories(id uuid primary key default gen_random_uuid(),code text not null,name text not null,kind text not null check(kind in ('INCOME','EXPENSE')),source text not null,requires_verification boolean not null default true,version int not null default 1,unique(code,version));
create table public.treasury_accounts(id uuid primary key default gen_random_uuid(),singleton boolean not null default true unique check(singleton),actual bigint not null default 0 check(actual>=0),reserved bigint not null default 0 check(reserved>=0 and reserved<=actual));
insert into public.treasury_accounts default values;
create table public.appropriations(id uuid primary key default gen_random_uuid(),period_id uuid not null references public.budget_periods,category_id uuid not null references public.budget_categories,ceiling bigint not null check(ceiling>=0),reserved bigint not null default 0 check(reserved>=0),executed bigint not null default 0 check(executed>=0),basis text not null,unique(period_id,category_id),check(reserved+executed<=ceiling));
alter table public.financial_cases add column period_id uuid references public.budget_periods,add column category_id uuid references public.budget_categories;
create table public.case_decisions(id uuid primary key default gen_random_uuid(),case_id uuid not null references public.financial_cases,approved boolean not null,amount bigint not null check(amount>=0),basis text not null,actor uuid not null references public.profiles(auth_user_id),created_at timestamptz not null default now());
create table public.document_sequences(document_type text not null,year int not null,serial bigint not null check(serial>0),primary key(document_type,year));
create table public.documents(id uuid primary key default gen_random_uuid(),document_index text not null unique,type text not null,case_id uuid references public.financial_cases,author uuid not null references public.profiles(auth_user_id),basis text not null,content jsonb not null,created_at timestamptz not null default now());
create table public.document_versions(id uuid primary key default gen_random_uuid(),document_id uuid not null references public.documents,version int not null,content jsonb not null,created_at timestamptz not null default now(),unique(document_id,version));
create table public.commitments(id uuid primary key default gen_random_uuid(),case_id uuid not null unique references public.financial_cases,decision_id uuid not null references public.case_decisions,appropriation_id uuid not null references public.appropriations,document_id uuid not null references public.documents,amount bigint not null check(amount>0),paid bigint not null default 0 check(paid>=0 and paid<=amount),cancelled boolean not null default false);
create table public.payment_orders(id uuid primary key default gen_random_uuid(),commitment_id uuid not null unique references public.commitments,document_id uuid not null references public.documents,amount bigint not null check(amount>0),executed boolean not null default false);
create table public.treasury_entries(id uuid primary key default gen_random_uuid(),period_id uuid not null references public.budget_periods,category_id uuid not null references public.budget_categories,case_id uuid references public.financial_cases,order_id uuid unique references public.payment_orders,document_id uuid not null references public.documents,kind text not null check(kind in ('OPENING','INCOME','EXPENSE','REVERSAL')),direction int not null check(direction in(-1,1)),amount bigint not null check(amount>0),confirmation text not null unique,counterparty text not null,proof text not null,reverses uuid unique references public.treasury_entries,created_at timestamptz not null default now());
create unique index one_opening_entry on public.treasury_entries(kind) where kind='OPENING';
create table public.utilization_reports(id uuid primary key default gen_random_uuid(),case_id uuid not null references public.financial_cases,author uuid not null references public.profiles(auth_user_id),spent bigint not null check(spent>=0),returned bigint not null check(returned>=0),proof text not null,explanation text not null,status text not null default 'SUBMITTED' check(status in ('SUBMITTED','RETURNED','ACCEPTED')),review_note text,created_at timestamptz not null default now());
create table public.public_report_drafts(id uuid primary key default gen_random_uuid(),period_id uuid not null references public.budget_periods,document_id uuid references public.documents,status text not null default 'DRAFT' check(status in ('DRAFT','READY_FOR_REVIEW','APPROVED','EXPORTED')),snapshot jsonb not null,content_hash text not null,bbcode text not null,created_by uuid not null references public.profiles(auth_user_id),created_at timestamptz not null default now(),publication_url text);
create table public.public_report_approvals(id uuid primary key default gen_random_uuid(),report_id uuid not null unique references public.public_report_drafts,actor uuid not null references public.profiles(auth_user_id),content_hash text not null,created_at timestamptz not null default now());
create table private.operation_receipts(actor uuid not null,request_key uuid not null,action text not null,target uuid,input jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(actor,request_key));
alter table private.operation_receipts enable row level security;
revoke all on private.operation_receipts from public,anon,authenticated;
create table public.document_files(id uuid primary key default gen_random_uuid(),case_id uuid not null references public.financial_cases,uploaded_by uuid not null references public.profiles(auth_user_id),name text not null,mime text not null,size bigint not null check(size>0 and size<=10485760),path text not null unique,ready boolean not null default false,created_at timestamptz not null default now());

create function private.finance_permission(p public.permission_key) returns boolean language sql stable security definer set search_path='' as $$select private.has_permission(p) and coalesce(auth.jwt()->>'aal','')='aal2' and (private.has_role('finance_officer') or private.has_role('finance_director'));$$;
create function private.treasury_read() returns boolean language sql stable security definer set search_path='' as $$select private.session_allowed() and (private.finance_permission('treasury.reserve') or private.finance_permission('treasury.execute') or private.finance_permission('treasury.income') or private.finance_permission('finance.approve') or private.finance_permission('reports.approve'));$$;
create function private.new_document(t text,c uuid,b text,body jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare n bigint;y int:=extract(year from now() at time zone 'UTC');d uuid;begin
 if not private.session_allowed() then raise exception 'forbidden' using errcode='42501';end if;
 insert into public.document_sequences values(t,y,1) on conflict(document_type,year) do update set serial=document_sequences.serial+1 returning serial into n;
 insert into public.documents(document_index,type,case_id,author,basis,content) values('MOF-'||t||'-'||y||'-'||lpad(n::text,greatest(4,length(n::text)),'0'),t,c,auth.uid(),b,body) returning id into d;
 insert into public.document_versions(document_id,version,content) values(d,1,body);return d;end;$$;
create function private.operation_impl(op text,target uuid,input jsonb,request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.financial_cases; cm public.commitments; po public.payment_orders; ap public.appropriations; acc public.treasury_accounts; per public.budget_periods;cat public.budget_categories;dec public.case_decisions;ur public.utilization_reports;rr public.public_report_drafts;ent public.treasury_entries;
 id uuid; doc uuid; amount bigint; total numeric; rev bigint;field text; note text:=trim(coalesce(input->>'basis','')); result jsonb;old_receipt private.operation_receipts;begin
 if not private.session_allowed() then raise exception 'forbidden' using errcode='42501';end if;
 if request_key is null or input is null or jsonb_typeof(input)<>'object' or octet_length(input::text)>65536 then raise exception 'invalid_request';end if;
 if exists(select 1 from jsonb_each(input) e where jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>8000) then raise exception 'invalid_input_type';end if;
 perform pg_advisory_xact_lock(2026111202);
 select * into old_receipt from private.operation_receipts r where r.actor=auth.uid() and r.request_key=operation_impl.request_key;
 if found then if old_receipt.action<>op or old_receipt.target is distinct from target or old_receipt.input<>input then raise exception 'idempotency_conflict';end if;return old_receipt.result;end if;
 if (select count(*) from private.operation_receipts r where r.actor=auth.uid() and r.created_at>now()-interval '1 minute')>=60 then raise exception 'rate_limit';end if;
 if length(note)<5 then raise exception 'basis_required';end if;
 if input ? 'amount' then if coalesce(input->>'amount','')!~'^(0|[1-9][0-9]{0,18})$' then raise exception 'positive_integer_amount_required';end if;amount:=(input->>'amount')::bigint;if amount=0 and op not in ('report.utilization_submit','appropriation.set') then raise exception 'positive_integer_amount_required';end if;end if;
 if op like 'case.%' or op like 'report.utilization_%' then select * into c from public.financial_cases where financial_cases.id=target for update;if not found or not private.can_read_case(target) then raise exception 'forbidden' using errcode='42501';end if;end if;
 if op='organization.save' then
  if not private.has_permission('users.manage') then raise exception 'forbidden' using errcode='42501';end if;
  foreach field in array array['name','short_name','address','account_reference'] loop if length(trim(coalesce(input->>field,'')))=0 then raise exception 'required_field:%',field;end if;end loop;
  if target is null then insert into public.organizations(name,short_name,address,account_reference) values(input->>'name',input->>'short_name',input->>'address',input->>'account_reference') returning organizations.id into id;
  else update public.organizations set name=input->>'name',short_name=input->>'short_name',address=input->>'address',account_reference=input->>'account_reference' where organizations.id=target returning organizations.id into id;if not found then raise exception 'not_found';end if;end if;
 elsif op in ('permission.grant','permission.revoke') then
  if not private.has_permission('users.manage') or target=auth.uid() then raise exception 'forbidden' using errcode='42501';end if;
  if input->>'permission' in ('finance.approve','treasury.reserve','treasury.execute','treasury.income','reports.approve') and not (private.has_role('finance_director') and private.finance_permission('finance.approve')) then raise exception 'financial_delegation_requires_director';end if;
  if op='permission.grant' then insert into public.permission_grants(user_id,permission,assigned_by,reason,expires_at) values(target,(input->>'permission')::public.permission_key,auth.uid(),note,(nullif(input->>'expires_at',''))::timestamptz) returning permission_grants.id into id;
  else update public.permission_grants set revoked_at=now() where user_id=target and permission=(input->>'permission')::public.permission_key and revoked_at is null;id:=target;end if;
 elsif op='category.create' then
  if not private.has_permission('settings.manage') then raise exception 'forbidden' using errcode='42501';end if;
  foreach field in array array['code','name','kind','source'] loop if length(trim(coalesce(input->>field,'')))=0 then raise exception 'required_field:%',field;end if;end loop;
  insert into public.budget_categories(code,name,kind,source,requires_verification,version) values(input->>'code',input->>'name',input->>'kind',input->>'source',not coalesce((input->>'verified')::boolean,false),coalesce((input->>'version')::int,1)) returning budget_categories.id into id;
 elsif op='period.create' then
  if not private.has_permission('settings.manage') then raise exception 'forbidden' using errcode='42501';end if;
  if exists(select 1 from public.budget_periods where start_date<=(input->>'end_date')::date and end_date>=(input->>'start_date')::date) then raise exception 'period_overlap';end if;
  insert into public.budget_periods(name,start_date,end_date,basis) values(input->>'name',(input->>'start_date')::date,(input->>'end_date')::date,note) returning budget_periods.id into id;
 elsif op='period.close' then
  if not private.finance_permission('finance.approve') or not private.has_role('finance_director') then raise exception 'forbidden' using errcode='42501';end if;
  if exists(select 1 from public.appropriations where period_id=target and reserved>0) then raise exception 'active_commitments';end if;
  update public.budget_periods set closed=true where budget_periods.id=target returning budget_periods.id into id;
 elsif op='appropriation.set' then
  if not private.finance_permission('finance.approve') or not private.has_role('finance_director') then raise exception 'forbidden' using errcode='42501';end if;
  select * into per from public.budget_periods where budget_periods.id=(input->>'period_id')::uuid for update;if not found or per.closed then raise exception 'period_closed_or_missing';end if;
  select * into cat from public.budget_categories where budget_categories.id=(input->>'category_id')::uuid;if not found or cat.kind<>'EXPENSE' or cat.requires_verification then raise exception 'category_requires_verification';end if;
  if amount is null then raise exception 'amount_required';end if;
  select a.ceiling into total from public.appropriations a where a.period_id=per.id and a.category_id=cat.id;total:=coalesce(total,0);
  insert into public.appropriations(period_id,category_id,ceiling,basis) values(per.id,cat.id,amount,note) on conflict(period_id,category_id) do update set ceiling=excluded.ceiling,basis=excluded.basis returning appropriations.id into id;
  insert into public.appropriation_changes(appropriation_id,before_amount,after_amount,basis,actor) values(id,total::bigint,amount,note,auth.uid());
  doc:=private.new_document('RES',null,note,jsonb_build_object('appropriation_id',id,'before',total::text,'after',amount::text));
 elsif op in ('treasury.opening','treasury.income') then
  if not private.finance_permission('treasury.income') then raise exception 'forbidden' using errcode='42501';end if;
  foreach field in array array['confirmation','counterparty','proof'] loop if length(trim(coalesce(input->>field,'')))<2 then raise exception 'required_field:%',field;end if;end loop;
  if amount is null then raise exception 'amount_required';end if;
  select * into per from public.budget_periods where budget_periods.id=(input->>'period_id')::uuid for update;if not found or per.closed then raise exception 'period_closed_or_missing';end if;
  select * into cat from public.budget_categories where budget_categories.id=(input->>'category_id')::uuid;if not found or cat.requires_verification or cat.kind<>'INCOME' then raise exception 'category_requires_verification';end if;
  select * into acc from public.treasury_accounts for update;
  doc:=private.new_document('INC',null,note,jsonb_build_object('amount',amount::text,'kind',op));
  insert into public.treasury_entries(period_id,category_id,document_id,kind,direction,amount,confirmation,counterparty,proof) values(per.id,cat.id,doc,case when op='treasury.opening' then 'OPENING' else 'INCOME' end,1,amount,input->>'confirmation',input->>'counterparty',input->>'proof') returning treasury_entries.id into id;
  update public.treasury_accounts set actual=actual+amount where treasury_accounts.id=acc.id;
 elsif op='case.submit' then
  if c.created_by<>auth.uid() or not private.has_role('agency_representative') or c.status not in ('DRAFT','NEEDS_CLARIFICATION') then raise exception 'invalid_case_transition';end if;
  if coalesce(input->>'truth_confirmed','')<>'true' then raise exception 'truth_confirmation_required';end if;
  foreach field in array array['agencyName','agencyAddress','agencyAccount','applicantName','applicantTitle','phone','basis','basisNumber','categoryCode','categoryName','amount','purpose','justification','recipient','recipientAccount','paymentPurpose'] loop if length(trim(coalesce(c.payload->>field,'')))=0 then raise exception 'required_field:%',field;end if;end loop;
  if not exists(select 1 from public.organizations o where o.id=c.organization_id and o.name=c.payload->>'agencyName' and o.address=c.payload->>'agencyAddress' and o.account_reference=c.payload->>'agencyAccount' and length(o.address)>0 and length(o.account_reference)>0) then raise exception 'agency_details_mismatch';end if;
  if not exists(select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.ic_name=c.payload->>'applicantName' and p.title=c.payload->>'applicantTitle') then raise exception 'applicant_mismatch';end if;
  select * into per from public.budget_periods where budget_periods.id=(input->>'period_id')::uuid;if not found or per.closed then raise exception 'period_closed_or_missing';end if;
  select * into cat from public.budget_categories where code=c.payload->>'categoryCode' and kind='EXPENSE' order by version desc limit 1;if not found or cat.requires_verification then raise exception 'category_requires_verification';end if;
  if c.type='PROCUREMENT_REQUEST' then
   foreach field in array array['staticId','division','authority','custodian','custodianStaticId','custodianTitle','custodianDivision','custodianAgency','supplier','supplierAddress','supplierRepresentative','supplierStaticId','supplierAccount','priceJustification','interestDisclosure'] loop if length(trim(coalesce(c.payload->>field,'')))=0 then raise exception 'required_field:%',field;end if;end loop;
   if coalesce(c.payload->>'staticId','')!~'^[0-9]+$' or coalesce(c.payload->>'custodianStaticId','')!~'^[0-9]+$' or coalesce(c.payload->>'supplierStaticId','')!~'^[0-9]+$' then raise exception 'static_id_required';end if;
   if not exists(select 1 from public.document_files where case_id=c.id and ready) then raise exception 'procurement_documents_required';end if;
   select sum(quantity::numeric*unit_price) into total from public.procurement_items where case_id=c.id;if total is null or total<>(c.payload->>'amount')::bigint then raise exception 'procurement_total_mismatch';end if;
  end if;
  if c.document_index is null then doc:=private.new_document(case when c.type='FUNDING_REQUEST' then 'BFR' else 'PR' end,c.id,note,c.payload);else select documents.id into doc from public.documents where document_index=c.document_index;insert into public.document_versions(document_id,version,content) select doc,coalesce(max(version),0)+1,c.payload from public.document_versions where document_id=doc;end if;
  update public.financial_cases set status='SUBMITTED',document_index=(select document_index from public.documents where documents.id=doc),period_id=per.id,category_id=cat.id,updated_at=now() where financial_cases.id=c.id;id:=c.id;
 elsif op in ('case.review','case.clarify','case.approve','case.reject','case.withdraw') then
  if op='case.withdraw' then
   if c.created_by<>auth.uid() or c.status not in ('SUBMITTED','UNDER_REVIEW','NEEDS_CLARIFICATION','APPROVED') or exists(select 1 from public.commitments where case_id=c.id) then raise exception 'withdrawal_not_permitted';end if;
   update public.financial_cases set status='WITHDRAWN' where financial_cases.id=c.id;
  elsif op in ('case.review','case.clarify') then
   if not private.finance_permission('cases.review') then raise exception 'forbidden' using errcode='42501';end if;
   if (op='case.review' and c.status<>'SUBMITTED') or (op='case.clarify' and c.status<>'UNDER_REVIEW') then raise exception 'invalid_case_transition';end if;
   update public.financial_cases set status=case when op='case.review' then 'UNDER_REVIEW'::public.case_status else 'NEEDS_CLARIFICATION'::public.case_status end,assigned_to=auth.uid() where financial_cases.id=c.id;
  else
   if not private.finance_permission('finance.approve') or not private.has_role('finance_director') then raise exception 'forbidden' using errcode='42501';end if;
   if c.status<>'UNDER_REVIEW' then raise exception 'invalid_case_transition';end if;
   if op='case.approve' and (amount is null or amount>(c.payload->>'amount')::bigint) then raise exception 'invalid_approved_amount';end if;
   insert into public.case_decisions(case_id,approved,amount,basis,actor) values(c.id,op='case.approve',case when op='case.approve' then amount else 0 end,note,auth.uid()) returning case_decisions.id into id;
   doc:=private.new_document('RES',c.id,note,jsonb_build_object('decision',op,'amount',case when op='case.approve' then amount::text else '0' end));
   update public.financial_cases set status=case when op='case.approve' then 'APPROVED'::public.case_status else 'REJECTED'::public.case_status end where financial_cases.id=c.id;
  end if;id:=c.id;
 elsif op='commitment.reserve' then
  if not private.finance_permission('treasury.reserve') or not private.can_read_case(target) then raise exception 'forbidden' using errcode='42501';end if;
  select * into c from public.financial_cases where financial_cases.id=target for update;if c.status<>'APPROVED' then raise exception 'invalid_case_transition';end if;
  select * into per from public.budget_periods where budget_periods.id=c.period_id;if not found or per.closed then raise exception 'period_closed_or_missing';end if;
  select * into dec from public.case_decisions where case_id=c.id and approved order by created_at desc limit 1;if not found then raise exception 'decision_required';end if;
  select * into acc from public.treasury_accounts for update;
  select * into ap from public.appropriations where period_id=c.period_id and category_id=c.category_id for update;
  if not found or dec.amount>acc.actual-acc.reserved or dec.amount>ap.ceiling-ap.executed-ap.reserved then raise exception 'insufficient_available_funds';end if;
  doc:=private.new_document('COM',c.id,note,jsonb_build_object('amount',dec.amount::text));
  insert into public.commitments(case_id,decision_id,appropriation_id,document_id,amount) values(c.id,dec.id,ap.id,doc,dec.amount) returning commitments.id into id;
  update public.treasury_accounts set reserved=reserved+dec.amount where treasury_accounts.id=acc.id;update public.appropriations set reserved=reserved+dec.amount where appropriations.id=ap.id;
 elsif op in ('order.create','order.execute') then
  if not private.finance_permission('treasury.execute') then raise exception 'forbidden' using errcode='42501';end if;
  if op='order.create' then select * into cm from public.commitments where commitments.id=target for update;
  else select * into po from public.payment_orders where payment_orders.id=target for update;select * into cm from public.commitments where commitments.id=po.commitment_id for update;end if;
  if cm.id is null or cm.cancelled or not private.can_read_case(cm.case_id) then raise exception 'forbidden' using errcode='42501';end if;
  select * into c from public.financial_cases where financial_cases.id=cm.case_id;
  select * into per from public.budget_periods where budget_periods.id=c.period_id;if per.closed then raise exception 'period_closed_or_missing';end if;
  if op='order.create' then
   if cm.paid<>0 then raise exception 'already_paid';end if;
   doc:=private.new_document('CO',c.id,note,jsonb_build_object('amount',cm.amount::text));
   insert into public.payment_orders(commitment_id,document_id,amount) values(cm.id,doc,cm.amount) returning payment_orders.id into id;
  else
   if po.executed or cm.paid<>0 then raise exception 'already_paid';end if;
   foreach field in array array['confirmation','proof'] loop if length(trim(coalesce(input->>field,'')))<2 then raise exception 'required_field:%',field;end if;end loop;
   select * into acc from public.treasury_accounts for update;select * into ap from public.appropriations where appropriations.id=cm.appropriation_id for update;
   doc:=private.new_document('EXP',c.id,note,jsonb_build_object('amount',po.amount::text,'proof',input->>'proof'));
   insert into public.treasury_entries(period_id,category_id,case_id,order_id,document_id,kind,direction,amount,confirmation,counterparty,proof) values(c.period_id,c.category_id,c.id,po.id,doc,'EXPENSE',-1,po.amount,input->>'confirmation',c.payload->>'recipient',input->>'proof') returning treasury_entries.id into id;
   update public.treasury_accounts set actual=actual-po.amount,reserved=reserved-po.amount where treasury_accounts.id=acc.id;
   update public.appropriations set reserved=reserved-po.amount,executed=executed+po.amount where appropriations.id=ap.id;
   update public.commitments set paid=commitments.amount where commitments.id=cm.id;update public.payment_orders set executed=true where payment_orders.id=po.id;
   update public.financial_cases set status='EXECUTING' where financial_cases.id=c.id;
  end if;
 elsif op='commitment.cancel' then
  if not private.finance_permission('treasury.reserve') then raise exception 'forbidden' using errcode='42501';end if;
  select * into cm from public.commitments where commitments.id=target for update;
  if cm.id is null or not private.can_read_case(cm.case_id) or cm.paid>0 or cm.cancelled or exists(select 1 from public.payment_orders where commitment_id=cm.id) then raise exception 'cancellation_not_permitted';end if;
  select * into ap from public.appropriations where appropriations.id=cm.appropriation_id for update;
  select * into per from public.budget_periods where budget_periods.id=ap.period_id;if per.closed then raise exception 'period_closed_or_missing';end if;
  update public.treasury_accounts set reserved=reserved-cm.amount;update public.appropriations set reserved=reserved-cm.amount where appropriations.id=ap.id;
  update public.commitments set cancelled=true where commitments.id=cm.id;update public.financial_cases set status='WITHDRAWN' where financial_cases.id=cm.case_id;id:=cm.id;
 elsif op in ('treasury.return','treasury.reverse') then
  if not private.finance_permission('treasury.execute') or not private.finance_permission('finance.approve') then raise exception 'forbidden' using errcode='42501';end if;
  select * into ent from public.treasury_entries where treasury_entries.id=target for update;
  if ent.id is null or ent.kind='REVERSAL' or (op='treasury.return' and ent.kind<>'EXPENSE') or (op='treasury.reverse' and ent.kind not in ('INCOME','OPENING')) then raise exception 'correction_not_permitted';end if;
  if amount is null or amount>ent.amount or (op='treasury.reverse' and amount<>ent.amount) then raise exception 'invalid_correction_amount';end if;
  foreach field in array array['confirmation','proof'] loop if length(trim(coalesce(input->>field,'')))<2 then raise exception 'required_field:%',field;end if;end loop;
  select * into per from public.budget_periods where budget_periods.id=ent.period_id;if per.closed then raise exception 'period_closed_or_missing';end if;
  select * into acc from public.treasury_accounts for update;
  if op='treasury.return' then
   select * into c from public.financial_cases where financial_cases.id=ent.case_id for update;
   if c.status<>'EXECUTING' or not private.can_read_case(c.id) then raise exception 'correction_not_permitted';end if;
   select * into cm from public.commitments where case_id=c.id;
   update public.treasury_accounts set actual=actual+amount where treasury_accounts.id=acc.id;
   update public.appropriations set executed=executed-amount where appropriations.id=cm.appropriation_id;
  else
   if acc.actual-acc.reserved<amount then raise exception 'insufficient_available_funds';end if;
   update public.treasury_accounts set actual=actual-amount where treasury_accounts.id=acc.id;
  end if;
  doc:=private.new_document('RES',ent.case_id,note,jsonb_build_object('corrects',ent.id,'amount',amount::text,'proof',input->>'proof'));
  insert into public.treasury_entries(period_id,category_id,case_id,document_id,kind,direction,amount,confirmation,counterparty,proof,reverses) values(ent.period_id,ent.category_id,ent.case_id,doc,'REVERSAL',-ent.direction,amount,input->>'confirmation',ent.counterparty,input->>'proof',ent.id) returning treasury_entries.id into id;
 elsif op='report.utilization_submit' then
  if c.created_by<>auth.uid() or c.status<>'EXECUTING' then raise exception 'invalid_case_transition';end if;
  if amount is null or length(trim(coalesce(input->>'proof','')))<2 then raise exception 'report_proof_required';end if;
  select * into cm from public.commitments where case_id=c.id;
  rev:=coalesce(nullif(input->>'returned',''),'0')::bigint;
  if rev<0 or amount+rev<>cm.paid then raise exception 'report_total_mismatch';end if;
  if rev<>coalesce((select sum(e.amount) from public.treasury_entries e where e.case_id=c.id and e.kind='REVERSAL' and e.direction=1),0) then raise exception 'return_requires_confirmed_correction';end if;
  insert into public.utilization_reports(case_id,author,spent,returned,proof,explanation) values(c.id,auth.uid(),amount,rev,input->>'proof',note) returning utilization_reports.id into id;
  doc:=private.new_document('FUR',c.id,note,jsonb_build_object('spent',amount::text,'returned',rev::text,'proof',input->>'proof'));
 elsif op in ('report.utilization_accept','report.utilization_return') then
  if not private.finance_permission('reports.approve') or not private.has_role('finance_director') then raise exception 'forbidden' using errcode='42501';end if;
  select * into ur from public.utilization_reports where case_id=c.id order by created_at desc limit 1 for update;
  if ur.id is null or ur.status<>'SUBMITTED' then raise exception 'report_required';end if;
  update public.utilization_reports set status=case when op='report.utilization_accept' then 'ACCEPTED' else 'RETURNED' end,review_note=note where utilization_reports.id=ur.id;id:=ur.id;
 elsif op='case.close' then
  if not private.finance_permission('reports.approve') or not private.has_role('finance_director') then raise exception 'forbidden' using errcode='42501';end if;
  if c.status<>'EXECUTING' or not exists(select 1 from public.utilization_reports where case_id=c.id and status='ACCEPTED') or not exists(select 1 from public.commitments where case_id=c.id and paid=commitments.amount and not cancelled) then raise exception 'accepted_report_and_execution_required';end if;
  update public.financial_cases set status='CLOSED' where financial_cases.id=c.id;id:=c.id;
 elsif op='report.generate' then
  if not private.treasury_read() then raise exception 'forbidden' using errcode='42501';end if;
  select * into per from public.budget_periods where budget_periods.id=target;if not found then raise exception 'period_required';end if;
  if not exists(select 1 from public.treasury_entries where kind='OPENING') then raise exception 'opening_balance_required';end if;
  select jsonb_build_object('period',per.name,'start',per.start_date,'end',per.end_date,
   'opening',coalesce((select sum(e.amount::numeric*e.direction) from public.treasury_entries e where e.created_at<per.start_date::timestamptz or (e.period_id=per.id and e.kind='OPENING')),0)::text,
   'income',coalesce(sum(t.amount) filter(where t.kind='INCOME'),0)::text,
   'expense',coalesce(sum(t.amount) filter(where t.kind='EXPENSE'),0)::text,
   'corrections',coalesce(sum(t.amount::numeric*t.direction) filter(where t.kind='REVERSAL'),0)::text,
   'net',coalesce(sum(t.amount::numeric*t.direction) filter(where t.kind<>'OPENING'),0)::text,
   'active_reserved',coalesce((select sum(a.reserved) from public.appropriations a where a.period_id=per.id),0)::text,'snapshot_at',now()) into result from public.treasury_entries t where t.period_id=per.id;
  result:=result||jsonb_build_object('closing',((result->>'opening')::numeric+(result->>'net')::numeric)::text);
  insert into public.public_report_drafts(period_id,snapshot,content_hash,bbcode,created_by) values(per.id,result,encode(sha256(convert_to(result::text,'UTF8')),'hex'),'[b]DEPARTMENT OF FINANCE[/b]'||chr(10)||'[b]Период:[/b] '||replace(replace(per.name,'[','('),']',')')||chr(10)||'Начальный баланс: $'||(result->>'opening')||chr(10)||'Подтверждённые поступления: $'||(result->>'income')||chr(10)||'Кассовые расходы: $'||(result->>'expense')||chr(10)||'Подтверждённые корректировки: $'||(result->>'corrections')||chr(10)||'Итоговый баланс: $'||(result->>'closing')||chr(10)||'Действующие резервы на дату формирования: $'||(result->>'active_reserved'),auth.uid()) returning public_report_drafts.id into id;
 elsif op in ('report.review','report.approve','report.export') then
  if not private.treasury_read() then raise exception 'forbidden' using errcode='42501';end if;
  select * into rr from public.public_report_drafts where public_report_drafts.id=target for update;if not found then raise exception 'not_found';end if;
  if op='report.review' then if rr.status<>'DRAFT' then raise exception 'invalid_report_transition';end if;update public.public_report_drafts set status='READY_FOR_REVIEW' where public_report_drafts.id=rr.id;
  elsif op='report.approve' then
   if not private.finance_permission('reports.approve') or not private.has_role('finance_director') then raise exception 'forbidden' using errcode='42501';end if;
   if rr.status<>'READY_FOR_REVIEW' then raise exception 'invalid_report_transition';end if;
   if exists(select 1 from private.operation_receipts r where r.created_at>rr.created_at and (r.action like 'treasury.%' or r.action like 'commitment.%' or r.action='order.execute')) then raise exception 'report_stale_regenerate';end if;
   doc:=private.new_document('RPT',null,note,rr.snapshot);
   insert into public.public_report_approvals(report_id,actor,content_hash) values(rr.id,auth.uid(),rr.content_hash);
   update public.public_report_drafts set status='APPROVED',document_id=doc where public_report_drafts.id=rr.id;
  else if rr.status<>'APPROVED' then raise exception 'approval_required';end if;update public.public_report_drafts set status='EXPORTED',publication_url=nullif(input->>'publication_url','') where public_report_drafts.id=rr.id;end if;id:=rr.id;
 else raise exception 'unknown_operation';end if;
 result:=jsonb_build_object('id',id,'document_id',doc);
 insert into public.audit_events(actor,action,target,decision,attributes,request_id) values(auth.uid(),op,coalesce(target,id),'allowed',jsonb_build_object('basis',note,'result',result),request_key);
 if c.id is not null then insert into public.case_events(case_id,actor,event,attributes) values(c.id,auth.uid(),op,jsonb_build_object('basis',note,'result',result));end if;
 insert into private.operation_receipts(actor,request_key,action,target,input,result) values(auth.uid(),request_key,op,target,input,result);
 return result;
end;$$;
create function public.perform_operation(op text,target uuid,input jsonb,request_key uuid) returns jsonb language sql security invoker set search_path='' as $$select private.operation_impl(op,target,input,request_key);$$;
create or replace function public.submit_case(case_id uuid) returns void language plpgsql security invoker set search_path='' as $$begin raise exception 'use_perform_operation_with_period_and_truth_confirmation';end;$$;
revoke all on function private.finance_permission(public.permission_key),private.treasury_read(),private.new_document(text,uuid,text,jsonb),private.operation_impl(text,uuid,jsonb,uuid),public.perform_operation(text,uuid,jsonb,uuid) from public,anon;
grant execute on function private.finance_permission(public.permission_key),private.treasury_read(),private.operation_impl(text,uuid,jsonb,uuid),public.perform_operation(text,uuid,jsonb,uuid) to authenticated;
do $$declare t text;begin foreach t in array array['budget_periods','budget_categories','treasury_accounts','appropriations','case_decisions','documents','document_versions','commitments','payment_orders','treasury_entries','utilization_reports','public_report_drafts','public_report_approvals','document_sequences','document_files'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);end loop;end;$$;
create policy periods_read on public.budget_periods for select to authenticated using(private.session_allowed());
create policy categories_read on public.budget_categories for select to authenticated using(private.session_allowed());
create policy account_read on public.treasury_accounts for select to authenticated using(private.treasury_read());
create policy appropriation_read on public.appropriations for select to authenticated using(private.treasury_read());
create policy decisions_read on public.case_decisions for select to authenticated using(private.can_read_case(case_id));
create policy documents_read on public.documents for select to authenticated using((case_id is not null and private.can_read_case(case_id)) or (case_id is null and private.treasury_read()) or private.has_permission('docs.manage'));
create policy versions_read on public.document_versions for select to authenticated using(exists(select 1 from public.documents where documents.id=document_id));
create policy commitments_read on public.commitments for select to authenticated using(private.can_read_case(case_id));
create policy orders_read on public.payment_orders for select to authenticated using(exists(select 1 from public.commitments where commitments.id=commitment_id));
create policy entries_read on public.treasury_entries for select to authenticated using(private.treasury_read() or (case_id is not null and private.can_read_case(case_id)));
create policy utilization_read on public.utilization_reports for select to authenticated using(private.can_read_case(case_id));
create policy reports_read on public.public_report_drafts for select to authenticated using(private.treasury_read());
create policy approvals_read on public.public_report_approvals for select to authenticated using(private.treasury_read());
create policy files_read on public.document_files for select to authenticated using(private.can_read_case(case_id));
create view public.treasury_account_read with(security_invoker=true) as select id,actual::text as actual,reserved::text as reserved,(actual-reserved)::text as available from public.treasury_accounts;
create view public.appropriation_read with(security_invoker=true) as select id,period_id,category_id,ceiling::text as ceiling,reserved::text as reserved,executed::text as executed,(ceiling-reserved-executed)::text as available,basis from public.appropriations;
create view public.commitment_read with(security_invoker=true) as select id,case_id,document_id,amount::text as amount,paid::text as paid,cancelled from public.commitments;
create view public.order_read with(security_invoker=true) as select id,commitment_id,document_id,amount::text as amount,executed from public.payment_orders;
create view public.entry_read with(security_invoker=true) as select id,period_id,case_id,document_id,kind,direction,amount::text as amount,confirmation,counterparty,proof,created_at from public.treasury_entries;
grant select on public.treasury_account_read,public.appropriation_read,public.commitment_read,public.order_read,public.entry_read to authenticated;
revoke all on public.treasury_account_read,public.appropriation_read,public.commitment_read,public.order_read,public.entry_read from anon;
-- Cover every new FK without changing application privileges.
do $$declare r record;begin for r in select conrelid::regclass as tbl,conname,att.attname from pg_constraint con join pg_namespace ns on ns.oid=con.connamespace join pg_attribute att on att.attrelid=con.conrelid and att.attnum=con.conkey[1] where con.contype='f' and ns.nspname='public' and cardinality(con.conkey)=1 and not exists(select 1 from pg_index i where i.indrelid=con.conrelid and i.indkey[0]=con.conkey[1]) loop execute format('create index %I on %s(%I)',r.conname||'_idx',r.tbl,r.attname);end loop;end;$$;
create or replace function private.save_case_draft_impl(case_id uuid, expected_version integer, case_type public.case_type, case_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  org_id uuid;
  result_id uuid;
  current_case public.financial_cases;
  revision integer;
  amount text;
  item jsonb;
  line integer:=0;
begin
  if not private.session_allowed() or not private.has_role('agency_representative') then raise exception 'forbidden' using errcode='42501'; end if;
  if case_type='INCOME_RECORD' then raise exception 'income_requires_treasury_procedure'; end if;
  if case_payload is null or jsonb_typeof(case_payload)<>'object' or octet_length(case_payload::text)>65536 then raise exception 'invalid_payload'; end if;
  if expected_version is null or expected_version<0 then raise exception 'invalid_version'; end if;
  if exists(select 1 from jsonb_each(case_payload) e where e.key<>'items' and (jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>2000)) then raise exception 'invalid_field_type'; end if;
  if case_payload ? 'items' and jsonb_typeof(case_payload->'items')<>'array' then raise exception 'invalid_items'; end if;
  if jsonb_array_length(coalesce(case_payload->'items','[]'::jsonb))>100 then raise exception 'too_many_items'; end if;
  amount:=case_payload->>'amount';
  if amount is not null and amount<>'' then
    if amount !~ '^[1-9][0-9]{0,18}$' then raise exception 'invalid_amount'; end if;
    perform amount::bigint; -- overflow is rejected; never cast to float.
  end if;
  select organization_id into org_id from public.profiles where auth_user_id=auth.uid();
  if case_id is null then
    if expected_version<>0 then raise exception 'version_conflict'; end if;
    insert into public.financial_cases(organization_id,created_by,type,payload)
      values(org_id,auth.uid(),case_type,case_payload) returning id,version into result_id,revision;
  else
    select * into current_case from public.financial_cases where id=case_id for update;
    if not found or current_case.created_by<>auth.uid() or current_case.organization_id<>org_id then raise exception 'forbidden' using errcode='42501'; end if;
    if current_case.status not in ('DRAFT','NEEDS_CLARIFICATION') then raise exception 'registered_case_is_immutable'; end if;
    if current_case.status='NEEDS_CLARIFICATION' and current_case.type<>case_type then raise exception 'case_type_is_fixed';end if;
    if current_case.version<>expected_version then raise exception 'version_conflict'; end if;
    update public.financial_cases set payload=case_payload,type=case_type,version=version+1,updated_at=now()
      where id=case_id returning id,version into result_id,revision;
  end if;
  delete from public.procurement_items where procurement_items.case_id=result_id;
  if case_type='PROCUREMENT_REQUEST' then
    for item in select * from jsonb_array_elements(coalesce(case_payload->'items','[]'::jsonb)) loop
      if jsonb_typeof(item)<>'object' or exists(select 1 from jsonb_each(item) e where jsonb_typeof(e.value)<>'string')
        or coalesce(item->>'quantity','') !~ '^[1-9][0-9]{0,8}$' or coalesce(item->>'unitPrice','') !~ '^[1-9][0-9]{0,18}$'
        or coalesce(length(item->>'name'),0)=0 then raise exception 'invalid_item'; end if;
      line:=line+1;
      insert into public.procurement_items(case_id,line_number,name,quantity,unit_price,purpose,division)
        values(result_id,line,item->>'name',(item->>'quantity')::bigint,(item->>'unitPrice')::bigint,coalesce(item->>'purpose',''),coalesce(item->>'division',''));
    end loop;
  end if;
  insert into public.case_versions(case_id,version,payload,author) values(result_id,revision,case_payload,auth.uid());
  insert into public.case_events(case_id,actor,event,attributes) values(result_id,auth.uid(),'draft.saved',jsonb_build_object('version',revision));
  insert into public.audit_events(actor,action,target,decision,attributes) values(auth.uid(),'case.draft_saved',result_id,'allowed',jsonb_build_object('version',revision));
  return result_id;
end;
$$;
commit;
