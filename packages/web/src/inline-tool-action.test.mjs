import test from 'node:test';
import assert from 'node:assert/strict';
import {validateToolAction} from './inline-tool-action.js';
import {freezeInlineTools} from './inline-tool-plan.js';
const item={id:'code',kind:'text',mode:'code',lang:'javascript',text:'return input + 1',x:0,y:0};
const board={items:[item],blocks:[],shapes:[],links:[]};
const scope={app:'repo-app',repo:'owner/repo',commit:'a'.repeat(40)};
const frozen={requestId:'request',actionMode:'explain',ids:['code'],repoScope:scope,toolSnapshot:freezeInlineTools(board,['code'],{}, {mode:'explain'})};
const action={kind:'tool_action',action:'run_code',requestId:'request',targetIds:['code'],summary:'Review execution'};
test('code handoff clones request without executing or mutating content',()=>{const before=JSON.stringify(board);const out=validateToolAction(action,frozen,board,{mode:'explain',codeAvailable:true});assert.equal(out.ok,true);assert.equal(out.preview.action,'run_code');assert.notEqual(out.preview.raw,action);assert.equal(JSON.stringify(board),before);});
test('request, mode, targets, source, permissions and extra execution fields fail closed',()=>{
 for(const [result,at,live,options] of [
  [{...action,requestId:'other'},frozen,board,{}], [{...action,targetIds:['other']},frozen,board,{}],
  [{...action,input:{run:true}},frozen,board,{}], [action,{...frozen,range:{id:'code',from:0,to:3}},board,{}],
  [action,frozen,{...board,items:[{...item,text:'new work'}]},{}], [action,frozen,board,{readOnly:true}],
  [action,frozen,board,{mode:'edit'}], [action,frozen,board,{locked:true}], [action,frozen,board,{codeAvailable:false}],
 ])assert.equal(validateToolAction(result,at,live,{mode:'explain',codeAvailable:true,...options}).ok,false);
});
test('evidence requires explicit frozen repository scope and literal bounded query',()=>{
 const result={...action,action:'find_evidence',query:'optimizer.step()'};
 const options={mode:'explain',repoScope:scope};
 assert.equal(validateToolAction(result,frozen,board,options).ok,true);
 for(const [out,at,opts] of [[result,{...frozen,repoScope:null},options],[result,frozen,{...options,repoScope:{...scope,commit:'b'.repeat(40)}}],[{...result,query:'x'.repeat(201)},frozen,options],[{...result,url:'https://example.com'},frozen,options]])assert.equal(validateToolAction(out,at,board,opts).ok,false);
});
