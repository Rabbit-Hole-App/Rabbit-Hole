import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { fileCardFromSource } from '../src/file-to-canvas.js';
import { familyOf } from '../src/file-capabilities.js';
// Shared PPTX with no job reads existing derivatives; only converter result routes are mocked.
const BASE=process.env.BASE || 'http://127.0.0.1:9091', CP=process.env.SMALL_CP || 'http://127.0.0.1:9093';
for(const u of [BASE,CP]) assert.match(u,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const secret=readFileSync(process.env.VARS,'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run=Date.now().toString(36);
const {session}=await (await fetch(CP+'/test/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'step-'+run+'@example.com',handle:'st_'+run,secret})})).json();
const api=async(path,init={})=>{const r=await fetch(BASE+path,{...init,headers:{cookie:'small_session='+session,'content-type':'application/json',...init.headers}});const body=await r.json();assert.ok(r.ok,body.error || String(r.status));return body;};
const canvas=await api('/api/canvases',{method:'POST',body:JSON.stringify({title:'STEP Retry '+run})});
const board='/api/learn/boards/'+canvas.name+'/main';
await api(board,{method:'PUT',body:JSON.stringify({state:{blocks:[],shapes:[],items:[],links:[],strokes:[],exchanges:[]}})});
const bytes=readFileSync('C:/s/fi-fixtures/gltf/separate/cube.gltf'),rev=createHash('sha256').update(bytes).digest('hex'),name='cube.gltf',family=familyOf({name});
const {source}=await api('/api/learn/files',{method:'POST',body:JSON.stringify({app:canvas.name,board:'main',name,type:'model/gltf+json',size:bytes.length,sha256:rev,family:family.id})});
await api('/api/learn/files/'+source.id,{method:'PUT',headers:{'content-type':'model/gltf+json'},body:bytes});
const card={...fileCardFromSource({id:source.id,rev,name,type:'model/gltf+json',size:bytes.length},family),id:'shared-slides',dx:0,dy:0,w:520,h:420};
card.fileRef.view={entry:name};card.fileRef.bundle=[];
for(const [dep,type] of [['cube.bin','application/octet-stream'],['cube_texture.png','image/png']]){
 const content=readFileSync('C:/s/fi-fixtures/gltf/separate/'+dep),rev=createHash('sha256').update(content).digest('hex');
 const made=await api('/api/learn/files',{method:'POST',body:JSON.stringify({app:canvas.name,board:'main',name:dep,type,size:content.length,sha256:rev,family:'model-part'})});
 if(made.upload)await api('/api/learn/files/'+made.source.id,{method:'PUT',headers:{'content-type':type},body:content});
 card.fileRef.bundle.push({path:dep,source:{id:made.source.id,rev},family:'model-part'});
}
await api(board,{method:'PUT',body:JSON.stringify({version:(await api(board)).version,state:{blocks:[card],shapes:[],items:[],links:[],strokes:[],exchanges:[]}})});

const shared=await api(board+'/share',{method:'POST',body:JSON.stringify({shared:true,view:true})});assert.ok(shared.sharing.view);
const {session:viewerSession}=await (await fetch(CP+'/test/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'viewer-'+run+'@example.com',handle:'vw_'+run,secret})})).json();

const browser=await chromium.launch();let checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
try{
 const context=await browser.newContext({viewport:{width:1600,height:1000}});await context.addCookies([{name:'small_session',value:viewerSession,url:BASE}]);
 const blocked=[];for(const path of ['ask','selection','tutor/plan','artifact','home-ask'])await context.route('**/api/learn/'+path,r=>{blocked.push(path);return r.abort();});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=page.locator('[data-model-card][data-model-state="ready"]');
 const scope=async query=>{for(const source of [card.fileRef.source,...card.fileRef.bundle.map(x=>x.source)]){
  const r=await fetch(BASE+'/api/learn/files/'+source.id+query,{headers:{cookie:'small_session='+viewerSession}});assert.equal(r.status,200);assert.equal(createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),source.rev);pass('authorized original bytes '+source.id);
 }};
 await scope('?share='+shared.sharing.view);
 await page.goto(BASE+'/b/'+shared.sharing.view);await ready.waitFor({timeout:30000});pass('shared bundle renders ready');await page.reload();await ready.waitFor({timeout:30000});pass('shared bundle reload ready');
 const response=await fetch(BASE+'/api/learn/boards/fork',{method:'POST',headers:{cookie:'small_session='+viewerSession,'content-type':'application/json'},body:JSON.stringify({source:{token:shared.sharing.view},key:'bundle-'+run})});assert.ok(response.ok);const fork=await response.json();
 await scope('?app='+encodeURIComponent(fork.name)+'&board=main');
 await page.goto(BASE+fork.url);await ready.waitFor({timeout:30000});pass('forked bundle renders ready');await page.reload();await ready.waitFor({timeout:30000});pass('forked bundle reload ready');
 assert.deepEqual(errors,[]);pass('no page exceptions');assert.deepEqual(blocked,[]);pass('no model request attempted');console.log(checks+' passed, 0 failed, 0 skipped');
}finally{await browser.close();}
