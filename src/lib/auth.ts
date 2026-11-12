import 'server-only';
import { forbidden, redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase/server';
import { supabaseConfig } from '@/lib/config';
import { allowed, type Access, type Permission } from '@/lib/access';
export async function requireIdentity() {
  if (!supabaseConfig()) redirect('/login');
  const db = await supabase();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) redirect('/login');
  const { data, error: accessError } = await db.rpc('my_access');
  if (accessError) forbidden();
  if (!data) {const pending=await db.rpc('access_request_status');if(pending.data&&['PENDING','REJECTED'].includes(pending.data.status))redirect('/auth/pending');forbidden();}
  return { db, user, access: data as Access };
}
export async function requireAccess(permission?: Permission) {
  const result = await requireIdentity();
  if (permission && !allowed(result.access, permission)) forbidden();
  return result;
}
