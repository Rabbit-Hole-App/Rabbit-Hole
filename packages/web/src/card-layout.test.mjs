import test from 'node:test';import assert from 'node:assert/strict';
import {switchCardLayout,resizeCardLayout,widthLimits,fitWidth,supportsCardLayout} from './card-layout.js';
test('conversion preserves identity/content/position and restores previous bounded size',()=>{const b={id:'a',type:'explanation',dx:17,dy:42,body:'long',refs:[{id:'r'}]};const f=switchCardLayout(b,'full',{w:480,h:330});assert.equal(f.body,b.body);assert.equal(f.refs,b.refs);assert.equal(f.dx,17);assert.deepEqual(f.cardLayout.slot,{w:480,h:330});const bigger=resizeCardLayout(f,900,9000);const back=switchCardLayout(bigger,'scrollable',{w:900,h:9000});assert.deepEqual(back.cardLayout.scrollableSize,{w:480,h:330});assert.equal(switchCardLayout(back,'full',{w:480,h:330}).cardLayout.fullWidth,900);assert.deepEqual(b,{id:'a',type:'explanation',dx:17,dy:42,body:'long',refs:[{id:'r'}]});});
test('content minimum raises maximum; preferred width is distinct and valid widths survive',()=>{assert.deepEqual(widthLimits(1600),{min:1600,max:1600});assert.equal(fitWidth(900),900);assert.equal(fitWidth(undefined),720);assert.equal(fitWidth(140,widthLimits(500)),500);});
test('left-edge resize only changes requested x and width, never derived height or slot',()=>{const b=switchCardLayout({id:'a',type:'snippet',dx:20,dy:30,code:'x'},'full',{w:400,h:200});const n=resizeCardLayout(b,500,4000,-80);assert.equal(n.dx,-80);assert.equal(n.dy,30);assert.deepEqual(n.cardLayout.slot,{w:400,h:200});assert.equal(n.h,undefined);assert.equal(n.code,'x');});
test('unsupported readers stay unchanged and existing cards default to scrollable',()=>{for(const type of ['paper','notebook','repo-code','video','repo-graph']){const b={type};assert.equal(supportsCardLayout(b),false);assert.equal(switchCardLayout(b,'full',{w:400,h:300}),b);}const b={type:'explanation'};assert.equal(switchCardLayout(b,'scrollable',{}),b);});

test('content-required wide size survives both mode switches',()=>{const wide=resizeCardLayout(switchCardLayout({id:'table',type:'table'},'full',{w:600,h:300}),1600,null,null,1600);const scroll=switchCardLayout(wide,'scrollable',{w:1600,h:900});assert.equal(scroll.cardLayout.fullWidth,1600);assert.equal(switchCardLayout(scroll,'full',{w:600,h:300}).cardLayout.fullWidth,1600);});

// Resize persistence (task 5b60a856): a card keeps its own w and h in its block, and a size commit must patch the block as it is now.
import {clampBox,patchBlock} from './card-layout.js';
const setBlockSize=(blocks,id,w,h)=>patchBlock(blocks,id,clampBox(w,h)); // what CanvasNode commits on release
const book=(id,over={})=>({id,type:'notebook',notebook_id:`nb-${id}`,dx:0,dy:0,ipynb:{cells:[]},...over});
test('a size commit keeps what changed since the drag began (the old whole-block replace reverted it)',()=>{
 const atPress=book('a'),now=[{...atPress,ipynb:{cells:['x = 1']},files:['notebook.ipynb']},book('b')];
 const old=now.map(b=>b.id==='a'?{...atPress,w:700,h:500}:b); // onChange({ ...block, w, h }) from the press-time render
 assert.deepEqual(old[0].ipynb,{cells:[]},'the old path lost the newer notebook save');
 const next=setBlockSize(now,'a',700,500);
 assert.deepEqual(next[0].ipynb,{cells:['x = 1']});assert.deepEqual(next[0].files,['notebook.ipynb']);
 assert.equal(next[0].w,700);assert.equal(next[0].h,500);
});
test('a notebook report after a resize keeps the size (the old report replaced the block with its pre-resize copy)',()=>{
 const resized=setBlockSize([book('a')],'a',700,500);
 const next=patchBlock(resized,'a',{ipynb:{cells:['y']}});
 assert.equal(next[0].w,700);assert.equal(next[0].h,500);assert.deepEqual(next[0].ipynb,{cells:['y']});
});
test('two cards keep independent sizes and a card with no stored size stays without one',()=>{
 const start=[book('a'),book('b'),book('c')];
 const next=setBlockSize(setBlockSize(start,'a',600,400),'b',900,700);
 assert.deepEqual([next[0].w,next[0].h,next[1].w,next[1].h],[600,400,900,700]);
 assert.equal('w' in next[2],false);assert.equal(next[2],start[2]);
 assert.equal(setBlockSize(start,'missing',600,400).every((b,i)=>b===start[i]),true);
 assert.equal('w' in start[0],false,'the input list is not mutated');
});
test('sizes are clamped to the corner handle limits',()=>{
 assert.deepEqual(clampBox(10,10),{w:280,h:140});assert.deepEqual(clampBox(5000,5000),{w:1200,h:1000});assert.deepEqual(clampBox(640,540),{w:640,h:540});
 assert.deepEqual(setBlockSize([book('a')],'a',5000,10)[0].w,1200);
});
