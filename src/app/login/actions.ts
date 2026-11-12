'use server';
import { redirect } from 'next/navigation';
import {staticLoginEmail,staticIdSchema} from '@/lib/onboarding';
import { z } from 'zod';
import { supabase } from '@/lib/supabase/server';
import { supabaseConfig } from '@/lib/config';
export type LoginState = { error: string };
export async function login(_state: LoginState, form: FormData): Promise<LoginState> {
  const parsed = z.object({ email: z.string().trim().max(254).refine(v=>staticIdSchema.safeParse(v).success||z.email().safeParse(v).success), password: z.string().min(1).max(1024) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'Проверьте Static ID / email и пароль.' };
  if (!supabaseConfig()) return { error: 'Сервис входа ещё не настроен владельцем.' };
  const db = await supabase();
  const { error } = await db.auth.signInWithPassword({...parsed.data,email:staticIdSchema.safeParse(parsed.data.email).success?staticLoginEmail(parsed.data.email):parsed.data.email});
  if (error) return { error: 'Вход не выполнен. Проверьте данные или обратитесь к администратору.' };
  redirect('/app');
}
export async function logout() {
  if (supabaseConfig()) await (await supabase()).auth.signOut({ scope: 'local' });
  redirect('/login');
}
