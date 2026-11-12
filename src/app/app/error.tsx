'use client';
export default function ErrorPage({ reset }: { reset:()=>void }) { return <section className="card"><h1>Операция не завершена</h1><p role="alert">Сервис отклонил запрос или временно недоступен. Проверьте полномочия и повторите попытку.</p><button onClick={reset}>Повторить</button></section>; }
