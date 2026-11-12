'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {LayoutDashboard,Files,Landmark,FileText,ChartNoAxesCombined,Settings2,BookOpen,LifeBuoy} from 'lucide-react';
const icons:Record<string,typeof LayoutDashboard>={'/app':LayoutDashboard,'/app/catalog':BookOpen,'/app/help':LifeBuoy,'/app/cases':Files,'/app/treasury':Landmark,'/app/documents':FileText,'/app/reports':ChartNoAxesCombined,'/app/admin':Settings2};
export function Navigation({modules}:{modules:{href:string;label:string}[]}){const path=usePathname();return <nav aria-label="Основная навигация">{modules.map(m=>{const Icon=icons[m.href];const active=m.href==='/app'?path===m.href:path.startsWith(m.href);return <Link key={m.href} href={m.href} aria-current={active?'page':undefined}>{Icon&&<Icon size={17} strokeWidth={1.6}/>}<span style={{fontSize:'inherit',color:'inherit'}}>{m.label}</span></Link>;})}</nav>;}
