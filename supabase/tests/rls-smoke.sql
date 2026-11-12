-- Trusted owner only. Transactional fixtures are always rolled back.
-- This tests real PostgreSQL RLS, not GoTrue login or email delivery.
begin;
do $$
declare
  admin_id uuid:=gen_random_uuid(); agent_id uuid:=gen_random_uuid(); outsider_id uuid:=gen_random_uuid();
  org_a uuid:=gen_random_uuid(); org_b uuid:=gen_random_uuid(); draft_id uuid;
  visible_rows integer; access_granted boolean; rejected boolean;
begin
  insert into auth.users(id) values(admin_id),(agent_id),(outsider_id);
  insert into public.organizations(id,name,short_name,address,account_reference) values
    (org_a,'ROLLBACK TEST A',org_a::text,'TEST','TEST'),(org_b,'ROLLBACK TEST B',org_b::text,'TEST','TEST');
  insert into public.profiles(auth_user_id,ic_name,title,organization_id,status) values
    (admin_id,'ROLLBACK Test Admin','TEST',org_a,'active'),
    (agent_id,'ROLLBACK Test Agent','TEST',org_a,'active'),
    (outsider_id,'ROLLBACK Test Outsider','TEST',org_b,'active');
  insert into public.role_assignments(user_id,role,assigned_by) values
    (admin_id,'system_admin',admin_id),(agent_id,'agency_representative',admin_id),(outsider_id,'agency_representative',admin_id);

  perform set_config('request.jwt.claims',jsonb_build_object('sub',agent_id,'aal','aal1','role','authenticated')::text,true);
  execute 'set local role authenticated';
  select public.save_case_draft(null,0,'FUNDING_REQUEST','{"amount":"9007199254740993","purpose":"ROLLBACK TEST"}') into draft_id;
  if (select payload->>'amount' from public.financial_cases where id=draft_id)<>'9007199254740993' then raise exception 'money_precision_failed'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider_id,'aal','aal1','role','authenticated')::text,true);
  select count(*) into visible_rows from public.financial_cases where id=draft_id;
  if visible_rows<>0 then raise exception 'cross_organization_read'; end if;
  rejected:=false;
  begin perform public.save_case_draft(draft_id,1,'FUNDING_REQUEST','{}');
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'cross_organization_write'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'aal','aal1','role','authenticated')::text,true);
  select private.has_permission('users.manage') into access_granted;
  if access_granted then raise exception 'mfa_bypass'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'aal','aal2','role','authenticated')::text,true);
  select private.has_permission('finance.approve') into access_granted;
  if access_granted then raise exception 'implicit_financial_authority'; end if;
  rejected:=false;
  begin perform public.set_staff_role(admin_id,'finance_director','ROLLBACK TEST');
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'self_promotion'; end if;
  perform public.block_staff(outsider_id,'ROLLBACK TEST dismissal');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider_id,'aal','aal1','role','authenticated')::text,true);
  if public.my_access() is not null then raise exception 'blocked_jwt_access'; end if;
  execute 'reset role';
end;
$$;
rollback;
