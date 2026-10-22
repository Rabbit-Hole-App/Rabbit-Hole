// Prepared component fixture, not deployed-app evidence. No model or repository request leaves this process.
import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
assert.equal(process.env.RUN_INLINE_EVIDENCE_COMPONENT,'yes','Explicit browser reservation required');
const out=resolve(process.env.OUT||'evidence/inline-evidence-handoff-component');await mkdir(out,{recursive:true});
const entry=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Evidence from './packages/web/src/InlineRepositoryEvidence.jsx';
function Fixture(){const[scope,setScope]=useState({app:'repo-a',repo:'owner/a',commit:'a'.repeat(40)}),[suggestion,setSuggestion]=useState(null);window.suggest=query=>setSuggestion({requestId:crypto.randomUUID(),query});window.changeScope=()=>setScope({app:'repo-b',repo:'owner/b',commit:'b'.repeat(40)});return <Evidence scope={scope} contextKey={scope.app} suggestedQuery={suggestion}/>;}createRoot(document.getElementById('root')).render(<Fixture/>);`;
const outputs=(await build({stdin:{contents:entry,sourcefile:'fixture.jsx',loader:'jsx',resolveDir:process.cwd()},bundle:true,write:false,outfile:'fixture-output/fixture.js',jsx:'automatic',loader:{'.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl'},format:'iife',platform:'browser',logLevel:'silent'})).outputFiles;
const bundled=outputs.find(file=>file.path.endsWith('.js')).text,css=outputs.find(file=>file.path.endsWith('.css'))?.text||'';
const html=`<style>${css}</style><div id="root"></div><script>${bundled.replaceAll('</script','<\\/script')}</script>`;
const browser=await chromium.launch({headless:true});const checks=[],requests=[],errors=[];let delayed;
try{
 const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{const path=new URL(route.request().url()).pathname;if(path==='/')return route.fulfill({contentType:'text/html',body:html});if(path==='/api/learn/inline/evidence'){requests.push(route.request().postDataJSON());delayed=route;return;}throw Error('Unexpected request '+path);});
 await page.goto('https://inline.test/');const query=page.getByRole('textbox');await query.waitFor();assert.equal(requests.length,0);
 await page.evaluate(()=>window.suggest('optimizer.step()'));await page.waitForFunction(()=>document.querySelector('input')?.value==='optimizer.step()');assert.equal(requests.length,0);checks.push('Review suggestion remains editable and makes no retrieval request');
 await query.fill('exact literal');assert.equal(requests.length,0);await page.getByRole('button',{name:'Search',exact:true}).click();await page.waitForFunction(()=>document.querySelector('button')?.textContent==='Searching');assert.equal(requests.length,1);assert.equal(requests[0].query,'exact literal');checks.push('Only explicit Search submits the displayed literal query');
 await page.evaluate(()=>window.changeScope());await page.waitForFunction(()=>document.querySelector('input')?.value==='');assert.equal(requests.length,1);
 await delayed.fulfill({json:{kind:'repository-evidence',scope:{app:'repo-a',repo:'owner/a',commit:'a'.repeat(40)},query:'exact literal',matches:[{path:'private.js',line:1,text:'OLD_SCOPE_SENTINEL',sourceId:'old'}],metadataMatches:[],coverage:{}}}).catch(()=>{});
 await page.waitForTimeout(50);assert.equal(await page.getByText('OLD_SCOPE_SENTINEL',{exact:true}).count(),0);assert.equal(await query.inputValue(),'');assert.equal(requests.length,1);assert.deepEqual(errors,[]);checks.push('Scope change clears query and ignores late old-scope response without another request');
}finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({checks,requests,errors,scope:'local component fixture only'},null,2));}
