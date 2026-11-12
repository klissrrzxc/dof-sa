import {it,expect} from 'vitest';
import {csv} from '../src/lib/csv';
it('escapes CSV fields and prevents spreadsheet formula execution',()=>{
 const result=csv([['=IMPORTXML("https://invalid")',' +cmd','normal','a,b','a"b','9007199254740993']]);
 expect(result).toContain('"\'=IMPORTXML');expect(result).toContain('"\' +cmd"');expect(result).toContain('"a,b"');expect(result).toContain('"a""b"');expect(result).toContain('9007199254740993');
});
