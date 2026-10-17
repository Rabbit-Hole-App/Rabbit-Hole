// Actual-app card Edit verification with deterministic model responses. No model requests leave the browser.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const BASE=process.env.BASE||'http://127.0.0.1:5441', CP=process.env.SMALL_CP||'http://127.0.0.1:9093';
for(const origin of [BASE,CP])assert.match(origin,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const OUT=resolve(process.env.OUT||'e2e/shots/card-edit');mkdirSync(OUT,{recursive:true});
const secret=process.env.TEST_BYPASS_SECRET||(process.env.VARS&&readFileSync(process.env.VARS,'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/,'$2'));
assert.ok(secret,'Set named TEST_BYPASS_SECRET or VARS');
const run=Date.now().toString(36),checks=[],results=[],errors=[],unexpected=[],requests=[];
let session,canvas,page,browser,proposal={title:'Concise explanation',body:'Short revision with $x^2$.',more:[]};
const original={id:'editable',type:'explanation',title:'Long explanation',body:Array.from({length:28},(_,i)=>`Paragraph ${i}: ${i===27?'BEYOND_VIEWPORT_TARGET':'Readable original material'}.`).join('\n\n'),more:[{label:'Details',text:'Structured details preserved as a field.'}],w:560,h:260,dx:0,dy:0};
const mode=process.env.CARD_EDIT_LAYOUT||'scrollable';
if(mode==='auto'){delete original.w;delete original.h;}
if(mode==='full')original.cardLayout={mode:'full',fullWidth:560,scrollableSize:{w:560,h:260},slot:{w:560,h:260}};
let originalBox,neighborBox;
const geometry=async id=>page.locator(`[data-block-id="${id}"]`).boundingBox();
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<2,`${label}: ${a} vs ${b}`);
const api=async(path,method='GET',body)=>{const r=await fetch(BASE+path,{method,headers:{cookie:`small_session=${session}`,origin:BASE,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.ok(r.ok,`${method} ${path}: ${r.status}`);return r.json();};
const until=async(fn,label)=>{const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,80));}throw Error(label);};
const state=async()=>(await api(`/api/learn/boards/${canvas.name}/main`)).state;
const savedCard=async()=>(await state()).blocks.find(b=>b.id==='editable');
const card=()=>page.locator('[data-block-id="editable"]');
const editor=()=>page.locator('[data-inline-ai]');
const select=async()=>{await card().click({position:{x:70,y:22}});await page.keyboard.press('Control+k');await editor().waitFor();await editor().locator('[data-inline-mode-toggle]').click();await editor().locator('[data-inline-mode="edit"]').click();};
const send=async(text)=>{await editor().locator('[data-inline-prompt]').fill(text);await editor().locator('[data-inline-submit]').click();await editor().locator('[data-inline-accept]').waitFor();await until(()=>editor().locator('[data-inline-accept]').isEnabled(),'No acceptable edit preview');};
const check=(name,fn)=>checks.push({name,fn});
check('complete structured target includes content beyond the scroll viewport',async()=>{originalBox=await geometry('editable');neighborBox=await geometry('neighbour');await select();await send('Explain this more simply and keep the mathematics.');assert.match(JSON.stringify(requests.at(-1).request.context.target),/BEYOND_VIEWPORT_TARGET/);assert.match(JSON.stringify(requests.at(-1).request.context.target),/Structured details preserved/);assert.deepEqual(await savedCard(),original);});
check('Escape discards the preview without changing the card',async()=>{await page.keyboard.press('Escape');await until(async()=>await editor().count()===0,'Editor stayed open');assert.deepEqual(await savedCard(),original);});
check('Refine receives the current proposal and preserves the original until Accept',async()=>{await select();await send('Organize this into a concise summary.');proposal={title:'Refined explanation',body:'Refined content with $x^2$ and a final note.',more:[]};await send('Keep the equation and add a final note.');assert.match(JSON.stringify(requests.at(-1).revise),/Short revision/);assert.deepEqual(await savedCard(),original);await page.screenshot({path:resolve(OUT,'preview.png')});});
check('Accept changes the existing card once, preserving its identity, dimensions and neighbours',async()=>{const before=await state();await editor().locator('[data-inline-accept]').click();await until(async()=>(await savedCard()).title==='Refined explanation','Accepted edit not persisted');const after=await state(),edited=after.blocks.find(b=>b.id==='editable');assert.equal(after.blocks.length,before.blocks.length);for(const key of ['id','type','w','h','dx','dy'])assert.equal(edited[key],original[key],key);assert.deepEqual(after.blocks.find(b=>b.id==='neighbour'),before.blocks.find(b=>b.id==='neighbour'));assert.equal(edited.body,proposal.body);const box=await geometry('editable'),neighbor=await geometry('neighbour');for(const key of ['x','y','width'])near(box[key],originalBox[key],`edited ${key}`);for(const key of ['x','y','width','height'])near(neighbor[key],neighborBox[key],`neighbour ${key}`);if(mode==='full')assert.ok(box.height<originalBox.height-100,'Full content shrinks after shortening');else near(box.height,originalBox.height,'Scrollable outer height');});
check('one Undo restores original content and one Redo restores the accepted edit',async()=>{if(await editor().count())await page.keyboard.press('Escape');await page.locator('[data-canvas-surface]').click({position:{x:150,y:650}});await page.keyboard.press('Control+z');await until(async()=>(await savedCard()).body===original.body,'One Undo did not restore original');await page.keyboard.press('Control+Shift+z');await until(async()=>(await savedCard()).body===proposal.body,'One Redo did not restore accepted revision');});
check('accepted structured content survives server reload',async()=>{await page.reload();await card().waitFor();assert.equal((await savedCard()).body,proposal.body);assert.deepEqual((await savedCard()).more,[]);await page.screenshot({path:resolve(OUT,'accepted-reloaded.png')});});
check('browser remains error-free and no nonfixture model request escaped',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.ok(requests.length>=3);});
let setupError;
try{
 const auth=await fetch(CP+'/test/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`cardedit-${run}@example.com`,secret})});assert.ok(auth.ok);session=(await auth.json()).session;
 canvas=await api('/api/canvases','POST',{title:`Card edit acceptance ${run}`});await api(`/api/learn/boards/${canvas.name}/main`,'PUT',{state:{strokes:[],shapes:[],items:[],links:[],groups:[],areas:[],exchanges:[],blocks:[original,{id:'neighbour',type:'explanation',title:'Unchanged neighbour',body:'Not an edit target.',dx:700,dy:0}]}});
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1500,height:1000}});await context.addCookies([{name:'small_session',value:session,url:BASE}]);
 await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(![BASE,CP].includes(url.origin)&&!['data:','blob:'].includes(url.protocol))return route.abort();
  if(url.pathname==='/api/learn/inline/decide')return route.fulfill({json:{decision:'proceed',route:{capability:'edit',outcome:'edit'},paid:false,token:'deterministic-card-edit'}});
  if(url.pathname==='/api/learn/inline/generate'){requests.push(req.postDataJSON());return route.fulfill({contentType:'text/event-stream',body:`event: done\ndata: ${JSON.stringify({result:{kind:'edit',summary:'Deterministic structured revision',ops:[{op:'replace_card_content',id:'editable',content:proposal}]}})}\n\n`});}
  if(['/api/learn/tutor/next-steps','/api/learn/next-steps'].includes(url.pathname))return route.fulfill({json:{set_id:run,generated_at:new Date().toISOString(),options:[],suggestions:[],fingerprint:null}});
  if(!['GET','HEAD','OPTIONS'].includes(req.method())&&/^\/api\/(ask$|learn\/(ask|selection|tutor|plan|artifact|assess|grade|home-ask|course|image|media|inline\/(generate|route)|journey|scene|transcribe|tts|voice|dive|explore))/.test(url.pathname)){unexpected.push(url.pathname);return route.abort();}return route.continue();});
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto(BASE+'/apps/'+canvas.name);await card().waitFor();
 for(const {name,fn} of checks){try{await fn();results.push({name,status:'passed'});console.log('PASS '+name);}catch(e){results.push({name,status:'failed',error:e.message});throw e;}}
}catch(e){setupError=e.stack;process.exitCode=1;console.error(e.message);await page?.screenshot({path:resolve(OUT,'failure.png')}).catch(()=>{});}finally{await browser?.close();const counts={passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,skipped:0,interrupted:checks.length-results.length};writeFileSync(resolve(OUT,'results.json'),JSON.stringify({candidate:process.env.CANDIDATE_SHA||'working tree',base:BASE,layout:mode,canvas:canvas?.name,counts,results,errors,unexpected,fixtureGenerations:requests.length,setupError,limitation:'Deterministic model fixtures verify wiring only; no real-model quality claim.'},null,2));console.log(JSON.stringify(counts));}
