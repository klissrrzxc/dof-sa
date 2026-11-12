'use client';
import { useActionState, useState, useTransition } from 'react';
import { enrollMfa, verifyMfa, type MfaState } from '@/app/auth/mfa/actions';
export function MfaForm({ factorId }: { factorId?: string }) {
  const [initial,setInitial] = useState<MfaState>({ error:'', factorId });
  const [busy,start] = useTransition();
  const [state,action,pending] = useActionState(verifyMfa, initial);
  if (!initial.factorId) return <div className="stack"><p>Подключите приложение аутентификатора для служебного доступа.</p>{initial.error && <p role="alert">{initial.error}</p>}<button disabled={busy} onClick={()=>start(async()=>setInitial(await enrollMfa()))}>{busy?'Подготовка…':'Подключить MFA'}</button></div>;
  return <form action={action} className="stack">{initial.qr && <>
    {/* Auth returns a QR data URL. Render as image, never inject SVG markup. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img alt="QR-код подключения аутентификатора" width={220} height={220} src={initial.qr}/><p>Отсканируйте код приложением аутентификатора. Не передавайте его другим лицам.</p></>}
    <input type="hidden" name="factorId" value={initial.factorId}/><label>Одноразовый код<input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required/></label>{state.error && <p role="alert">{state.error}</p>}<button disabled={pending}>Подтвердить вход</button></form>;
}
