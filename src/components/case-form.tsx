'use client';
import { useActionState,useState } from 'react';
import { saveDraft } from '@/app/app/cases/actions';
import { draftFields, type CaseDraft } from '@/lib/cases';
export function CaseForm({id='',version=0,initial={}}:{id?:string;version?:number;initial?:Partial<CaseDraft>}) {
  const [type,setType]=useState(initial.type??'FUNDING_REQUEST');
  const [items,setItems]=useState<CaseDraft['items']>(initial.items??[]);
  const [state,action,pending]=useActionState(saveDraft,{error:''});
  const groups=[...new Set(draftFields.map(f=>f.group))].filter(g=>type==='PROCUREMENT_REQUEST'||g!=='Закупка');
  return <form action={action}><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={version}/><input type="hidden" name="items" value={JSON.stringify(type==='PROCUREMENT_REQUEST'?items:[])}/>
    <section className="card"><label>Тип заявления<select name="type" value={type} onChange={e=>setType(e.target.value as CaseDraft['type'])}><option value="FUNDING_REQUEST">Запрос на финансирование</option><option value="PROCUREMENT_REQUEST">Государственная закупка</option></select></label></section>
    {groups.map(group=><section className="card" key={group}><h2>{group}</h2><div className="form-grid">{draftFields.filter(f=>f.group===group).map(f=><label key={f.key}>{f.label}<input name={f.key} defaultValue={initial[f.key]??''} maxLength={2000} inputMode={f.key==='amount'?'numeric':undefined}/></label>)}</div></section>)}
    {type==='PROCUREMENT_REQUEST' && <section className="card"><h2>Спецификация закупки</h2>{items.map((item,index)=><fieldset key={index} className="card"><legend>Позиция {index+1}</legend><div className="form-grid">{(['name','quantity','unitPrice','purpose','division'] as const).map((key,k)=><label key={key}>{['Наименование','Количество','Цена единицы, целые доллары','Назначение','Подразделение'][k]}<input value={item[key]} required maxLength={2000} onChange={e=>setItems(items.map((row,i)=>i===index?{...row,[key]:e.target.value}:row))}/></label>)}</div><button type="button" className="secondary" onClick={()=>setItems(items.filter((_,i)=>i!==index))}>Удалить позицию</button></fieldset>)}<button type="button" className="secondary" disabled={items.length>=100} onClick={()=>setItems([...items,{name:'',quantity:'1',unitPrice:'',purpose:'',division:''}])}>Добавить позицию</button></section>}
    <p className="notice">Внутренний черновик. Не является официальной формой, не получает регистрационный номер и не создаёт право на финансирование. Вложения и официальная подача пока недоступны.</p>{state.error && <p role="alert" className="notice">{state.error}</p>}<button disabled={pending}>{pending?'Сохранение…':'Сохранить черновик'}</button>
  </form>;
}
