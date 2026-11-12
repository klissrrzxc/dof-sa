begin;
create function private.case_file_impl(action text,target uuid,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare c public.financial_cases; f public.document_files; file_id uuid;begin
 if not private.session_allowed() then raise exception 'forbidden' using errcode='42501';end if;
 if action='begin' then
  select * into c from public.financial_cases where id=target;
  if c.id is null or c.created_by<>auth.uid() or not private.can_read_case(c.id) or c.status not in ('DRAFT','NEEDS_CLARIFICATION','EXECUTING') then raise exception 'forbidden' using errcode='42501';end if;
  if length(trim(coalesce(input->>'name','')))=0 or length(input->>'name')>180 or input->>'mime' not in ('application/pdf','image/png','image/jpeg') or coalesce(input->>'mime','')='' then raise exception 'unsupported_file';end if;
  file_id:=gen_random_uuid();
  insert into public.document_files(id,case_id,uploaded_by,name,mime,size,path) values(file_id,c.id,auth.uid(),input->>'name',input->>'mime',(input->>'size')::bigint,c.id::text||'/'||file_id::text) returning * into f;
 elsif action in ('complete','access') then
  select * into f from public.document_files where id=target for update;
  if f.id is null or not private.can_read_case(f.case_id) then raise exception 'forbidden' using errcode='42501';end if;
  if action='complete' then
   if f.uploaded_by<>auth.uid() or not exists(select 1 from storage.objects o where bucket_id='financial-documents' and o.name=f.path and (o.metadata->>'size')::bigint=f.size and o.metadata->>'mimetype'=f.mime) then raise exception 'file_upload_not_confirmed';end if;
   update public.document_files set ready=true where id=f.id;f.ready:=true;
  elsif not f.ready then raise exception 'file_not_ready';end if;
 else raise exception 'unknown_operation';end if;
 insert into public.audit_events(actor,action,target,decision) values(auth.uid(),'file.'||action,f.id,'allowed');
 return to_jsonb(f);
end;$$;
create function public.case_file(action text,target uuid,input jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.case_file_impl(action,target,input);$$;
create function private.file_storage_access(object_name text,write_access boolean) returns boolean language sql stable security definer set search_path='' as $$
 select private.session_allowed() and exists(select 1 from public.document_files f join public.financial_cases c on c.id=f.case_id where f.path=object_name and private.can_read_case(c.id) and (case when write_access then f.uploaded_by=auth.uid() and not f.ready and c.created_by=auth.uid() and c.status in ('DRAFT','NEEDS_CLARIFICATION','EXECUTING') else f.ready end));
$$;
revoke all on function private.case_file_impl(text,uuid,jsonb),public.case_file(text,uuid,jsonb),private.file_storage_access(text,boolean) from public,anon;
grant execute on function private.case_file_impl(text,uuid,jsonb),public.case_file(text,uuid,jsonb),private.file_storage_access(text,boolean) to authenticated;
create policy financial_files_insert on storage.objects for insert to authenticated with check(bucket_id='financial-documents' and private.file_storage_access(name,true));
create policy financial_files_select on storage.objects for select to authenticated using(bucket_id='financial-documents' and private.file_storage_access(name,false));
commit;
