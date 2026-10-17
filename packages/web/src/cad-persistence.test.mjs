import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeCadBlock} from './cad-client.js';
// Exercise the actual pure callback decision in the JSX module without mounting
// its WebGL renderer or replacing the application with a fixture implementation.
const source=readFileSync(new URL('./CadCard.jsx',import.meta.url),'utf8');
const definition=source.match(/export function cadPersistenceChanged\(previous, next\) \{([\s\S]*?)\n\}/);
assert.ok(definition,'persistence decision is present');
const shouldPersist=new Function('previous','next',definition[1]);
test('first accepted model saves revision and file reference once; progress polls stay quiet',()=>{
 let current={id:'card',revisionId:null,status:'queued'},saved=0,quiet=0;
 const apply=incoming=>{const next=mergeCadBlock(current,incoming);if(JSON.stringify(next)===JSON.stringify(current))return;if(shouldPersist(current,next))saved++;else quiet++;current=next;};
 apply({status:'building'});assert.equal(saved,0);assert.equal(quiet,1);
 const ready={status:'ready',revisionId:'r1',sourceId:'source1',fileRef:{source:{id:'source1'}},manifest:{revisionId:'r1',artifacts:[]}};
 apply(ready);assert.equal(saved,1);assert.equal(current.fileRef.source.id,'source1');
 apply(ready);assert.equal(saved,1);
 apply({status:'checking'});assert.equal(saved,1);assert.equal(quiet,2);
 apply({status:'ready',revisionId:'r2',sourceId:'source2',fileRef:{source:{id:'source2'}},manifest:{revisionId:'r2',artifacts:[]}});assert.equal(saved,2);
});
test('late accepted artifact indexing and optional exports persist without another generation',()=>{
 const before={revisionId:'r1',manifest:{revisionId:'r1',artifacts:[]}};
 assert.equal(shouldPersist(before,{...before,fileRef:{source:{id:'source1'}}}),true);
 assert.equal(shouldPersist(before,{...before,manifest:{revisionId:'r1',artifacts:[{kind:'stl',url:'/saved.stl'}]}}),true);
 assert.equal(shouldPersist(before,{...before,status:'ready',proposedRevisionId:'r2'}),false);
});

test('shared and detached cards never poll or mutate the originating job',()=>{
 const definition=source.match(/export function cadCanMutate\(block, readOnly = false\) \{([\s\S]*?)\n\}/);
 const canMutate=new Function('block','readOnly',definition[1]);
 assert.equal(canMutate({jobId:'original'},false),true);
 assert.equal(canMutate({jobId:'original'},true),false);
 assert.equal(canMutate({jobId:'original',cadDetached:true},false),false);
 assert.equal(canMutate({cadDetached:true,manifest:{revisionId:'r1'}},false),false);
 assert.match(source,/if\(!mutable\)return;\r?\n    let live=true,timer;/,'snapshot mode never starts live polling');
 assert.match(source,/const action=async\(name,body\)=>\{if\(!mutable\)return;/,'imperative actions also guard copied jobs');
});
