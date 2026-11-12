import {Navigation} from '@/components/navigation';
import { Landmark, LogOut } from 'lucide-react';
import { requireAccess } from '@/lib/auth';
import { visibleModules,roleLabels } from '@/lib/access';
import { logout } from '@/app/login/actions';
export const dynamic = 'force-dynamic';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { access } = await requireAccess();
  return <div className="workspace"><aside><div className="brand"><Landmark size={30}/><strong>DOF-SA <span>FMS</span></strong><small>DEPARTMENT OF FINANCE</small></div><Navigation modules={visibleModules(access)}/><p className="sidebar-foot">STATE OF SAN ANDREAS<br/>RESTRICTED ACCESS</p></aside><div className="workspace-main"><header><div><strong>{access.ic_name}</strong><small>{access.title} · {access.roles.map(r=>roleLabels[r]).join(', ')}</small></div><form action={logout}><button className="secondary"><LogOut size={16}/> Выйти</button></form></header><main id="main-content">{children}</main></div></div>;
}
