// Historical prototype verifier. The mascot was removed on 2026-09-24; this
// script describes the retired behavior and is not a check for the current page.
import {chromium,expect} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import path from 'node:path';
const base=process.env.SMALL_BASE||'https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev';
const output=path.resolve('design/rabbit-character/living-08/qa/scroll-portals');mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1100}});
const page=await context.newPage(),errors=[],results=[],publicApi=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))publicApi.push(r.url());});
const canvas=page.locator('#rabbit');
const check=async(name,fn)=>{await fn();results.push({name,pass:true});console.log('PASS '+name);};
async function scrollToProgress(p){
  const {start,range,y}=await page.locator('#warren').evaluate(el=>({start:Number(el.dataset.scrollStart),range:Number(el.dataset.scrollRange),y:scrollY}));
  await page.mouse.move(110,200);await page.mouse.wheel(0,start+p*range-y);
  await expect.poll(async()=>Math.abs(Number(await canvas.getAttribute('data-progress'))-p),{timeout:10000}).toBeLessThan(.003);
  await page.waitForTimeout(370);
}
const screenshot=async name=>page.locator('.rabbit-sticky').screenshot({path:path.join(output,name+'.png')});
const portalWhites=async id=>page.evaluate(id=>{
  const c=document.getElementById('rabbit'),button=document.querySelector(`button[data-portal="${id}"]`),ctx=c.getContext('2d');
  const x=parseFloat(button.style.left)/100*c.width,y=parseFloat(button.style.top)/100*c.height,dpr=c.width/c.clientWidth;
  const size=Math.max(170,Math.min(250,c.clientWidth*.24)),rx=(size*.26-6)*dpr,ry=(size*.31-6)*dpr;
  const pixels=ctx.getImageData(0,0,c.width,c.height).data;let n=0;
  for(let yy=Math.floor(y-ry);yy<y+ry;yy++)for(let xx=Math.floor(x-rx);xx<x+rx;xx++)if(((xx-x)/rx)**2+((yy-y)/ry)**2<1){const i=(yy*c.width+xx)*4;if(pixels[i]>170&&pixels[i+1]>170&&pixels[i+2]>170&&pixels[i+3]>220)n++;}
  return n;
},id);
try{
  await page.goto(base+'/');await expect(page.locator('#warren')).toHaveAttribute('data-ready','true',{timeout:45000});
  await page.screenshot({path:path.join(output,'landing-hero.png')});
  await check('public landing preserves the hero and links to three dedicated pages',async()=>{
    await expect(page.locator('#shaft')).toHaveCount(1);
    for(const name of ['blog','features','pricing']){await expect(page.locator(`#bar a[href="/${name}"]`)).toHaveCount(1);await expect(page.locator(`#${name}`)).toHaveCount(0);}
    expect(await page.title()).toBe('Rabbit Hole');
  });
  await scrollToProgress(0);
  await check('front-facing presence, upright upper A and lower B',async()=>{
    await expect(canvas).toHaveAttribute('data-view','front');await expect(canvas).toHaveAttribute('data-state','idle_breathe');
    const a=await page.locator('[data-portal=A]').boundingBox(),b=await page.locator('[data-portal=B]').boundingBox();expect(a.y).toBeLessThan(b.y);
    await expect(canvas).toHaveAttribute('data-portal-shape','screen-facing');await screenshot('front-presence');
  });
  await check('living actions remain usable at a resting point',async()=>{
    const first=await canvas.screenshot();await page.waitForTimeout(950);expect(first.equals(await canvas.screenshot())).toBe(false);
    for(const [label,state] of [['Look left','idle_look_left'],['Look right','idle_look_right'],['Check watch','idle_watch_check'],['Crouch','crouch']]){
      await page.getByRole('button',{name:label,exact:true}).click();await expect(canvas).toHaveAttribute('data-state',state);
      await page.waitForTimeout(state==='crouch'?550:1100);await screenshot(state);
      await expect(canvas).toHaveAttribute('data-state','idle_breathe',{timeout:5000});
    }
  });
  await check('scroll down turns, crouches, enters A, hides, emerges from B and recovers',async()=>{
    for(const [p,state,label] of [[.12,'approach_portal','approach'],[.22,'turn_to_portal','turn'],[.28,'portal_crouch','crouch'],[.34,'portal_enter','enter-shallow'],[.40,'portal_enter','enter-deep'],[.5,'portal_hidden','hidden'],[.60,'portal_exit','exit-early'],[.66,'portal_exit','exit-late'],[.72,'recover_from_portal','recover'],[.78,'turn_from_portal','turn-out'],[.87,'depart_portal','continue'],[1,'idle_breathe','lower-rest']]){
      await scrollToProgress(p);await expect(canvas).toHaveAttribute('data-state',state);await screenshot('down-'+label);
      if(state==='portal_enter'){await expect(canvas).toHaveAttribute('data-portal','A');await expect(canvas).toHaveAttribute('data-view','back');}
      if(state==='portal_exit'){await expect(canvas).toHaveAttribute('data-portal','B');await expect(canvas).toHaveAttribute('data-view','front');}
    }
  });
  await check('scroll up uses the same sequence with B as entrance and A as exit',async()=>{
    for(const [q,state,label] of [[.12,'approach_portal','approach'],[.22,'turn_to_portal','turn'],[.28,'portal_crouch','crouch'],[.36,'portal_enter','enter'],[.5,'portal_hidden','hidden'],[.64,'portal_exit','exit'],[.72,'recover_from_portal','recover'],[1,'idle_breathe','upper-rest']]){
      await scrollToProgress(1-q);await expect(canvas).toHaveAttribute('data-state',state);await screenshot('up-'+label);
      if(state==='portal_enter')await expect(canvas).toHaveAttribute('data-portal','B');
      if(state==='portal_exit')await expect(canvas).toHaveAttribute('data-portal','A');
    }
  });
  await check('partial scroll holds pixels; reversing mid-entry retains the same opening',async()=>{
    await scrollToProgress(.39);const position=await canvas.getAttribute('data-position'),depth=Number(await canvas.getAttribute('data-depth'));
    const held=await canvas.screenshot();await page.waitForTimeout(650);expect(held.equals(await canvas.screenshot())).toBe(true);
    await scrollToProgress(.387);await expect(canvas).toHaveAttribute('data-state','portal_exit');await expect(canvas).toHaveAttribute('data-portal','A');
    expect(await canvas.getAttribute('data-position')).toBe(position);expect(Math.abs(Number(await canvas.getAttribute('data-depth'))-depth)).toBeLessThan(.05);
    await screenshot('mid-entry-reversal');
    await scrollToProgress(.64);await scrollToProgress(.637);await expect(canvas).toHaveAttribute('data-state','portal_enter');await expect(canvas).toHaveAttribute('data-portal','B');
    await screenshot('mid-exit-reversal');
  });
  await check('paper silhouette stays opaque and is progressively occluded by the page rim',async()=>{
    await scrollToProgress(.1);await scrollToProgress(.315);const shallow=await portalWhites('A');
    await scrollToProgress(.355);await screenshot('rim-occlusion');
    await scrollToProgress(.425);const deep=await portalWhites('A');expect(shallow).toBeGreaterThan(100);expect(deep).toBeLessThan(shallow*.4);
    await expect(canvas).toHaveAttribute('data-occlusion','rim-and-plane');
    results.push({name:'aperture white pixels',shallow,deep});
  });
  await check('runtime pointer and keyboard portal placement affects the scroll path',async()=>{
    await scrollToProgress(.5);
    const b=page.getByRole('button',{name:'Move portal B'}),before=await b.boundingBox();
    await page.mouse.move(before.x+22,before.y+22);await page.mouse.down();await page.mouse.move(before.x-48,before.y-20,{steps:8});await page.mouse.up();
    const after=await b.boundingBox();expect(after.x).toBeLessThan(before.x-30);
    await b.focus();await b.press('ArrowRight');const keyed=await b.boundingBox();expect(keyed.x).toBeGreaterThan(after.x);
    await scrollToProgress(.64);const pos=JSON.parse(await canvas.getAttribute('data-position'));
    const center=await b.evaluate(el=>({x:parseFloat(el.style.left)/100,y:parseFloat(el.style.top)/100}));expect(pos.x).toBeCloseTo(center.x,5);expect(pos.y).toBeCloseTo(center.y,5);await screenshot('moved-destination');
  });
  await check('pause holds the current scroll pose and resume catches up',async()=>{
    await page.getByRole('button',{name:'Pause mascot'}).click();const before=await canvas.getAttribute('data-progress');
    await page.mouse.wheel(0,100);await page.waitForTimeout(250);expect(await canvas.getAttribute('data-progress')).toBe(before);
    await page.getByRole('button',{name:'Resume mascot'}).click();await expect.poll(()=>canvas.getAttribute('data-progress')).not.toBe(before);
  });
  await check('exact pink clouds animate below and the pause frame contains visible clouds',async()=>{
    await page.locator('#pink-cloud').scrollIntoViewIfNeeded();const cloud=page.locator('#cloud-motion');
    await expect.poll(()=>cloud.evaluate(i=>i.complete&&i.naturalWidth===1440),{timeout:30000}).toBe(true);
    expect(await cloud.getAttribute('src')).toBe('/landing/typesafe-pink-cloud.gif');
    const moving=await cloud.screenshot();await page.waitForTimeout(800);expect(moving.equals(await cloud.screenshot())).toBe(false);
    await page.getByRole('button',{name:'Pause clouds',exact:true}).click();const still=page.locator('#cloud-still');await expect(still).toBeVisible();await expect(cloud).toBeHidden();
    await expect.poll(()=>still.evaluate(i=>i.complete&&i.naturalWidth===1440)).toBe(true);
    const pink=await still.evaluate(i=>{const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(i,0,0);const p=ctx.getImageData(0,0,c.width,c.height).data;let n=0;for(let j=0;j<p.length;j+=4)if(p[j]>170&&p[j+1]<170&&p[j+2]>100)n++;return n;});expect(pink).toBeGreaterThan(10000);
    await page.locator('#pink-cloud').screenshot({path:path.join(output,'pink-cloud.png')});
  });
  await check('mobile scroll journey, touch-sized controls and reduced motion',async()=>{
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);await scrollToProgress(.05);await scrollToProgress(.38);
    await expect(canvas).toHaveAttribute('data-state','portal_enter');await page.screenshot({path:path.join(output,'mobile-entry.png')});
    await scrollToProgress(.64);await expect(canvas).toHaveAttribute('data-state','portal_exit');await page.screenshot({path:path.join(output,'mobile-exit.png')});
    await page.emulateMedia({reducedMotion:'reduce'});await scrollToProgress(.25);await expect(canvas).toHaveAttribute('data-state','idle_breathe');await expect(canvas).toHaveAttribute('data-view','front');
    await scrollToProgress(.75);await expect(canvas).toHaveAttribute('data-hidden','false');await expect(canvas).toHaveAttribute('data-depth','0.0000');
    await expect(page.locator('[data-motion-note]')).toBeVisible();await expect(page.locator('#cloud-still')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:path.join(output,'mobile-reduced-motion.png')});
  });
  for(const name of ['blog','features','pricing']){
    await check(`${name} has its own navigable, reloadable public page`,async()=>{
      await page.goto(base+'/'+name);await expect(page.locator('h1')).toHaveText(name[0].toUpperCase()+name.slice(1));
      expect(await page.title()).toBe(`${name[0].toUpperCase()+name.slice(1)} — Rabbit Hole`);
      await expect(page.locator('#rabbit')).toHaveCount(0);await expect(page.locator('#shaft')).toHaveCount(0);
      await page.getByRole('button',{name:'Menu',exact:true}).click();await expect(page.locator('#sheet')).toHaveClass('open');
      await page.locator(`#sheet a[href="/${name}"]`).click();await page.reload();await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:path.join(output,name+'-mobile.png')});await page.setViewportSize({width:1440,height:1100});
      await page.screenshot({path:path.join(output,name+'-desktop.png')});await page.setViewportSize({width:390,height:844});
    });
  }
  expect(publicApi).toEqual([]);
  const env=parseEnv(readFileSync(process.env.SMALL_ENV_FILE||new URL('../../../.env',import.meta.url),'utf8'));
  if(!env.SMALL_TEST_BYPASS)throw Error('Missing dev test-session credential');
  const login=await fetch(base+'/test/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'yudhisteer.chin@gmail.com',secret:env.SMALL_TEST_BYPASS})});
  if(!login.ok)throw Error(`Test session HTTP ${login.status}`);
  const {session}=await login.json(),catalog=await(await fetch(base+'/api/apps',{headers:{Cookie:`small_session=${session}`}})).json();
  await context.addCookies([{name:'small_session',value:session,url:base}]);await page.setViewportSize({width:1440,height:1100});
  for(const kind of ['regular','repository']){
    const app=catalog.apps.find(a=>kind==='repository'?a.kind==='repository':a.kind!=='repository'&&a.hosting!=='aws');if(!app)throw Error('No existing '+kind+' app');
    await check('mascot remains absent from '+kind+' app',async()=>{
      await page.goto(`${base}/apps/${encodeURIComponent(app.name)}?tab=mascot`);await expect(page.getByRole('tab',{name:'Graph',exact:true})).toHaveAttribute('data-state','active',{timeout:30000});
      await expect(page.getByRole('tab',{name:'Mascot',exact:true})).toHaveCount(0);await expect(canvas).toHaveCount(0);
    });
  }
  expect(errors).toEqual([]);
  writeFileSync(path.join(output,'browser-verification.json'),JSON.stringify({tested_at:new Date().toISOString(),url:base+'/#warren',results,console_errors:errors,real_deployed_landing:true,model_calls:0,visual_approval:false},null,2)+'\n');
  console.log(JSON.stringify({checks:results.length,console_errors:errors}));
}catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error;}
finally{await context.close();await browser.close();}
