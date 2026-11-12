import {NextResponse} from 'next/server';
import {forbidden} from 'next/navigation';
import {requireAccess} from '@/lib/auth';
import {allowed} from '@/lib/access';
import {csv} from '@/lib/csv';
export async function GET(_request:Request,{params}:{params:Promise<{type:string}>}){
 const {db,access}=await requireAccess();const {type}=await params;const cutoff=new Date().toISOString();let rows:unknown[][];
 if(type==='audit'){
  if(!allowed(access,'audit.read'))forbidden();rows=[['ID','Действие','Объект','Результат','UTC','Запрос']];
  for(let offset=0;offset<10000;offset+=1000){
   const {data,error}=await db.from('audit_events').select('id,action,target,decision,created_at,request_id').lte('created_at',cutoff).order('created_at').order('id').range(offset,offset+999);
   if(error)return new NextResponse('Export unavailable',{status:503});rows.push(...data.map(e=>[e.id,e.action,e.target,e.decision,e.created_at,e.request_id]));if(data.length<1000)break;
  }
 }else if(type==='treasury'){
  if(!access.roles.some(r=>['finance_director','finance_officer'].includes(r))||!access.permissions.some(p=>p.startsWith('treasury.')||['finance.approve','reports.approve'].includes(p)))forbidden();rows=[['ID','Тип','Направление','Сумма','Подтверждение','UTC']];
  for(let offset=0;offset<10000;offset+=1000){
   const {data,error}=await db.from('entry_read').select('*').lte('created_at',cutoff).order('created_at').order('id').range(offset,offset+999);
   if(error)return new NextResponse('Export unavailable',{status:503});rows.push(...data.map(e=>[e.id,e.kind,e.direction,e.amount,e.confirmation,e.created_at]));if(data.length<1000)break;
  }
 }else return new NextResponse('Not found',{status:404});
 return new NextResponse(csv(rows),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${type}.csv"`,'Cache-Control':'private, no-store'}});
}
