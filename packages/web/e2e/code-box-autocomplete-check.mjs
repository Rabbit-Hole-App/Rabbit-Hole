// Actual-app local autocomplete acceptance. No provider fixtures or paid calls.
// Run only after coordinator grants the browser window. Credentials come from env.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE=process.env.BASE||'https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev';
const CP=process.env.SMALL_CP||'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev';
const OUT=resolve(process.env.OUT||'e2e/shots/code-box-autocomplete');
const allowed=new Set(['https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev','https://rabbit-hole-cp-dev.tryrabbithole.workers.dev']);
for(const origin of [BASE,CP])assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)||allowed.has(origin),'Only isolated dev/local origins are allowed');
assert.ok(process.env.TEST_BYPASS_SECRET,'TEST_BYPASS_SECRET is required');
assert.ok(process.env.CANDIDATE_SHA,'CANDIDATE_SHA must identify the deployed candidate');
const startedAt=Date.now(),run=startedAt.toString(36),results=[],errors=[],forbidden=[],external=[],writes=[];
let browser,page,session,canvas,sharing=false,setupError;
mkdirSync(OUT,{recursive:true});
const remainingOnly=process.env.REMAINING_ONLY==='1';
const original='local_value = 1\n# Unicode λ\n';
const item=(id,text,x,extra={})=>({id,kind:'text',mode:'code',text,x,y:180,w:450,h:260,fresh:false,...extra});
const seed={items:[item('code-main',original,80,remainingOnly?{lang:'python'}:{}),item('code-other','untouched = True\n',600,{lang:'python'}),item('plain','Heading and literal <b>text</b>',80,{mode:'text',y:500,level:'h1'})],blocks:[],shapes:[],links:[],strokes:[],groups:[],areas:[],exchanges:[]};
const api=async(path,method='GET',body)=>{const response=await fetch(BASE+path,{method,headers:{cookie:`small_session=${session}`,origin:BASE,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.ok(response.ok,`${method} ${path}: ${response.status}`);return response.json();};
const state=async()=>(await api(`/api/learn/boards/${canvas.name}/main`)).state;
const saved=async id=>(await state()).items.find(entry=>entry.id===id);
const until=async(fn,message)=>{const deadline=Date.now()+15000;while(Date.now()<deadline){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error(message);};
const box=(id='code-main',target=page)=>target.locator(`[data-item-id="${id}"]`);
const editor=()=>page.locator('[data-code-box-editor]');
const input=()=>page.locator('[data-code-box-input]');
const source=async()=>(await input().locator('.cm-line').allTextContents()).join('\n');
const enter=async(id='code-main')=>{await box(id).dblclick({position:{x:30,y:35}});await input().waitFor();assert.equal(await editor().count(),1);};
const exit=async()=>{await input().focus();await page.keyboard.press('Control+Enter');await until(async()=>await editor().count()===0,'Code editor did not close');};
const replace=async text=>{await input().focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(text);};
const popup=()=>page.locator('.cm-tooltip-autocomplete');
async function intercept(context){await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();
  if(![BASE,CP].includes(url.origin)&&!['data:','blob:'].includes(url.protocol)){external.push(url.origin);return route.abort();}
  if(['/api/learn/tutor/next-steps','/api/learn/next-steps'].includes(path)||/^\/api\/learn\/boards\/shared\/[^/]+\/next-steps$/.test(path))return route.fulfill({json:{set_id:run,generated_at:new Date().toISOString(),options:[],suggestions:[],fingerprint:null}});
  const unsafe=/^\/api\/(ask(?:\/|$)|repositories\/[^/]+\/(ask|learn-course)|learn\/(ask|selection|plan|artifact|assess|grade|home-ask|course|image|media|upload|inline\/(decide|generate|route)|journey|scene|transcribe|tts|voice|dive|explore|cad)|.*(?:execute|kernel|notebooks?\/.*(?:run|exec|files)))/;
  if(!['GET','HEAD','OPTIONS'].includes(method)){writes.push(`${method} ${path}`);if(unsafe.test(path)||/\/(assets|files|uploads?)(\/|$)/.test(path)){forbidden.push(`${method} ${path}`);return route.abort();}}
  return route.continue();
});}
const checks=[];const check=(name,fn)=>checks.push({name,fn});
check('only active Code box mounts editor; new unspecified language is Plain text',async()=>{
  assert.equal(await editor().count(),0);await enter();assert.equal(await editor().getByLabel('Code language').inputValue(),'text');
  assert.equal(await box('code-other').locator('[data-code-box-editor]').count(),0);assert.equal(await source(),original);
  await editor().getByLabel('Code language').selectOption('python');await until(async()=>(await saved('code-main')).lang==='python','Language did not persist');
  // Existing canvas metadata controls finish the current editing session.
  // Re-enter after that persisted language change before typing source.
  if(!await editor().count())await enter();
});
check('local keyword completion replaces range; one editor Undo/Redo restores completion',async()=>{
  await replace('return');await input().locator('.cm-line span').first().waitFor();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await replace('ret');await page.keyboard.press('Control+Space');await popup().waitFor();
  await page.getByRole('option',{name:'return',exact:true}).click();assert.equal(await source(),'return');
  await page.keyboard.press('Control+z');assert.equal(await source(),'ret');await page.keyboard.press('Control+y');assert.equal(await source(),'return');
});
check('identifiers, arrows, Tab, Escape and ordinary indentation remain local',async()=>{
  await replace('local_unique_name = 1\nlocal_uni');await page.keyboard.press('Control+Space');await popup().waitFor();
  await until(()=>page.getByRole('option',{name:'local_unique_name',exact:true}).isVisible(),'Local identifier missing');
  // CodeMirror deliberately ignores popup navigation during its 75ms
  // interaction delay; exercise keyboard behavior after that documented guard.
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowUp');await page.keyboard.press('Tab');assert.match(await source(),/\nlocal_unique_name$/);
  await replace('ret');await page.keyboard.press('Control+Space');await popup().waitFor();await page.keyboard.press('Escape');assert.equal(await popup().count(),0);assert.equal(await source(),'ret');
  await replace('');await page.keyboard.press('Tab');assert.match(await source(),/^\s+$/);await page.keyboard.press('Enter');assert.ok((await source()).includes('\n'));
});
check('editing does not move/delete canvas objects; native history remains one exit transaction',async()=>{
  await replace(original);await exit();await until(async()=>(await saved('code-main')).text===original,'Baseline save missing');
  await enter();await replace('saved_value = 2\n');await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowRight');await exit();
  await until(async()=>(await saved('code-main')).text==='saved_value = 2\n','Edited source not saved');
  await page.keyboard.press('Control+z');await until(async()=>(await saved('code-main')).text===original,'One canvas Undo did not restore editor transaction');
  await page.keyboard.press('Control+Shift+Z');await until(async()=>(await saved('code-main')).text==='saved_value = 2\n','One canvas Redo did not restore source');
  assert.equal((await saved('code-main')).x,80);assert.equal((await saved('code-main')).y,180);assert.deepEqual(await saved('code-other'),seed.items[1]);
});
check('literal Text-Code roundtrip, language and reload preserve native identity',async()=>{
  const literal='\tUnicode λ\n<b>literal</b>\n';await enter();await replace(literal);await exit();await until(async()=>(await saved('code-main')).text===literal,'Literal save missing');
  await box().click();await page.locator('button[data-text-mode="text"]').click();await until(async()=>((await saved('code-main')).mode||'text')==='text','Text mode missing');
  assert.equal((await saved('code-main')).text,literal);await page.locator('button[data-text-mode="code"]').click();await until(async()=>(await saved('code-main')).mode==='code','Code mode missing');
  await page.reload();await box().waitFor();const after=await saved('code-main');assert.equal(after.text,literal);assert.equal(after.lang,'python');assert.equal(after.id,'code-main');
});
check('Duplicate persists literal source and language without upload or generation',async()=>{
  await box().click();await page.keyboard.press('Control+d');await until(async()=>(await state()).items.length===4,'Duplicate was not saved');
  const copy=(await state()).items.find(entry=>!seed.items.some(original=>original.id===entry.id));assert.equal(copy.text,(await saved('code-main')).text);assert.equal(copy.lang,'python');
  await page.reload();await box(copy.id).waitFor();assert.equal((await saved(copy.id)).text,copy.text);
  // Duplicate is intentionally offset over the original; remove the verified
  // fixture copy through the normal UI before subsequent pointer checks.
  await box(copy.id).click({position:{x:40,y:40}});await page.keyboard.press('Delete');
  await until(async()=>!(await saved(copy.id)),'Verified duplicate cleanup did not persist');
});
check('Ctrl+K opens existing inline editor for the exact active code selection without generation',async()=>{
  await enter();await page.keyboard.press('Control+a');await page.keyboard.press('Control+k');await page.locator('[data-inline-ai]').waitFor();
  const context=page.locator('[data-inline-ai]');assert.ok(await context.isVisible());
  await context.getByRole('button',{name:/Context/}).click();const selected=context.locator('[data-inline-context-entry="selected"]');await selected.waitFor();assert.equal(await selected.count(),1);assert.match(await selected.innerText(),/Unicode λ/);assert.ok(!(await selected.innerText()).includes('untouched'));
  assert.equal(forbidden.length,0);await page.keyboard.press('Escape');if(await context.count())await page.keyboard.press('Escape');
  if(await editor().count())await exit();
});
check('completion popup stays within usable canvas at two zooms with Search open',async()=>{
  await page.getByRole('tab',{name:'Find text on canvas',exact:true}).click();const panel=page.locator('[data-canvas-search]');await panel.waitFor();
  for(const zoom of ['Zoom out','Zoom in']){
    await page.getByRole('button',{name:zoom,exact:true}).click();await enter();await replace('return');await input().locator('.cm-line span').first().waitFor();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await replace('ret');await page.keyboard.press('Control+Space');await popup().waitFor();
    const tip=await popup().boundingBox(),caret=await input().boundingBox(),side=await panel.boundingBox();assert.ok(tip&&caret&&side);
    const viewport=page.viewportSize();assert.ok(tip.x>=0&&tip.y>=0&&tip.x+tip.width<=viewport.width+1&&tip.y+tip.height<=viewport.height+1,'Popup is clipped by viewport');
    assert.ok(tip.x+tip.width<=side.x+1||tip.x>=side.x+side.width-1,'Popup overlaps open side panel');
    assert.ok(Math.abs(tip.y-caret.y)<caret.height+100,'Popup detached from code caret');
    assert.ok((await popup().evaluate(node=>parseFloat(getComputedStyle(node).fontSize)))>=12,'Popup is unreadably scaled');
    await page.keyboard.press('Escape');await exit();
  }
  await page.screenshot({path:resolve(OUT,'code-panel-zoom.png')});
});
check('signed-out shared viewer can read code but cannot edit or change language',async()=>{
  const shared=await api(`/api/learn/boards/${canvas.name}/main/share`,'POST',{shared:true,view:true,public_view:true});const token=shared.sharing?.view;assert.ok(token,'Share token missing');sharing=true;
  const context=await browser.newContext({viewport:{width:1500,height:1000}});await intercept(context);const viewer=await context.newPage();viewer.setDefaultTimeout(15000);
  try{await viewer.goto(`${BASE}/b/${token}`);await box('code-main',viewer).waitFor();const before=await saved('code-main');const target=await box('code-main',viewer).boundingBox();assert.ok(target);await viewer.mouse.dblclick(target.x+Math.min(30,target.width/2),target.y+Math.min(30,target.height/2));assert.equal(await viewer.locator('[data-code-box-editor]').count(),0);assert.equal(await viewer.locator('button[data-text-mode]').count(),0);assert.deepEqual(await saved('code-main'),before);await viewer.screenshot({path:resolve(OUT,'code-readonly.png')});}finally{await context.close();}
});
check('no provider/execution/upload requests or browser exceptions',async()=>{assert.deepEqual(forbidden,[]);assert.deepEqual(errors,[]);});
try{
  const auth=await fetch(CP+'/test/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`code-autocomplete-${run}@example.com`,secret:process.env.TEST_BYPASS_SECRET})});assert.ok(auth.ok,`Session ${auth.status}`);session=(await auth.json()).session;
  canvas=await api('/api/canvases','POST',{title:`Code autocomplete ${run}`});await api(`/api/learn/boards/${canvas.name}/main`,'PUT',{state:seed});
  browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1500,height:1000}});await context.addCookies([{name:'small_session',value:session,url:BASE}]);await intercept(context);
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));await page.goto(BASE+'/apps/'+canvas.name);await box().waitFor();
  for(const [index,{name,fn}]of checks.entries()){if(remainingOnly&&index<7){results.push({name,status:'skipped',reason:'ponytail: reuse seven passed checks from autocomplete-51e11889-run8; this run targets remaining checks only'});continue;}try{await fn();results.push({name,status:'passed'});console.log('PASS '+name);}catch(error){results.push({name,status:'failed',error:error.message});throw error;}}
}catch(error){setupError=error.stack;process.exitCode=1;console.error(error.message);await page?.screenshot({path:resolve(OUT,'failure.png')}).catch(()=>{});}
finally{
  if(sharing)await api(`/api/learn/boards/${canvas.name}/main/share`,'POST',{shared:false}).catch(error=>{errors.push(`Share cleanup failed: ${error.message}`);process.exitCode=1;});
  await browser?.close();const counts={passed:results.filter(result=>result.status==='passed').length,failed:results.filter(result=>result.status==='failed').length,skipped:results.filter(result=>result.status==='skipped').length,interrupted:checks.length-results.length};
  writeFileSync(resolve(OUT,'results.json'),JSON.stringify({candidate:process.env.CANDIDATE_SHA,dirty:process.env.CANDIDATE_DIRTY||'must be recorded by coordinator',base:BASE,canvas:canvas?.name,elapsedMs:Date.now()-startedAt,counts,results,errors,forbidden,external,writes,setupError,limitations:['Prepared actual-app harness; only a completed run establishes coverage.','IME, stale remote-conflict and fork/trash-restore need separate focused scenarios; not covered by these counts.']},null,2));console.log(JSON.stringify(counts));
}
