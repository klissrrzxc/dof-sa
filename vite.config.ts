import {defineConfig,loadEnv} from 'vite';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const file=(p:string)=>fileURLToPath(new URL(p,import.meta.url));
export default defineConfig(({mode})=>{const env=loadEnv(mode,root,'');return {root:file('./web-client'),base:'./',esbuild:{jsx:'automatic'},define:{'process.env.NEXT_PUBLIC_SUPABASE_URL':JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL||''),'process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY':JSON.stringify(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'')},resolve:{alias:[
 {find:'@/lib/auth',replacement:file('./web-client/auth.ts')},{find:'@/lib/supabase/server',replacement:file('./web-client/client.ts')},
 {find:/^@\/app\/(login\/actions|register\/actions|auth\/recover\/actions|app\/operations|app\/cases\/actions|app\/cases\/files|app\/admin\/access-actions|app\/admin\/actions)$/,replacement:file('./web-client/actions.ts')},
 {find:'next/link',replacement:file('./web-client/link.tsx')},{find:'next/navigation',replacement:file('./web-client/navigation.ts')},{find:'node:crypto',replacement:file('./web-client/crypto.ts')},{find:'server-only',replacement:file('./web-client/empty.ts')},
 {find:'@',replacement:file('./src')},
 ]},plugins:[{name:'browser-admin-actions',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/app/app/admin/page.tsx'))return code.replace("from './actions'","from '@/app/app/admin/actions'");}}],build:{outDir:file('./dist-pages'),emptyOutDir:true,sourcemap:false},server:{host:'127.0.0.1',port:4173},preview:{host:'127.0.0.1',port:4173}};});
