import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
// Use the existing Git credential helper without emitting credentials or persisting a token.
const credential=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}});
if(credential.status!==0)throw new Error('GitHub credential unavailable');
const values=Object.fromEntries(credential.stdout.trim().split('\n').map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
if(!values.password)throw new Error('GitHub credential unavailable');
const headers={Authorization:'Bearer '+values.password,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
const api='https://api.github.com/repos/klissrrzxc/dof-sa';
async function call(path,method='GET',data){const r=await fetch(api+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,data:r.status===204?null:await r.json()};}
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,'')];}));
for(const [name,key] of [['SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL'],['SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']]){if(!env[key])throw new Error('Missing publishable configuration');const existing=await call('/actions/variables/'+name);const r=await call('/actions/variables'+(existing.status===200?'/'+name:''),existing.status===200?'PATCH':'POST',{name,value:env[key]});console.log('Repository public variable '+name+': '+r.status);if(![201,204].includes(r.status))throw new Error('Cannot configure repository variable');}
let pages=await call('/pages');if(pages.status===404)pages=await call('/pages','POST',{build_type:'workflow'});else if(pages.status===200&&pages.data.build_type!=='workflow')pages=await call('/pages','PUT',{build_type:'workflow'});
console.log('GitHub Pages setup: '+pages.status);if(![200,201,204].includes(pages.status))console.log('Owner action required: '+(pages.data?.message||'enable Pages in repository settings'));else console.log('Pages publishing enabled for https://klissrrzxc.github.io/dof-sa/');
