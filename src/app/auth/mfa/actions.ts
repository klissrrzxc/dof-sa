'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { requireIdentity } from '@/lib/auth';
export type MfaState = { error: string; factorId?: string; qr?: string };
export async function enrollMfa(): Promise<MfaState> {
  const { db } = await requireIdentity();
  const { data: factors } = await db.auth.mfa.listFactors();
  const existing = factors?.totp.find(f=>f.status==='verified');
  if (existing) return { error: '', factorId: existing.id };
  for (const f of factors?.all ?? []) if(f.status==='unverified') await db.auth.mfa.unenroll({ factorId:f.id });
  const { data, error } = await db.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'DOF-SA FMS' });
  return error ? { error:'Не удалось подготовить MFA. Повторите попытку.' } : { error:'', factorId:data.id, qr:data.totp.qr_code.startsWith('<')?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(data.totp.qr_code):data.totp.qr_code };
}
export async function verifyMfa(previous: MfaState, form: FormData): Promise<MfaState> {
  const parsed = z.object({ factorId:z.uuid(), code:z.string().regex(/^\d{6}$/) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ...previous, error:'Введите шестизначный код.' };
  const { db } = await requireIdentity();
  const { error } = await db.auth.mfa.challengeAndVerify(parsed.data);
  if (error) return { ...previous, error:'Код не принят. Проверьте время в приложении аутентификатора.' };
  redirect('/app');
}
