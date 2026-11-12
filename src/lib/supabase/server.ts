import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseConfig } from '@/lib/config';
export async function supabase() {
  const config = supabaseConfig();
  if (!config) throw new Error('Supabase is not configured');
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: { sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: true, path: '/' },
    cookies: { getAll: () => store.getAll(), setAll: (values) => {
      try { values.forEach(({ name, value, options }) => store.set(name, value, options)); }
      catch { /* Server Component cannot set cookies; proxy refreshes sessions. */ }
    } },
  });
}
