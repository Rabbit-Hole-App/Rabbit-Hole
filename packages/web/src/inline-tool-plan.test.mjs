import test from 'node:test';
import assert from 'node:assert/strict';
import {freezeInlineTools,validInlineToolSnapshot,inlineToolSnapshotBoard,validateInlinePlan} from './inline-tool-plan.js';
import {applyTx,editTx} from './inline-ai-apply.js';
import {earlierResult} from './inline-ai-session.js';
const table={id:'table',type:'table',columns:['value'],rows:[['2'],['1']],title:'Numbers',x:10,y:20};
const a={id:'a',kind:'rect',text:'A',x1:0,y1:0,x2:100,y2:100};
const b={id:'b',kind:'rect',text:'B',x1:200,y1:0,x2:300,y2:100};
const edge={id:'edge',from:'a',to:'b',label:'relation'};
const board=()=>({shapes:[structuredClone(a),structuredClone(b)],links:[structuredClone(edge)],items:[],blocks:[structuredClone(table)]});
const plan=(ids,steps)=>({mode:'edit',targetIds:ids,steps});
const sort={tool:'transform_table',targetIds:['table'],input:{operation:'sort',column:0}};
test('table preview preserves metadata and original; current content is rechecked',()=>{
 const source=board(),frozen=freezeInlineTools(source,['table']);
 const result=validateInlinePlan(plan(['table'],[sort]),frozen,source);
 assert.equal(result.ok,true);assert.deepEqual(result.changes[0].after.rows,[['1'],['2']]);
 assert.equal(result.changes[0].after.x,10);assert.deepEqual(source.blocks[0].rows,[['2'],['1']]);
 source.blocks[0].rows[0][0]='3';assert.equal(validateInlinePlan(plan(['table'],[sort]),frozen,source).ok,false);
});
test('source-backed, citation-bearing, locked and malformed snapshots cannot authorize edits',()=>{
 for(const patch of [{fileRef:{source:{id:'private'}}},{citations:['citation']}]){
  const source=board();Object.assign(source.blocks[0],patch);assert.equal(freezeInlineTools(source,['table']),null);
 }
 const source=board();source.blocks[0].locked=true;assert.equal(freezeInlineTools(source,['table']),null);
 for(const value of [{},null,{version:1,ids:['a'],objects:{a},lists:{a:'shapes'},bounds:{},selection:[null]}])assert.equal(validInlineToolSnapshot(value),false);
});
test('read-only dependency records do not confer removal scope; newly attached edges invalidate',()=>{
 const source=board(),frozen=freezeInlineTools(source,['a']);
 assert.deepEqual(frozen.readOnlyGraph.links,[edge]);assert.deepEqual(inlineToolSnapshotBoard(frozen).shapes.map(x=>x.id).sort(),['a','b']);
 const remove=plan(['a'],[{tool:'edit_diagram',targetIds:['a'],input:{removeIds:['a']}}]);
 assert.equal(validateInlinePlan(remove,frozen,source,{}, {requestId:'r'}).ok,false);
 const rename=plan(['a'],[{tool:'edit_diagram',targetIds:['a'],input:{changes:[{id:'a',patch:{text:'Renamed'}}]}}]);
 assert.equal(validateInlinePlan(rename,frozen,source,{}, {requestId:'r'}).ok,true);
 source.links.push({...edge,id:'new'});assert.match(validateInlinePlan(rename,frozen,source,{}, {requestId:'r'}).errors[0],/connections changed/);
});
test('diagram additions have deterministic fresh IDs and preserve existing graph',()=>{
 const source=board(),frozen=freezeInlineTools(source,['a']);
 const request=plan(['a'],[{tool:'edit_diagram',targetIds:['a'],input:{add:{shapes:[{id:'new',kind:'rect',label:'New'}],links:[{id:'newlink',from:'a',to:'new',label:'next'}]}}}]);
 const first=validateInlinePlan(request,frozen,source,{}, {requestId:'r'});
 assert.equal(first.ok,true);assert.equal(first.additions.length,2);assert.deepEqual(first,validateInlinePlan(request,frozen,source,{}, {requestId:'r'}));
 assert.equal(source.shapes.length,2);assert.equal(validateInlinePlan(request,frozen,source).ok,false);
});
test('mixed scoped table and diagram steps aggregate without widening IDs',()=>{
 const source=board(),frozen=freezeInlineTools(source,['a','table']);
 const request=plan(['a','table'],[sort,{tool:'edit_diagram',targetIds:['a'],input:{changes:[{id:'a',patch:{text:'Updated'}}]}}]);
 const result=validateInlinePlan(request,frozen,source,{}, {requestId:'request'});
 assert.equal(result.ok,true);assert.deepEqual(result.changes.map(x=>x.id),['table','a']);
 request.steps[1].targetIds=['b'];assert.equal(validateInlinePlan(request,frozen,source,{}, {requestId:'request'}).ok,false);
});
test('structural transaction removes and adds atomically, replay does not duplicate, original remains valid Undo state',()=>{
 const source=board(),frozen=freezeInlineTools(source,['a','edge']);
 const request=plan(['a','edge'],[{tool:'edit_diagram',targetIds:['a','edge'],input:{removeIds:['edge'],add:{shapes:[{id:'new',label:'Replacement'}]}}}]);
 const checked=validateInlinePlan(request,frozen,source,{}, {requestId:'r'});assert.equal(checked.ok,true);
 const tx=editTx({requestId:'r',...checked}),accepted=applyTx(source,tx);
 assert.equal(accepted.shapes.length,3);assert.equal(accepted.links.length,0);assert.equal(source.links.length,1);
 assert.deepEqual(applyTx(accepted,tx),accepted);assert.deepEqual(accepted.blocks,source.blocks);
 assert.deepEqual(JSON.parse(earlierResult({kind:'edit',raw:{plan:request}})).plan,request);
});
test('arrangement refuses changed measured bounds even when stored object is unchanged',()=>{
 const source=board(),bounds={a:{x:0,y:0,w:100,h:100},b:{x:200,y:0,w:100,h:100}},frozen=freezeInlineTools(source,['a','b'],bounds);
 const request=plan(['a','b'],[{tool:'arrange_selection',targetIds:['a','b'],input:{how:'left'}}]);
 assert.equal(validateInlinePlan(request,frozen,source,bounds).ok,true);
 assert.equal(validateInlinePlan(request,frozen,source,{...bounds,a:{...bounds.a,w:105}}).ok,false);
});
test('annotation connectors cannot become structural diagram edges',()=>{
 const source=board();source.links[0].kind='annotation';const frozen=freezeInlineTools(source,['edge']);
 const request=plan(['edge'],[{tool:'edit_diagram',targetIds:['edge'],input:{changes:[{id:'edge',patch:{label:'new'}}]}}]);
 assert.match(validateInlinePlan(request,frozen,source,{}, {requestId:'r'}).errors[0],/not structural/);
});
test('Explain annotations add native callouts without changing even locked source cards',()=>{
 const source=board();Object.assign(source.blocks[0],{fileRef:{source:{id:'original'}},locked:true});
 const bounds={table:{x:10,y:20,w:420,h:220}},frozen=freezeInlineTools(source,['table'],bounds,{mode:'explain'});
 assert.ok(frozen);const request={mode:'explain',targetIds:['table'],steps:[{tool:'annotate_selection',targetIds:['table'],input:{annotations:[{targetId:'table',text:'Read this column first'}]}}]};
 const result=validateInlinePlan(request,frozen,source,bounds,{mode:'explain',requestId:'annotation-request'});
 assert.equal(result.ok,true);assert.equal(result.changes.length,0);assert.equal(result.additions.length,2);
 const accepted=applyTx(source,{...editTx({requestId:'annotation-request',...result}),kind:'annotations'});
 assert.deepEqual(accepted.blocks,source.blocks);assert.equal(accepted.links.at(-1).kind,'annotation');
 assert.equal(validateInlinePlan({...request,mode:'edit'},frozen,source,bounds,{mode:'edit',requestId:'r'}).ok,false);
 assert.equal(validateInlinePlan(request,frozen,source,bounds,{mode:'explain',requestId:'r',readOnly:true}).ok,false);
});
test('annotation placement refuses bounds drift and out-of-scope highlights',()=>{
 const source=board(),bounds={a:{x:0,y:0,w:100,h:100}},frozen=freezeInlineTools(source,['a'],bounds,{mode:'explain'});
 const request={mode:'explain',targetIds:['a'],steps:[{tool:'annotate_selection',targetIds:['a'],input:{annotations:[{targetId:'a',text:'A',highlight:{x:200,y:200,w:10,h:10}}]}}]};
 assert.equal(validateInlinePlan(request,frozen,source,bounds,{mode:'explain',requestId:'r'}).ok,false);
 delete request.steps[0].input.annotations[0].highlight;
 assert.equal(validateInlinePlan(request,frozen,source,{a:{...bounds.a,w:105}},{mode:'explain',requestId:'r'}).ok,false);
});
