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

// FX-EB-10 (owner 2026-10-30): a text card resized taller than its content kept that height and stood mostly blank (a Challenge's
// question and controls filled about half of it). A content-fitted card's height follows its content; a saved or dragged
// height is only a ceiling, and a drag or commit never stores more than the content needs.
import {fitFrame,naturalHeight} from './card-layout.js';
import {readFileSync} from 'node:fs';
// A card as the browser lays it out: a fixed height wins; otherwise its content's, up to max-height, and the rest scrolls in its body.
const laidOut=({height,maxHeight},content,extra=0)=>{const offsetHeight=height??Math.min(content+extra,maxHeight??Infinity),clientHeight=offsetHeight-extra-24;
 return {offsetHeight,querySelector:sel=>sel==='[data-scroll]'?{clientHeight,scrollHeight:Math.max(clientHeight,content-24)}:null};};
test('the screenshot case: a Challenge saved at 1000 px renders at its content height and a commit stores that height, not 1000',()=>{
 const content=310,saved=1000;
 const before=laidOut(fitFrame(saved,undefined,false),content);
 assert.equal(before.offsetHeight,1000,'reproduction: a fixed height leaves ~690 px blank under the controls');
 const style=fitFrame(saved,undefined,true);assert.deepEqual(style,{height:undefined,maxHeight:1000});
 const card=laidOut(style,content);assert.equal(card.offsetHeight,310,'reopened: no blank space');
 assert.equal(naturalHeight(card),310,'the natural height is read from an unstretched card');
 assert.deepEqual(clampBox(440,saved,naturalHeight(card)),{w:440,h:310},'the commit never stores more than the content needs');
});
test('the natural height includes content scrolled under a lower ceiling, and leaves out the rows under the body',()=>{
 const card=laidOut(fitFrame(260,undefined,true),500);assert.equal(card.offsetHeight,260);assert.equal(naturalHeight(card),500);
 assert.equal(clampBox(440,220,naturalHeight(card)).h,220,'dragging smaller than the content is allowed: it scrolls');
 assert.equal(naturalHeight(laidOut(fitFrame(900,undefined,true),300,40),40),300,'Sources or reference rows (extra) are not body height');
 assert.equal(naturalHeight({offsetHeight:180,querySelector:()=>null}),180);
});
test('the required height follows the content: wrapping at a narrower width, or feedback appearing, moves the limit',()=>{
 const wide=naturalHeight(laidOut(fitFrame(undefined,760,true),280)),narrow=naturalHeight(laidOut(fitFrame(undefined,760,true),460));
 assert.deepEqual([clampBox(700,900,wide).h,clampBox(320,900,narrow).h],[280,460]);
 const feedback=laidOut(fitFrame(280,undefined,true),640);assert.equal(feedback.offsetHeight,280,'feedback after a commit scrolls inside the committed height');
 assert.equal(clampBox(440,900,naturalHeight(feedback)).h,640,'and a new drag may open the card to the feedback\'s full height');
 assert.equal(laidOut(fitFrame(640,undefined,true),300).offsetHeight,300,'a section closed again: the card shrinks back, no blank space');
});
test('content limits stay inside the corner handle limits; no content measure keeps the old limits',()=>{
 assert.equal(clampBox(400,900,90).h,140);assert.equal(clampBox(400,5000,2000).h,1000);assert.equal(clampBox(400,900,undefined).h,900);assert.equal(clampBox(400,900,NaN).h,900);assert.equal(clampBox(400,900,0).h,900);
 assert.deepEqual(clampBox(5000,10,300),{w:1200,h:140},'width resizing is unchanged');
});
test('working surfaces keep their frames: without fitContent the height stays fixed and a dragged height is kept',()=>{
 assert.deepEqual(fitFrame(540,undefined,false),{height:540,maxHeight:undefined});assert.deepEqual(fitFrame(undefined,420,false),{height:undefined,maxHeight:420});
 assert.deepEqual(fitFrame(undefined,760,true),{height:undefined,maxHeight:760},'a never-resized text card keeps its type cap');
 assert.equal(setBlockSize([book('a')],'a',700,900)[0].h,900,'a notebook keeps the height it was dragged to');
});
test('a text card commit patches the block as it is now: an answer given during the drag survives, only w and h change',()=>{
 const atPress={id:'c',type:'challenge',mode:'explain_back',dx:5,dy:6,prompt:'Why?',answer:null},now=[{...atPress,answer:'Because',verdict:'VERDICT: good'}];
 const next=patchBlock(now,'c',clampBox(480,1000,330));
 assert.deepEqual(next[0],{...now[0],w:480,h:330});assert.equal(now[0].h,undefined,'not mutated');
});
test('the sizing policy is per card type: text cards fit their content; notebooks, Sketch, media and interactive cards keep their frames',()=>{
 const body=readFileSync(new URL('./LearningBlocks.jsx',import.meta.url),'utf8').split('export const BLOCK_TYPES = {')[1];
 const heads=[...body.matchAll(/^  ([A-Za-z0-9_]+): \{/gm)],entry=type=>{const at=heads.findIndex(m=>m[1]===type);return at<0?null:body.slice(heads[at].index,heads[at+1]?.index);};
 const fits=heads.map(m=>m[1]).filter(type=>/^    fitContent: true,/m.test(entry(type)));
 assert.deepEqual(fits.sort(),['challenge','explanation','flashcards','quiz']);
 for(const type of ['code','snippet','table','graph','plot','flow','whiteboard','animation','image','video','cad','paper','scene']) assert.ok(entry(type)&&!fits.includes(type),type);
});
