import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfig } from '@/lib/config';
export async function proxy(request: NextRequest) {
  const config = supabaseConfig();
  let response = NextResponse.next({ request });
  if (!config) return request.nextUrl.pathname.startsWith('/app')
    ? NextResponse.redirect(new URL('/login', request.url)) : response;
  const db = createServerClient(config.url, config.key, { cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }, cookies: {
    getAll: () => request.cookies.getAll(), setAll: (values) => {
      values.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    },
  } });
  const { data: { user } } = await db.auth.getUser();
  if (!user && request.nextUrl.pathname.startsWith('/app')) {
    const redirect = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    return redirect;
  }
  return response;
}
export const config = { matcher: ['/app/:path*', '/login/:path*', '/auth/:path*'] };
