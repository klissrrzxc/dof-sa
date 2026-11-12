'use server';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {requireAccess} from '@/lib/auth';
export async function reviewAccess(_previous:{message:string;ok:boolean},form:FormData):Promise<{message:string;ok:boolean}>{
 const {db}=await requireAccess('users.manage');
 const parsed=z.object({target:z.uuid(),decision:z.enum(['APPROVE','REJECT']),note:z.string().trim().min(5).max(2000)}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {ok:false,message:'Укажите решение и пояснение (не менее пяти символов).'};
 const data:Record<string,string>={note:parsed.data.note};
 if(parsed.data.decision==='APPROVE'){
  const fields=z.object({ic_name:z.string().trim().min(3).max(150),game_phone:z.string().trim().min(3).max(40),title:z.string().trim().min(2).max(200),organization_id:z.uuid(),level:z.enum(['REPRESENTATIVE','AGENCY_HEAD','FINANCE_OFFICER','FINANCE_DIRECTOR','SYSTEM_ADMIN']),authority_document:z.string().trim().max(2000),confirmed:z.literal('true')}).safeParse(Object.fromEntries(form));
  if(!fields.success)return {ok:false,message:'Проверьте данные, выберите фактический уровень полномочий и подтвердите проверку.'};
  if(fields.data.level==='REPRESENTATIVE'&&fields.data.authority_document.length<5)return {ok:false,message:'Для представителя укажите проверенный приказ о полномочиях.'};
  Object.assign(data,fields.data);
 }
 const {error}=await db.rpc('review_access_request',{target:parsed.data.target,decision:parsed.data.decision,data});
 if(error)return {ok:false,message:error.message==='financial_delegation_requires_director'?'Финансовые полномочия может делегировать действующий руководитель Минфина.':'Решение не сохранено. Проверьте статус заявки и данные; повторное одобрение не допускается.'};
 revalidatePath('/app/admin');return {ok:true,message:parsed.data.decision==='APPROVE'?'Доступ одобрен. Пользователь входит со своим Static ID и паролем.':'Заявка отклонена.'};
}
