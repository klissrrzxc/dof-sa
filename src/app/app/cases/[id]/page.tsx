import { z } from 'zod';
import { notFound } from 'next/navigation';
import { requireAccess } from '@/lib/auth';
import { CaseForm } from '@/components/case-form';
import { draftFields,formatMoney } from '@/lib/cases';
export default async function CasePage({params}:{params:Promise<{id:string}>}) {
  const {db,access}=await requireAccess();const {id}=await params;
  if(!z.uuid().safeParse(id).success) notFound();
  const {data:c,error}=await db.from('financial_cases').select('id,type,status,payload,version,created_by').eq('id',id).maybeSingle();
  if(error) throw new Error('Дело недоступно');
  if(!c) notFound(); // Same response for absent and invisible UUIDs.
  const {data:events,error:eventError}=await db.from('case_events').select('id,event,attributes,created_at').eq('case_id',id).order('created_at');
  if(eventError) throw new Error('История недоступна');
  const editable=c.status==='DRAFT'&&c.created_by===access.id&&access.roles.includes('agency_representative');
  return <><p className="eyebrow">INTERNAL DRAFT · VERSION {c.version}</p><h1>{c.payload.purpose||'Черновик заявления'}</h1><p className="muted">UUID: {c.id}. Официальный индекс не присвоен.</p>{editable?<CaseForm id={id} version={c.version} initial={{...c.payload,type:c.type}}/>:<section className="card"><dl>{draftFields.map(f=><div key={f.key}><dt>{f.label}</dt><dd>{f.key==='amount'?formatMoney(c.payload[f.key]||''):c.payload[f.key]||'Не указано'}</dd></div>)}</dl></section>}<section className="card"><h2>История</h2><p className="muted">Время UTC. RP-часовой пояс ещё не утверждён.</p>{events?.map(e=><p key={e.id}><time>{e.created_at}</time> · Сохранена версия {e.attributes.version}</p>)}</section></>;
}
