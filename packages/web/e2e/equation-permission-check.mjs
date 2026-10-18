import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.HARNESS||'http://127.0.0.1:5174/e2e/inline-ai-harness.html';
const out=process.env.OUT||'e2e/shots/equation-permission';mkdirSync(out,{recursive:true});
const browser=await chromium.launch(),results=[],errors=[];
const original={id:'eq',kind:'equation',latex:'x^2',x:220,y:200,size:24,fresh:false};
try{
 for(const mode of ['pending','preview','manual']){
  const context=await browser.newContext({viewport:{width:1400,height:950}}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/api/**',r=>r.abort());
  await context.addInitScript(({original,mode})=>localStorage.setItem('harness:permission-'+mode,JSON.stringify({items:[original],shapes:[],links:[],blocks:[],groups:[],areas:[],strokes:[]})),{original,mode});
  await page.goto(base+'?board=permission-'+mode);
  await page.locator('[data-item-id="eq"]').dblclick();await page.locator('[data-equation-palette]').waitFor();
  if(mode==='manual'){
   await page.getByRole('tab',{name:'LaTeX',exact:true}).click();await page.getByLabel('LaTeX source',{exact:true}).fill('y^9');
  }else{
   await page.evaluate(mode=>{window.__inlineTransport.decide=async()=>({decision:'proceed',token:'fixture'});window.__inlineTransport.generate=async()=>{window.__generationStarted=true;const result={result:{kind:'equation',latex:'y^3'}};return mode==='pending'?new Promise(resolve=>{window.__releaseEquation=()=>resolve(result);}):result;};},mode);
   await page.locator('[data-equation-generate-tab]').click();await page.getByLabel('Equation description').fill('Replace the expression');await page.locator('[data-equation-generator]').getByRole('button',{name:'Generate',exact:true}).click();await page.waitForFunction(()=>window.__generationStarted);
   if(mode==='preview')await page.getByLabel('Generated LaTeX').waitFor();
  }
  await page.evaluate(()=>window.__setCanvasReadOnly(true));await page.locator('[data-equation-palette]').waitFor({state:'detached'});
  if(mode==='pending')await page.evaluate(()=>window.__releaseEquation());
  await page.mouse.click(1000,700);await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-equation-generator]').count(),0);
  assert.deepEqual(await page.evaluate(()=>window.canvasApi.current.boardNow().items),[original]);assert.deepEqual(errors,[]);
  results.push({name:mode+' permission revocation',status:'passed'});console.log('PASS '+mode);await context.close();
 }
}catch(error){results.push({status:'failed',error:error.message});process.exitCode=1;console.error(error.stack);}
finally{await browser.close();writeFileSync(out+'/results.json',JSON.stringify({candidate:process.env.CANDIDATE_SHA||'working tree',results,errors,counts:{passed:results.filter(x=>x.status==='passed').length,failed:results.filter(x=>x.status==='failed').length,skipped:0,interrupted:3-results.length},limitation:'Actual AdaptiveCanvas editor with deterministic transport; no provider requests.'},null,2));}
