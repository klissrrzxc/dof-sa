'use client';
import { useActionState } from 'react';
import { login } from '@/app/login/actions';
export function LoginForm({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(login, { error: '' });
  return <form action={action} className="stack">
    <label>Static ID / email<input name="email" type="text" placeholder="Ваш Static ID" autoComplete="username" required maxLength={254} /></label>
    <label>Пароль<input name="password" type="password" autoComplete="current-password" required maxLength={1024} /></label>
    {state.error && <p role="alert" className="notice">{state.error}</p>}
    <button disabled={!configured || pending}>{pending ? 'Проверка…' : 'Войти в систему'}</button>
  </form>;
}
