create index profiles_organization_idx on public.profiles(organization_id);
create index roles_assigner_idx on public.role_assignments(assigned_by);
create index grants_assigner_idx on public.permission_grants(assigned_by);
create index audit_actor_idx on public.audit_events(actor);
create index cases_creator_idx on public.financial_cases(created_by);
create index case_versions_author_idx on public.case_versions(author);
create index case_events_actor_idx on public.case_events(actor);
