import {NextResponse,type NextRequest} from 'next/server';
import {z} from 'zod';
import {requireAccess} from '@/lib/auth';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {db}=await requireAccess();const {id}=await params;
 if(!z.uuid().safeParse(id).success)return new NextResponse('Not found',{status:404});
 const {data,error}=await db.rpc('case_file',{action:'access',target:id,input:{}});
 if(error)return new NextResponse('Not found',{status:404});
 const signed=await db.storage.from('financial-documents').createSignedUrl(data.path,60,{download:data.name});
 if(signed.error)return new NextResponse('Download unavailable',{status:503});
 return NextResponse.redirect(signed.data.signedUrl,303);
}
