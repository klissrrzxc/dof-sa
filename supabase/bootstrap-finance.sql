-- One-time trusted owner operation. Fill UUID and actual delegation basis locally.
-- Adds a finance role without removing the system administrator role.
begin;
do $$declare person uuid:=null;reason text:='';begin
 if person is null or length(trim(reason))<5 then raise exception 'Fill existing Auth UUID and real delegation basis locally';end if;
 perform pg_advisory_xact_lock(2026111201);
 if exists(select 1 from public.role_assignments where role='finance_director' and revoked_at is null) then raise exception 'Initial director already appointed; use controlled delegation';end if;
 if not exists(select 1 from public.profiles where auth_user_id=person and status='active') then raise exception 'Active staff profile required';end if;
 insert into public.role_assignments(user_id,role,assigned_by) values(person,'finance_director',person);
 insert into public.permission_grants(user_id,permission,assigned_by,reason) select person,p,person,reason from unnest(array['cases.read_all','cases.review','finance.approve','treasury.reserve','treasury.execute','treasury.income','reports.approve','docs.manage']::public.permission_key[])p;
 insert into public.audit_events(actor,action,target,decision,attributes) values(person,'owner.initial_finance_director',person,'allowed',jsonb_build_object('basis',reason));
end;$$;
commit;
