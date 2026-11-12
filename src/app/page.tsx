import { redirect } from 'next/navigation';
export default async function Home({searchParams}:{searchParams:Promise<{code?:string;error_code?:string}>}) {
  const {code,error_code}=await searchParams;
  if(code) redirect('/auth/callback?code='+encodeURIComponent(code));
  redirect(error_code==="otp_expired"?'/login?error_code=otp_expired':'/login');
}
