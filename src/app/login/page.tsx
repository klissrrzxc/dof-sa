import Link from 'next/link';
import {redirect} from 'next/navigation';
import {AuthShell} from '@/components/auth-shell';
import {LoginForm} from '@/components/login-form';
import {supabaseConfig} from '@/lib/config';
export default async function Login({searchParams}:{searchParams:Promise<{error_code?:string;code?:string}>}){
 const {error_code,code}=await searchParams;if(code)redirect('/auth/callback?code='+encodeURIComponent(code));const configured=!!supabaseConfig();
 return <AuthShell><p className="eyebrow">WELCOME BACK</p><h2>Вход в систему</h2><p className="muted">Используйте Static ID и пароль своей одобренной учётной записи.</p>{!configured&&<p className="notice" role="status">Сервис авторизации ещё не подключён.</p>}{error_code==='otp_expired'&&<p className="notice" role="alert">Ссылка недействительна, истекла или уже использована. Получите новую ссылку для установки пароля.</p>}<LoginForm configured={configured}/><div className="auth-links"><Link href="/register">Получить доступ</Link><Link href="/auth/recover">Установить или восстановить пароль</Link></div><p className="login-foot">Нет доступа? Подайте заявку — решение примет администратор. Для ранее созданных аккаунтов сохраняется вход по email.</p></AuthShell>;
}
