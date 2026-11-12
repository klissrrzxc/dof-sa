import Link from 'next/link';
export default function Forbidden() { return <main className="auth-card"><p className="eyebrow">RESTRICTED ACCESS · 403</p><h1>Доступ запрещён</h1><p>Для этой операции нет действующих полномочий. Обратитесь к администратору.</p><Link href="/login">Вернуться ко входу</Link></main>; }
