import test from 'node:test';
import assert from 'node:assert/strict';
import {INLINE_TOOLS,inlineToolAvailability,validateInlineToolPlan} from './inline-tool-capabilities.js';
const selection=[{id:'a',kind:'shape'},{id:'b',kind:'shape'}];
const adapters={inspect_selection:{available:true},set_appearance:{available:true},arrange_selection:{available:true}};
const plan={mode:'edit',targetIds:['a','b'],steps:[{tool:'set_appearance',targetIds:['a','b'],input:{fill:'#0000ff'}},{tool:'arrange_selection',targetIds:['a','b'],input:{alignment:'left'}}]};
const check=(value=plan,options={})=>validateInlineToolPlan(value,{mode:'edit',selection,adapters,...options});
test('composed appearance and arrangement remain one bounded plan with frozen targets',()=>{
 assert.equal(check().ok,true);assert.equal(check({...plan,steps:[...plan.steps,...plan.steps,...plan.steps]}).ok,false);
 assert.equal(check({...plan,steps:[{...plan.steps[0],targetIds:['nearby']}]}).ok,false);
 assert.equal(check({...plan,targetIds:['a','a']}).ok,false);
});
test('mode, locks and read-only permissions cannot be widened by capability availability',()=>{
 assert.equal(check({...plan,mode:'explain'}).ok,false);assert.equal(check(plan,{readOnly:true}).ok,false);
 assert.equal(check(plan,{selection:[selection[0],{...selection[1],locked:true}]}).ok,false);
 assert.equal(inlineToolAvailability('inspect_selection',{mode:'explain',selection,readOnly:true,adapters}).available,true);
});
test('native appearance never edits pixels; missing runtime remains unavailable',()=>{
 assert.equal(inlineToolAvailability('set_appearance',{mode:'edit',selection:[{id:'img',kind:'image'}],adapters}).available,false);
 assert.equal(inlineToolAvailability('remove_background',{mode:'edit',selection:[{id:'img',kind:'image'}],adapters}).available,false);
 assert.equal(inlineToolAvailability('constructor',{mode:'edit',selection,adapters}).available,false);
 assert.equal(inlineToolAvailability('set_appearance',{mode:'edit',selection,adapters:Object.create(adapters)}).available,false);
 assert.equal(INLINE_TOOLS.remove_background.execution,'background');
});
test('code edits do not authorize execution',()=>{
 const selected=[{id:'code',kind:'code'}],value={mode:'explain',targetIds:['code'],steps:[{tool:'run_code',targetIds:['code'],input:{}}]};
 const options={mode:'explain',selection:selected,adapters:{run_code:{available:true}}};
 assert.equal(validateInlineToolPlan(value,options).ok,false);
 assert.equal(validateInlineToolPlan(value,{...options,executionRequested:true}).ok,true);
});
