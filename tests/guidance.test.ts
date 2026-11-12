import {describe,it,expect} from 'vitest';
import {latestCategories,type BudgetCategory} from '../src/lib/catalog';
import {draftFields} from '../src/lib/cases';
import {draftTip,operationTip} from '../src/lib/field-guidance';
describe('catalog revisions and field guidance',()=>{
 it('does not fall back to an old verified revision when the newest is unverified',()=>{const common={id:'test',code:'03.01',name:'Materials',kind:'EXPENSE',category_group:'Operations',description:'',required_documents:''};const rows=[{...common,version:1,requires_verification:false},{...common,version:2,requires_verification:true}] as BudgetCategory[];expect(latestCategories(rows)).toHaveLength(1);expect(latestCategories(rows)[0].requires_verification).toBe(true);});
 it('explains all case fields and separates external confirmation from generated indexes',()=>{for(const f of draftFields){expect(draftTip(f.key).example.length).toBeGreaterThan(2);expect(draftTip(f.key).help.length).toBeGreaterThan(10);}expect(operationTip('confirmation','order.execute').help).toContain('MOF');expect(operationTip('confirmation','order.execute').help).toContain('повторно');});
});
