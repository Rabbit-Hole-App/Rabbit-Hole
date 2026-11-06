// Real existing dev converter through FileJobs; source/board/job/derivative routes are never mocked.
import {chromium} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {fileCardFromSource} from '../src/file-to-canvas.js';
import {familyOf} from '../src/file-capabilities.js';
const BASE='https://rabbit-hole-web-dev-fi-jobs.tryrabbithole.workers.dev',CP='https://rabbit-hole-cp-dev.tryrabbithole.workers.dev';
assert.ok(process.env.DEV_TEST_BYPASS,'DEV_TEST_BYPASS required');
const fixtures=[['STEP','cad/box.step','model/step','[data-model-card][data-model-state="ready"]'],['audio',process.env.AUDIO_FIXTURE||new URL('../src/__fixtures__/media/tone.flac',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),'audio/flac','[data-media-state="derivative-ready"]'],['PPTX','lane2/deck.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation','[data-file-doc-slide-image]']];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const browser=await chromium.launch();let passed=0,failed=0;
try{for(const [label,path,type,marker] of fixtures.filter(f=>!process.env.ONLY||f[0]===process.env.ONLY)){
 let context;const errors=[];
 try{
  const run=crypto.randomUUID().slice(0,8);
  const minted=await fetch(CP+'/test/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'converter-'+run+'@example.com',handle:'cv_'+run,secret:process.env.DEV_TEST_BYPASS})});assert.ok(minted.ok);const {session}=await minted.json();
  const api=async(path,init={})=>{const r=await fetch(BASE+path,{...init,headers:{cookie:'small_session='+session,'content-type':'application/json',...init.headers}});const body=await r.json();assert.ok(r.ok,body.error||String(r.status));return body;};
  await api('/api/profile',{method:'PUT',body:JSON.stringify({handle:'cv_'+run})});
  const canvas=await api('/api/canvases',{method:'POST',body:JSON.stringify({title:'Converter '+label+' '+run})}),board='/api/learn/boards/'+canvas.name+'/main';
  const empty={blocks:[],shapes:[],items:[],strokes:[],links:[],exchanges:[]};await api(board,{method:'PUT',body:JSON.stringify({state:empty})});
  const bytes=readFileSync(/^[A-Za-z]:/.test(path)?path:'C:/s/fi-fixtures/'+path),name=path.split('/').at(-1),rev=sha(bytes),fam=familyOf({name});
  const made=await api('/api/learn/files',{method:'POST',body:JSON.stringify({app:canvas.name,board:'main',name,type,size:bytes.length,sha256:rev,family:fam.id})});
  if(made.upload)await api('/api/learn/files/'+made.source.id,{method:'PUT',headers:{'content-type':type},body:bytes});
  const card={...fileCardFromSource({id:made.source.id,rev,name,type,size:bytes.length},fam),id:'converter-'+run,dx:0,dy:0,w:560,h:440};
  await api(board,{method:'PUT',body:JSON.stringify({state:{...empty,blocks:[card]},version:(await api(board)).version})});
  const open=async()=>{
   context=await browser.newContext({viewport:{width:1600,height:1000}});await context.addCookies([{name:'small_session',value:session,url:BASE}]);
   for(const path of ['ask','selection','tutor/plan','artifact','home-ask','journey','course','media'])await context.route('**/api/learn/'+path,r=>r.abort());
   await context.route('**/api/learn/tutor/next-steps',r=>r.fulfill({json:{steps:[]}}));
   const page=await context.newPage();page.on('response',async r=>{if(r.url().includes('/api/learn/files')&&r.status()>=400)console.log('HTTP '+r.status()+' '+new URL(r.url()).pathname);if(r.url().includes('/api/learn/files/jobs/')){const b=await r.json().catch(()=>null);if(b?.job)console.log('JOB '+JSON.stringify({id:b.job.id,state:b.job.state,error:b.job.error,attempt:b.job.attempt}));}});page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR '+label+' '+e.message);});await page.goto(BASE+'/apps/'+canvas.name);
   if(label==='audio'){
    const initial=page.locator('audio');await initial.waitFor({timeout:180000});
    if(!(await initial.getAttribute('aria-label')).includes('converted copy'))await initial.evaluate(async el=>{el.muted=true;await Promise.race([el.play().catch(()=>{}),new Promise(r=>setTimeout(r,4000))]);el.pause();try{el.currentTime=0.1;}catch{}});
   }
   await page.waitForTimeout(8000);console.log('VISIBLE '+label+' '+(await page.locator('body').innerText()).slice(-2500));await page.screenshot({path:'C:/s/spec/fi-converter-state-'+label+'.png'});await page.locator(marker).waitFor({timeout:180000});
   if(label==='PPTX')await page.waitForFunction(()=>document.querySelector('[data-file-doc-slide-image]')?.naturalWidth>0);
   if(label==='audio'){const audio=page.locator('audio');await audio.evaluate(async el=>{el.muted=true;await el.play();});await page.waitForTimeout(100);assert.ok(await audio.evaluate(el=>!el.error&&el.currentTime>0));await audio.evaluate(el=>el.pause());}
   return page;
  };
  const page=await open();await page.waitForTimeout(2000);
  const saved=(await api(board)).state.blocks.filter(b=>b.fileRef?.source?.id===made.source.id);assert.equal(saved.length,1);assert.ok(saved[0].fileRef.job);
  const job=(await api('/api/learn/files/jobs/'+saved[0].fileRef.job)).job;assert.ok(['ready','ready_with_limitations'].includes(job.state),job.state);console.log('READY '+label+' job '+job.id+' attempt '+job.attempt);
  const original=await fetch(BASE+'/api/learn/files/'+made.source.id,{headers:{cookie:'small_session='+session}});assert.ok(original.ok);assert.equal(sha(Buffer.from(await original.arrayBuffer())),rev);
  await context.close();context=null;await open();assert.deepEqual(errors,[]);passed++;console.log('PASS '+label+' visible real conversion, original hash intact, fresh browser context reopens saved derivative.');
 }catch(error){failed++;console.log('FAIL '+label+' '+error.message);const page=context?.pages()[0];if(page){console.log('VISIBLE '+(await page.locator('body').innerText().catch(()=>'')));await page.screenshot({path:'C:/s/spec/fi-converter-failure-'+label+'.png'}).catch(()=>{});}}finally{await context?.close();}
}}finally{await browser.close();}
console.log(passed+' passed, '+failed+' failed, 0 skipped, 0 interrupted');process.exitCode=failed?1:0;
