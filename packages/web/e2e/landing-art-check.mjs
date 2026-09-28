// Focused visual check against this worktree's deployed landing page.
import {chromium,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const base='https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev';
const output=new URL('../../../tmp/landing-art/cloud-loop-qa/',import.meta.url);
mkdirSync(output,{recursive:true});
const path=name=>fileURLToPath(new URL(name,output));
const browser=await chromium.launch({channel:'chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors=[],failedAssets=[],samples=[],retiredAssetRequests=[];
try{
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().includes('pink-cloud-filled'))retiredAssetRequests.push(request.url());});
  page.on('response',response=>{
    if(new URL(response.url()).pathname.startsWith('/landing/')&&response.status()>=400)
      failedAssets.push({path:new URL(response.url()).pathname,status:response.status()});
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await expect(page.locator('#shaft')).toHaveCount(1);
  await expect(page.locator('#rabbit,#warren,[data-portal]')).toHaveCount(0);
  const cloud=page.locator('#pink-cloud'),still=page.locator('#cloud-still'),motion=page.locator('#cloud-motion');
  await cloud.scrollIntoViewIfNeeded();
  await expect.poll(()=>motion.evaluate(image=>image.complete&&image.naturalWidth===1440),{timeout:30000}).toBe(true);
  await expect(motion).toHaveAttribute('src','/landing/typesafe-pink-cloud-loop.gif');
  await expect(page.locator('img[src*="pink-cloud-filled"]')).toHaveCount(0);
  const started=Date.now();
  for(let i=0;i<20;i++){
    await expect(still).toBeHidden();
    await expect(motion).toBeVisible();
    const state=await motion.evaluate(image=>({opacity:getComputedStyle(image).opacity,transform:getComputedStyle(image).transform,blend:getComputedStyle(image).mixBlendMode}));
    expect(state).toEqual({opacity:'1',transform:'none',blend:'normal'});
    const screenshot=await cloud.screenshot({path:path(`cloud-${String(i).padStart(2,'0')}.png`),animations:'allow'});
    samples.push({frame:i,elapsed_ms:Date.now()-started,sha256:createHash('sha256').update(screenshot).digest('hex'),...state});
    await page.waitForTimeout(800);
  }
  expect(samples.at(-1).elapsed_ms).toBeGreaterThan(2*6720);
  expect(new Set(samples.map(sample=>sample.sha256)).size).toBeGreaterThan(8);
  console.log('Original animated cloud sampled across two full loops; no static base.');
  await expect(page.locator('#cloud-pause,#observatory-pause,#footer-motion')).toHaveCount(0);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(still).toBeVisible();
  await expect(page.locator('#cloud-motion')).toBeHidden();
  await expect.poll(()=>still.evaluate(image=>image.complete&&image.naturalWidth===1440)).toBe(true);
  await still.evaluate(image=>image.decode());
  const pausedPixels=await still.screenshot();
  await page.waitForTimeout(350);
  expect(await still.screenshot()).toEqual(pausedPixels);
  await cloud.screenshot({path:path('cloud-reduced-motion.png')});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect(page.locator('#cloud-motion')).toBeVisible();
  await expect(still).toBeHidden();
  const mountains=page.locator('#blue-mountains');
  await mountains.scrollIntoViewIfNeeded();
  await expect.poll(()=>mountains.locator('img').evaluate(image=>image.complete&&image.naturalWidth===1672),{timeout:30000}).toBe(true);
  await mountains.locator('img').evaluate(image=>image.decode());
  await page.screenshot({path:path('mountains-desktop.png')});
  await mountains.screenshot({path:path('mountains-art.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const route of ['blog','features','pricing']){
    await page.goto(base+'/'+route);
    await expect(page.locator('h1')).toHaveText(route[0].toUpperCase()+route.slice(1));
  }
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(base);
  await cloud.scrollIntoViewIfNeeded();
  await expect(still).toBeVisible();
  await expect(page.locator('#cloud-motion')).toBeHidden();
  await expect.poll(()=>still.evaluate(image=>image.complete&&image.naturalWidth===1440)).toBe(true);
  await expect.poll(()=>mountains.locator('img').evaluate(image=>image.complete&&image.naturalWidth===1672)).toBe(true);
  await Promise.all([still.evaluate(image=>image.decode()),mountains.locator('img').evaluate(image=>image.decode())]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:path('art-mobile-reduced-motion.png')});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect(page.locator('#cloud-motion')).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('#cloud-motion')).toBeHidden();
  expect(errors).toEqual([]);expect(failedAssets).toEqual([]);expect(retiredAssetRequests).toEqual([]);
  const report={url:base,tested_at:new Date().toISOString(),full_cloud_loop_samples:samples,original_cloud_restored:true,no_static_base:true,no_filled_cloud_requests:true,no_playback_controls:true,reduced_motion:true,mountains_loaded:true,mobile_no_horizontal_overflow:true,public_routes:true,hero_preserved:true,mascot_absent:true,console_errors:errors,failed_art_assets:failedAssets};
  writeFileSync(new URL('browser-verification.json',output),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,full_cloud_loop_samples:samples.length}));
}finally{await context.close();await browser.close();}
