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
  if (accessError || !data) forbidden();
  return { db, user, access: data as Access };
}
export async function requireAccess(permission?: Permission) {
  const result = await requireIdentity();
  const { data, error } = await result.db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) forbidden();
  if ((result.access.mfa_required || data.nextLevel === 'aal2') && data.currentLevel !== 'aal2') redirect('/auth/mfa');
  if (permission && !allowed(result.access, permission)) forbidden();
  return result;
}
