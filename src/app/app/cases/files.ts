'use server';
import { z } from 'zod';
import {revalidatePath} from 'next/cache';
import {requireAccess} from '@/lib/auth';
export async function uploadFile(_previous:{message:string},form:FormData):Promise<{message:string}>{
 const {db}=await requireAccess();const caseId=z.uuid().safeParse(form.get('case_id'));const file=form.get('file');
 if(!caseId.success||!(file instanceof File)||file.size===0||file.size>10485760||!['application/pdf','image/png','image/jpeg'].includes(file.type))return {message:'Допустимы PDF, PNG или JPEG размером до 10 MiB.'};
 const bytes=new Uint8Array(await file.arrayBuffer());
 const valid=file.type==='application/pdf'?String.fromCharCode(...bytes.slice(0,5))==='%PDF-':file.type==='image/png'?[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(!valid)return {message:'Содержимое файла не соответствует выбранному типу.'};
 const {data,error}=await db.rpc('case_file',{action:'begin',target:caseId.data,input:{name:file.name.slice(0,180),mime:file.type,size:String(file.size)}});
 if(error)return {message:'Добавление вложения отклонено. Проверьте владельца и статус дела.'};
 const {error:uploadError}=await db.storage.from('financial-documents').upload(data.path,bytes,{contentType:file.type,upsert:false});
 if(uploadError)return {message:'Загрузка не завершена. Повторите попытку; незавершённый файл не доступен для скачивания.'};
 const {error:completeError}=await db.rpc('case_file',{action:'complete',target:data.id,input:{}});
 if(completeError)return {message:'Файл передан, но проверка загрузки не завершена. Обратитесь к администратору.'};
 revalidatePath('/app/cases/'+caseId.data);return {message:'Вложение сохранено в приватном хранилище.'};
}
