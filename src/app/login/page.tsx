import { Landmark, ShieldCheck } from 'lucide-react';
import { LoginForm } from '@/components/login-form';
import { supabaseConfig } from '@/lib/config';
export default function Login() {
  const configured = !!supabaseConfig();
  return <main className="login-shell"><section className="login-brand"><Landmark size={46} strokeWidth={1.2}/><p className="eyebrow">STATE OF SAN ANDREAS</p><h1>Министерство<br/>финансов</h1><p className="subtitle">DEPARTMENT OF FINANCE</p><div className="gold-rule"/><p>Закрытая информационная система<br/>бюджетного и казначейского управления</p><small>DOF-SA FMS · СЛУЖЕБНЫЙ ДОСТУП</small></section>
    <section className="login-panel"><div className="login-inner"><span className="badge"><ShieldCheck size={15}/> RESTRICTED ACCESS</span><h2>Вход в рабочее пространство</h2><p className="muted">Используйте персональную учётную запись, выданную администратором.</p>{!configured && <p className="notice" role="status">Подключение сервиса авторизации не настроено. Вход станет доступен после настройки владельцем.</p>}<LoginForm configured={configured}/><p className="login-foot">Доступ предоставляется по приглашению.<br/>Самостоятельная регистрация не предусмотрена.</p></div></section></main>;
}
