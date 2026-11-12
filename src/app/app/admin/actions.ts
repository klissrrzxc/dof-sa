'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAccess } from '@/lib/auth';
import { roles } from '@/lib/access';
export async function inviteStaff(_previous: { message:string }, form:FormData):Promise<{ message:string }> {
  const { db } = await requireAccess('users.manage');
  const parsed = z.object({ email:z.email(), ic_name:z.string().trim().min(2).max(150), title:z.string().trim().min(2).max(200), organization_id:z.uuid(), assigned_role:z.enum(roles) }).safeParse(Object.fromEntries(form));
  if(!parsed.success) return { message:'Проверьте все поля приглашения.' };
  const {error}=await db.functions.invoke('staff-invite',{body:parsed.data});
  if(error) return {message:'Приглашение не отправлено. Проверьте полномочия, настройки SMTP, лимит отправки или существующий аккаунт.'};
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
