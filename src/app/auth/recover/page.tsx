import Link from 'next/link';
import { RecoveryForm } from '@/components/recovery-form';
export default function Recover(){return <main className="auth-card"><p className="eyebrow">ACCOUNT RECOVERY</p><h1>Установка пароля</h1><p>Для существующей учётной записи с email используйте свою почту. Если вы подавали заявку по Static ID без email, пароль вы задавали сами; для сброса обратитесь к администратору после проверки личности.</p><RecoveryForm/><p><Link href="/login">Вернуться ко входу</Link></p></main>;}
