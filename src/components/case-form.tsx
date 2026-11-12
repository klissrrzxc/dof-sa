'use client';
import {CategoryPicker} from '@/components/category-picker';
import type {BudgetCategory} from '@/lib/catalog';
import {draftTip,itemExamples} from '@/lib/field-guidance';
import { useActionState,useState } from 'react';
import { saveDraft } from '@/app/app/cases/actions';
import { draftFields, type CaseDraft } from '@/lib/cases';
export function CaseForm({id='',version=0,initial={},categories=[]}:{id?:string;version?:number;initial?:Partial<CaseDraft>;categories?:BudgetCategory[]}) {
  const [type,setType]=useState(initial.type??'FUNDING_REQUEST');
  const [items,setItems]=useState<CaseDraft['items']>(initial.items??[]);
  const [state,action,pending]=useActionState(saveDraft,{error:''});
  const groups=[...new Set(draftFields.map(f=>f.group))].filter(g=>type==='PROCUREMENT_REQUEST'||g!=='Закупка');
  return <form action={action}><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={version}/><input type="hidden" name="items" value={JSON.stringify(type==='PROCUREMENT_REQUEST'?items:[])}/>
    <section className="card"><p className="muted">Все примеры вымышленные: замените их своими RP-данными. Можно сохранить неполный черновик и вернуться позже.</p><label>Тип заявления<select name="type" value={type} onChange={e=>setType(e.target.value as CaseDraft['type'])}><option value="FUNDING_REQUEST">Запрос на финансирование</option><option value="PROCUREMENT_REQUEST">Государственная закупка</option></select></label></section>
    {groups.map(group=><section className="card" key={group}><h2>{group}</h2>{group==='Финансовое основание'&&<CategoryPicker categories={categories} initialCode={initial.categoryCode} initialName={initial.categoryName}/>}<div className="form-grid">{draftFields.filter(f=>f.group===group&&!['categoryCode','categoryName'].includes(f.key)).map(f=><label key={f.key}>{f.label}<input name={f.key} aria-label={f.label} aria-describedby={f.key+'-help'} defaultValue={initial[f.key]??''} maxLength={2000} placeholder={'Например: '+draftTip(f.key).example} inputMode={f.key==='amount'?'numeric':undefined}/><span className="field-hint" id={f.key+'-help'}>{draftTip(f.key).help}</span></label>)}</div></section>)}
    {type==='PROCUREMENT_REQUEST' && <section className="card"><h2>Спецификация закупки</h2>{items.map((item,index)=><fieldset key={index} className="card"><legend>Позиция {index+1}</legend><div className="form-grid">{(['name','quantity','unitPrice','purpose','division'] as const).map((key,k)=><label key={key}>{['Наименование','Количество','Цена единицы, целые доллары','Назначение','Подразделение'][k]}<input aria-label={['Наименование','Количество','Цена единицы, целые доллары','Назначение','Подразделение'][k]} placeholder={'Например: '+itemExamples[key]} value={item[key]} required maxLength={2000} onChange={e=>setItems(items.map((row,i)=>i===index?{...row,[key]:e.target.value}:row))}/></label>)}</div><button type="button" className="secondary" onClick={()=>setItems(items.filter((_,i)=>i!==index))}>Удалить позицию</button></fieldset>)}<button type="button" className="secondary" disabled={items.length>=100} onClick={()=>setItems([...items,{name:'',quantity:'1',unitPrice:'',purpose:'',division:''}])}>Добавить позицию</button></section>}
    <p className="notice">До подачи это внутренний черновик. Сохранение не регистрирует заявление и не создаёт резерв или платёж. Подать сохранённую редакцию можно отдельным действием в карточке дела.</p>{state.error && <p role="alert" className="notice">{state.error}</p>}<button disabled={pending}>{pending?'Сохранение…':'Сохранить черновик'}</button>
  </form>;
}
