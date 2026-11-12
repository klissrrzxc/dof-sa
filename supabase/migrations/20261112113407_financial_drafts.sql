begin;
create type public.case_type as enum ('FUNDING_REQUEST','PROCUREMENT_REQUEST','INCOME_RECORD');
create type public.case_status as enum ('DRAFT','SUBMITTED','UNDER_REVIEW','NEEDS_CLARIFICATION','APPROVED','EXECUTING','CLOSED','REJECTED','WITHDRAWN');
create table public.financial_cases (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  created_by uuid not null references public.profiles(auth_user_id), assigned_to uuid references public.profiles(auth_user_id),
  type public.case_type not null, status public.case_status not null default 'DRAFT',
  document_index text unique, payload jsonb not null default '{}',
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(jsonb_typeof(payload)='object'), check(octet_length(payload::text)<=65536),
  check(status='DRAFT' or document_index is not null)
);
create index cases_organization_created_idx on public.financial_cases(organization_id,created_at desc);
create index cases_assigned_idx on public.financial_cases(assigned_to,status);
create table public.case_versions (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.financial_cases(id),
  version integer not null check(version>0), payload jsonb not null, author uuid not null references public.profiles(auth_user_id),
  created_at timestamptz not null default now(), unique(case_id,version)
);
create table public.case_events (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.financial_cases(id),
  actor uuid not null references public.profiles(auth_user_id), event text not null,
  attributes jsonb not null default '{}', created_at timestamptz not null default now()
);
create index case_events_case_created_idx on public.case_events(case_id,created_at);
create table public.procurement_items (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.financial_cases(id),
  line_number integer not null check(line_number>0), name text not null,
  quantity bigint not null check(quantity>0), unit_price bigint not null check(unit_price>0),
  purpose text not null default '', division text not null default '',
  unique(case_id,line_number), check(quantity::numeric*unit_price<=9223372036854775807)
);
create function private.can_read_case(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.session_allowed() and exists(select 1 from public.financial_cases c where c.id=target and (
    (private.has_role('agency_representative') and c.organization_id=(select organization_id from public.profiles where auth_user_id=auth.uid()))
    or c.assigned_to=auth.uid() or private.has_permission('cases.read_all')
  ));
$$;
create function private.save_case_draft_impl(case_id uuid, expected_version integer, case_type public.case_type, case_payload jsonb)
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
    if current_case.status<>'DRAFT' then raise exception 'registered_case_is_immutable'; end if;
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
create function public.save_case_draft(case_id uuid, expected_version integer, case_type public.case_type, case_payload jsonb)
returns uuid language sql security invoker set search_path = '' as $$ select private.save_case_draft_impl(case_id,expected_version,case_type,case_payload); $$;

-- Deliberate DB gate. No API client, including direct REST RPC, can register a form before legal verification.
create function public.submit_case(case_id uuid) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.can_read_case(case_id) then raise exception 'forbidden' using errcode='42501'; end if;
  raise exception 'requires_verification: MOF-REQ-01 versus MOF-BFR-01 / MOF-PR-01; official filing channel not approved';
end;
$$;
alter table public.financial_cases enable row level security;
alter table public.case_versions enable row level security;
alter table public.case_events enable row level security;
alter table public.procurement_items enable row level security;
revoke all on public.financial_cases,public.case_versions,public.case_events,public.procurement_items from anon,authenticated;
grant select on public.financial_cases,public.case_versions,public.case_events,public.procurement_items to authenticated;
create policy cases_read on public.financial_cases for select to authenticated using(private.can_read_case(id));
create policy versions_read on public.case_versions for select to authenticated using(private.can_read_case(case_id));
create policy events_read on public.case_events for select to authenticated using(private.can_read_case(case_id));
create policy items_read on public.procurement_items for select to authenticated using(private.can_read_case(case_id));
revoke all on function private.can_read_case(uuid),private.save_case_draft_impl(uuid,integer,public.case_type,jsonb),public.save_case_draft(uuid,integer,public.case_type,jsonb),public.submit_case(uuid) from public,anon;
grant execute on function private.can_read_case(uuid),private.save_case_draft_impl(uuid,integer,public.case_type,jsonb),public.save_case_draft(uuid,integer,public.case_type,jsonb),public.submit_case(uuid) to authenticated;
commit;
