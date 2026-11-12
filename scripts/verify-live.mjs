// Read only: no users, invitations or business data are created.
import assert from 'node:assert/strict';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert(url&&key,'Set Supabase URL and publishable key first');
const headers={apikey:key,'Content-Type':'application/json'};
const tables=['access_requests','profiles','organizations','role_assignments','permission_grants','audit_events','system_settings','financial_cases','case_versions','case_events','procurement_items','budget_periods','budget_categories','treasury_accounts','appropriations','case_decisions','documents','document_versions','commitments','payment_orders','treasury_entries','utilization_reports','public_report_drafts','public_report_approvals','document_sequences','document_files','appropriation_changes'];
for(const table of tables){
  const r=await fetch(`${url}/rest/v1/${table}?select=*&limit=1`,{headers});
  assert([401,403].includes(r.status),`Anonymous ${table}: unexpected ${r.status}`);
  console.log(`PASS anonymous ${table}: ${r.status}`);
}
const rpc=await fetch(`${url}/rest/v1/rpc/my_access`,{method:'POST',headers,body:'{}'});
assert([401,403].includes(rpc.status),`Anonymous my_access: unexpected ${rpc.status}`);
console.log(`PASS anonymous RPC: ${rpc.status}`);
const storage=await fetch(`${url}/storage/v1/object/list/financial-documents`,{method:'POST',headers,body:JSON.stringify({prefix:'',limit:1})});
// Some Storage gateways return 200 with no visible objects under RLS.
if(storage.status===200) assert.deepEqual(await storage.json(),[],'Anonymous storage listing exposed objects');
else assert([400,401,403].includes(storage.status),`Anonymous storage: unexpected ${storage.status}`);
console.log(`PASS anonymous Storage: ${storage.status}`);
const settings=await fetch(`${url}/auth/v1/settings`,{headers});
assert(settings.ok,`Auth settings: ${settings.status}`);
const auth=await settings.json();
console.log(`Auth public signup disabled: ${auth.disable_signup===true}`);
if(auth.disable_signup!==true){console.error('OWNER ACTION: disable public signup in Supabase Auth before release.');process.exitCode=2;}

for(const name of ['perform_operation','case_file']){const r=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(name==='perform_operation'?{op:'case.submit',target:null,input:{},request_key:crypto.randomUUID()}:{action:'access',target:crypto.randomUUID(),input:{}})});assert([401,403].includes(r.status),'Anonymous '+name+' unexpectedly accessible');console.log('PASS anonymous '+name+': '+r.status);}
const edge=await fetch(url+'/functions/v1/staff-invite',{method:'POST',headers,body:'{}'});assert.equal(edge.status,401);console.log('PASS unauthenticated invitation function: 401');

const intake=await fetch(url+'/functions/v1/access-request',{method:'POST',headers,body:'{}'});assert.equal(intake.status,400);console.log('PASS public request validates empty payload: 400');
const status=await fetch(url+'/rest/v1/rpc/access_request_status',{method:'POST',headers,body:'{}'});assert([401,403].includes(status.status));console.log('PASS own request status requires login');
