begin;
alter table public.payment_orders add column cancelled boolean not null default false;
alter table public.payment_orders add constraint order_execution_not_cancelled check(not(executed and cancelled));
alter table public.payment_orders drop constraint payment_orders_commitment_id_key;
create unique index one_active_order_per_commitment on public.payment_orders(commitment_id) where not cancelled;
create or replace view public.order_read with(security_invoker=true) as select id,commitment_id,document_id,amount::text as amount,executed,cancelled from public.payment_orders;
do $migration$
declare definition text;begin
 select pg_get_functiondef('private.operation_impl(text,uuid,jsonb,uuid)'::regprocedure) into definition;
 if position($old$ elsif op in ('order.create','order.execute') then$old$ in definition)=0 then raise exception 'Unexpected order implementation';end if;
 definition:=replace(definition,$old$ elsif op in ('order.create','order.execute') then$old$,$new$ elsif op='order.cancel' then
  if not private.finance_permission('treasury.execute') or not private.finance_permission('finance.approve') then raise exception 'forbidden' using errcode='42501';end if;
  select * into po from public.payment_orders where payment_orders.id=target for update;
  select * into cm from public.commitments where commitments.id=po.commitment_id for update;
  if po.id is null or po.executed or po.cancelled or not private.can_read_case(cm.case_id) then raise exception 'cancellation_not_permitted';end if;
  select * into c from public.financial_cases where financial_cases.id=cm.case_id;
  select * into per from public.budget_periods where budget_periods.id=c.period_id;if per.closed then raise exception 'period_closed_or_missing';end if;
  update public.payment_orders set cancelled=true where payment_orders.id=po.id;
  doc:=private.new_document('RES',c.id,note,jsonb_build_object('cancelled_order',po.id,'cash_movement','none'));id:=po.id;
 elsif op in ('order.create','order.execute') then$new$);
 definition:=replace(definition,'if po.executed or cm.paid<>0','if po.executed or po.cancelled or cm.paid<>0');
 definition:=replace(definition,'exists(select 1 from public.payment_orders where commitment_id=cm.id)','exists(select 1 from public.payment_orders where commitment_id=cm.id and not cancelled)');
 execute definition;
end;
$migration$;
commit;
