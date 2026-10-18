import {readFileSync} from 'node:fs';
const deploy=JSON.parse(readFileSync('.netlify/refraksi-draft.json','utf8'));
const response=await fetch(deploy.url,{signal:AbortSignal.timeout(20000)});
const html=await response.text();
if(response.status===401 && html.includes('Login Redirect')){console.log(JSON.stringify({url:deploy.url,status:401,protectedByNetlify:true,message:'Draft requires Netlify account login. Production site is unchanged; public asset checks cannot run without the Netlify browser session.'},null,2));process.exit(0);}
if(response.status!==200||!html.includes('Refraksi'))throw new Error('Preview page is unavailable: HTTP '+response.status);
const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match=>match[1]);
const checked=await Promise.all(assets.map(async path=>{const response=await fetch(deploy.url+path,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Missing asset '+path);return{path,status:response.status};}));
const spa=await fetch(deploy.url+'/dashboard',{signal:AbortSignal.timeout(20000)});
console.log(JSON.stringify({url:deploy.url,status:response.status,assets:checked,spaStatus:spa.status,csp:!!response.headers.get('content-security-policy'),frame:response.headers.get('x-frame-options'),cache:response.headers.get('cache-control')},null,2));
