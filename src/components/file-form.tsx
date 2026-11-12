'use client';
import {useActionState} from 'react';
import {uploadFile} from '@/app/app/cases/files';
export function FileForm({caseId}:{caseId:string}){const [state,action,pending]=useActionState(uploadFile,{message:''});return <form action={action} className="stack"><input type="hidden" name="case_id" value={caseId}/><label>PDF, PNG или JPEG, до 10 MiB<input name="file" type="file" accept="application/pdf,image/png,image/jpeg" required/></label>{state.message&&<p role="status">{state.message}</p>}<button disabled={pending}>{pending?'Загрузка…':'Прикрепить файл'}</button></form>;}
