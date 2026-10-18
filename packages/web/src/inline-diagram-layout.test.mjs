import test from 'node:test';
import assert from 'node:assert/strict';
import { previewDiagramEdit } from './inline-diagram-edit.js';
import { freezeInlineTools,validateInlinePlan } from './inline-tool-plan.js';
const node=(id,x,w=100,h=60)=>({id,kind:'rect',text:`Label ${id}`,runs:[{t:`Label ${id}`,b:true}],x1:x,y1:20,x2:x+w,y2:20+h,color:'#123456'});
function fixture(){const board={shapes:[node('a',0,600,350),node('b',700),node('c',1000)],links:[{id:'ab',from:'a',to:'b',label:'edge',route:'elbow'},{id:'bc',from:'b',to:'c',label:'continue'}],items:[],blocks:[]};return{board,frozen:{ids:['a','b','c'],objects:Object.fromEntries(board.shapes.map(n=>[n.id,structuredClone(n)]))},requestId:'vertical-test'};}
const input={targetIds:['a','b','c'],layout:{flow:'down'}};
test('vertical layout reuses graph ranks with measured sizes and preserves all nonposition fields',()=>{
  const f=fixture(),result=previewDiagramEdit(input,f);assert.equal(result.ok,true);
  assert.deepEqual(result,previewDiagramEdit(input,fixture()));assert.deepEqual(result.additions,[]);assert.deepEqual(result.removals,[]);
  const [a,b,c]=result.changes.map(change=>change.after);assert.ok(b.y1>a.y2);assert.ok(c.y1>b.y2);
  for(const change of result.changes){assert.equal(change.after.x2-change.after.x1,change.before.x2-change.before.x1);assert.equal(change.after.y2-change.after.y1,change.before.y2-change.before.y1);for(const key of ['id','text','runs','color'])assert.deepEqual(change.after[key],change.before[key]);}
  assert.equal(f.board.shapes[1].x1,700);assert.equal(f.board.links[0].id,'ab');assert.equal(result.changes.some(change=>change.list==='links'),false);
});
test('cycles and external edges retain topology and report readonly dependencies',()=>{
  const f=fixture();f.board.shapes.push(node('outside',2000));f.board.links.push({id:'cycle',from:'c',to:'a'},{id:'external',from:'b',to:'outside'});
  const result=previewDiagramEdit(input,f);assert.equal(result.ok,true);assert.deepEqual(result.dependencies.map(item=>item.id),['external']);assert.match(result.limitations[0],/cycle/);assert.equal(f.board.shapes[3].x1,2000);
});
test('vertical layout refuses stale, readonly, mixed changes, source, lock, groups and point anchors',()=>{
  for(const patch of [{locked:true},{groupId:'g'},{source:{id:'s'}},{citations:[{id:'c'}]},{x2:Infinity}]){const f=fixture();Object.assign(f.board.shapes[0],patch);f.frozen.objects.a=structuredClone(f.board.shapes[0]);assert.equal(previewDiagramEdit(input,f).ok,false);}
  const f=fixture();f.board.shapes[0].text='new';assert.equal(previewDiagramEdit(input,f).ok,false);
  assert.equal(previewDiagramEdit(input,{...fixture(),readOnly:true}).ok,false);
  assert.equal(previewDiagramEdit({...input,changes:[]},fixture()).ok,false);
  const pinned=fixture();pinned.board.links[0].toPoint={x:3,y:4};assert.equal(previewDiagramEdit(input,pinned).ok,false);
});
test('shared graph dispatcher preserves exact scope and rejects dependency drift',()=>{
  const {board}=fixture(),snapshot=freezeInlineTools(board,input.targetIds);
  const plan={mode:'edit',targetIds:input.targetIds,steps:[{tool:'edit_diagram',targetIds:input.targetIds,input:{layout:{flow:'down'}}}]};
  const result=validateInlinePlan(plan,snapshot,board,{}, {requestId:'layout-request'});assert.equal(result.ok,true);assert.deepEqual(result.changes.map(change=>change.id),['b','c']);
  board.links[0].label='changed';assert.equal(validateInlinePlan(plan,snapshot,board,{}, {requestId:'layout-request'}).ok,false);
});
