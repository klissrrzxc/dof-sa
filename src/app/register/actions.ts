'use server';
import {accessRequestSchema} from '@/lib/onboarding';
import {supabase} from '@/lib/supabase/server';
import {supabaseConfig} from '@/lib/config';
export async function requestAccess(_previous:{message:string;ok:boolean},form:FormData):Promise<{message:string;ok:boolean}>{
 if(form.get('company_url'))return {ok:true,message:'Заявка принята. После проверки администратором войдите по Static ID и своему паролю.'};
 const parsed=accessRequestSchema.safeParse(Object.fromEntries(form));
 if(!parsed.success)return {ok:false,message:parsed.error.issues.map(i=>i.path[0]==='password'?'Пароль: не менее 12 символов.':i.message).join('; ')};
 if(!supabaseConfig())return {ok:false,message:'Приём заявок временно недоступен.'};
 const {password_confirm,confirmed,...data}=parsed.data;void password_confirm;void confirmed;
 const {error}=await (await supabase()).functions.invoke('access-request',{body:data});
 if(error)return {ok:false,message:'Заявка не отправлена. Проверьте поля или повторите позже: число запросов ограничено.'};
 return {ok:true,message:'Заявка принята. Администратор проверит данные и назначит полномочия. Войти можно по Static ID и указанному паролю; до одобрения рабочие разделы закрыты.'};
}
