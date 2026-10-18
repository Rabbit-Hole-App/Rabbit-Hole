// Actual app + existing local integration stack; deterministic decide/generate fixtures only.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const BASE=process.env.BASE||'http://127.0.0.1:5174',CP=process.env.SMALL_CP||'http://127.0.0.1:9093',OUT=resolve(process.env.OUT||'e2e/shots/ctrlk-notebook');
const approvedDev=new Set(['https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev','https://rabbit-hole-cp-dev.tryrabbithole.workers.dev']);
for(const origin of [BASE,CP])assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)||approvedDev.has(origin),'Only the named dev preview or local integration stack is allowed');
const secret=process.env.TEST_BYPASS_SECRET||(process.env.VARS&&readFileSync(process.env.VARS,'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/,'$2'));assert.ok(secret,'Set named TEST_BYPASS_SECRET or VARS');
mkdirSync(OUT,{recursive:true});const startedAt=Date.now(),run=startedAt.toString(36),results=[],errors=[],requests=[],unexpected=[];let browser,page,session,canvas,setupError;
const NOTEBOOK='https://rabbit-hole-canvas-notebook-dev-ctrlk-tools.tryrabbithole.workers.dev';
const original={id:'nb',type:'notebook',notebook_id:crypto.randomUUID(),dx:0,dy:0,language:'python',active_path:'notebook.ipynb',ipynb_path:'notebook.ipynb',files:['notebook.ipynb'],ipynb:{nbformat:4,nbformat_minor:5,metadata:{kernelspec:{name:'python',display_name:'Python (Pyodide)',language:'python'}},cells:[{id:'a',cell_type:'code',source:'x = 1',metadata:{},execution_count:1,outputs:[{output_type:'stream',name:'stdout',text:'old output'}]},{id:'b',cell_type:'code',source:'x + 1',metadata:{},execution_count:2,outputs:[{output_type:'stream',name:'stdout',text:'2'}]}]}};
const api=async(path,method='GET',body)=>{const r=await fetch(BASE+path,{method,headers:{cookie:`small_session=${session}`,origin:BASE,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.ok(r.ok,`${method} ${path}: ${r.status}`);return r.json();};
const state=async()=>(await api(`/api/learn/boards/${canvas.name}/main`)).state;
const until=async(fn,message)=>{const end=Date.now()+60000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error(message);};
const editor=()=>page.locator('[data-inline-ai]');
const frame=()=>page.frameLocator('[data-notebook-frame]');
const source=()=>frame().locator('.jp-CodeCell .cm-content').first();
const checks=[];const check=(name,fn)=>checks.push({name,fn});
check('actual Jupyter selection opens a scoped source-only preview without changing saved content',async()=>{
 await page.locator('[data-notebook-edit-cells]').waitFor();await until(()=>page.locator('[data-notebook-edit-cells]').isEnabled(),'Notebook did not become ready');
 await source().click();await page.locator('[data-notebook-edit-cells]').click();await editor().waitFor();
 await editor().locator('[data-inline-prompt]').fill('Change the selected assignment to x = 3.');await editor().locator('[data-inline-submit]').click();await editor().locator('[data-inline-accept]').waitFor();await until(()=>editor().locator('[data-inline-accept]').isEnabled(),'No acceptable source preview');
 const request=requests.at(-1);assert.deepEqual(request.request.context.toolSnapshot.notebook.cellIds,['a']);assert.equal(request.request.mode,'edit');assert.equal((await state()).blocks[0].ipynb.cells[0].source,'x = 1');await page.screenshot({path:resolve(OUT,'selected-cell-preview.png')});
});
check('Accept updates actual Jupyter and saved canvas source, clears dependent outputs without execution',async()=>{
 await editor().locator('[data-inline-accept]').click();await until(async()=>(await state()).blocks[0].ipynb.cells[0].source==='x = 3','Accepted source not saved');await until(async()=>(await source().innerText()).trim()==='x = 3','Frame source not updated');
 const cells=(await state()).blocks[0].ipynb.cells;assert.equal(cells[1].source,'x + 1');assert.ok(cells.every(cell=>cell.execution_count===null&&cell.outputs.length===0));
});
check('one canvas Undo restores source and outputs in the live notebook; Redo reapplies',async()=>{
 const surface=page.locator('[data-canvas-surface]'),bounds=await surface.boundingBox();await surface.click({position:{x:20,y:Math.min(bounds.height-20,650)}});await page.keyboard.press('Control+z');await until(async()=>(await state()).blocks[0].ipynb.cells[0].source==='x = 1','Canvas Undo not saved');await until(async()=>(await source().innerText()).trim()==='x = 1','Frame Undo not applied');assert.equal((await state()).blocks[0].ipynb.cells[1].execution_count,2);
 await page.keyboard.press('Control+Shift+z');await until(async()=>(await state()).blocks[0].ipynb.cells[0].source==='x = 3','Redo not saved');await until(async()=>(await source().innerText()).trim()==='x = 3','Frame Redo not applied');
});
check('reload retains accepted source and stale outputs; no cells were run',async()=>{
 await page.reload();await source().waitFor({timeout:120000});await until(async()=>(await source().innerText()).trim()==='x = 3','Reload lost accepted source');const cells=(await state()).blocks[0].ipynb.cells;assert.ok(cells.every(cell=>cell.execution_count===null&&cell.outputs.length===0));await page.screenshot({path:resolve(OUT,'source-reloaded.png')});
});
check('no real provider requests or browser exceptions occurred',async()=>{assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);assert.equal(requests.length,1);});
try{
 const auth=await fetch(CP+'/test/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`native-${run}@example.com`,secret})});assert.ok(auth.ok,`Session ${auth.status}`);session=(await auth.json()).session;
 canvas=await api('/api/canvases','POST',{title:`Native tools ${run}`});await api(`/api/learn/boards/${canvas.name}/main`,'PUT',{state:{strokes:[],shapes:[],items:[],links:[],groups:[],areas:[],exchanges:[],blocks:[original]}});
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1500,height:1000}});await context.addCookies([{name:'small_session',value:session,url:BASE}]);
 await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(![BASE,CP,NOTEBOOK,'https://cdn.jsdelivr.net','https://pypi.org','https://files.pythonhosted.org'].includes(url.origin)&&!['data:','blob:'].includes(url.protocol))return route.abort();
  if(url.pathname==='/api/learn/inline/decide')return route.fulfill({json:{decision:'proceed',route:{capability:'edit',outcome:'edit'},paid:false,token:'annotation-fixture'}});
  if(url.pathname==='/api/learn/inline/generate'){const body=req.postDataJSON();requests.push(body);const ids=body.request.targetIds;return route.fulfill({contentType:'text/event-stream',body:`event: done\ndata: ${JSON.stringify({result:{kind:'edit',summary:'Update selected assignment',plan:{mode:'edit',targetIds:ids,steps:[{tool:'edit_notebook_cells',targetIds:ids,input:{cellIds:['a'],edits:[{id:'a',source:'x = 3'}]}}]}}})}\n\n`});}
  if(['/api/learn/tutor/next-steps','/api/learn/next-steps'].includes(url.pathname))return route.fulfill({json:{set_id:run,generated_at:new Date().toISOString(),options:[],suggestions:[],fingerprint:null}});
  if(!['GET','HEAD','OPTIONS'].includes(req.method())&&/^\/api\/(ask$|learn\/(ask|selection|tutor|plan|artifact|assess|grade|home-ask|course|image|media|inline\/(generate|route)|journey|scene|transcribe|tts|voice|dive|explore))/.test(url.pathname)){unexpected.push(url.pathname);return route.abort();}return route.continue();});
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto(BASE+'/apps/'+canvas.name);await page.locator('[data-notebook-frame]').waitFor();
 for(const {name,fn} of checks){try{await fn();results.push({name,status:'passed'});console.log('PASS '+name);}catch(e){results.push({name,status:'failed',error:e.message});throw e;}}
}catch(e){setupError=e.stack;process.exitCode=1;console.error(e.message);await page?.screenshot({path:resolve(OUT,'failure.png')}).catch(()=>{});}finally{await browser?.close();const counts={passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,skipped:0,interrupted:checks.length-results.length};writeFileSync(resolve(OUT,'results.json'),JSON.stringify({candidate:process.env.CANDIDATE_SHA||'working tree',base:BASE,elapsedMs:Date.now()-startedAt,canvas:canvas?.name,counts,results,errors,unexpected,fixtureGenerations:requests.length,setupError,limitation:'Actual embedded Jupyter bridge and workspace; deterministic model fixtures only. No real-provider quality claim and no cell execution.'},null,2));console.log(JSON.stringify(counts));}
