import {createClient} from '@supabase/supabase-js';
import {supabaseConfig} from '@/lib/config';
const config=supabaseConfig();
export const db=config?createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'dof-sa-fms-auth'}}):null;
export async function supabase(){if(!db)throw new Error('Сервис авторизации ещё не подключён');return db;}
export function refresh(){window.dispatchEvent(new Event('fms:refresh'));}
export function go(path:string){location.hash=path;}
