import Link from 'next/link';
import { RecoveryForm } from '@/components/recovery-form';
export default function Recover(){return <main className="auth-card"><p className="eyebrow">ACCOUNT RECOVERY</p><h1>Установка пароля</h1><p>Для уже приглашённых сотрудников. Используйте почту, на которую было отправлено приглашение.</p><RecoveryForm/><p><Link href="/login">Вернуться ко входу</Link></p></main>;}
