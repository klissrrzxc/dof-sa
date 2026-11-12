import { Landmark, ShieldCheck } from 'lucide-react';
import { LoginForm } from '@/components/login-form';
import { supabaseConfig } from '@/lib/config';
import Link from 'next/link';
import { redirect } from 'next/navigation';
export default async function Login({searchParams}:{searchParams:Promise<{error_code?:string;code?:string}>}) {
  const {error_code,code}=await searchParams;
  if(code) redirect('/auth/callback?code='+encodeURIComponent(code));
  const configured = !!supabaseConfig();
  const expired=error_code==='otp_expired';
  return <main className="login-shell"><section className="login-brand"><Landmark size={46} strokeWidth={1.2}/><p className="eyebrow">STATE OF SAN ANDREAS</p><h1>Министерство<br/>финансов</h1><p className="subtitle">DEPARTMENT OF FINANCE</p><div className="gold-rule"/><p>Закрытая информационная система<br/>бюджетного и казначейского управления</p><small>DOF-SA FMS · СЛУЖЕБНЫЙ ДОСТУП</small></section>
    <section className="login-panel"><div className="login-inner"><span className="badge"><ShieldCheck size={15}/> RESTRICTED ACCESS</span><h2>Вход в рабочее пространство</h2><p className="muted">Используйте персональную учётную запись, выданную администратором.</p>{!configured && <p className="notice" role="status">Подключение сервиса авторизации не настроено. Вход станет доступен после настройки владельцем.</p>}{expired && <p className="notice" role="alert">Ссылка недействительна, истекла или уже использована. Получите новую ссылку для установки пароля.</p>}<LoginForm configured={configured}/><p><Link href="/auth/recover">Установить или восстановить пароль</Link></p><p className="login-foot">Доступ предоставляется по приглашению.<br/>Самостоятельная регистрация не предусмотрена.</p></div></section></main>;
}
