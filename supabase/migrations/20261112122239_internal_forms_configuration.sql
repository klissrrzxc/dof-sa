begin;
create policy receipts_denied on private.operation_receipts for select to authenticated using(false);
update public.system_settings set value='{"status":"internal_fms_v1","publication":"manual_when_required","layout":"new_internal_form"}',requires_verification=false,source_url='https://forum.santamaria-rp.com/threads/7249/',updated_at=now() where key='funding_form';
update public.system_settings set value='{"status":"internal_fms_v1","publication":"manual_when_required","layout":"new_internal_form"}',requires_verification=false,source_url='https://forum.santamaria-rp.com/threads/7253/',updated_at=now() where key='procurement_form';
insert into public.audit_events(action,decision,attributes) values('system.internal_forms_v1','allowed','{"basis":"Owner requested new internal FMS forms; statutory requirements remain in force; external publication is not automated"}');
commit;
