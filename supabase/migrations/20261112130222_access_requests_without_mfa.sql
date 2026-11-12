begin;
-- Owner-requested RP onboarding: password + administrator approval, no MFA requirement.
create or replace function private.mfa_required() returns boolean language sql stable security definer set search_path='' as $$select false;$$;
create or replace function private.session_allowed() returns boolean language sql stable security definer set search_path='' as $$select private.active_identity();$$;
create or replace function private.finance_permission(p public.permission_key) returns boolean language sql stable security definer set search_path='' as $$select private.has_permission(p) and (private.has_role('finance_officer') or private.has_role('finance_director'));$$;
alter table public.profiles add column static_id text unique,add column game_phone text not null default '',add column authority_level text not null default 'LEGACY',add column authority_document text not null default '';
alter table public.profiles add constraint static_id_format check(static_id is null or static_id~'^[1-9][0-9]{0,11}$');
create table public.access_requests(
 id uuid primary key default gen_random_uuid(),static_id text not null check(static_id~'^[1-9][0-9]{0,11}$'),
 ic_name text not null check(length(ic_name) between 3 and 150),game_phone text not null check(length(game_phone) between 3 and 40),organization_name text not null check(length(organization_name) between 2 and 200),
 requested_level text not null check(requested_level in ('REPRESENTATIVE','AGENCY_HEAD','FINANCE_OFFICER','FINANCE_DIRECTOR')),
 authority_document text not null default '',user_id uuid references auth.users(id) on delete set null,
 status text not null default 'CREATING' check(status in ('CREATING','PENDING','APPROVED','REJECTED','FAILED')),
 reviewed_by uuid references public.profiles(auth_user_id),review_note text,created_at timestamptz not null default now(),reviewed_at timestamptz
);
create unique index one_active_access_request on public.access_requests(static_id) where status in ('CREATING','PENDING','APPROVED');
create index access_request_user_idx on public.access_requests(user_id);
create index access_request_reviewer_idx on public.access_requests(reviewed_by);
create index access_request_queue_idx on public.access_requests(status,created_at);
alter table public.access_requests enable row level security;
revoke all on public.access_requests from public,anon,authenticated;
grant select on public.access_requests to authenticated;
create policy access_request_admin_read on public.access_requests for select to authenticated using(private.has_permission('users.manage'));
create table private.access_request_rates(fingerprint text not null,bucket timestamptz not null,count int not null,primary key(fingerprint,bucket));
alter table private.access_request_rates enable row level security;
revoke all on private.access_request_rates from public,anon,authenticated;
create policy access_rates_denied on private.access_request_rates for select to authenticated using(false);
create function private.reserve_access_impl(data jsonb,fingerprint text) returns jsonb language plpgsql security definer set search_path='' as $$
declare request_id uuid;count_value int;previous_user uuid;begin
 if current_setting('role',true)<>'service_role' then raise exception 'forbidden' using errcode='42501';end if;
 if fingerprint!~'^[a-f0-9]{64}$' or data is null or octet_length(data::text)>12000 or data ? 'password' then raise exception 'invalid_request';end if;
 perform pg_advisory_xact_lock(hashtextextended('access:'||coalesce(data->>'static_id',''),0));
 insert into private.access_request_rates values(fingerprint,date_trunc('hour',now()),1) on conflict on constraint access_request_rates_pkey do update set count=access_request_rates.count+1 returning count into count_value;
 if count_value>20 then raise exception 'request_rate_limit';end if;
 insert into private.access_request_rates values('GLOBAL',date_trunc('hour',now()),1) on conflict on constraint access_request_rates_pkey do update set count=access_request_rates.count+1 returning count into count_value;
 if count_value>200 then raise exception 'request_rate_limit';end if;
 if exists(select 1 from public.profiles where static_id=data->>'static_id') or exists(select 1 from public.access_requests where static_id=data->>'static_id' and status in ('CREATING','PENDING','APPROVED')) then return jsonb_build_object('create',false);end if;
 select r.user_id into previous_user from public.access_requests r where r.static_id=data->>'static_id' and r.status in ('REJECTED','FAILED') and not exists(select 1 from public.profiles where auth_user_id=r.user_id) order by created_at desc limit 1;
 insert into public.access_requests(static_id,ic_name,game_phone,organization_name,requested_level,authority_document)
 values(data->>'static_id',trim(data->>'ic_name'),trim(data->>'game_phone'),trim(data->>'organization_name'),data->>'requested_level',coalesce(data->>'authority_document','')) returning id into request_id;
 return jsonb_build_object('create',true,'id',request_id,'previous_user',previous_user);
end;$$;
create function public.reserve_access_request(data jsonb,fingerprint text) returns jsonb language sql security invoker set search_path='' as $$select private.reserve_access_impl(data,fingerprint);$$;
create function private.finish_access_impl(target uuid,auth_user uuid,successful boolean) returns void language plpgsql security definer set search_path='' as $$declare r public.access_requests;begin
 if current_setting('role',true)<>'service_role' then raise exception 'forbidden' using errcode='42501';end if;
 select * into r from public.access_requests where id=target for update;if r.id is null or r.status<>'CREATING' then raise exception 'request_not_pending';end if;
 if auth_user is not null and not exists(select 1 from auth.users where id=auth_user and email='id-'||r.static_id||'@users.dof-sa.invalid') then raise exception 'identity_mismatch';end if;
 if successful and auth_user is null then raise exception 'identity_required';end if;
 update public.access_requests set user_id=auth_user,status=case when successful then 'PENDING' else 'FAILED' end where id=r.id;
 insert into public.audit_events(action,target,decision) values('access.request_received',r.id,case when successful then 'pending' else 'failed' end);
end;$$;
create function public.finish_access_request(target uuid,auth_user uuid,successful boolean) returns void language sql security invoker set search_path='' as $$select private.finish_access_impl(target,auth_user,successful);$$;
create function private.access_status_impl() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('status',r.status,'note',case when r.status='REJECTED' then r.review_note else null end,'active',private.active_identity()) from public.access_requests r where auth.uid() is not null and r.user_id=auth.uid() order by r.created_at desc limit 1;
$$;
create function public.access_request_status() returns jsonb language sql stable security invoker set search_path='' as $$select private.access_status_impl();$$;
create function private.review_access_impl(target uuid,decision text,data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.access_requests;actual_role public.staff_role;level text:=data->>'level';p public.permission_key;grant_list public.permission_key[];begin
 if not private.has_permission('users.manage') then raise exception 'forbidden' using errcode='42501';end if;
 select * into r from public.access_requests where id=target for update;
 if r.id is null or r.status<>'PENDING' or r.user_id is null or r.user_id=auth.uid() then raise exception 'request_not_pending';end if;
 if length(trim(coalesce(data->>'note','')))<5 then raise exception 'review_note_required';end if;
 if decision='REJECT' then update public.access_requests set status='REJECTED',reviewed_by=auth.uid(),reviewed_at=now(),review_note=data->>'note' where id=r.id;
 elsif decision='APPROVE' then
  if data->>'confirmed'<>'true' or data->>'confirmed' is null then raise exception 'identity_confirmation_required';end if;
  if not exists(select 1 from public.organizations where id=(data->>'organization_id')::uuid and active) then raise exception 'organization_required';end if;
  if coalesce(length(trim(data->>'ic_name')),0) not between 3 and 150 or coalesce(length(trim(data->>'game_phone')),0) not between 3 and 40 or coalesce(length(trim(data->>'title')),0) not between 2 and 200 then raise exception 'profile_data_required';end if;
  if level in ('REPRESENTATIVE','AGENCY_HEAD') then actual_role:='agency_representative';grant_list:='{}';
  elsif level='FINANCE_OFFICER' then actual_role:='finance_officer';grant_list:=array['cases.read_all','cases.review','docs.manage']::public.permission_key[];
  elsif level='FINANCE_DIRECTOR' then
   if not private.has_role('finance_director') or not private.finance_permission('finance.approve') then raise exception 'financial_delegation_requires_director';end if;
   actual_role:='finance_director';grant_list:=array['cases.read_all','cases.review','finance.approve','treasury.reserve','treasury.execute','treasury.income','reports.approve','docs.manage']::public.permission_key[];
  elsif level='SYSTEM_ADMIN' then actual_role:='system_admin';grant_list:='{}';else raise exception 'invalid_level';end if;
  if level='REPRESENTATIVE' and coalesce(length(trim(data->>'authority_document')),0)<5 then raise exception 'authority_document_required';end if;
  insert into public.profiles(auth_user_id,ic_name,title,organization_id,status,static_id,game_phone,authority_level,authority_document)
   values(r.user_id,trim(data->>'ic_name'),trim(data->>'title'),(data->>'organization_id')::uuid,'active',r.static_id,trim(data->>'game_phone'),level,coalesce(data->>'authority_document',''));
  insert into public.role_assignments(user_id,role,assigned_by) values(r.user_id,actual_role,auth.uid());
  foreach p in array grant_list loop insert into public.permission_grants(user_id,permission,assigned_by,reason) values(r.user_id,p,auth.uid(),data->>'note');end loop;
  update public.access_requests set status='APPROVED',reviewed_by=auth.uid(),reviewed_at=now(),review_note=data->>'note' where id=r.id;
 else raise exception 'invalid_decision';end if;
 insert into public.audit_events(actor,action,target,decision,attributes) values(auth.uid(),'access.'||lower(decision),r.id,'allowed',jsonb_build_object('user_id',r.user_id,'level',level));
end;$$;
create function public.review_access_request(target uuid,decision text,data jsonb) returns void language sql security invoker set search_path='' as $$select private.review_access_impl(target,decision,data);$$;
grant usage on schema private to service_role;
revoke all on function private.reserve_access_impl(jsonb,text),public.reserve_access_request(jsonb,text),private.finish_access_impl(uuid,uuid,boolean),public.finish_access_request(uuid,uuid,boolean),private.access_status_impl(),public.access_request_status(),private.review_access_impl(uuid,text,jsonb),public.review_access_request(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.reserve_access_impl(jsonb,text),public.reserve_access_request(jsonb,text),private.finish_access_impl(uuid,uuid,boolean),public.finish_access_request(uuid,uuid,boolean) to service_role;
grant execute on function private.access_status_impl(),public.access_request_status(),private.review_access_impl(uuid,text,jsonb),public.review_access_request(uuid,text,jsonb) to authenticated;
-- A delegate cannot submit an agency request without the administrator-verified mandate.
do $migration$declare definition text;begin
 select pg_get_functiondef('private.operation_impl(text,uuid,jsonb,uuid)'::regprocedure) into definition;
 definition:=replace(definition,$old$ elsif op='case.submit' then$old$,$new$ elsif op='case.submit' then
  if exists(select 1 from public.profiles p where p.auth_user_id=auth.uid() and private.has_role('agency_representative') and p.authority_level<>'AGENCY_HEAD' and (length(trim(p.authority_document))<5 or c.payload->>'authority' is distinct from p.authority_document)) then raise exception 'authority_document_required';end if;
  if exists(select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.static_id is not null and c.payload->>'staticId' is distinct from p.static_id) then raise exception 'applicant_mismatch';end if;$new$);
 execute definition;
end;$migration$;
insert into public.audit_events(action,decision,attributes) values('system.access_requests_without_mfa','allowed','{"basis":"Owner explicitly requested password-based RP access requests with administrator approval and removal of MFA requirement"}');
commit;
