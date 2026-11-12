import Link from 'next/link';
import {z} from 'zod';
import {notFound} from 'next/navigation';
import {requireAccess} from '@/lib/auth';
import {allowed} from '@/lib/access';
import {CaseForm} from '@/components/case-form';
import {FileForm} from '@/components/file-form';
import {OperationForm} from '@/components/operation-form';
import {draftFields,formatMoney} from '@/lib/cases';
import {statusLabels,type Field} from '@/lib/operations';
export default async function CasePage({params}:{params:Promise<{id:string}>}){
 const {db,access}=await requireAccess();const {id}=await params;if(!z.uuid().safeParse(id).success)notFound();
 const {data:c,error}=await db.from('financial_cases').select('id,type,status,payload,version,created_by,document_index,period_id').eq('id',id).maybeSingle();
 if(error)throw new Error('Дело недоступно');if(!c)notFound();
 const results=await Promise.all([
  db.from('case_events').select('id,event,attributes,created_at').eq('case_id',id).order('created_at'),
  db.from('case_versions').select('id,version,payload,created_at').eq('case_id',id).order('version'),
  db.from('budget_periods').select('id,name').eq('closed',false),
  db.from('commitment_read').select('*').eq('case_id',id),
  db.from('documents').select('id,document_index,type,created_at').eq('case_id',id).order('created_at'),
  db.from('document_files').select('id,name,ready,created_at').eq('case_id',id),
  db.from('utilization_reports').select('id,status,explanation,proof,review_note,created_at').eq('case_id',id).order('created_at'),
  db.from('order_read').select('*'),
 ]);
 if(results.some(r=>r.error))throw new Error('Связанные записи недоступны');
 const [events,versions,periods,commitments,docs,files,reports,orders]=results;
 const own=c.created_by===access.id,editable=own&&['DRAFT','NEEDS_CLARIFICATION'].includes(c.status)&&access.roles.includes('agency_representative');
 const finance=access.roles.some(r=>r==='finance_officer'||r==='finance_director');const can=(p:Parameters<typeof allowed>[1])=>finance&&allowed(access,p);
 const commitment=commitments.data?.[0];const order=orders.data?.find(o=>o.commitment_id===commitment?.id&&!o.cancelled);
 const periodField:Field={name:'period_id',label:'Бюджетный период',type:'select',options:periods.data?.map(p=>({value:p.id,label:p.name}))};
 return <><p className="eyebrow">FINANCIAL CASE · {c.document_index||'DRAFT'}</p><h1>{c.payload.purpose||'Заявление'}</h1><p className="muted">{statusLabels[c.status]} · Версия {c.version} · {c.document_index||'Индекс будет присвоен при подаче'}</p>
 <nav className="case-tabs" aria-label="Разделы дела"><a href="#details">Сведения</a><a href="#review">Рассмотрение</a><a href="#execution">Исполнение</a><a href="#documents">Документы</a><a href="#history">История</a></nav>
 <div id="details">{editable?<CaseForm id={id} version={c.version} initial={{...c.payload,type:c.type}}/>:<section className="card"><h2>Сведения</h2><dl>{draftFields.filter(f=>c.payload[f.key]).map(f=><div key={f.key}><dt>{f.label}</dt><dd>{f.key==='amount'?formatMoney(c.payload[f.key]):c.payload[f.key]}</dd></div>)}</dl>{c.payload.items?.length>0&&<div className="table-scroll"><table><thead><tr><th>Позиция</th><th>Количество</th><th>Цена единицы</th></tr></thead><tbody>{(c.payload.items as {name:string;quantity:string;unitPrice:string}[]).map((item,i)=><tr key={i}><td>{item.name}</td><td>{item.quantity}</td><td>{formatMoney(item.unitPrice)}</td></tr>)}</tbody></table></div>}</section>}</div>
 {editable&&<section className="card"><h2>Подать заявление</h2><p>Подача регистрирует внутреннюю форму FMS. Она не означает согласование, резерв или выплату. Сначала сохраните текущие изменения.</p><OperationForm op="case.submit" target={id} title="Подать на рассмотрение" fields={[periodField,{name:'truth_confirmed',label:'Подтверждаю достоверность сведений и целевое использование',type:'checkbox'}]}/></section>}
 <section className="card" id="review"><h2>Рассмотрение</h2>{c.status==='SUBMITTED'&&can('cases.review')&&<OperationForm op="case.review" target={id} title="Принять к рассмотрению"/>}{c.status==='UNDER_REVIEW'&&can('cases.review')&&<OperationForm op="case.clarify" target={id} title="Запросить уточнения"/>}{c.status==='UNDER_REVIEW'&&can('finance.approve')&&access.roles.includes('finance_director')&&<><OperationForm op="case.approve" target={id} title="Утвердить решение" fields={[{name:'amount',label:'Утверждаемая сумма, целые доллары',value:c.payload.amount}]}/><hr/><OperationForm op="case.reject" target={id} title="Отклонить заявление"/></>}{own&&['SUBMITTED','UNDER_REVIEW','NEEDS_CLARIFICATION','APPROVED'].includes(c.status)&&!commitment&&<OperationForm op="case.withdraw" target={id} title="Отозвать заявление"/>}{!['SUBMITTED','UNDER_REVIEW'].includes(c.status)&&<p className="muted">Текущий статус: {statusLabels[c.status]}. Доступные действия определяются полномочиями и состоянием дела.</p>}</section>
 <section className="card" id="execution"><h2>Решение и исполнение</h2>{commitment&&<p>Обязательство: {formatMoney(commitment.amount)} · исполнено {formatMoney(commitment.paid)}{commitment.cancelled?' · отменено':''}</p>}{c.status==='APPROVED'&&!commitment&&can('treasury.reserve')&&<OperationForm op="commitment.reserve" target={id} title="Зарегистрировать обязательство и резерв"/>}{commitment&&!commitment.cancelled&&!order&&can('treasury.execute')&&<OperationForm op="order.create" target={commitment.id} title="Создать кассовый ордер"/>}{commitment&&!commitment.cancelled&&!order&&can('treasury.reserve')&&<OperationForm op="commitment.cancel" target={commitment.id} title="Отменить неисполненное обязательство"/>}{order&&<p>Ордер: {formatMoney(order.amount)} · {order.executed?'Исполнен':'Ожидает фактического перевода'}</p>}{order&&!order.executed&&can('treasury.execute')&&<><p className="notice">Сначала выполните реальный игровой перевод. Подтверждение ниже регистрирует уже совершённую операцию, оно не переводит деньги автоматически.</p><OperationForm op="order.execute" target={order.id} title="Подтвердить фактическое исполнение" fields={[{name:'confirmation',label:'Уникальный номер подтверждения перевода'},{name:'proof',label:'Ссылка / реквизиты доказательства перевода',type:'textarea'}]}/></>}
 {order&&!order.executed&&can('treasury.execute')&&can('finance.approve')&&<OperationForm op="order.cancel" target={order.id} title="Аннулировать неисполненный ордер"/>}
 {c.status==='EXECUTING'&&own&&<OperationForm op="report.utilization_submit" target={id} title="Подать отчёт о целевом использовании" fields={[{name:'amount',label:'Подтверждённо использованная сумма'},{name:'returned',label:'Возвращённый остаток',value:'0'},{name:'proof',label:'Документы и доказательства использования',type:'textarea'}]}/>}
 {reports.data?.map(r=><div className="card" key={r.id}><strong>{statusLabels[r.status]}</strong><p>{r.explanation}</p><p>{r.proof}</p>{r.review_note&&<p>Результат проверки: {r.review_note}</p>}</div>)}
 {c.status==='EXECUTING'&&can('reports.approve')&&access.roles.includes('finance_director')&&<><OperationForm op="report.utilization_accept" target={id} title="Принять последний отчёт"/><hr/><OperationForm op="report.utilization_return" target={id} title="Вернуть отчёт на доработку"/><hr/><OperationForm op="case.close" target={id} title="Закрыть исполненное дело"/></>}</section>
 <section className="card" id="documents"><h2>Документы и вложения</h2>{docs.data?.map(d=><p key={d.id}><Link href={'/app/documents/'+d.id}>{d.document_index}</Link> · {d.type}</p>)}{files.data?.filter(f=>f.ready).map(f=><p key={f.id}><a href={'/app/files/'+f.id}>{f.name}</a></p>)}{own&&['DRAFT','NEEDS_CLARIFICATION','EXECUTING'].includes(c.status)&&<FileForm caseId={id}/>}</section>
 <section className="card" id="history"><h2>История и версии</h2><p className="muted">Время UTC; RP-часовой пояс ещё не задан.</p>{events.data?.map(e=><p key={e.id}><time>{e.created_at}</time> · {e.event}{e.attributes.version?' · v'+e.attributes.version:''}{e.attributes.basis?' · '+e.attributes.basis:''}</p>)}{versions.data?.map(v=><details key={v.id}><summary>Редакция {v.version} · {v.created_at}</summary><dl>{draftFields.filter(f=>v.payload[f.key]).map(f=><div key={f.key}><dt>{f.label}</dt><dd>{v.payload[f.key]}</dd></div>)}</dl></details>)}</section></>;
}
