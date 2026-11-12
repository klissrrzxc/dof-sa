'use client';
import { useActionState } from 'react';
import { inviteStaff } from '@/app/app/admin/actions';
import { roles,roleLabels } from '@/lib/access';
export function InviteForm({organizations}:{organizations:{id:string;name:string}[]}) {
  const [state,action,pending]=useActionState(inviteStaff,{message:''});
  return <form action={action} className="stack"><div className="form-grid"><label>Электронная почта<input name="email" type="email" required autoComplete="off"/></label><label>IC имя и фамилия<input name="ic_name" required minLength={2} maxLength={150}/></label><label>Должность<input name="title" required minLength={2} maxLength={200}/></label><label>Ведомство<select name="organization_id" required>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label>Роль<select name="assigned_role">{roles.map(r=><option key={r} value={r}>{roleLabels[r]}</option>)}</select></label></div>{state.message && <p role="status" className="notice">{state.message}</p>}<button disabled={pending || !organizations.length}>{pending?'Отправка…':'Пригласить сотрудника'}</button></form>;
}
