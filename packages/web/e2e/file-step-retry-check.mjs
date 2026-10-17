import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { fileCardFromSource } from '../src/file-to-canvas.js';
import { familyOf } from '../src/file-capabilities.js';
// Local Workers + real STEP card: intentionally unconfigured converter makes a durable failure.
// This proves Retry resumes the SAME job/source, not successful conversion (covered separately on dev).
const BASE=process.env.BASE || 'http://127.0.0.1:9091', CP=process.env.SMALL_CP || 'http://127.0.0.1:9093';
for(const u of [BASE,CP]) assert.match(u,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const secret=readFileSync(process.env.VARS,'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run=Date.now().toString(36);
const {session}=await (await fetch(CP+'/test/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'step-'+run+'@example.com',handle:'st_'+run,secret})})).json();
const api=async(path,init={})=>{const r=await fetch(BASE+path,{...init,headers:{cookie:'small_session='+session,'content-type':'application/json',...init.headers}});const body=await r.json();assert.ok(r.ok,body.error || String(r.status));return body;};
const canvas=await api('/api/canvases',{method:'POST',body:JSON.stringify({title:'STEP Retry '+run})});
const board='/api/learn/boards/'+canvas.name+'/main';
await api(board,{method:'PUT',body:JSON.stringify({state:{blocks:[],shapes:[],items:[],links:[],strokes:[],exchanges:[]}})});
const bytes=readFileSync('C:/s/fi-fixtures/cad/box.step'),rev=createHash('sha256').update(bytes).digest('hex'),name='box.step',family=familyOf({name});
const {source}=await api('/api/learn/files',{method:'POST',body:JSON.stringify({app:canvas.name,board:'main',name,type:'model/step',size:bytes.length,sha256:rev,family:family.id})});
await api('/api/learn/files/'+source.id,{method:'PUT',headers:{'content-type':'model/step'},body:bytes});
const card={...fileCardFromSource({id:source.id,rev,name,type:'model/step',size:bytes.length},family),id:'retry-step',dx:0,dy:0,w:520,h:420};
await api(board,{method:'PUT',body:JSON.stringify({version:(await api(board)).version,state:{blocks:[card],shapes:[],items:[],links:[],strokes:[],exchanges:[]}})});
const browser=await chromium.launch();
try {
 const context=await browser.newContext({viewport:{width:1600,height:1000}});
 await context.addCookies([{name:'small_session',value:session,url:BASE}]);
 await context.route('**/api/learn/tutor/**',r=>r.abort());
 const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'||r.method()==='PUT')requests.push({url:new URL(r.url()).pathname,method:r.method()});});
 await page.goto(BASE+'/apps/'+canvas.name);
 const retry=page.locator('[data-model-cad-retry]');await retry.waitFor();
 assert.match(await page.locator('[data-block-id="retry-step"]').innerText(),/not configured/);
 const saved=await api(board);let jobId=saved.state.blocks[0].fileRef.job;
 for(let i=0;!jobId&&i<40;i++){await page.waitForTimeout(250);jobId=(await api(board)).state.blocks[0].fileRef.job;}
 assert.ok(jobId);const before=(await api('/api/learn/files/jobs/'+jobId)).job;assert.equal(before.state,'failed');
 const initial=requests.length;await retry.click();
 let after;
 for(let i=0;i<60;i++){after=(await api('/api/learn/files/jobs/'+jobId)).job;if(after.attempt===before.attempt+1&&after.state==='failed')break;await page.waitForTimeout(250);}
 assert.equal(after.id,before.id);assert.equal(after.source,source.id);assert.equal(after.attempt,before.attempt+1);assert.equal(after.state,'failed');
 assert.equal(requests.slice(initial).filter(r=>r.url.endsWith('/retry')).length,1);
 assert.equal(requests.slice(initial).filter(r=>r.url==='/api/learn/files'||r.method==='PUT'&&r.url==='/api/learn/files/'+source.id).length,0);
 await page.reload();await retry.waitFor();
 const final=(await api(board)).state.blocks;assert.equal(final.length,1);assert.equal(final[0].fileRef.job,jobId);assert.equal(final[0].fileRef.source.id,source.id);assert.deepEqual(errors,[]);
 console.log('PASS STEP Retry: real worker failed job attempts '+before.attempt+' -> '+after.attempt+', same job/source, one POST, no reupload, one card after reload. Successful conversion intentionally not asserted.');
} finally {await browser.close();}
