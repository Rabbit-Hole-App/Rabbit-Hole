import test from 'node:test';
import assert from 'node:assert/strict';
import { freezeInlineTools, validateInlinePlan } from './inline-tool-plan.js';
import { applyTx, editTx } from './inline-ai-apply.js';
import { inlineEditToolFor } from '../../control-plane/src/agents/learn-inline.js';
const card=(id,dx)=>({id,type:'explanation',title:id,body:'Keep this content.',dx,dy:0});
test('equal-width schema is advertised only to the frozen shared-tool path',()=>{
  const step=tool=>tool.input_schema.properties.plan.properties.steps.items.properties.input.properties;
  assert.ok(step(inlineEditToolFor(true)).how.enum.includes('equal-width'));
  assert.equal(step(inlineEditToolFor(true)).width.maximum,1200);
  assert.ok(!step(inlineEditToolFor(false)).how.enum.includes('equal-width'));
});
function fixture(){
  const board={blocks:[card('a',0),card('b',100)],items:[],shapes:[],links:[{id:'ab',from:'a',to:'b',label:'keep'}]};
  const boxes={a:{x:20,y:50,w:320,h:200},b:{x:120,y:280,w:400,h:240}};
  return{board,boxes,snapshot:freezeInlineTools(board,['a','b'],boxes)};
}
function check(input,fixtureValue=fixture(),options={}){
  const {board,boxes,snapshot}=fixtureValue;
  return validateInlinePlan({mode:'edit',targetIds:['a','b'],steps:[{tool:'arrange_selection',targetIds:['a','b'],input}]},snapshot,board,boxes,options);
}
test('card arrangement uses offsets, preserves contents and connector topology',()=>{
  const f=fixture(),result=check({how:'left'},f);assert.equal(result.ok,true);
  const moved=result.changes.find(change=>change.id==='b');assert.equal(moved.after.dx,0);assert.equal(moved.after.dy,0);assert.deepEqual(moved.bounds,{x:20,y:280,w:400,h:240});
  const next=applyTx(f.board,editTx({requestId:'arrange-test',changes:result.changes}));assert.deepEqual(next.links,f.board.links);assert.equal(next.blocks[1].body,'Keep this content.');assert.equal(f.board.blocks[1].dx,100);
});
test('equal width preserves card footprint and measured anchor without changing original content',()=>{
  const f=fixture(),result=check({how:'equal-width'},f);assert.equal(result.ok,true);
  const resized=result.changes.find(change=>change.id==='a').after;
  assert.deepEqual(resized.cardLayout.slot,{w:320,h:200});assert.deepEqual(resized.cardLayout.scrollableSize,{w:400,h:200});assert.equal(resized.dx,0);assert.equal(resized.body,f.board.blocks[0].body);
  assert.equal(check({how:'equal-width',width:300},f).ok,false);assert.equal(check({how:'equal-width',width:1300},f).ok,false);
});
test('equal width retains Full content mode and refuses unmeasured shrink minima',()=>{
  const f=fixture();f.board.blocks[0].cardLayout={mode:'full',fullWidth:320,slot:{w:320,h:200},scrollableSize:{w:320,h:200}};f.snapshot=freezeInlineTools(f.board,['a','b'],f.boxes);
  const result=check({how:'equal-width'},f);assert.equal(result.ok,true);assert.equal(result.changes.find(change=>change.id==='a').after.cardLayout.fullWidth,400);assert.equal(result.changes[0].after.cardLayout.mode,'full');
  f.boxes.a.w=500;f.snapshot=freezeInlineTools(f.board,['a','b'],f.boxes);assert.equal(check({how:'equal-width',width:400},f).ok,false);
});
test('source, lock, readonly, revision, measured bounds and dependencies fail closed',()=>{
  for(const patch of [{locked:true},{source:{id:'private'}},{citations:[{id:'paper'}]},{fileRef:{id:'file'}}]){const f=fixture();Object.assign(f.board.blocks[0],patch);assert.equal(freezeInlineTools(f.board,['a','b'],f.boxes),null);}
  assert.equal(check({how:'left'},fixture(),{readOnly:true}).ok,false);
  for(const mutate of [f=>f.board.blocks[0].body='new',f=>f.boxes.a.x++,f=>f.board.links[0].label='changed']){const f=fixture();mutate(f);assert.equal(check({how:'left'},f).ok,false);}
});
test('boxed shape equal widths preserve reversed coordinates and identities',()=>{
  const board={blocks:[],items:[],links:[],shapes:[{id:'a',kind:'rect',x1:100,y1:0,x2:0,y2:80,text:'a'},{id:'b',kind:'rect',x1:200,y1:0,x2:400,y2:80,text:'b'}]};
  const boxes={a:{x:0,y:0,w:100,h:80},b:{x:200,y:0,w:200,h:80}},snapshot=freezeInlineTools(board,['a','b'],boxes);
  const result=check({how:'equal-width'},{board,boxes,snapshot});assert.equal(result.ok,true);assert.deepEqual(result.changes[0].after,{...board.shapes[0],x1:200});
});
