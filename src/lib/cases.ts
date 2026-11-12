import { z } from 'zod';
const text=z.string().trim().max(2000).default('');
export const amountSchema=z.string().regex(/^(?:|[1-9]\d{0,18})$/,'Укажите положительную целую сумму').refine(s=>!s || (/^[1-9]\d{0,18}$/.test(s) && BigInt(s)<=9223372036854775807n),'Сумма превышает BIGINT');
export const draftSchema=z.object({
  type:z.enum(['FUNDING_REQUEST','PROCUREMENT_REQUEST']),
  agencyName:text, agencyAddress:text, agencyAccount:text,
  applicantName:text, applicantTitle:text, staticId:text, division:text, phone:text, authority:text,
  basis:text, basisNumber:text, basisUrl:z.union([z.literal(''),z.url().refine(s=>s.startsWith('https://'),'Требуется HTTPS')]).default(''),
  categoryCode:text, categoryName:text, amount:amountSchema,
  purpose:text, justification:text, recipient:text, recipientAccount:text, paymentPurpose:text,
  custodian:text,custodianStaticId:text,custodianTitle:text,custodianDivision:text,custodianAgency:text,supplier:text,supplierAddress:text,supplierRepresentative:text,supplierStaticId:text,supplierAccount:text,
  priceJustification:text,interestDisclosure:text,
  items:z.array(z.object({ name:z.string().trim().min(1).max(2000),quantity:z.string().regex(/^[1-9]\d{0,8}$/),unitPrice:amountSchema.refine(s=>!!s),purpose:text,division:text }).refine(i=>/^[1-9]\d{0,8}$/.test(i.quantity) && /^[1-9]\d{0,18}$/.test(i.unitPrice) && BigInt(i.quantity)*BigInt(i.unitPrice)<=9223372036854775807n,'Некорректная сумма позиции')).max(100).default([]),
});
export type CaseDraft=z.infer<typeof draftSchema>;
export function formatMoney(value:string) { return value ? new Intl.NumberFormat('ru-RU').format(BigInt(value))+' $' : 'Не указана'; }
export function procurementTotal(items:CaseDraft['items']) { return items.reduce((total,item)=>total+BigInt(item.quantity)*BigInt(item.unitPrice),0n); }
export const draftFields: {key:Exclude<keyof CaseDraft,'type'|'items'>;label:string;group:string}[]=[
  {key:'agencyName',label:'Полное наименование ведомства',group:'Ведомство'},
  {key:'agencyAddress',label:'Юридический адрес',group:'Ведомство'},
  {key:'agencyAccount',label:'Лицевой счёт ведомства',group:'Ведомство'},
  {key:'applicantName',label:'IC имя и фамилия заявителя',group:'Заявитель'},
  {key:'applicantTitle',label:'Должность / звание',group:'Заявитель'},
  {key:'staticId',label:'Static ID',group:'Заявитель'},
  {key:'division',label:'Подразделение',group:'Заявитель'},
  {key:'phone',label:'Контактный телефон',group:'Заявитель'},
  {key:'authority',label:'Основание полномочий / приказ',group:'Заявитель'},
  {key:'basis',label:'Правовое / распорядительное основание',group:'Финансовое основание'},
  {key:'basisNumber',label:'Номер документа-основания',group:'Финансовое основание'},
  {key:'basisUrl',label:'Ссылка на официальную публикацию (при наличии)',group:'Финансовое основание'},
  {key:'categoryCode',label:'Предполагаемый код статьи — требует сверки',group:'Финансовое основание'},
  {key:'categoryName',label:'Наименование статьи — требует сверки',group:'Финансовое основание'},
  {key:'amount',label:'Запрашиваемая сумма, целые игровые доллары',group:'Финансовое основание'},
  {key:'purpose',label:'Целевое назначение',group:'Финансовое основание'},
  {key:'justification',label:'Финансовое обоснование / недостаточность ресурсов',group:'Финансовое основание'},
  {key:'recipient',label:'Получатель',group:'Получатель'},
  {key:'recipientAccount',label:'Лицевой счёт получателя',group:'Получатель'},
  {key:'paymentPurpose',label:'Назначение платежа',group:'Получатель'},
  {key:'custodian',label:'Имя и фамилия материально ответственного лица',group:'Закупка'},
  {key:'custodianStaticId',label:'Static ID материально ответственного лица',group:'Закупка'},
  {key:'custodianTitle',label:'Должность материально ответственного лица',group:'Закупка'},
  {key:'custodianDivision',label:'Подразделение материально ответственного лица',group:'Закупка'},
  {key:'custodianAgency',label:'Ведомство материально ответственного лица',group:'Закупка'},
  {key:'supplier',label:'Наименование поставщика',group:'Закупка'},
  {key:'supplierAddress',label:'Точный адрес поставщика',group:'Закупка'},
  {key:'supplierRepresentative',label:'Владелец / представитель поставщика',group:'Закупка'},
  {key:'supplierStaticId',label:'Static ID представителя поставщика',group:'Закупка'},
  {key:'supplierAccount',label:'Платёжные реквизиты поставщика',group:'Закупка'},
  {key:'priceJustification',label:'Обоснование стоимости и выбора поставщика',group:'Закупка'},
  {key:'interestDisclosure',label:'Декларация наличия / отсутствия заинтересованности',group:'Закупка'},
];
