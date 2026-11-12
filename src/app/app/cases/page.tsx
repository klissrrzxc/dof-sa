import Link from 'next/link';
import { requireAccess } from '@/lib/auth';
import { formatMoney } from '@/lib/cases';
export default async function Cases({searchParams}:{searchParams:Promise<{q?:string;type?:string}>}) {
  const {db,access}=await requireAccess();
  const {q='',type=''}=await searchParams;
  let query=db.from('financial_cases').select('id,type,status,payload,version,created_at').order('created_at',{ascending:false}).limit(100);
  if(['FUNDING_REQUEST','PROCUREMENT_REQUEST'].includes(type)) query=query.eq('type',type);
  if(q.trim()) query=query.ilike('payload->>purpose','%'+q.trim().slice(0,100).replace(/[%_]/g,'')+'%');
  const {data,error}=await query;
  if(error) throw new Error('Реестр недоступен');
  return <><p className="eyebrow">FINANCIAL CASES</p><h1>Заявления</h1><p className="muted">Служебные черновики в пределах ваших полномочий. Показано не более 100 последних записей.</p>{access.roles.includes('agency_representative')&&<Link href="/app/cases/new">Создать черновик</Link>}<section className="card"><form className="form-grid"><label>Поиск по назначению<input name="q" defaultValue={q} maxLength={100}/></label><label>Тип<select name="type" defaultValue={type}><option value="">Все типы</option><option value="FUNDING_REQUEST">Финансирование</option><option value="PROCUREMENT_REQUEST">Закупка</option></select></label><button>Применить фильтры</button></form></section><section className="card">{!data?.length?<p>Заявлений по выбранным условиям нет.</p>:<div className="table-scroll"><table><thead><tr><th>Назначение</th><th>Тип</th><th>Сумма</th><th>Статус</th><th>Версия</th></tr></thead><tbody>{data.map(c=><tr key={c.id}><td><Link href={'/app/cases/'+c.id}>{c.payload.purpose||'Без назначения'}</Link></td><td>{c.type==='FUNDING_REQUEST'?'Финансирование':'Закупка'}</td><td>{formatMoney(c.payload.amount||'')}</td><td>{c.status==='DRAFT'?'Черновик':c.status}</td><td>{c.version}</td></tr>)}</tbody></table></div>}</section></>;
}
