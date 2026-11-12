begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

create type public.staff_role as enum ('agency_representative','finance_officer','finance_director','system_admin');
create type public.staff_status as enum ('invited','active','blocked');
create type public.permission_key as enum ('cases.read_all','cases.review','finance.approve','treasury.reserve','treasury.execute','treasury.income','reports.approve','docs.manage','users.manage','audit.read','settings.manage');

create table public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 200),
  short_name text not null unique, address text not null, account_reference text not null,
  active boolean not null default true, created_at timestamptz not null default now()
);
create table public.profiles (
  auth_user_id uuid primary key references auth.users(id), ic_name text not null check(length(ic_name) between 2 and 150),
  title text not null, organization_id uuid not null references public.organizations(id),
  status public.staff_status not null default 'invited', created_at timestamptz not null default now()
);
create table public.role_assignments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(auth_user_id),
  role public.staff_role not null, assigned_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), expires_at timestamptz, revoked_at timestamptz,
  check (expires_at is null or expires_at > created_at), check (revoked_at is null or revoked_at >= created_at)
);
create index role_assignments_user_idx on public.role_assignments(user_id) where revoked_at is null;
create table public.permission_grants (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(auth_user_id),
  permission public.permission_key not null, assigned_by uuid not null references auth.users(id),
  reason text not null check(length(reason) >= 5), created_at timestamptz not null default now(),
  expires_at timestamptz, revoked_at timestamptz,
  check (expires_at is null or expires_at > created_at)
);
create index permission_grants_user_idx on public.permission_grants(user_id) where revoked_at is null;
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), actor uuid references auth.users(id), action text not null,
  target uuid, decision text not null, attributes jsonb not null default '{}',
  request_id uuid not null default gen_random_uuid(), created_at timestamptz not null default now()
);
create index audit_created_idx on public.audit_events(created_at desc);
create table public.system_settings (
  key text primary key, value jsonb not null, requires_verification boolean not null default true,
  source_url text, updated_at timestamptz not null default now()
);
insert into public.system_settings(key,value) values
 ('rp_timezone','null'), ('funding_form','{"status":"requires_verification","reason":"BFR-01 vs unified REQ-01"}'),
 ('procurement_form','{"status":"requires_verification","reason":"PR-01 vs unified REQ-01"}');

-- Identity is checked from auth.uid(), never user-editable metadata. Kept outside exposed schemas.
create function private.active_identity() returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p join public.organizations o on o.id=p.organization_id
    where p.auth_user_id=auth.uid() and p.status='active' and o.active
  );
$$;
create function private.has_role(wanted public.staff_role) returns boolean language sql stable security definer set search_path = '' as $$
  select private.active_identity() and exists(select 1 from public.role_assignments r
    where r.user_id=auth.uid() and r.role=wanted and r.revoked_at is null and (r.expires_at is null or r.expires_at>now()));
$$;
create function private.mfa_required() returns boolean language sql stable security definer set search_path = '' as $$
  select private.active_identity() and (
    exists(select 1 from public.role_assignments r where r.user_id=auth.uid() and r.role<>'agency_representative'
      and r.revoked_at is null and (r.expires_at is null or r.expires_at>now()))
    or exists(select 1 from public.permission_grants g where g.user_id=auth.uid() and g.revoked_at is null and (g.expires_at is null or g.expires_at>now()))
  );
$$;
create function private.session_allowed() returns boolean language sql stable security definer set search_path = '' as $$
  select private.active_identity() and (not private.mfa_required() or coalesce(auth.jwt()->>'aal','aal1')='aal2');
$$;
create function private.has_permission(wanted public.permission_key) returns boolean language sql stable security definer set search_path = '' as $$
  select private.session_allowed() and (
    (wanted in ('users.manage','audit.read','settings.manage') and private.has_role('system_admin'))
    or exists(select 1 from public.permission_grants g where g.user_id=auth.uid() and g.permission=wanted
      and g.revoked_at is null and (g.expires_at is null or g.expires_at>now()))
  );
$$;
create function private.my_access_impl() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',p.auth_user_id,'ic_name',p.ic_name,'title',p.title,'organization_id',p.organization_id,
    'roles',coalesce((select jsonb_agg(r.role) from public.role_assignments r where r.user_id=auth.uid()
      and r.revoked_at is null and (r.expires_at is null or r.expires_at>now())),'[]'::jsonb),
    'permissions',coalesce((select jsonb_agg(perm) from unnest(enum_range(null::public.permission_key)) perm
      where private.has_permission(perm)),'[]'::jsonb), 'mfa_required',private.mfa_required())
  from public.profiles p where p.auth_user_id=auth.uid() and private.active_identity();
$$;
create function public.my_access() returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.my_access_impl();
$$;

create function private.set_staff_role_impl(target_user uuid, new_role public.staff_role, reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_permission('users.manage') or auth.uid()=target_user then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if coalesce(length(trim(reason)),0)<5 then raise exception 'reason_required'; end if;
  perform 1 from public.profiles where auth_user_id=target_user for update;
  if not found then raise exception 'profile_not_found'; end if;
  update public.role_assignments set revoked_at=now() where user_id=target_user and revoked_at is null;
  insert into public.role_assignments(user_id,role,assigned_by) values(target_user,new_role,auth.uid());
  insert into public.audit_events(actor,action,target,decision,attributes)
    values(auth.uid(),'staff.role_assigned',target_user,'allowed',jsonb_build_object('role',new_role,'reason',reason));
end;
$$;
create function public.set_staff_role(target_user uuid, new_role public.staff_role, reason text)
returns void language sql security invoker set search_path = '' as $$ select private.set_staff_role_impl(target_user,new_role,reason); $$;
create function private.block_staff_impl(target_user uuid, reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_permission('users.manage') or auth.uid()=target_user then raise exception 'forbidden' using errcode='42501'; end if;
  if coalesce(length(trim(reason)),0)<5 then raise exception 'reason_required'; end if;
  update public.profiles set status='blocked' where auth_user_id=target_user;
  if not found then raise exception 'profile_not_found'; end if;
  insert into public.audit_events(actor,action,target,decision,attributes)
    values(auth.uid(),'staff.blocked',target_user,'allowed',jsonb_build_object('reason',reason));
end;
$$;
create function public.block_staff(target_user uuid, reason text) returns void language sql security invoker set search_path = '' as $$ select private.block_staff_impl(target_user,reason); $$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.role_assignments enable row level security;
alter table public.permission_grants enable row level security;
alter table public.audit_events enable row level security;
alter table public.system_settings enable row level security;
revoke all on public.profiles,public.organizations,public.role_assignments,public.permission_grants,public.audit_events,public.system_settings from anon,authenticated;
grant select on public.profiles,public.organizations,public.role_assignments,public.permission_grants,public.audit_events,public.system_settings to authenticated;
create policy profiles_read on public.profiles for select to authenticated using(private.session_allowed() and (auth_user_id=(select auth.uid()) or private.has_permission('users.manage')));
create policy organizations_read on public.organizations for select to authenticated using(private.session_allowed() and (id=(select organization_id from public.profiles where auth_user_id=(select auth.uid())) or private.has_permission('users.manage')));
create policy roles_read on public.role_assignments for select to authenticated using(private.session_allowed() and (user_id=(select auth.uid()) or private.has_permission('users.manage')));
create policy grants_read on public.permission_grants for select to authenticated using(private.session_allowed() and (user_id=(select auth.uid()) or private.has_permission('users.manage')));
create policy audit_read on public.audit_events for select to authenticated using(private.has_permission('audit.read'));
create policy settings_read on public.system_settings for select to authenticated using(private.has_permission('settings.manage'));

revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.active_identity(),private.has_role(public.staff_role),private.mfa_required(),private.session_allowed(),private.has_permission(public.permission_key),private.my_access_impl(),private.set_staff_role_impl(uuid,public.staff_role,text),private.block_staff_impl(uuid,text) to authenticated;
revoke all on function public.my_access(),public.set_staff_role(uuid,public.staff_role,text),public.block_staff(uuid,text) from public,anon;
grant execute on function public.my_access(),public.set_staff_role(uuid,public.staff_role,text),public.block_staff(uuid,text) to authenticated;

create function private.provision_staff_impl(target_user uuid, ic_name text, title text, organization_id uuid, assigned_role public.staff_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_permission('users.manage') or target_user=auth.uid() then raise exception 'forbidden' using errcode='42501'; end if;
  if length(trim(ic_name)) not between 2 and 150 or length(trim(title)) not between 2 and 200 then raise exception 'invalid_profile'; end if;
  if not exists(select 1 from public.organizations o where o.id=organization_id and o.active) then raise exception 'organization_not_active'; end if;
  insert into public.profiles(auth_user_id,ic_name,title,organization_id,status) values(target_user,trim(ic_name),trim(title),organization_id,'active');
  insert into public.role_assignments(user_id,role,assigned_by) values(target_user,assigned_role,auth.uid());
  insert into public.audit_events(actor,action,target,decision,attributes) values(auth.uid(),'staff.invited',target_user,'allowed',jsonb_build_object('role',assigned_role));
end;
$$;
create function public.provision_staff(target_user uuid, ic_name text, title text, organization_id uuid, assigned_role public.staff_role)
returns void language sql security invoker set search_path = '' as $$ select private.provision_staff_impl(target_user,ic_name,title,organization_id,assigned_role); $$;
revoke all on function private.provision_staff_impl(uuid,text,text,uuid,public.staff_role),public.provision_staff(uuid,text,text,uuid,public.staff_role) from public,anon;
grant execute on function private.provision_staff_impl(uuid,text,text,uuid,public.staff_role),public.provision_staff(uuid,text,text,uuid,public.staff_role) to authenticated;

-- Private bucket. No object policies until case/document authorisation is implemented.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('financial-documents','financial-documents',false,10485760,array['application/pdf','image/png','image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
commit;
