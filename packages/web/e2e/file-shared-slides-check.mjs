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
const bytes=readFileSync('C:/s/fi-fixtures/lane2/deck.pptx'),rev=createHash('sha256').update(bytes).digest('hex'),name='deck.pptx',family=familyOf({name});
const {source}=await api('/api/learn/files',{method:'POST',body:JSON.stringify({app:canvas.name,board:'main',name,type:'application/vnd.openxmlformats-officedocument.presentationml.presentation',size:bytes.length,sha256:rev,family:family.id})});
await api('/api/learn/files/'+source.id,{method:'PUT',headers:{'content-type':'application/vnd.openxmlformats-officedocument.presentationml.presentation'},body:bytes});
const card={...fileCardFromSource({id:source.id,rev,name,type:'application/vnd.openxmlformats-officedocument.presentationml.presentation',size:bytes.length},family),id:'shared-slides',dx:0,dy:0,w:520,h:420};
await api(board,{method:'PUT',body:JSON.stringify({version:(await api(board)).version,state:{blocks:[card],shapes:[],items:[],links:[],strokes:[],exchanges:[]}})});

const shared=await api(board+'/share',{method:'POST',body:JSON.stringify({shared:true,view:true})});assert.ok(shared.sharing.view);
const {session:viewerSession}=await (await fetch(CP+'/test/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'viewer-'+run+'@example.com',handle:'vw_'+run,secret})})).json();
const browser=await chromium.launch();
try {
 const context=await browser.newContext({viewport:{width:1600,height:1000}});await context.addCookies([{name:"small_session",value:viewerSession,url:BASE}]);const page=await context.newPage();page.setDefaultTimeout(12000);let lists=0,jobs=0,forkName=null;const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/api/learn/files/sources/'+source.id+'/derivatives?*',async route=>{lists++;const q=new URL(route.request().url()).searchParams;if(forkName) assert.equal(q.get('app'),forkName);else assert.equal(q.get('share'),shared.sharing.view);await route.fulfill({json:{derivatives:[{id:'fd_'+ 'a'.repeat(24),kind:'slide',name:'slide-001.png'}]}});});
 await context.route('**/api/learn/files/'+source.id+'/d/*',route=>route.fulfill({contentType:'image/png',body:readFileSync('C:/s/fi-fixtures/image/photo.png')}));
 await context.route('**/api/learn/files/'+source.id+'/jobs',route=>{jobs++;return forkName ? route.continue() : route.abort();});
 await page.goto(BASE+'/b/'+shared.sharing.view);await page.locator('[data-file-doc-slide]').waitFor({timeout:30000});
 const image=page.locator('[data-file-doc-slide-image]');await image.waitFor();await page.waitForFunction(()=>document.querySelector('[data-file-doc-slide-image]')?.naturalWidth>0);assert.ok(lists>0);assert.equal(jobs,0);assert.deepEqual(errors,[]);
 const forkResponse=await fetch(BASE+'/api/learn/boards/fork',{method:'POST',headers:{cookie:'small_session='+viewerSession,'content-type':'application/json'},body:JSON.stringify({source:{token:shared.sharing.view},key:'slides-'+run})});assert.ok(forkResponse.ok);const fork=await forkResponse.json();forkName=fork.name;
 await page.goto(BASE+fork.url);await image.waitFor();await page.waitForTimeout(1200);await page.waitForFunction(()=>document.querySelector('[data-file-doc-slide-image]')?.naturalWidth>0);assert.equal(await page.locator('[data-file-doc-awaiting]').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS forked PPTX keeps readable slide image and does not show conversion failure after expected source-owner submit refusal.');
 console.log('PASS shared PPTX with no job reads ready slide derivative through share scope, renders image, never submits conversion. Converter response mocked; source/board/share real local worker.');
}finally{await browser.close();}
