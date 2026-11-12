import { requireIdentity } from '@/lib/auth';
import { MfaForm } from '@/components/mfa-form';
import { logout } from '@/app/login/actions';
export const dynamic = 'force-dynamic';
export default async function MfaPage() {
  const { db } = await requireIdentity();
  const { data } = await db.auth.mfa.listFactors();
  return <main className="auth-card"><p className="eyebrow">SECURITY VERIFICATION</p><h1>Подтверждение доступа</h1><MfaForm factorId={data?.totp.find(f=>f.status==='verified')?.id}/><form action={logout} className="actions"><button className="secondary">Выйти</button></form></main>;
}
