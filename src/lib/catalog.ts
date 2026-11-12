export type BudgetCategory={id:string;code:string;name:string;kind:string;version:number;category_group:string;description:string;required_documents:string;requires_verification:boolean};
// Resolve each code to its latest revision, including unverified revisions (which must not be selectable).
export function latestCategories(rows:BudgetCategory[]){const codes=new Map<string,BudgetCategory>();for(const row of rows)if(!codes.has(row.code)||codes.get(row.code)!.version<row.version)codes.set(row.code,row);return [...codes.values()].sort((a,b)=>a.code.localeCompare(b.code));}
