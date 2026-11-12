import {requireAccess} from '@/lib/auth';
import {allowed} from '@/lib/access';
import {AccessReviewForm} from './access-review-form';
export async function AccessQueue(){const {db,access}=await requireAccess();if(!allowed(access,'users.manage'))return null;
 const [requests,organizations]=await Promise.all([db.from('access_requests').select('id,static_id,ic_name,game_phone,organization_name,requested_level,authority_document,created_at').eq('status','PENDING').order('created_at').limit(100),db.from('organizations').select('id,name').eq('active',true)]);
 if(requests.error||organizations.error)throw new Error('Заявки на доступ недоступны');
 return <section className="card"><div className="section-heading"><div><p className="eyebrow">ACCESS CONTROL</p><h2>Заявки на доступ</h2></div><span className="status-pill">{requests.data.length} на проверке</span></div><p className="muted">Запрошенный уровень — пожелание заявителя. Фактическую организацию и права назначаете вы. Пароль пользователя здесь не хранится и не отображается.</p>{!requests.data.length&&<p className="empty-state">Новых заявок пока нет.</p>}{requests.data.map(r=><details key={r.id}><summary>{r.ic_name} · ID {r.static_id} · {r.created_at}</summary><AccessReviewForm request={r} organizations={organizations.data}/></details>)}</section>;
}
