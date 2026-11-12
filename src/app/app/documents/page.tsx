import Link from 'next/link';
import {requireAccess} from '@/lib/auth';
export default async function Documents({searchParams}:{searchParams:Promise<{q?:string}>}){
 const {db}=await requireAccess();const {q=''}=await searchParams;let query=db.from('documents').select('id,document_index,type,basis,created_at').order('created_at',{ascending:false}).limit(100);if(q)query=query.ilike('document_index','%'+q.slice(0,60).replace(/[%_]/g,'')+'%');const {data,error}=await query;if(error)throw new Error('Архив недоступен');
 return <><p className="eyebrow">DOCUMENT REGISTER</p><h1>Документы</h1><section className="card"><form className="form-grid"><label>Поиск по индексу<input name="q" defaultValue={q} maxLength={60}/></label><button>Найти</button></form><div className="table-scroll"><table><thead><tr><th>Индекс</th><th>Тип</th><th>Основание</th><th>Дата UTC</th></tr></thead><tbody>{data?.map(d=><tr key={d.id}><td><Link href={'/app/documents/'+d.id}>{d.document_index}</Link></td><td>{d.type}</td><td>{d.basis}</td><td>{d.created_at}</td></tr>)}</tbody></table></div>{!data?.length&&<p>Доступных документов по этим условиям нет.</p>}</section></>;
}
