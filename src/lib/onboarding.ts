import {z} from 'zod';
export const accessLevels=['REPRESENTATIVE','AGENCY_HEAD','FINANCE_OFFICER','FINANCE_DIRECTOR'] as const;
export const accessLevelLabels:Record<string,string>={REPRESENTATIVE:'Представитель по приказу',AGENCY_HEAD:'Руководитель ведомства',FINANCE_OFFICER:'Сотрудник Министерства финансов',FINANCE_DIRECTOR:'Руководитель Министерства финансов',SYSTEM_ADMIN:'Системный администратор'};
export const staticIdSchema=z.string().trim().regex(/^[1-9]\d{0,11}$/,'Укажите игровой Static ID цифрами');
export const accessRequestSchema=z.object({static_id:staticIdSchema,ic_name:z.string().trim().min(3).max(150),game_phone:z.string().trim().min(3).max(40),organization_name:z.string().trim().min(2).max(200),requested_level:z.enum(accessLevels),authority_document:z.string().trim().max(2000).default(''),password:z.string().min(12).max(128),password_confirm:z.string(),confirmed:z.literal('true')}).refine(d=>d.password===d.password_confirm,{message:'Пароли не совпадают',path:['password_confirm']}).refine(d=>d.requested_level!=='REPRESENTATIVE'||d.authority_document.length>=5,{message:'Укажите приказ или документ о представительстве',path:['authority_document']});
// Internal Auth identifier only. No email is sent to this reserved .invalid domain.
export function staticLoginEmail(id:string){return 'id-'+staticIdSchema.parse(id)+'@users.dof-sa.invalid';}
