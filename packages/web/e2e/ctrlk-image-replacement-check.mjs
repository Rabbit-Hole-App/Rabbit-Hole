// Deployed image extraction UI and actual dev source storage; model outputs are fixtures.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
const BASE=process.env.BASE,CP=process.env.SMALL_CP,OUT=process.env.OUT;
assert.equal(BASE,'https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev');
assert.equal(CP,'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev');
assert.ok(OUT&&process.env.TEST_BYPASS_SECRET&&process.env.CANDIDATE_SHA,'Provide named dev auth, output directory and exact SHA');
mkdirSync(OUT,{recursive:true});const started=Date.now(),results=[],unexpected=[],errors=[];let browser,page,session,canvas,original,source,setupError;
const api=async(path,method='GET',body)=>{const response=await fetch(BASE+path,{method,headers:{cookie:`small_session=${session}`,origin:BASE,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.ok(response.ok,`${method} ${path}: ${response.status}`);return response.json();};
const state=async()=>(await api(`/api/learn/boards/${canvas.name}/main`)).state;
const until=async(fn,message)=>{const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,150));}throw Error(message);};

let scenario='table',stale=false,generated=0;
const content=kind=>({table:{kind:'card',block:{type:'table',columns:['Label','Value'],rows:[['recognized label','2']]}},code:{kind:'card',block:{type:'snippet',code:'return input + 2;'}},equation:{kind:'equation',latex:'x^2'},diagram:{kind:'diagram',spec:{shapes:[{id:'a',label:'Input'},{id:'b',label:'Output'}],connectors:[{from:'a',to:'b'}]}}}[kind]);
const clean=()=>({blocks:[structuredClone(original)],items:[],shapes:[],links:[],groups:[],areas:[],strokes:[],exchanges:[],sources:[]});
const reset=async()=>{stale=false;await api(`/api/learn/boards/${canvas.name}/main`,'PUT',{state:clean()});await page.goto(BASE+'/apps/'+canvas.name);await page.reload();await page.locator('[data-block-id="image"]').waitFor();original=(await state()).blocks.find(b=>b.id==='image');};
const open=async(kind)=>{
 scenario=kind;await page.locator('[data-block-id="image"]').click({position:{x:100,y:40}});await page.locator('[data-block-id="image"]').focus();await page.keyboard.press('Control+k');
 const editor=page.locator('[data-inline-ai]');await editor.waitFor();
 if(await editor.locator('[data-inline-mode-toggle]').getAttribute('data-inline-mode-current')!=='edit'){await editor.locator('[data-inline-mode-toggle]').click();await editor.locator('[data-inline-mode="edit"]').click();}
 assert.equal(await editor.locator('[data-image-replacement-output]').inputValue(),'');
 await editor.locator('[data-image-replacement-output]').selectOption(kind);
 await editor.locator('[data-inline-prompt]').fill('Replace this image with editable '+kind);
 await editor.locator('[data-inline-submit]').click();await editor.locator('[data-inline-image-replacement]').waitFor();
 await editor.getByText('Acceptance replaces the selected image and retains its original asset.',{exact:false}).waitFor();
 await editor.getByText('Check the recognized label.',{exact:false}).waitFor();return editor;
};
const replaced=(value,kind)=>kind==='table'||kind==='code'?value.blocks.find(b=>b.id==='image')?.type===(kind==='table'?'table':'snippet'):!value.blocks.some(b=>b.id==='image')&&(kind==='equation'?value.items.length===1:value.shapes.length===2);
const checks=['table','code','equation','diagram'].map(kind=>({name:`Explicit Edit ${kind} replacement preserves asset, atomic Undo/Redo and reload`,fn:async()=>{
 await reset();const before=await state(),editor=await open(kind);assert.deepEqual((await state()).blocks,before.blocks);assert.equal((await state()).items.length,0);assert.equal((await state()).shapes.length,0);
 await page.screenshot({path:OUT+'/'+kind+'-preview.png'});await editor.locator('[data-inline-accept]').click();await until(async()=>replaced(await state(),kind),kind+' not saved');
 const saved=await state(),entities=[...saved.blocks,...saved.items,...saved.shapes,...saved.links,...saved.groups];
 assert.ok(saved.sources.some(s=>s.id===`file:${source.id}@${source.rev}`&&s.fileRef?.source?.id===source.id&&s.attached===false));
 for(const entity of entities){assert.equal(entity.inline?.extraction.source.blockId,'image');assert.deepEqual(entity.inline.extraction.source.source,{id:source.id,rev:source.rev});assert.equal(entity.inline.mode,'edit');}
 if(kind==='table'||kind==='code'){const block=saved.blocks.find(b=>b.id==='image');assert.equal(block.dx,original.dx);assert.equal(block.dy,original.dy);assert.equal(block.fileRef,undefined);}else assert.equal(saved.blocks.length,0);
 if(kind==='diagram'){assert.equal(saved.links.length,1);assert.ok(saved.shapes.some(s=>s.id===saved.links[0].from));assert.ok(saved.shapes.some(s=>s.id===saved.links[0].to));}
 await page.keyboard.press('Control+z');await until(async()=>{const s=await state();return s.blocks.find(b=>b.id==='image')?.type==='file'&&s.items.length===0&&s.shapes.length===0&&s.links.length===0;},'One Undo did not restore original');assert.deepEqual((await state()).blocks.find(b=>b.id==='image'),original);
 await page.keyboard.press('Control+Shift+z');await until(async()=>replaced(await state(),kind),'One Redo did not restore replacement');
 await page.reload();
 if(kind==='table'||kind==='code'){
  const rendered=page.locator('[data-block-id="image"]');await rendered.waitFor({state:'visible'});
  if(kind==='table')await rendered.getByText('recognized label',{exact:true}).waitFor({state:'visible'});
  else await until(async()=>(await rendered.innerText()).includes('return input + 2;'),'Reloaded code text did not render');
 }else if(kind==='equation'){
  const rendered=page.locator('[data-item-id="'+saved.items[0].id+'"]');await rendered.waitFor({state:'visible'});await rendered.locator('.katex').first().waitFor({state:'visible'});
 }else{
  for(const shape of saved.shapes)await page.locator('[data-shape-id="'+shape.id+'"]').waitFor({state:'visible'});
 }
 await until(async()=>replaced(await state(),kind),'Replacement did not survive reload');const reloaded=await state();
 const retainedRead=await fetch(BASE+`/api/learn/files/${encodeURIComponent(source.id)}?app=${encodeURIComponent(canvas.name)}&board=main`,{method:'HEAD',headers:{cookie:`small_session=${session}`,origin:BASE},cache:'no-store'});
 assert.ok(retainedRead.ok,'Retained original must remain accessible after reload');assert.equal(retainedRead.headers.get('x-source-rev'),source.rev);
 assert.deepEqual({blocks:reloaded.blocks,items:reloaded.items,shapes:reloaded.shapes,links:reloaded.links,groups:reloaded.groups},{blocks:saved.blocks,items:saved.items,shapes:saved.shapes,links:saved.links,groups:saved.groups});assert.ok(reloaded.sources.some(s=>s.fileRef?.source.id===source.id));
}}));
checks.push({name:'Changed source revision refuses explicit replacement without deleting original',fn:async()=>{
 await reset();const editor=await open('table');stale=true;await editor.locator('[data-inline-accept]').click();await editor.getByText('The source image revision changed.',{exact:false}).waitFor();assert.deepEqual((await state()).blocks,[original]);assert.equal((await state()).items.length,0);await page.keyboard.press('Escape');stale=false;
}});
checks.push({name:'An incident link prevents replacement and leaves both endpoints usable',fn:async()=>{
 await reset();const linked=clean();linked.shapes=[{id:'other',kind:'rect',x1:500,y1:100,x2:650,y2:180,text:'Keep',color:'#111111',width:2}];linked.links=[{id:'existing-link',from:'image',to:'other',fromSide:'right',toSide:'left',head:true,route:'straight'}];await api(`/api/learn/boards/${canvas.name}/main`,'PUT',{state:linked});await page.reload();await page.locator('[data-block-id="image"]').waitFor();
 scenario='table';await page.locator('[data-block-id="image"]').click({position:{x:100,y:40}});await page.locator('[data-block-id="image"]').focus();await page.keyboard.press('Control+k');const editor=page.locator('[data-inline-ai]');await editor.waitFor();if(await editor.locator('[data-inline-mode-toggle]').getAttribute('data-inline-mode-current')!=='edit'){await editor.locator('[data-inline-mode-toggle]').click();await editor.locator('[data-inline-mode="edit"]').click();}
 await editor.locator('[data-image-replacement-output]').selectOption('table');await editor.locator('[data-inline-prompt]').fill('Replace image with editable table');await editor.locator('[data-inline-submit]').click();await editor.getByText('The original image, permissions or dependencies changed. Request a new preview.',{exact:false}).waitFor();assert.equal(await editor.locator('[data-inline-accept]').count(),0);const after=await state();assert.deepEqual(after.blocks,linked.blocks);assert.deepEqual(after.links,linked.links);assert.equal(after.shapes[0].id,'other');assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
}});
const selected=checks.filter(check=>!process.env.ONLY||new RegExp(process.env.ONLY).test(check.name));
try{
 const auth=await fetch(CP+'/test/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`image-tools-${started}@example.com`,secret:process.env.TEST_BYPASS_SECRET})});assert.ok(auth.ok);session=(await auth.json()).session;
 canvas=await api('/api/canvases','POST',{title:'Image transform verification'});await api(`/api/learn/boards/${canvas.name}/main`,'PUT',{state:{blocks:[],items:[],shapes:[],links:[],groups:[],areas:[],strokes:[],exchanges:[],sources:[]}});
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1500,height:1000}});await context.addCookies([{name:'small_session',value:session,url:BASE}]);page=await context.newPage();
 const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=2;c.height=1;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,1,1);x.fillStyle='blue';x.fillRect(1,0,1,1);return c.toDataURL('image/png').split(',')[1];});const bytes=Buffer.from(data,'base64');
 const made=await api('/api/learn/files','POST',{app:canvas.name,board:'main',name:'two-pixels.png',type:'image/png',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),family:'image'});source=made.source;if(made.upload){const response=await fetch(new URL(made.upload.url,BASE),{method:'PUT',headers:{cookie:`small_session=${session}`,origin:BASE,'content-type':'image/png'},body:bytes});assert.ok(response.ok,`Original upload ${response.status}`);source=(await response.json()).source;}
 original={id:'image',type:'file',kind:'image',title:'Two pixels',dx:0,dy:0,w:320,h:220,fileRef:{v:1,source:{id:source.id,rev:source.rev},family:'image',meta:{name:'two-pixels.png',type:'image/png',size:bytes.length},view:{},status:{preview:'ready',context:'none'}}};await api(`/api/learn/boards/${canvas.name}/main`,'PUT',{state:{blocks:[original],items:[],shapes:[],links:[],groups:[],areas:[],strokes:[],exchanges:[],sources:[]}});

 await context.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(![BASE,CP].includes(u.origin)&&!['blob:','data:'].includes(u.protocol))return route.abort();
 if(stale&&r.method()==='HEAD'&&u.pathname==='/api/learn/files/'+source.id)return route.fulfill({status:200,headers:{'x-source-rev':'c'.repeat(64)}});
 if(u.pathname==='/api/learn/inline/decide'){
  const body=r.postDataJSON();assert.equal(body.request.mode,'edit');assert.deepEqual(body.request.context.imageReplacement,{targetId:'image',output:scenario});return route.fulfill({json:{decision:'proceed',route:{capability:'edit',outcome:'edit'},paid:false,token:'replacement-fixture'}});
 }
 if(u.pathname==='/api/learn/inline/generate'){
  generated++;const body=r.postDataJSON();assert.equal(body.request.mode,'edit');assert.deepEqual(body.request.context.imageReplacement,{targetId:'image',output:scenario});
  const result={kind:'image_replacement',requestId:body.request_id,targetId:'image',output:scenario,summary:'Replace image with native '+scenario,content:content(scenario),extraction:{source:{blockId:'image',source:{id:source.id,rev:source.rev},coverage:'whole-image'},uncertainties:[{location:'label',message:'Check the recognized label.'}]}};
  return route.fulfill({contentType:'text/event-stream',body:`event: done\ndata: ${JSON.stringify({result})}\n\n`});
 }
 if(['/api/learn/tutor/next-steps','/api/learn/next-steps'].includes(u.pathname))return route.fulfill({json:{options:[],suggestions:[]}});
 if(!['GET','HEAD','OPTIONS'].includes(r.method())&&/^\/api\/(ask$|learn\/(ask|tutor|plan|artifact|image|code-runs|media|scene|transcribe|tts|voice|dive|explore))/.test(u.pathname)){unexpected.push(u.pathname);return route.abort();}return route.continue();});
 page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));await page.goto(BASE+'/apps/'+canvas.name);await page.locator('[data-block-id="image"]').waitFor();original=(await state()).blocks.find(b=>b.id==='image');
 for(const {name,fn} of selected){try{await fn();results.push({name,status:'passed'});console.log('PASS '+name);}catch(e){results.push({name,status:'failed',error:e.message});throw e;}}
}catch(e){setupError=e.stack;process.exitCode=1;console.error(e.message);await page?.screenshot({path:OUT+'/failure.png'}).catch(()=>{});}finally{await browser?.close();const counts={passed:results.filter(x=>x.status==='passed').length,failed:results.filter(x=>x.status==='failed').length,skipped:0,interrupted:selected.length-results.length};writeFileSync(OUT+'/results.json',JSON.stringify({candidate:process.env.CANDIDATE_SHA,base:BASE,notSelected:checks.length-selected.length,canvas:canvas?.name,elapsedMs:Date.now()-started,counts,results,generatedFixtures:generated,unexpected,errors,setupError,limitation:'Actual original upload/source HEAD/native persistence; deterministic replacement proposals only. No real recognition, provider or code execution.'},null,2));console.log(JSON.stringify(counts));}
