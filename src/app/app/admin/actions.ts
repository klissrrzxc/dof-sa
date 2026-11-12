'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAccess } from '@/lib/auth';
import { roles } from '@/lib/access';
import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from '@/lib/config';
export async function inviteStaff(_previous: { message:string }, form:FormData):Promise<{ message:string }> {
  const { db } = await requireAccess('users.manage');
  const parsed = z.object({ email:z.email(), ic_name:z.string().trim().min(2).max(150), title:z.string().trim().min(2).max(200), organization_id:z.uuid(), assigned_role:z.enum(roles) }).safeParse(Object.fromEntries(form));
  if(!parsed.success) return { message:'Проверьте все поля приглашения.' };
  const config=supabaseConfig(), key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const origin=z.url().safeParse(process.env.APP_ORIGIN);
  if(!config || !key || !origin.success) return { message:'Сервис приглашений не настроен владельцем.' };
  const admin=createClient(config.url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const { email,...profile }=parsed.data;
  const {data,error}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:new URL('/auth/confirm',origin.data).toString()});
  if(error || !data.user) return { message:'Не удалось отправить приглашение. Проверьте SMTP и журнал Auth.' };
  const { error: provisionError }=await db.rpc('provision_staff',{target_user:data.user.id,...profile});
  if(provisionError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { message:'Назначение не создано. Приглашение отменено; проверьте полномочия и ведомство.' };
  }
  revalidatePath('/app/admin');
  return { message:'Приглашение отправлено. Пользователь должен принять его по электронной почте.' };
}
export async function changeRole(form: FormData) {
  const { db } = await requireAccess('users.manage');
  const data = z.object({ target_user:z.uuid(), new_role:z.enum(roles), reason:z.string().trim().min(5).max(1000) }).parse(Object.fromEntries(form));
  const { error } = await db.rpc('set_staff_role',data);
  if (error) throw new Error('Изменение назначения отклонено');
  revalidatePath('/app/admin');
}
export async function blockStaff(form: FormData) {
  const { db } = await requireAccess('users.manage');
  const data = z.object({ target_user:z.uuid(), reason:z.string().trim().min(5).max(1000) }).parse(Object.fromEntries(form));
  const { error } = await db.rpc('block_staff',data);
  if (error) throw new Error('Блокировка отклонена');
  revalidatePath('/app/admin');
}
