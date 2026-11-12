'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { supabase } from '@/lib/supabase/server';
import { supabaseConfig } from '@/lib/config';
export type LoginState = { error: string };
export async function login(_state: LoginState, form: FormData): Promise<LoginState> {
  const parsed = z.object({ email: z.email().max(254), password: z.string().min(1).max(1024) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'Проверьте адрес электронной почты и пароль.' };
  if (!supabaseConfig()) return { error: 'Сервис входа ещё не настроен владельцем.' };
  const db = await supabase();
  const { error } = await db.auth.signInWithPassword(parsed.data);
  if (error) return { error: 'Вход не выполнен. Проверьте данные или обратитесь к администратору.' };
  redirect('/app');
}
export async function logout() {
  if (supabaseConfig()) await (await supabase()).auth.signOut({ scope: 'local' });
  redirect('/login');
}
