// Actual deployed UI/persistence; execution endpoints are fixtures, never a paid runtime.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
const BASE=process.env.BASE,CP=process.env.SMALL_CP,OUT=process.env.OUT;
assert.equal(BASE,'https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev');
assert.equal(CP,'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev');
assert.ok(OUT&&process.env.TEST_BYPASS_SECRET&&process.env.CANDIDATE_SHA);
mkdirSync(OUT,{recursive:true});
const started=Date.now(),results=[],unexpected=[],errors=[],digest=value=>createHash('sha256').update(value).digest('hex');
let browser,page,session,canvas,original,submitted,setupError;
let fixtureQuote=false,ready=false,submits=0,polls=0,cancels=0,quotes=0;
const code='console.log("answer", input.value); return input.value * 2;',input={value:21};
const api=async(path,method='GET',body)=>{const response=await fetch(BASE+path,{method,headers:{cookie:`small_session=${session}`,origin:BASE,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.ok(response.ok,`${method} ${path}: ${response.status}`);return response.json();};
const state=async()=>(await api(`/api/learn/boards/${canvas.name}/main`)).state;
const until=async(fn,message)=>{const deadline=Date.now()+20000;while(Date.now()<deadline){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error(message);};
const panel=()=>page.locator('[data-inline-code-run]');
async function open(){
 if(!await page.locator('[data-inline-ai]').isVisible()){await page.locator('[data-item-id="code-run"]').click({position:{x:20,y:20}});await page.keyboard.press('Control+k');await page.locator('[data-inline-ai]').waitFor();}
 await page.locator('[data-inline-code-input]').fill(JSON.stringify(input));await page.locator('[data-inline-code-review]').click();await panel().waitFor();return panel();
}
const close=async()=>panel().getByRole('button',{name:'Close',exact:true}).click();
const job=phase=>({id:submitted.id,scope:{app:canvas.name,board:'main'},phase:phase||(ready?'succeeded':'started'),sourceSha256:digest(code),inputSha256:digest(JSON.stringify(input)),reservedMicros:5000,actualCostUsd:null,createdAt:started,result:ready?{status:'ok',stdout:[{level:'log',text:'answer 21'}],result:42,error:null,sourceSha256:digest(code),inputSha256:digest(JSON.stringify(input)),executionStarted:true,terminationConfirmed:false,elapsedMs:1}:null,reason:null});
const checks=[
 ...(process.env.HANDOFF_ONLY==='yes'?[{name:'Natural execution handoff opens input review without quote or execution',fn:async()=>{
  await page.locator('[data-item-id="code-run"]').click({position:{x:20,y:20}});await page.keyboard.press('Control+k');await page.locator('[data-inline-ai]').waitFor();
  await page.locator('[data-inline-prompt]').fill('Run this with the input I choose');await page.locator('[data-inline-submit]').click();await page.locator('[data-inline-tool-action]').waitFor();
  assert.equal(quotes,0);assert.equal(submits,0);await page.getByRole('button',{name:'Review action',exact:true}).click();
  assert.equal(await page.locator('[data-inline-code-input]').inputValue(),'null');assert.equal(quotes,0);assert.equal(submits,0);assert.equal(polls,0);assert.equal(await panel().count(),0);assert.deepEqual((await state()).items,original.items);assert.deepEqual(unexpected,[]);
 }}]:[]),
 {name:'Actual disabled execution quote prevents Run without runtime calls',fn:async()=>{await open();await panel().getByText('Execution is not configured.',{exact:true}).waitFor();assert.equal(await panel().locator('[data-inline-code-run-start]').count(),0);assert.equal(submits,0);await close();}},
 {name:'Fixture quote requires explicit Run and persists a source-bound ticket before POST',fn:async()=>{fixtureQuote=true;await open();await panel().locator('[data-inline-code-run-start]').waitFor();assert.match(await panel().innerText(),/Maximum reservation: \$0.005/);assert.match(await panel().innerText(),/Actual cost is unknown/);assert.equal(submits,0);await panel().locator('[data-inline-code-run-start]').click();await until(()=>polls>0,'Execution polling did not begin');assert.equal(submits,1);assert.deepEqual((await state()).items,original.items);await page.screenshot({path:OUT+'/started.png'});await page.reload();await page.locator('[data-item-id="code-run"]').waitFor();}},
 {name:'Reload requires explicit Resume and does not duplicate execution',fn:async()=>{const before=polls;await open();await panel().getByRole('button',{name:'Resume execution status',exact:true}).waitFor();await page.waitForTimeout(200);assert.equal(polls,before);assert.equal(submits,1);ready=true;await panel().getByRole('button',{name:'Resume execution status',exact:true}).click();await panel().locator('[data-inline-code-output]').waitFor();await panel().getByText('Execution: succeeded.',{exact:false}).waitFor();assert.equal(submits,1);}},
 {name:'Execution output is read-only and preserves the canvas source',fn:async()=>{assert.equal(await panel().getByLabel('Execution stdout',{exact:true}).innerText(),'[log] answer 21');assert.equal(await panel().getByLabel('Execution result',{exact:true}).innerText(),'42');assert.equal(await panel().locator('[contenteditable="true"],textarea').count(),0);assert.deepEqual((await state()).items,original.items);assert.deepEqual((await state()).blocks,original.blocks);assert.equal(submits,1);await page.screenshot({path:OUT+'/result.png'});await close();}},
 {name:'Changed source opens fresh consent without reusing output or deleting the prior ticket',fn:async()=>{await page.keyboard.press('Escape');const changed=await state();changed.items=changed.items.map(item=>item.id==='code-run'?{...item,text:'return 99;'}:item);await api(`/api/learn/boards/${canvas.name}/main`,'PUT',{state:changed});await page.reload();await page.locator('[data-item-id="code-run"]').waitFor();const before=polls;await open();await panel().locator('[data-inline-code-run-start]').waitFor();assert.equal(polls,before);assert.equal(submits,1);assert.equal(await panel().locator('[data-inline-code-output]').count(),0);assert.equal(await panel().getByRole('button',{name:'Resume execution status',exact:true}).count(),0);assert.ok(await page.evaluate(id=>Object.keys(localStorage).filter(key=>key.startsWith('small.code-run:')).map(key=>JSON.parse(localStorage.getItem(key))).some(ticket=>ticket.id===id),submitted.id));assert.equal((await state()).items.find(item=>item.id==='code-run').text,'return 99;');await close();}},
 {name:'Changed JSON input requires a fresh explicit Run and performs no automatic execution',fn:async()=>{await page.keyboard.press('Escape');await api(`/api/learn/boards/${canvas.name}/main`,'PUT',{state:original});await page.reload();await page.locator('[data-item-id="code-run"]').waitFor();await open();await panel().getByRole('button',{name:'Resume execution status',exact:true}).waitFor();await close();await page.locator('[data-inline-code-input]').fill('{"value":100}');const before=polls;await page.locator('[data-inline-code-review]').click();await panel().locator('[data-inline-code-run-start]').waitFor();assert.equal(polls,before);assert.equal(submits,1);assert.equal(await panel().locator('[data-inline-code-output]').count(),0);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);}}

];
try {
 const auth=await fetch(CP+'/test/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`code-run-${started}@example.com`,secret:process.env.TEST_BYPASS_SECRET})});assert.ok(auth.ok);session=(await auth.json()).session;
 canvas=await api('/api/canvases','POST',{title:'Code execution fixture verification'});
 const empty={blocks:[],items:[{id:'code-run',kind:'text',mode:'code',lang:'javascript',text:code,x:120,y:160,w:480,h:240,fresh:false}],shapes:[],links:[],groups:[],areas:[],strokes:[],exchanges:[],sources:[]};await api(`/api/learn/boards/${canvas.name}/main`,'PUT',{state:empty});
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1500,height:1000}});await context.addCookies([{name:'small_session',value:session,url:BASE}]);page=await context.newPage();
 await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(![BASE,CP].includes(url.origin)&&!['blob:','data:'].includes(url.protocol))return route.abort();
  if(process.env.HANDOFF_ONLY==='yes'&&path==='/api/learn/inline/decide')return route.fulfill({json:{decision:'proceed',route:{capability:'note',outcome:'text'},paid:false,token:'tool-action-fixture'}});
  if(process.env.HANDOFF_ONLY==='yes'&&path==='/api/learn/inline/generate'){const body=request.postDataJSON();return route.fulfill({contentType:'text/event-stream',body:`event: done\ndata: ${JSON.stringify({result:{kind:'tool_action',action:'run_code',targetIds:['code-run'],requestId:body.request_id,summary:'Review your input'}})}\n\n`});}
  if(path==='/api/learn/inline/telemetry')return route.continue();
  if(path==='/api/learn/code-runs'&&request.method()==='GET'){quotes++;return fixtureQuote?route.fulfill({json:{available:true,language:'javascript',maximumReservedMicros:5000,limits:{maxRuns:20,maxMicros:100000}}}):route.continue();}
  if(path==='/api/learn/code-runs'&&request.method()==='POST'){
   if(!fixtureQuote){unexpected.push('unapproved-execution');return route.abort();}
   submitted=request.postDataJSON();assert.equal(submitted.executionConfirmed,true);assert.equal(submitted.code,code);assert.deepEqual(submitted.input,input);assert.equal(submitted.maxReservedMicros,5000);assert.equal(submitted.app,canvas.name);assert.equal(submitted.board,'main');
   const stored=await page.evaluate(id=>Object.keys(localStorage).filter(key=>key.startsWith('small.code-run:')).map(key=>JSON.parse(localStorage.getItem(key))).find(ticket=>ticket.id===id),submitted.id);assert.ok(stored,'Ticket must persist before POST');assert.equal(stored.sourceSha256,digest(code));assert.equal(stored.inputSha256,digest(JSON.stringify(input)));assert.equal(stored.code,undefined);assert.equal(stored.input,undefined);submits++;return route.fulfill({status:201,json:{job:job('queued')}});
  }
  if(submitted&&path===`/api/learn/code-runs/${submitted.id}`){polls++;return route.fulfill({json:{job:job()}});}
  if(submitted&&path===`/api/learn/code-runs/${submitted.id}/cancel`){cancels++;return route.fulfill({json:{job:job('cancelled')}});}
  if(path.startsWith('/api/learn/code-runs')){unexpected.push(path);return route.abort();}
  if(['/api/learn/tutor/next-steps','/api/learn/next-steps'].includes(path))return route.fulfill({json:{options:[],suggestions:[]}});
  if(path.startsWith('/api/learn/inline/')||!['GET','HEAD','OPTIONS'].includes(request.method())&&/^\/api\/(ask$|learn\/(ask|tutor|plan|artifact|image|media|scene|transcribe|tts|voice|dive|explore))/.test(path)){unexpected.push(path);return route.abort();}
  return route.continue();
 });
 page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));await page.goto(BASE+'/apps/'+canvas.name);await page.locator('[data-item-id="code-run"]').waitFor();original=await state();
 for(const check of (process.env.HANDOFF_ONLY==='yes'?checks.slice(0,1):checks)){try{await check.fn();results.push({name:check.name,status:'passed'});console.log('PASS '+check.name);}catch(error){results.push({name:check.name,status:'failed',error:error.message});throw error;}}
}catch(error){setupError=error.stack;process.exitCode=1;console.error(error.message);await page?.screenshot({path:OUT+'/failure.png'}).catch(()=>{});}finally{await browser?.close();const counts={passed:results.filter(result=>result.status==='passed').length,failed:results.filter(result=>result.status==='failed').length,skipped:0,interrupted:(process.env.HANDOFF_ONLY==='yes'?1:checks.length)-results.length};writeFileSync(OUT+'/results.json',JSON.stringify({candidate:process.env.CANDIDATE_SHA,base:BASE,canvas:canvas?.name,elapsedMs:Date.now()-started,counts,results,quotes,submits,polls,cancels,unexpected,errors,setupError,limits:'Actual deployed UI and saved board/ticket; disabled quote actual. Submit/status/cancel are deterministic fixtures. No cloud runtime invocation, provider call, CPU-termination or billing verification.'},null,2));console.log(JSON.stringify(counts));}
