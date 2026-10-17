import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchCamera, createSearchSnapshotStore, searchQuote, revealSearchRange, createEquationSearchDrafts } from './canvas-search-navigation.js';

test('search frames tiny objects at readable zoom without enlarging or moving the object', () => {
  const box = Object.freeze({x:900,y:1400,w:10,h:10}), view={x:0,y:0,z:.2}, area={left:24,top:24,right:600,bottom:650};
  const next=searchCamera(box,view,area);
  assert.equal(next.z, .6);
  assert.equal(next.x+(box.x+5)*next.z,312);
  assert.equal(next.y+(box.y+5)*next.z,337);
});
test('a long card remains readable and begins inside the available panel-aware viewport', () => {
  const next=searchCamera({x:100,y:500,w:600,h:10000},{x:0,y:0,z:1},{left:24,top:60,right:624,bottom:700});
  assert.ok(next.z>=.6 && next.z<=1);
  assert.equal(next.y+500*next.z,76);
  assert.ok(next.x+100*next.z>=24);
});
test('snapshots are stable across reads and camera-only updates; live edits notify and retain all content', () => {
  let board={blocks:[{id:'x',body:'a'.repeat(300000)}],doc:{blocks:[{id:'p',text:'first'}]}};
  const store=createSearchSnapshotStore(()=>board), first=store.get();let calls=0;
  const unsubscribe=store.subscribe(()=>{calls++;assert.equal(store.get().board.doc.blocks[0].text,'unsaved');});
  assert.equal(store.get(),first);assert.equal(first.board.blocks[0].body.length,300000);
  board={...board,doc:{blocks:[{id:'p',text:'unsaved'}]}};store.changed();
  assert.equal(calls,1);assert.equal(store.get().revision,first.revision+1);
  assert.notEqual(store.get(),first);unsubscribe();store.changed();assert.equal(calls,1);
});
test('literal quotes retain punctuation and locate repeated text using surrounding context',()=>{
  assert.deepEqual(searchQuote('a src/a.py and b src/a.py',{exact:'src/a.py',prefix:'b ',suffix:''}),{start:17,end:25});
  assert.equal(searchQuote('unchanged','missing'),null);
});

test('match reveal scrolls only the inner card container at the camera scale', () => {
  const previous=globalThis.getComputedStyle;
  const card={contains:n=>n===inner,scrollTop:0,parentElement:null};
  const inner={parentElement:card,scrollTop:0,scrollLeft:0,scrollHeight:2000,clientHeight:200,scrollWidth:400,clientWidth:400,
    getBoundingClientRect:()=>({top:100,bottom:200,left:100,right:300,height:100,width:200})};
  globalThis.getComputedStyle=()=>({overflowY:'auto',overflowX:'hidden'});
  try { revealSearchRange(card,{startContainer:{parentElement:inner},getBoundingClientRect:()=>({top:600,bottom:610,left:120,right:200})},.5);
    assert.equal(inner.scrollTop,900);assert.equal(card.scrollTop,0);
  } finally {globalThis.getComputedStyle=previous;}
});


test('equation drafts are searchable immediately without persisting, and closing restores stored content', () => {
  const equation=Object.freeze({id:'e',kind:'equation',latex:'saved'}), other=Object.freeze({id:'other',latex:'other'});
  const board=Object.freeze({items:Object.freeze([equation,other]),blocks:[]});
  let calls=0;
  const drafts=createEquationSearchDrafts(()=>{calls++;store.changed();});
  const store=createSearchSnapshotStore(()=>drafts.apply(board));
  const initial=store.get();
  drafts.set('e','\\frac{live}{draft}');
  assert.equal(store.get().board.items[0].latex,'\\frac{live}{draft}');
  assert.equal(equation.latex,'saved');assert.equal(store.get().board.items[1],other);
  assert.notEqual(store.get(),initial);assert.equal(calls,1);
  drafts.set('e','\\frac{live}{draft}');assert.equal(calls,1);
  drafts.set('e','');assert.equal(store.get().board.items[0].latex,'');
  drafts.set('e',null);assert.equal(store.get().board,board);assert.equal(calls,3);
  drafts.set('e',null);assert.equal(calls,3);
});
