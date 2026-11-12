import { z } from 'zod';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
async function setPassword(form: FormData) {
  'use server';
  const password = z.string().min(12).max(128).parse(form.get('password'));
  const db = await supabase();
  const { data:{user} } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { error } = await db.auth.updateUser({ password });
  if (error) throw new Error('Не удалось установить пароль');
  redirect('/app');
}
export default async function PasswordPage() {
  const { data:{user} } = await (await supabase()).auth.getUser();
  if (!user) redirect('/login');
  return <main className="auth-card"><h1>Персональный пароль</h1><form action={setPassword} className="stack"><label>Новый пароль<input name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password"/></label><button>Установить пароль</button></form></main>;
}
