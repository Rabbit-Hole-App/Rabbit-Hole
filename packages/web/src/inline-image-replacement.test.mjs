import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImageReplacement, imageReplacementTransaction } from './inline-image-replacement.js';
import { verifyExtractionRead } from './inline-extraction.js';
import { applyTx } from './inline-ai-apply.js';
const make = (output = 'table') => {
 const original={id:'image',type:'file',kind:'image',dx:12,dy:20,w:300,h:200,fileRef:{v:1,family:'image',source:{id:'fs_'+'a'.repeat(24),rev:'b'.repeat(64)},meta:{name:'source.png'}}};
 const board={blocks:[structuredClone(original),{id:'other',type:'explanation',text:'Unchanged'}],items:[],shapes:[],links:[],groups:[]};
 const extraction={source:{blockId:'image',source:original.fileRef.source,coverage:'whole-image'},uncertainties:[{location:'header',message:'Check recognized label.'}]};
 const contents={table:{kind:'card',block:{type:'table',columns:['X'],rows:[['2']]}},code:{kind:'card',block:{type:'snippet',code:'return 2;'}},equation:{kind:'equation',latex:'x^2'},diagram:{kind:'diagram',spec:{shapes:[{id:'a',label:'Start'},{id:'b',label:'End'}],connectors:[{from:'a',to:'b'}]}}};
 const result={kind:'image_replacement',requestId:'request-123',targetId:'image',output,content:contents[output],extraction,summary:'Replace original image'};
 const frozen={requestId:'request-123',ids:['image'],imageReplacement:{targetId:'image',output},actionMode:'edit',extractionImage:structuredClone(original),extractionScope:{app:'canvas-demo',board:'main'}};
 return{original,board,result,frozen};
};
const bounds={x:100,y:200,w:300,h:200};
async function verified(f){
 return verifyExtractionRead({extraction:f.result.extraction,before:f.original,ids:['image'],scope:f.frozen.extractionScope,current:()=>({block:f.board.blocks[0],scope:f.frozen.extractionScope}),fetchImpl:async(_path,options)=>{assert.equal(options.method,'HEAD');return new Response(null,{headers:{'x-source-rev':f.original.fileRef.source.rev}});}});
}
test('explicit four native replacements compose with actual source receipt and atomic canvas apply',async()=>{
 for(const output of ['table','code','equation','diagram']){
  const f=make(output),before=structuredClone(f.board),checked=validateImageReplacement(f.result,f.frozen,f.board,{mode:'edit'});assert.equal(checked.ok,true);
  const retained=await verified(f);const made=imageReplacementTransaction(checked.preview,{requestId:'request-123',board:f.board,bounds,retainedSource:retained.retainedSource,provenance:{mode:'explain'}});
  assert.equal(made.ok,true);assert.equal(made.tx.kind,'edit');assert.deepEqual(f.board,before);assert.equal(made.tx.retainedSources[0].fileRef.source.id,f.original.fileRef.source.id);
  const after=applyTx(f.board,made.tx);assert.deepEqual(after.blocks.find(b=>b.id==='other'),before.blocks[1]);
  if(output==='table'||output==='code'){const block=after.blocks.find(b=>b.id==='image');assert.equal(block.type,output==='table'?'table':'snippet');assert.equal(block.fileRef,undefined);assert.equal(block.dx,12);assert.equal(block.dy,20);assert.equal(block.inline.mode,'edit');}
  else{assert.equal(after.blocks.some(b=>b.id==='image'),false);if(output==='equation'){assert.equal(after.items[0].kind,'equation');assert.equal(after.items[0].x,100);}else{assert.equal(after.shapes.length,2);assert.equal(after.links.length,1);assert.ok(after.shapes.some(s=>s.id===after.links[0].from));}}
  assert.equal(imageReplacementTransaction(checked.preview,{requestId:'request-123',board:after,bounds,retainedSource:retained.retainedSource}).ok,false);
 }
});
test('stale content, placement, lock, dependencies, scope and mismatched identities refuse',()=>{
 for(const mutate of [f=>{f.board.blocks[0].dx++;},f=>{f.board.blocks[0].locked=true;},f=>{f.board.blocks[0].groupId='group';},f=>{f.board.links=[{id:'link',from:'image',to:'other'}];},f=>{f.board.groups=[{id:'group',members:['image']}];},f=>{f.frozen.actionMode='explain';},f=>{f.result.requestId='request-other';},f=>{f.result.output='code';},f=>{f.frozen.extractionScope.share='token';},f=>{f.board.blocks[0].fileRef.source.rev='c'.repeat(64);},f=>{f.result.content.block.fileRef=f.original.fileRef;}]){const f=make();mutate(f);assert.equal(validateImageReplacement(f.result,f.frozen,f.board,{mode:'edit'}).ok,false);}
 const f=make();assert.equal(validateImageReplacement(f.result,f.frozen,f.board,{mode:'edit',readOnly:true}).ok,false);
});
test('accept requires exact retained original and rechecks dependencies after asynchronous source access',async()=>{
 const f=make('equation'),checked=validateImageReplacement(f.result,f.frozen,f.board,{mode:'edit'}),retained=await verified(f);
 assert.equal(imageReplacementTransaction(checked.preview,{requestId:'request-123',board:f.board,bounds}).ok,false);
 const forged=structuredClone(retained.retainedSource);forged.fileRef.source.rev='c'.repeat(64);assert.equal(imageReplacementTransaction(checked.preview,{requestId:'request-123',board:f.board,bounds,retainedSource:forged}).ok,false);
 f.board.links.push({id:'later',from:'image',to:'other'});assert.equal(imageReplacementTransaction(checked.preview,{requestId:'request-123',board:f.board,bounds,retainedSource:retained.retainedSource}).ok,false);
});
test('new native IDs cannot collide and invalid native content cannot remove original',async()=>{
 for(const output of ['equation','diagram']){const f=make(output),checked=validateImageReplacement(f.result,f.frozen,f.board,{mode:'edit'}),retained=await verified(f);f.board.items.push({id:output==='equation'?'equation-request-123':'inline-request-123-s0',kind:'text',text:'Keep'});assert.equal(imageReplacementTransaction(checked.preview,{requestId:'request-123',board:f.board,bounds,retainedSource:retained.retainedSource}).ok,false);}
 const f=make('diagram');f.result.content.spec.connectors[0].to='missing';assert.equal(validateImageReplacement(f.result,f.frozen,f.board,{mode:'edit'}).ok,false);
});
