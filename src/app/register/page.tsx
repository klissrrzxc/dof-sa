import Link from 'next/link';
import {AuthShell} from '@/components/auth-shell';
import {AccessRequestForm} from '@/components/access-request-form';
import {supabaseConfig} from '@/lib/config';
export default function Register(){return <AuthShell register><p className="eyebrow">ACCESS REQUEST</p><h2>Заявка на доступ</h2><p className="muted">Расскажите о персонаже и ведомстве. Администратор проверит сведения и определит фактический уровень полномочий.</p><AccessRequestForm configured={!!supabaseConfig()}/><p className="login-foot">Уже одобрены? <Link href="/login">Войти в систему</Link></p></AuthShell>;}
