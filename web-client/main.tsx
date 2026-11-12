import React,{cloneElement,isValidElement,useEffect,useState,type ReactNode,type ReactElement} from 'react';
import {createRoot} from 'react-dom/client';
import '../src/app/globals.css';
import {db,supabase,go,refresh} from './client';
import {RouteSignal} from './navigation';
import {requireAccess} from './auth';
import {csv} from '@/lib/csv';
import {allowed} from '@/lib/access';
import Layout from '@/app/app/layout';
import Dashboard from '@/app/app/page';
import Cases from '@/app/app/cases/page';
import NewCase from '@/app/app/cases/new/page';
import CasePage from '@/app/app/cases/[id]/page';
import Treasury from '@/app/app/treasury/page';
import Documents from '@/app/app/documents/page';
import Document from '@/app/app/documents/[id]/page';
import Reports from '@/app/app/reports/page';
import Admin from '@/app/app/admin/page';
import Help from '@/app/app/help/page';
import Catalog from '@/app/app/catalog/page';
import Login from '@/app/login/page';
import Register from '@/app/register/page';
import Recover from '@/app/auth/recover/page';
import Pending from '@/app/auth/pending/page';
import Forbidden from '@/app/forbidden';
import {logout} from './actions';
// Resolve data-loading components before handing their tree to the browser renderer.
// Authorization still runs in every Supabase query/RPC under RLS; these functions carry no server key.
async function resolveTree(node:ReactNode):Promise<ReactNode>{
 if(Array.isArray(node))return Promise.all(node.map(resolveTree));
 if(!isValidElement(node))return node;
 const element=node as ReactElement<Record<string,unknown>>;
 if(typeof element.type==='function'&&element.type.constructor.name==='AsyncFunction'){
  const render=element.type as (props:Record<string,unknown>)=>Promise<ReactNode>;return resolveTree(await render(element.props));
 }
 if(element.props.children!==undefined)return cloneElement(element,{children:await resolveTree(element.props.children as ReactNode)});
 return element;
}
function Password(){const [message,setMessage]=useState('');return <main className="auth-card"><h1>Установить пароль</h1><form action={async form=>{const password=String(form.get('password')||'');if(password.length<12||password.length>128||password!==form.get('repeat')){setMessage('Пароль: не менее 12 символов; повтор должен совпадать.');return;}const {error}=await (await supabase()).auth.updateUser({password});if(error)setMessage('Не удалось установить пароль. Получите новую ссылку.');else go('/app');}} className="stack"><label>Новый пароль<input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required/></label><label>Повторите пароль<input name="repeat" type="password" minLength={12} maxLength={128} autoComplete="new-password" required/></label>{message&&<p role="alert">{message}</p>}<button>Установить пароль</button></form></main>;}
async function load(route:string){const [path,query='']=route.split('?');const searchParams=Promise.resolve(Object.fromEntries(new URLSearchParams(query.split('#')[0])));let node:ReactNode;
 if(path==='/login'||path==='/')return Login({searchParams});
 if(path==='/register')return Register();
 if(path==='/auth/recover')return Recover();
 if(path==='/auth/pending')return Pending();
 if(path==='/auth/password'){const {data:{user}}=await (await supabase()).auth.getUser();if(!user)throw new RouteSignal('/login');return <Password/>;}
 if(!path.startsWith('/app'))throw new RouteSignal('404');
 await requireAccess();
 if(path==='/app')node=await Dashboard();
 else if(path==='/app/cases')node=await Cases({searchParams});
 else if(path==='/app/cases/new')node=await NewCase();
 else if(/^\/app\/cases\/[^/]+$/.test(path))node=await CasePage({params:Promise.resolve({id:path.split('/')[3]})});
 else if(path==='/app/treasury')node=await Treasury({searchParams});
 else if(path==='/app/documents')node=await Documents({searchParams});
 else if(/^\/app\/documents\/[^/]+$/.test(path))node=await Document({params:Promise.resolve({id:path.split('/')[3]})});
 else if(path==='/app/reports')node=await Reports();
 else if(path==='/app/admin')node=await Admin();
 else if(path==='/app/help')node=await Help();
 else if(path==='/app/catalog')node=await Catalog();
 else throw new RouteSignal('404');
 return resolveTree(await Layout({children:node}));
}
async function download(path:string){const {db,access}=await requireAccess();if(path.startsWith('/app/files/')){const {data,error}=await db.rpc('case_file',{action:'access',target:path.split('/')[3],input:{}});if(error)throw new Error('Файл недоступен');const result=await db.storage.from('financial-documents').createSignedUrl(data.path,60,{download:data.name});if(result.error)throw new Error('Не удалось создать ссылку');location.assign(result.data.signedUrl);return;}
 const type=path.split('/')[3];if(type!=='audit'&&type!=='treasury')throw new Error('Выгрузка не найдена');if(type==='audit'&&!allowed(access,'audit.read'))throw new Error('Недостаточно полномочий');if(type==='treasury'&&(!access.roles.some(r=>['finance_director','finance_officer'].includes(r))||!access.permissions.some(p=>p.startsWith('treasury.')||['finance.approve','reports.approve'].includes(p))))throw new Error('Недостаточно полномочий');
 const rows:unknown[][]=type==='audit'?[['ID','Действие','Объект','Результат','UTC','Запрос']]:[['ID','Тип','Направление','Сумма','Подтверждение','UTC']];const cutoff=new Date().toISOString();for(let offset=0;offset<10000;offset+=1000){const {data,error}=await db.from(type==='audit'?'audit_events':'entry_read').select('*').lte('created_at',cutoff).order('created_at').order('id').range(offset,offset+999);if(error)throw new Error('Выгрузка недоступна');rows.push(...data.map(e=>type==='audit'?[e.id,e.action,e.target,e.decision,e.created_at,e.request_id]:[e.id,e.kind,e.direction,e.amount,e.confirmation,e.created_at]));if(data.length<1000)break;}const url=URL.createObjectURL(new Blob([csv(rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=type+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function App(){const [revision,setRevision]=useState(0),[content,setContent]=useState<ReactNode>(<main className="auth-card">Загрузка…</main>),[error,setError]=useState('');
 useEffect(()=>{const update=()=>{setContent(<main className="auth-card" role="status">Загрузка рабочего пространства…</main>);setRevision(v=>v+1);};window.addEventListener('hashchange',update);window.addEventListener('fms:refresh',update);return()=>{window.removeEventListener('hashchange',update);window.removeEventListener('fms:refresh',update);};},[]);
 useEffect(()=>{let active=true;const route=location.hash.slice(1)||'/login';load(route).then(resolveTree).then(node=>{if(active){setContent(node);setError('');requestAnimationFrame(()=>{const anchor=route.split('#')[1];if(anchor)document.getElementById(anchor)?.scrollIntoView();else window.scrollTo(0,0);});}}).catch(e=>{if(!active)return;if(e instanceof RouteSignal){if(e.route==='403')setContent(<Forbidden/>);else if(e.route==='404')setContent(<main className="auth-card"><h1>Страница не найдена</h1><a href="#/app">Вернуться к обзору</a></main>);else go(e.route);}else setContent(<main className="auth-card"><h1>Не удалось загрузить данные</h1><p>Проверьте соединение и повторите. Данные не подменяются примерами.</p><button onClick={refresh}>Повторить</button><form action={logout}><button className="secondary">Выйти</button></form></main>);});return()=>{active=false;};},[revision]);
 useEffect(()=>{const click=(event:MouseEvent)=>{const a=(event.target as Element).closest('a');const href=a?.getAttribute('href');if(!href)return;if(href.startsWith('/app/export/')||href.startsWith('/app/files/')){event.preventDefault();download(href).catch(()=>setError('Операция недоступна. Проверьте вход и полномочия.'));}else if(href.startsWith('/')){event.preventDefault();go(href);}else if(href.startsWith('#')&&!href.startsWith('#/')){event.preventDefault();document.getElementById(href.slice(1))?.scrollIntoView({behavior:'smooth'});}};const submit=(event:SubmitEvent)=>{const form=event.target as HTMLFormElement;if(form.hasAttribute('action')||form.method.toLowerCase()!=='get')return;event.preventDefault();const query=new URLSearchParams();new FormData(form).forEach((v,k)=>{if(typeof v==='string')query.set(k,v);});go((location.hash.slice(1).split('?')[0]||'/app')+'?'+query);};document.addEventListener('click',click);document.addEventListener('submit',submit);return()=>{document.removeEventListener('click',click);document.removeEventListener('submit',submit);};},[]);
 return <>{error&&<p role="alert" className="notice" onClick={()=>setError('')}>{error}</p>}{content}</>;
}
db?.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')go('/auth/password');if(event==='SIGNED_OUT')go('/login');});
createRoot(document.getElementById('root')!).render(<App/>);
