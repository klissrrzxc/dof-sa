'use client';
import { useActionState } from 'react';
import { performOperation } from '@/app/app/operations';
import type {Field,OperationName} from '@/lib/operations';
export function OperationFormClient({op,target='',title,fields=[],requestKey}:{op:OperationName;target?:string;title:string;fields?:Field[];requestKey:string}){
 const [state,action,pending]=useActionState(performOperation,{message:'',ok:false});
 return <form action={action} className="stack"><input type="hidden" name="op" value={op}/>{!fields.some(f=>f.name==='target')&&<input type="hidden" name="target" value={target}/>}<input type="hidden" name="request_key" value={state.nextKey||requestKey}/><div className="form-grid">{fields.map(f=><label key={f.name}>{f.label}{f.type==='select'?<select name={f.name} defaultValue={f.value||''} required={f.required!==false}><option value="">Выберите…</option>{f.options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:f.type==='textarea'?<textarea name={f.name} defaultValue={f.value} required={f.required!==false} maxLength={8000}/>:<input type={f.type||'text'} name={f.name} defaultValue={f.type==='checkbox'?undefined:f.value} value={f.type==='checkbox'?'true':undefined} required={f.required!==false} maxLength={8000}/>}</label>)}</div><label>Основание / служебное пояснение<textarea name="basis" required minLength={5} maxLength={2000}/></label>{state.message&&<p role="status" className="notice">{state.message}</p>}<button disabled={pending}>{pending?'Регистрация…':title}</button></form>;
}
