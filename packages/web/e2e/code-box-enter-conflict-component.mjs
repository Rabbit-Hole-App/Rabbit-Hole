// Focused component regression only. No app, persistence, model or runtime claim.
// COMPONENT_SRC must point to the reviewed candidate's packages/web/src directory.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
assert.ok(process.env.COMPONENT_SRC,'Set COMPONENT_SRC to the reviewed candidate web/src');
const bundle=await build({stdin:{resolveDir:resolve(process.env.COMPONENT_SRC),loader:'jsx',contents:`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';import CodeBoxEditor from './CodeBoxEditor.jsx';
import{EditorView}from'@codemirror/view';import{syntaxTree}from'@codemirror/language';import{CompletionContext}from'@codemirror/autocomplete';
window.completionDiagnostics=()=>{const view=EditorView.findFromDOM(document.querySelector('.cm-editor'));const state=view.state,pos=state.selection.main.head,names=[];for(let node=syntaxTree(state).resolveInner(pos,-1);node;node=node.parent)names.push(node.name);return{pos,names,sources:state.languageDataAt('autocomplete',pos).map(source=>{if(typeof source!=='function')return{kind:typeof source};const result=source(new CompletionContext(state,pos,true));return result?.then?{async:true}:{from:result?.from,labels:result?.options?.slice(0,45).map(item=>item.label)};})};};
function App(){const[value,setValue]=useState('remote = 1'),[epoch,setEpoch]=useState(0);window.fixture={remote:setValue};return <CodeBoxEditor key={epoch} value={value} language="python" onApi={api=>window.codeApi=api} onChange={text=>window.draft=text} onExit={result=>{(window.exits||=[]).push(result);if(result.conflict)return false;setValue(result.value);return true}} onInlineAI={()=>{window.inlineCalls=(window.inlineCalls||0)+1}} onDiscard={()=>{window.discards=(window.discards||0)+1;setEpoch(n=>n+1)}}/>}createRoot(document.getElementById('root')).render(<App/>);
`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
if(process.env.BUILD_ONLY==='1'){console.log(JSON.stringify({scope:'component fixture bundle only; no behavior checks executed',bytes:bundle.outputFiles[0].contents.length}));process.exit(0);}
const browser=await chromium.launch({headless:true});const results=[],requests=[],errors=[];let page;
try{
  page=await browser.newPage({viewport:{width:1000,height:700}});page.setDefaultTimeout(10000);
  await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});page.on('pageerror',error=>errors.push(error.message));
  // Mirror the component's Tailwind flex/min-height utilities: this isolated
  // bundle does not include the app stylesheet. Without them its 100%-height
  // CodeMirror overlay covers the real conflict buttons below the host.
  await page.setContent('<style>[data-code-box-editor]{display:flex;flex-direction:column;height:100%;min-height:80px}[data-code-box-editor]>div:nth-child(2){min-height:0;flex:1} [data-code-box-editor]>div:first-child{display:flex;align-items:center;gap:8px}</style><div id="root" style="width:500px;height:300px"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  const input=page.locator('[data-code-box-input]');await input.waitFor();
  await page.waitForFunction(()=>window.completionDiagnostics().sources.some(source=>source.labels?.includes('return')));
  const text=()=>page.evaluate(()=>window.codeApi.getText());
  const replace=async value=>{await input.click();await page.keyboard.press('Control+a');await page.keyboard.insertText(value);};
  const complete=async()=>{await page.keyboard.press('Control+Space');await page.getByRole('option',{name:'return',exact:true}).waitFor();await page.waitForTimeout(100);};
  const initialApi=await page.evaluate(()=>{window.initialCodeApi=window.codeApi;return window.codeApi.getText()});assert.equal(initialApi,'remote = 1');
  await page.evaluate(()=>window.fixture.remote('remote = 4'));await page.waitForFunction(()=>window.codeApi.getText()==='remote = 4');
  assert.equal(await page.evaluate(()=>window.initialCodeApi===window.codeApi),true);assert.equal(await page.getByRole('button',{name:'Discard draft',exact:true}).count(),0);
  results.push('Clean remote update preserves the editor instance and updates the baseline');
  await replace('if True:\n  ret');await complete();await page.keyboard.press('Enter');
  assert.equal(await text(),'if True:\n  ret\n  ','Enter must insert newline/indent, never accept return');results.push('Enter with visible completion inserts newline and indentation');
  await replace('if True:\n  ret');await complete();await page.keyboard.press('Tab');
  assert.equal(await text(),'if True:\n  return','Tab must accept the visible keyword');results.push('Tab accepts the same completion');
  await replace('local_draft = 2');await page.evaluate(()=>window.fixture.remote('remote = 3'));await page.getByRole('status').filter({hasText:'changed elsewhere'}).waitFor();
  assert.equal(await text(),'local_draft = 2');await page.keyboard.press('Control+Enter');
  const attempt=await page.evaluate(()=>window.exits.at(-1));assert.equal(attempt.conflict,true);assert.equal(attempt.value,'local_draft = 2');assert.equal(attempt.expectedText,'remote = 4');assert.equal(await text(),'local_draft = 2');
  await page.getByRole('button',{name:'Discard draft',exact:true}).waitFor();results.push('Remote change retains draft and refused commit reports original revision');
  await page.getByRole('button',{name:'Discard draft',exact:true}).click();await page.waitForFunction(()=>window.codeApi?.getText()==='remote = 3');
  assert.equal(await page.evaluate(()=>window.discards),1);assert.equal(await page.getByRole('button',{name:'Discard draft',exact:true}).count(),0);results.push('Explicit discard remounts latest remote value without overwriting it');
  // Synthetic DOM composition is deliberately not an OS IME acceptance claim.
  await replace('ret');await complete();const compositionBefore=await text();
  const composition=await page.evaluate(()=>{
    const node=document.querySelector('[data-code-box-input]'),before={exits:(window.exits||[]).length,inline:window.inlineCalls||0};let escaped=0;
    const bubble=()=>escaped++;document.addEventListener('keydown',bubble);
    node.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));
    const prevented=[];let protectedText;
    for(const [key,ctrlKey]of [['Tab',false],['k',true],['Enter',true],['Escape',false],['ArrowLeft',false],['Delete',false],[' ',false]]){
      const event=new KeyboardEvent('keydown',{key,ctrlKey,isComposing:true,bubbles:true,cancelable:true});node.dispatchEvent(event);prevented.push({key,ctrlKey,prevented:event.defaultPrevented});if(key==='Escape')protectedText=window.codeApi.getText();
    }
    node.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:''}));document.removeEventListener('keydown',bubble);
    return {before,after:{exits:(window.exits||[]).length,inline:window.inlineCalls||0},escaped,prevented,protectedText};
  });
  assert.equal(composition.protectedText,compositionBefore);assert.deepEqual(composition.after,composition.before);console.log(JSON.stringify({syntheticCompositionBubbledKeys:composition.escaped,scope:'diagnostic only; canvas action suppression requires actual-app checks'}));
  for(const event of composition.prevented.filter(event=>event.key==='Tab'||event.ctrlKey))assert.equal(event.prevented,true);
  results.push('Synthetic composition prevents completion, exit and inline AI');
  // Ordinary completion becomes available again after composition ends.
  await replace('ret');await page.keyboard.press('Control+Space');await page.getByRole('option',{name:'return',exact:true}).waitFor();await page.waitForTimeout(100);await page.keyboard.press('Tab');assert.equal(await text(),'return');
  results.push('Completion resumes after synthetic composition ends');
  assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);results.push('No network requests or browser errors');
  console.log(JSON.stringify({candidate:process.env.CANDIDATE_SHA||'working candidate; record dirty state',passed:results.length,failed:0,skipped:0,results,scope:'isolated component only'}));
}catch(error){console.error(JSON.stringify({passed:results.length,failed:1,skipped:0,error:error.message,results,options:await page?.getByRole('option').allTextContents(),diagnostics:await page?.evaluate(()=>window.completionDiagnostics?.()),body:(await page?.locator('body').innerText())?.slice(0,1500),errors}));process.exitCode=1;}
finally{await browser.close();}
