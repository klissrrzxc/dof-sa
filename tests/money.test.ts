import {it,expect} from 'vitest';
import {amountSchema,draftSchema,procurementTotal,formatMoney} from '../src/lib/cases';
it('money stays exact above the JavaScript safe integer boundary',()=>{
  expect(amountSchema.parse('9007199254740993')).toBe('9007199254740993');
  expect(formatMoney('9007199254740993').replace(/\s/g,'')).toBe('9007199254740993$');
  expect(procurementTotal([{name:'TEST',quantity:'3',unitPrice:'9007199254740993',purpose:'',division:''}])).toBe(27021597764222979n);
});
it('rejects floats, exponent notation, negatives, invalid characters and bigint overflow',()=>{
  for(const amount of ['-1','1.5','1e6','0','abc','9223372036854775808']) expect(amountSchema.safeParse(amount).success).toBe(false);
});
it('malformed procurement quantities produce validation errors instead of throwing',()=>{
  expect(draftSchema.safeParse({type:'PROCUREMENT_REQUEST',amount:'',items:[{name:'Test',quantity:'invalid',unitPrice:'x'}]}).success).toBe(false);
});
