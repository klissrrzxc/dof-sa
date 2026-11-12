'use server';
import { z } from 'zod';
import { headers } from 'next/headers';
import { supabase } from '@/lib/supabase/server';
import { supabaseConfig } from '@/lib/config';
export async function recoverPassword(_previous:{message:string},form:FormData):Promise<{message:string}> {
  const parsed=z.email().max(254).safeParse(form.get('email'));
  if(!parsed.success) return {message:'Укажите корректный адрес электронной почты.'};
  if(!supabaseConfig()) return {message:'Сервис авторизации ещё не настроен.'};
  const configured=new URL(process.env.APP_ORIGIN||'http://localhost:3000');
  const incoming=(await headers()).get('origin');
  let origin=configured.origin;
  if(incoming===configured.origin || (configured.protocol==='http:' && ['http://localhost:3000','http://127.0.0.1:3000'].includes(incoming||''))) origin=incoming!;
  const {error}=await (await supabase()).auth.resetPasswordForEmail(parsed.data,{redirectTo:origin+'/auth/callback'});
  if(error) return {message:'Запрос не выполнен или достигнут лимит отправки. Повторите позже; при повторной ошибке проверьте SMTP в Supabase.'};
  return {message:'Если адрес связан с учётной записью, на него придёт письмо для установки пароля. Откройте последнюю ссылку в этом же браузере. Не используйте старое приглашение.'};
}
