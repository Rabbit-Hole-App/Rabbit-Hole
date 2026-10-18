import test from 'node:test';
import assert from 'node:assert/strict';
import {previewAnnotations} from './inline-annotation-tools.js';
const target={id:'target',kind:'rect',x1:0,y1:0,x2:100,y2:80,text:'Original'};
const make=()=>{const board={shapes:[structuredClone(target)],items:[],blocks:[],links:[],groups:[]};
 const box={x:0,y:0,w:100,h:80};return{board,frozen:{ids:['target'],objects:{target:structuredClone(target)},lists:{target:'shapes'},bounds:{target:{...box}},selection:[{id:'target',kind:'shape',locked:false}]},currentBounds:{target:box}};};
const request=()=>({requestId:'r1',mode:'explain',annotations:[{targetId:'target',text:'A short explanation.'}]});
test('Explain adds native callout and annotation arrow with provenance, leaving source and topology intact',()=>{
 const context=make(),before=structuredClone(context);const result=previewAnnotations(request(),context);
 assert.equal(result.ok,true);assert.deepEqual(result.changes,[]);assert.deepEqual(result.removals,[]);assert.equal(result.additions.length,2);
 const note=result.additions.find(item=>item.list==='shapes').after,arrow=result.additions.find(item=>item.list==='links').after;
 assert.equal(note.kind,'rect');assert.equal(note.text,'A short explanation.');assert.equal(arrow.kind,'annotation');assert.equal(arrow.to,'target');assert.equal(arrow.from,note.id);
 assert.deepEqual(note.inline.sources,['target']);assert.equal(note.inline.requestId,'r1-0');assert.deepEqual(context,before);
});
test('highlight is a separate native rectangle entirely inside measured target bounds',()=>{
 const result=previewAnnotations({...request(),annotations:[{targetId:'target',text:'Area',highlight:{x:10,y:12,w:30,h:20}}]},make());
 assert.equal(result.ok,true);const overlay=result.additions.find(item=>item.after.inline.annotationType==='highlight').after;
 assert.deepEqual([overlay.x1,overlay.y1,overlay.x2,overlay.y2],[10,12,40,32]);assert.ok(overlay.opacity>0&&overlay.opacity<1);assert.deepEqual(result.changes,[]);
});
test('missing, stale content and stale measured bounds refuse without partial additions',()=>{
 for(const mutate of [ctx=>ctx.board.shapes[0].text='Changed',ctx=>ctx.currentBounds.target.x++,ctx=>ctx.board.shapes=[],ctx=>delete ctx.frozen.bounds.target]){
  const context=make();mutate(context);const result=previewAnnotations(request(),context);assert.equal(result.ok,false);assert.deepEqual(result.additions,[]);
 }
});
test('read-only, out-of-scope and unbounded or unknown annotation inputs refuse',()=>{
 assert.equal(previewAnnotations(request(),{...make(),readOnly:true}).ok,false);
 for(const annotation of [{targetId:'other',text:'x'},{targetId:'target',text:'x'.repeat(301)},{targetId:'target',text:' '},{targetId:'target',text:'x',html:'<img>'},
  {targetId:'target',text:'x',highlight:{x:-1,y:0,w:5,h:5}},{targetId:'target',text:'x',highlight:{x:0,y:0,w:101,h:1}},{targetId:'target',text:'x',highlight:{x:0,y:0,w:NaN,h:1}}])
  assert.equal(previewAnnotations({...request(),annotations:[annotation]},make()).ok,false);
 assert.equal(previewAnnotations({...request(),annotations:Array.from({length:11},()=>({targetId:'target',text:'x'}))},make()).ok,false);
});
test('Edit changes only a selected existing annotation label, preserving identity, placement and arrow',()=>{
 const context=make(),first=previewAnnotations(request(),context);
 for(const addition of first.additions)context.board[addition.list].push(addition.after);
 const note=first.additions.find(item=>item.list==='shapes').after,box={x:note.x1,y:note.y1,w:note.x2-note.x1,h:note.y2-note.y1};
 context.frozen={ids:[note.id],objects:{[note.id]:structuredClone(note)},lists:{[note.id]:'shapes'},bounds:{[note.id]:{...box}},selection:[{id:note.id,kind:'shape',locked:false}]};context.currentBounds[note.id]=box;
 const before=structuredClone(context.board),result=previewAnnotations({requestId:'r2',mode:'edit',annotations:[{annotationId:note.id,text:'Revised explanation'}]},context);
 assert.equal(result.ok,true);assert.equal(result.changes.length,1);assert.deepEqual(result.additions,[]);assert.deepEqual(result.removals,[]);
 assert.deepEqual(result.changes[0].after,{...note,text:'Revised explanation'});assert.deepEqual(context.board,before);
 result.changes[0].after.inline.sources.push('mutation');assert.deepEqual(context.board,before,'Proposal must not alias saved metadata');
});
test('Edit cannot rewrite source objects or unselected annotations, or move an annotation',()=>{
 assert.equal(previewAnnotations({requestId:'r',mode:'edit',annotations:[{annotationId:'target',text:'Rewrite source'}]},make()).ok,false);
 assert.equal(previewAnnotations({requestId:'r',mode:'edit',annotations:[{annotationId:'not-selected',text:'x'}]},make()).ok,false);
 assert.equal(previewAnnotations({requestId:'r',mode:'edit',annotations:[{annotationId:'target',text:'x',highlight:{x:1,y:1,w:1,h:1}}]},make()).ok,false);
});
test('colliding generated identifiers and invalid frozen scope refuse atomically',()=>{
 const context=make(),first=previewAnnotations(request(),context);context.board.shapes.push(first.additions[0].after);
 assert.equal(previewAnnotations(request(),context).ok,false);
 const other=make();other.frozen.ids.push('target');assert.equal(previewAnnotations(request(),other).ok,false);
});
test('unconnectable targets and malformed geometry refuse rather than inventing anchors',()=>{
 const context=make();context.board.shapes[0].kind='line';context.frozen.objects.target.kind='line';
 assert.equal(previewAnnotations(request(),context).ok,false);
 const second=make();second.currentBounds.target.w=Infinity;second.frozen.bounds.target.w=Infinity;
 assert.equal(previewAnnotations(request(),second).ok,false);
});
test('multiple callouts use distinct native identities and do not overlap each other',()=>{
 const context=make(),result=previewAnnotations({...request(),annotations:[{targetId:'target',text:'First'},{targetId:'target',text:'Second'}]},context);
 assert.equal(result.ok,true);assert.equal(new Set(result.additions.map(item=>item.id)).size,4);
 const [a,b]=result.additions.filter(item=>item.list==='shapes').map(item=>item.after);
 assert.ok(a.x2<=b.x1||b.x2<=a.x1||a.y2<=b.y1||b.y2<=a.y1);
 assert.equal(previewAnnotations({...request(),requestId:123},make()).ok,false);
});
test('proposal creation works with recursively frozen inputs and safe literal labels',()=>{
 const freeze=value=>{Object.freeze(value);for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);return value;};
 const context=freeze(make()),input=freeze({...request(),annotations:[{targetId:'target',text:'<script> is literal code, not HTML'}]});
 const result=previewAnnotations(input,context);assert.equal(result.ok,true);
 const note=result.additions.find(item=>item.list==='shapes').after;assert.equal(note.text,input.annotations[0].text);assert.equal(note.html,undefined);
 assert.deepEqual(context.board.shapes,[target]);
});
