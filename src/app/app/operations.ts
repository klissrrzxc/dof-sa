'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAccess } from '@/lib/auth';
import { operationNames,operationError } from '@/lib/operations';
export type OperationState={message:string;ok:boolean;nextKey?:string};
export async function performOperation(_previous:OperationState,form:FormData):Promise<OperationState>{
 const {db}=await requireAccess();
 const parsed=z.object({op:z.enum(operationNames),target:z.union([z.uuid(),z.literal('')]),request_key:z.uuid()}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {ok:false,message:'Некорректный запрос. Обновите страницу.'};
 const {op,target,request_key}=parsed.data;const input:Record<string,string>={};
 for(const [key,value] of form.entries())if(!['op','target','request_key','$ACTION_REF_1','$ACTION_KEY'].includes(key)&&!key.startsWith('$ACTION_')){
  if(typeof value!=='string'||value.length>8000)return {ok:false,message:'Превышен допустимый размер поля.'};input[key]=value;
 }
 const {error}=await db.rpc('perform_operation',{op,target:target||null,input,request_key});
 if(error)return {ok:false,message:operationError(error.message)};
 revalidatePath('/app','layout');
 return {ok:true,message:'Операция зарегистрирована.',nextKey:crypto.randomUUID()};
}
