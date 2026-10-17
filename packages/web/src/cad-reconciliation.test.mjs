import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeCadBlock} from './cad-client.js';
const card=readFileSync(new URL('./CadCard.jsx',import.meta.url),'utf8');
const decision=card.match(/export function cadPersistenceChanged\(previous, next\) \{([\s\S]*?)\n\}/);
const cadPersistenceChanged=new Function('previous','next',decision[1]);
const canvas=readFileSync(new URL('./AdaptiveCanvas.jsx',import.meta.url),'utf8');
const body=canvas.match(/reconcileCad: ([\s\S]*?),\r?\n      cadContext:/)[1];
const factory=new Function('alive','readOnlyRef','blocksRef','mergeCadBlock','cadPersistenceChanged','snapshot','setBlocks','insertAtView',`return (${body})`);
test('job-list reload recovery persists accepted revision before identical card polls',()=>{
 const blocks={current:[{id:'c',type:'cad',revisionId:null,status:'queued',dx:30}]};let snapshots=0;
 const reconcile=factory({current:true},{current:false},blocks,mergeCadBlock,cadPersistenceChanged,()=>snapshots++,fn=>{blocks.current=fn(blocks.current);},()=>{throw Error('existing card must not be inserted again');});
 reconcile({id:'c',type:'cad',status:'building'});assert.equal(snapshots,0);
 const ready={id:'c',type:'cad',status:'ready',revisionId:'r1',fileRef:{source:{id:'s1'}},manifest:{revisionId:'r1'}};
 reconcile(ready);assert.equal(snapshots,1);assert.equal(blocks.current[0].fileRef.source.id,'s1');assert.equal(blocks.current[0].dx,30);
 reconcile(ready);assert.equal(snapshots,1);assert.equal(blocks.current.length,1);
 reconcile({...ready,status:'checking'});assert.equal(snapshots,1);
});

test('deletion and Undo placement hooks exclude detached copies and missing jobs',()=>{
 const predicates=[...canvas.matchAll(/(?:find|filter)\((block=>[^;\n]*?block\.type==='cad'[^;\n]*?)\)/g)].map(match=>match[1]);
 assert.equal(predicates.length,4,'removeBlock, selection delete and both Undo lists');
 for(const predicate of predicates){
  const allows=new Function('id','ids',`return (${predicate})`)('c',['c']);
  assert.equal(allows({id:'c',type:'cad',jobId:'origin'}),true);
  assert.equal(allows({id:'c',type:'cad',jobId:'origin',cadDetached:true}),false);
  assert.ok(!allows({id:'c',type:'cad',cadDetached:true}));
 }
});
