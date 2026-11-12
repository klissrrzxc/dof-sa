'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAccess } from '@/lib/auth';
import { draftSchema } from '@/lib/cases';
export async function saveDraft(_previous:{error:string},form:FormData):Promise<{error:string}> {
  const { db }=await requireAccess();
  let items:unknown;
  try { items=JSON.parse(String(form.get('items')||'[]')); } catch { return {error:'Некорректная спецификация закупки.'}; }
  const parsed=draftSchema.safeParse({...Object.fromEntries(form),items});
  if(!parsed.success) return {error:parsed.error.issues.map(i=>i.message).join('; ')};
  const id=z.union([z.literal(''),z.uuid()]).safeParse(form.get('id'));
  const version=z.coerce.number().int().min(0).safeParse(form.get('version'));
  if(!id.success || !version.success) return {error:'Некорректная версия черновика.'};
  const {type,...payload}=parsed.data;
  const {data,error}=await db.rpc('save_case_draft',{case_id:id.data||null,expected_version:version.data,case_type:type,case_payload:payload});
  if(error) return {error:error.message.includes('version_conflict')?'Черновик изменён в другой вкладке. Откройте актуальную версию.':'Сохранение отклонено. Проверьте полномочия и размер данных.'};
  revalidatePath('/app/cases');
  redirect('/app/cases/'+data);
}
