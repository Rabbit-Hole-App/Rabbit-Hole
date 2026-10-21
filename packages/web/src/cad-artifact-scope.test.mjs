import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./CadCard.jsx',import.meta.url),'utf8');
const definition=source.match(/export function cadReadUrl\(path, \{ ownerRead = false, scope = fileScope\(\), origin = window.location.origin \} = \{\}\) \{([\s\S]*?)\n\}/);
assert.ok(definition);
const scopeSource=readFileSync(new URL('./file-source-client.js',import.meta.url),'utf8');
const scopeQuery=new Function('at',scopeSource.match(/export function scopeQuery\(at = scope\) \{([\s\S]*?)\n\}/)[1]);
const read=new Function('path','options','scopeQuery',`const {ownerRead=false,scope=null,origin='https://dev.example'}=options;${definition[1]}`);
const url=(path,options)=>new URL(read(path,options,scopeQuery),'https://dev.example');
const file='/api/learn/files/source/d/model.glb';
test('live owner reads proposed and accepted artifacts before autosave',()=>{
 for(const path of [file,`${file}?app=old&board=old&rev=1`]){
  const result=url(path,{ownerRead:true,scope:{app:'app',board:'board'}});
  assert.equal(result.searchParams.has('app'),false);assert.equal(result.searchParams.has('board'),false);
 }
 assert.equal(url(`${file}?rev=1`,{ownerRead:true}).searchParams.get('rev'),'1');
 // Downloads (the card's and the context menu's) read through one helper, as the owner only when the card is mutable.
 assert.match(source,/readUrl\(artifact\.url,\{ownerRead\}\)/);
 assert.match(source,/downloadCadArtifact\(artifact,mutable\)/);
 assert.equal((source.match(/ownerRead=\{mutable\}/g)||[]).length,2);
});
test('shared/member and detached snapshots retain scoped authorization',()=>{
 assert.equal(url(file,{ownerRead:true,scope:{share:'token'}}).searchParams.get('share'),'token');
 assert.equal(url(file,{ownerRead:true,scope:{member:'member-board'}}).searchParams.get('member'),'member-board');
 const detached=url(file,{ownerRead:false,scope:{app:'copy',board:'copy-board'}});
 assert.equal(detached.searchParams.get('app'),'copy');assert.equal(detached.searchParams.get('board'),'copy-board');
 const guard=source.match(/export function cadCanMutate\(block, readOnly = false\) \{([\s\S]*?)\n\}/);
 assert.equal(new Function('block','readOnly',guard[1])({jobId:'old',cadDetached:true},false),false);
});
test('jobs retain board scope and unrelated URLs remain rejected',()=>{
 assert.equal(url('/api/learn/cad/jobs/job',{ownerRead:true,scope:{app:'app',board:'board'}}).searchParams.get('board'),'board');
 for(const path of ['https://evil.example/api/learn/files/source','/api/private'])assert.throws(()=>url(path,{ownerRead:true}),/invalid delivery URL/);
});
