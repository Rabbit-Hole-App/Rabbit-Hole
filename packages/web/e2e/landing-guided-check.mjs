import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url=process.argv[2] || 'https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/';
const out=path.join(os.tmpdir(), 'rabbit-hole-guided-review',new URL(url).hostname);
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],results=[],blocked=[];
const selector='.softmax-guided .softmax-canvas';
async function open(width,reduced=false) {
  const page=await browser.newPage({viewport:{width,height:width<700?844:1000},reducedMotion:reduced?'reduce':'no-preference'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    const Observer=window.IntersectionObserver;window.guidedVisibility=[];
    window.IntersectionObserver=class extends Observer {
      constructor(callback,options) {super((entries,observer)=>{
        for(const entry of entries) if(entry.target.closest('.softmax-guided')) {
          window.guidedVisibility.push({target:entry.target.className,ratio:entry.intersectionRatio,intersecting:entry.isIntersecting,time:performance.now()});
          window.guidedVisibility=window.guidedVisibility.slice(-12);
        }
        callback(entries,observer);
      },options);}
    };
  });
  await page.route('**/*',r=>{
    const q=r.request(),u=new URL(q.url());
    if(q.method()!=='GET'||/^\/(api|auth|test|login|logout|a|run|deploy|share)(\/|$)/.test(u.pathname)) {blocked.push(u.pathname);return r.abort();}
    return r.continue();
  });
  await page.goto(url,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('#adaptive-guided').click();
  await page.locator(selector).scrollIntoViewIfNeeded();
  return page;
}
async function phase(page,name) {
  try {
    await page.waitForFunction(({selector,name})=>document.querySelector(selector).dataset.phase===name,{selector,name},{timeout:22000});
  } catch(error) {
    console.error(await page.evaluate(selector=>({phase:document.querySelector(selector).dataset,hidden:document.hidden,scrollY,viewport:innerHeight,canvas:document.querySelector(selector).getBoundingClientRect().toJSON(),visibility:window.guidedVisibility,scores:[...document.querySelectorAll('[data-score-input]')].map(e=>e.value)}),selector));
    throw error;
  }
}
async function math(page,values) {
  const actual=await page.evaluate(values=>{
    const inputs=[...document.querySelectorAll('[data-score-input]')];
    inputs.forEach((input,i)=>{input.value=values[i];input.dispatchEvent(new Event('input',{bubbles:true}));});
    return {
      scores:[...document.querySelectorAll('[data-score]')].map(e=>Number(e.textContent)),
      weights:[...document.querySelectorAll('[data-weight]')].map(e=>Number(e.textContent)),
      probabilities:[...document.querySelectorAll('[data-prob]')].map(e=>parseFloat(e.textContent)),
      widths:[...document.querySelectorAll('.softmax-shares span')].map(e=>parseFloat(e.style.width)),
      vector:document.querySelector('[data-score-vector]').textContent,
    };
  },values);
  assert.deepEqual(actual.scores,values);
  assert.equal(actual.vector,`[${values.join(', ')}]`);
  const shifted=values.map(x=>Math.exp(x-Math.max(...values))),sum=shifted.reduce((a,b)=>a+b,0);
  values.forEach((v,i)=>{
    assert.ok(Math.abs(actual.weights[i]-Math.exp(v))<=.005);
    assert.ok(Math.abs(actual.probabilities[i]-shifted[i]/sum*100)<=.05001);
    assert.ok(Math.abs(actual.widths[i]-shifted[i]/sum*100)<.0001);
  });
  assert.ok(Math.abs(actual.widths.reduce((a,b)=>a+b,0)-100)<.0001);
}
try {
  for(const width of [1440,390]) {
    const page=await open(width);
    await phase(page,'typing');
    await page.waitForTimeout(850);
    assert.ok((await page.locator(selector+' .softmax-prompt').innerText()).length<30);
    assert.notEqual(await page.locator('.softmax-guided-camera').evaluate(e=>getComputedStyle(e).transform),'none');
    assert.equal(await page.locator('[data-guided-card]').evaluate(e=>e.inert),true);
    assert.equal(await page.locator('.softmax-guided video').count(),0);
    await page.locator(selector).screenshot({path:path.join(out,`typing-${width}.png`)});
    await phase(page,'generating');
    assert.equal(await page.locator(selector+' .softmax-generating').evaluate(e=>getComputedStyle(e).opacity),'1');
    await page.locator(selector).screenshot({path:path.join(out,`generating-${width}.png`)});
    await phase(page,'dragging');
    await page.waitForTimeout(1000);
    assert.equal(await page.locator(selector+' .softmax-level-link').evaluate(e=>getComputedStyle(e).opacity),'1');
    assert.equal(await page.locator('.softmax-slider-cursor').evaluate(e=>getComputedStyle(e).opacity),'1');
    assert.equal(await page.locator('[data-guided-card]').evaluate(e=>e.inert),false);
    await page.locator('.softmax-guided').screenshot({path:path.join(out,`dragging-${width}.png`)});
    await phase(page,'ready');
    assert.deepEqual(await page.locator('[data-score-input]').evaluateAll(es=>es.map(e=>Number(e.value))),[3,3,1.5,1]);
    const slider=page.locator('#softmax-score-b');await slider.scrollIntoViewIfNeeded();
    const rect=await slider.boundingBox();
    await page.mouse.move(rect.x+8+(rect.width-16)*5/6,rect.y+rect.height/2);
    await page.mouse.down();await page.mouse.move(rect.x+8+(rect.width-16)/3,rect.y+rect.height/2,{steps:12});await page.mouse.up();
    assert.ok(Number(await slider.inputValue())<1);
    assert.equal(Number(await page.locator('[data-score="1"]').innerText()),Number(await slider.inputValue()));
    for(const values of [[1,1,1,1],[-2,4,0,-1],[2,-2,4,-1],[2,1,-2,4],[4,-2,-2,-2]]) await math(page,values);
    await page.locator('.softmax-quiz input[value="50"]').check();
    assert.equal(await page.locator('.softmax-quiz').getAttribute('data-result'),'retry');
    await page.locator('.softmax-quiz input[value="25"]').check();
    assert.equal(await page.locator('.softmax-quiz').getAttribute('data-result'),'correct');
    await page.locator('.softmax-guided').screenshot({path:path.join(out,`interactive-${width}.png`)});
    await page.locator('#adaptive-deep').click();
    assert.equal(await page.locator('[data-score-vector]').innerText(),'[4, -2, -2, -2]');
    await page.locator('#adaptive-guided').click();
    assert.equal(await page.locator(selector).getAttribute('data-phase'),'ready');
    assert.deepEqual(await page.locator('[data-score-input]').evaluateAll(es=>es.map(e=>Number(e.value))),[4,-2,-2,-2]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    results.push({width,sequence:true,math:true,quiz:true,manualState:true});
    await page.close();
  }
  for(const width of [320,768]) {
    const page=await open(width,true);
    await phase(page,'ready');
    assert.equal(await page.locator(selector).getAttribute('data-running'),'false');
    assert.equal(await page.locator('.softmax-guided-camera').evaluate(e=>getComputedStyle(e).transform),'none');
    const input=page.locator('#softmax-score-b');await input.focus();await page.keyboard.press('ArrowRight');
    assert.equal(await input.inputValue(),'1.25');
    await page.locator('.softmax-quiz input[value="25"]').focus();await page.keyboard.press('Space');
    assert.equal(await page.locator('.softmax-quiz').getAttribute('data-result'),'correct');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.locator('.softmax-guided').screenshot({path:path.join(out,`reduced-${width}.png`)});
    results.push({width,reduced:true,keyboard:true});await page.close();
  }
  const page=await open(1440);
  await phase(page,'typing');
  await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(250);
  const paused=await page.locator(selector+' .softmax-prompt').innerText();
  await page.waitForTimeout(1100);
  assert.equal(await page.locator(selector+' .softmax-prompt').innerText(),paused);
  await page.locator(selector).scrollIntoViewIfNeeded();await phase(page,'dragging');
  const input=page.locator('#softmax-score-c');await input.focus();await page.keyboard.press('ArrowRight');
  const value=await input.inputValue();await page.waitForTimeout(1300);
  assert.equal(await input.inputValue(),value);assert.equal(await page.locator(selector).getAttribute('data-phase'),'ready');
  await page.locator('#adaptive-overview').click();await page.locator('#adaptive-guided').click();await page.locator('#adaptive-overview').click();
  assert.equal(await page.locator(selector).getAttribute('data-running'),'false');
  assert.ok(await page.locator('.softmax-overview .softmax-canvas').evaluate(e=>e.clientHeight)<=550);
  await page.close();results.push({pauseResume:true,takeover:true,rapidSwitch:true});
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
} finally {
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({url,results,errors,blocked},null,2));
  await browser.close();
}
console.log(JSON.stringify({results,errors,blocked,out}));
