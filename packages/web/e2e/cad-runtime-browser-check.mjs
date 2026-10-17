// Reads real completed CAD jobs/artifacts. Never creates, retries, edits or accepts a job.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONFIG='C:/Users/cyudhist/AppData/Local/Temp/rabbit-hole-cad-verification-d8c8d3d8-8575-42ca-9ee3-f5ac60847f6a.json';
const {base,cp,session,app,board}=JSON.parse(readFileSync(CONFIG,'utf8'));
assert.equal(base,'https://rabbit-hole-web-dev-cad-integration.tryrabbithole.workers.dev');
assert.equal(cp,'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev');
assert.equal(app,'canvas-0da4df73');
assert.equal(board,'main');
assert.ok(session);
assert.equal(process.env.CAD_RUNTIME_READY,'yes','Coordinator must confirm completed runtime jobs before running');
const OUT=resolve(process.env.OUT||'cad-runtime-browser-evidence');mkdirSync(OUT,{recursive:true});
const minimumReady=process.env.CAD_RUNTIME_MIN_READY==='1'?1:2;
const results=[],errors=[],blocked=[],artifactReads=[],boardWrites=[],persistenceObservations=[];
let browser,page,setupError,identities=[];
const boardPath=`/api/learn/boards/${app}/${board}`;
const jobsPath=`/api/learn/cad/jobs?app=${encodeURIComponent(app)}&board=${encodeURIComponent(board)}`;
const get=async(path,authenticated=true)=>{
  const url=new URL(path,base);assert.equal(url.origin,base);
  return fetch(url,{headers:authenticated?{cookie:`small_session=${session}`}:{},redirect:'manual'});
};
const json=async(path)=>{const response=await get(path);assert.ok(response.ok,`GET ${new URL(path,base).pathname}: ${response.status}`);return response.json();};
const layout=state=>(state.blocks||[]).map(({id,dx,dy,w,h})=>({id,dx,dy,w,h}));
const checks=[];const check=(name,fn)=>checks.push({name,fn});
let ready,initialLayout;
check('completed real jobs restore their saved CAD cards',async()=>{
  const data=await json(jobsPath);ready=data.jobs.filter(job=>job.state==='ready'&&!job.awaitingAccept);
  assert.ok(ready.length>=minimumReady,`Expected at least ${minimumReady} completed model(s)`);
  identities=ready.map(({id,cardId,revisionId,attempt})=>({id,cardId,revisionId,attempt}));
  await page.goto(`${base}/apps/${app}`,{waitUntil:'domcontentloaded'});
  for(const job of ready)await page.locator(`[data-block-id="${job.cardId}"] [data-cad-card]`).waitFor();
  const deadline=Date.now()+30000;let persisted;
  while(Date.now()<deadline){
    persisted=(await json(boardPath)).state;
    const complete=ready.every(job=>persisted.blocks?.some(block=>block.id===job.cardId&&block.revisionId===job.revisionId&&block.fileRef?.source?.id===job.manifest.sourceId));
    persistenceObservations.push({at:new Date().toISOString(),acceptedSourceReferencesPersisted:complete});
    if(complete)break;await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.equal(persistenceObservations.at(-1).acceptedSourceReferencesPersisted,true,'Recovered accepted revisions/source references must persist before authorization checks');
  initialLayout=layout(persisted);
});
check('real saved GLBs load and interact without moving cards',async()=>{
  for(const [index,job] of ready.entries()){
    const card=page.locator(`[data-block-id="${job.cardId}"]`);
    await card.scrollIntoViewIfNeeded();await card.locator('[data-drag-zone]').first().click();
    const viewer=card.locator('[data-cad-viewer]');await viewer.locator('canvas').waitFor();
    await viewer.getByRole('button',{name:'Interact',exact:true}).waitFor();
    await page.waitForFunction(id=>{const card=document.querySelector(`[data-block-id="${id}"]`);return [...card.querySelectorAll('button')].some(button=>button.textContent==='Interact'&&!button.disabled);},job.cardId);
    assert.equal(await card.getByRole('alert').count(),0);
    const before=await card.boundingBox();await viewer.getByRole('button',{name:'Interact',exact:true}).click();
    const box=await viewer.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2+15,{steps:8});await page.mouse.up();
    const after=await card.boundingBox();for(const key of ['x','y','width','height'])assert.ok(Math.abs(before[key]-after[key])<2,`${key} changed during orbit`);
    await viewer.getByRole('button',{name:'Done',exact:true}).focus();await page.keyboard.press('Escape');
    assert.equal(await viewer.getByRole('button',{name:'Interact',exact:true}).count(),1);
    await page.screenshot({path:resolve(OUT,`real-model-${index+1}.png`)});
  }
});
check('stored artifacts allow owner reads and reject anonymous reads',async()=>{
  for(const job of ready){
    for(const artifact of job.manifest?.artifacts||[]){
      assert.match(artifact.url,/^\/api\/learn\/files\//);
      const response=await get(artifact.url);assert.equal(response.status,200,`${artifact.kind} owner read`);
      const bytes=await response.arrayBuffer();assert.ok(bytes.byteLength>0);
      const denied=await get(artifact.url,false);assert.ok([401,403,404].includes(denied.status),`${artifact.kind} anonymous read: ${denied.status}`);
      const scoped=new URL(artifact.url,base);scoped.searchParams.set('app',app);scoped.searchParams.set('board',board);
      const scopedResponse=await get(scoped.href);assert.equal(scopedResponse.status,200,`${artifact.kind} board-scoped read after recovery`);await scopedResponse.arrayBuffer();
      artifactReads.push({jobId:job.id,kind:artifact.kind,bytes:bytes.byteLength,ownerStatus:response.status,boardScopedStatus:scopedResponse.status,anonymousStatus:denied.status});
    }
    for(const kind of ['step','glb','thumbnail'])assert.ok(artifactReads.some(item=>item.jobId===job.id&&item.kind===kind),`Missing ${kind}`);
  }
});
check('reload retains the same jobs, revisions and canvas layout',async()=>{
  await page.reload({waitUntil:'domcontentloaded'});
  for(const job of ready)await page.locator(`[data-block-id="${job.cardId}"] [data-cad-card]`).waitFor();
  const after=await json(jobsPath);
  assert.deepEqual(after.jobs.filter(job=>identities.some(item=>item.id===job.id)).map(({id,cardId,revisionId,attempt})=>({id,cardId,revisionId,attempt})),identities);
  assert.deepEqual(layout((await json(boardPath)).state),initialLayout);
});
check('no page error or attempted CAD mutation occurred',async()=>{
  assert.deepEqual(errors,[]);assert.deepEqual(blocked.filter(item=>item.path.startsWith('/api/learn/cad/')),[]);
});
try{
  browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1500,height:1000}});
  await context.addCookies([{name:'small_session',value:session,url:base}]);
  await context.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(![base,cp].includes(url.origin)&&!['data:','blob:'].includes(url.protocol))return route.abort();
    if(!['GET','HEAD','OPTIONS'].includes(request.method())){
      // The normal page may persist recovered ready cards. No other mutation is allowed.
      if(request.method()==='PUT'&&url.pathname===boardPath)return route.continue();
      blocked.push({path:url.pathname,method:request.method()});return route.abort();
    }
    return route.continue();
  });
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.request().method()==='PUT'&&new URL(response.url()).pathname===boardPath)boardWrites.push({at:new Date().toISOString(),status:response.status()});});
  for(const item of checks){try{await item.fn();results.push({name:item.name,status:'passed'});console.log('PASS '+item.name);}catch(error){results.push({name:item.name,status:'failed',error:error.message});throw error;}}
}catch(error){setupError=error.message;process.exitCode=1;console.error(error.message);await page?.screenshot({path:resolve(OUT,'failure.png')}).catch(()=>{});}
finally{
  await browser?.close();const counts={passed:results.filter(item=>item.status==='passed').length,failed:results.filter(item=>item.status==='failed').length,skipped:0,interrupted:checks.length-results.length};
  writeFileSync(resolve(OUT,'results.json'),JSON.stringify({candidate:process.env.CANDIDATE_SHA||'unrecorded',base,app,board,minimumReady,counts,results,identities,artifactReads,boardWrites,persistenceObservations,blocked,errors,setupError,limitation:'Real stored model rendering and read authorization only; no new model requests or geometry-quality assertions.'},null,2));console.log(JSON.stringify(counts));
}
