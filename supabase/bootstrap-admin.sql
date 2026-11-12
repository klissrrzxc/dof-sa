-- Run only as trusted project owner, after creating/inviting the Auth user.
-- Replace placeholders LOCALLY. Do not commit personal values.
begin;
do $$
declare
  owner_id uuid := null; -- required: existing auth.users UUID
  owner_ic text := '';  -- required: real RP name
  owner_title text := '';
  org_name text := '';
  org_short text := '';
  org_address text := '';
  org_account text := '';
  org_id uuid;
begin
  if owner_id is null or least(length(owner_ic),length(owner_title),length(org_name),length(org_short),length(org_address),length(org_account))=0 then
    raise exception 'Fill all bootstrap values locally';
  end if;
  perform pg_advisory_xact_lock(2026111201);
  if exists(select 1 from public.role_assignments where role='system_admin' and revoked_at is null) then raise exception 'Administrator already exists'; end if;
  insert into public.organizations(name,short_name,address,account_reference) values(org_name,org_short,org_address,org_account) returning id into org_id;
  insert into public.profiles(auth_user_id,ic_name,title,organization_id,status) values(owner_id,owner_ic,owner_title,org_id,'active');
  insert into public.role_assignments(user_id,role,assigned_by) values(owner_id,'system_admin',owner_id);
  insert into public.audit_events(actor,action,target,decision) values(owner_id,'owner.bootstrap',owner_id,'allowed');
end;
$$;
commit;
