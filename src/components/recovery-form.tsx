'use client';
import { useActionState } from 'react';
import { recoverPassword } from '@/app/auth/recover/actions';
export function RecoveryForm(){
  const [state,action,pending]=useActionState(recoverPassword,{message:''});
  return <form action={action} className="stack"><label>Электронная почта<input name="email" type="email" autoComplete="email" maxLength={254} required/></label>{state.message&&<p className="notice" role="status">{state.message}</p>}<button disabled={pending}>{pending?'Отправка…':'Получить ссылку для установки пароля'}</button></form>;
}
