import { NextResponse, type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase/server';
export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  if (token_hash && type==='invite') {
    const { error } = await (await supabase()).auth.verifyOtp({ token_hash, type:'invite' });
    if (!error) return NextResponse.redirect(new URL('/auth/password',request.url));
  }
  return NextResponse.redirect(new URL('/login',request.url));
}
