begin;
alter policy documents_read on public.documents using((case_id is not null and private.can_read_case(case_id)) or (case_id is null and (private.treasury_read() or private.has_permission('docs.manage'))));
do $migration$
declare definition text;begin
 select pg_get_functiondef('private.operation_impl(text,uuid,jsonb,uuid)'::regprocedure) into definition;
 if position('if po.executed or po.cancelled or cm.paid<>0' in definition)=0 then raise exception 'Unexpected payment state guard';end if;
 definition:=replace(definition,'if po.executed or po.cancelled or cm.paid<>0',$new$if po.cancelled then raise exception 'order_cancelled';end if;if po.executed or cm.paid<>0$new$);
 execute definition;
end;
$migration$;
commit;
