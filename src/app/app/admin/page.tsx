import { forbidden } from 'next/navigation';
import { requireAccess } from '@/lib/auth';
import { changeRole, blockStaff } from './actions';
import { roles,roleLabels,allowed } from '@/lib/access';
import { InviteForm } from '@/components/invite-form';
export default async function Admin() {
  const {db,access}=await requireAccess();
  const users=allowed(access,'users.manage'), audit=allowed(access,'audit.read'),settings=allowed(access,'settings.manage');
  if(!users&&!audit&&!settings) forbidden();
  const profiles=users?await db.from('profiles').select('auth_user_id,ic_name,title,status').order('ic_name'):null;
  const organizations=users?await db.from('organizations').select('id,name').eq('active',true):null;
  const events=audit?await db.from('audit_events').select('id,action,target,decision,created_at').order('created_at',{ascending:false}).limit(100):null;
  const configuration=settings?await db.from('system_settings').select('key,requires_verification').order('key'):null;
  if([profiles,organizations,events,configuration].some(r=>r?.error)) throw new Error('Служебные данные недоступны');
  const targets=profiles?.data?.filter(p=>p.auth_user_id!==access.id)??[];
  return <><p className="eyebrow">ACCESS ADMINISTRATION</p><h1>Администрирование</h1><p className="muted">Назначение роли не предоставляет финансовых полномочий. Самоназначение запрещено.</p>
    {users&&<><section className="card"><h2>Пользователи</h2><div className="table-scroll"><table><thead><tr><th>Должностное лицо</th><th>Должность</th><th>Статус</th></tr></thead><tbody>{profiles?.data?.map(p=><tr key={p.auth_user_id}><td>{p.ic_name}</td><td>{p.title}</td><td>{p.status}</td></tr>)}</tbody></table></div></section>
    <section className="card"><h2>Персональное приглашение</h2><InviteForm organizations={organizations?.data??[]}/></section>
    {targets.length>0&&<><section className="card"><h2>Изменить назначение</h2><form action={changeRole} className="stack"><label>Должностное лицо<select name="target_user" required>{targets.map(p=><option key={p.auth_user_id} value={p.auth_user_id}>{p.ic_name}</option>)}</select></label><label>Роль<select name="new_role">{roles.map(r=><option key={r} value={r}>{roleLabels[r]}</option>)}</select></label><label>Основание<textarea name="reason" minLength={5} maxLength={1000} required/></label><button>Сохранить назначение</button></form></section>
    <section className="card"><h2>Прекратить доступ</h2><form action={blockStaff} className="stack"><label>Должностное лицо<select name="target_user" required>{targets.map(p=><option key={p.auth_user_id} value={p.auth_user_id}>{p.ic_name}</option>)}</select></label><label>Основание<textarea name="reason" minLength={5} required maxLength={1000}/></label><button>Заблокировать доступ</button></form><p className="muted">Блокировка применяется в БД немедленно. Отзыв Auth-сессий выполняется владельцем через Supabase.</p></section></>}</>}
    {audit&&<section className="card"><h2>Журнал аудита</h2><p className="muted">Последние 100 событий, время UTC.</p>{!events?.data?.length?<p>Событий пока нет.</p>:<div className="table-scroll"><table><thead><tr><th>Время</th><th>Действие</th><th>Объект</th><th>Результат</th></tr></thead><tbody>{events.data.map(e=><tr key={e.id}><td>{e.created_at}</td><td>{e.action}</td><td>{e.target||'—'}</td><td>{e.decision}</td></tr>)}</tbody></table></div>}</section>}
    {settings&&<section className="card"><h2>Нормативные настройки</h2><p className="muted">Изменение настроек выполняется контролируемой миграцией после нормативной проверки.</p><table><thead><tr><th>Настройка</th><th>Проверка</th></tr></thead><tbody>{configuration?.data?.map(s=><tr key={s.key}><td>{s.key}</td><td>{s.requires_verification?'Требует проверки':'Проверено'}</td></tr>)}</tbody></table></section>}
  </>;
}
