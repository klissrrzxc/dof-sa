import { forbidden } from 'next/navigation';
import { requireAccess } from '@/lib/auth';
import { CaseForm } from '@/components/case-form';
export default async function NewCase() {
  const {db,access}=await requireAccess();
  if(!access.roles.includes('agency_representative')) forbidden();
  const {data,error}=await db.from('organizations').select('name,address,account_reference').eq('id',access.organization_id).single();
  if(error) throw new Error('Ведомство недоступно');
  return <><p className="eyebrow">INTERNAL DRAFT</p><h1>Новый черновик заявления</h1><CaseForm initial={{agencyName:data.name,agencyAddress:data.address,agencyAccount:data.account_reference,applicantName:access.ic_name,applicantTitle:access.title}}/></>;
}
