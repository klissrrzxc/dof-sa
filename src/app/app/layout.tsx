import Link from 'next/link';
import { Landmark, LogOut } from 'lucide-react';
import { requireAccess } from '@/lib/auth';
import { visibleModules,roleLabels } from '@/lib/access';
import { logout } from '@/app/login/actions';
export const dynamic = 'force-dynamic';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { access } = await requireAccess();
  return <div className="workspace"><aside><div className="brand"><Landmark size={30}/><strong>DOF-SA <span>FMS</span></strong><small>DEPARTMENT OF FINANCE</small></div><nav aria-label="Основная навигация">{visibleModules(access).map((m,i) => <Link key={m.href} href={m.href}><span>{String(i+1).padStart(2,'0')}</span>{m.label}</Link>)}</nav><p className="sidebar-foot">STATE OF SAN ANDREAS<br/>RESTRICTED ACCESS</p></aside><div className="workspace-main"><header><div><strong>{access.ic_name}</strong><small>{access.title} · {access.roles.map(r=>roleLabels[r]).join(', ')}</small></div><form action={logout}><button className="secondary"><LogOut size={16}/> Выйти</button></form></header><main id="main-content">{children}</main></div></div>;
}
