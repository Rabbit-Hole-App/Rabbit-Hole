import test from 'node:test';
import assert from 'node:assert/strict';
import {fileContextManifest,retainedFileSources} from './file-context-manifest.js';
const source={id:'fs_'+ 'a'.repeat(24),rev:'b'.repeat(64)};
const ref={source,family:'gltf',view:{entry:'models/cube.gltf'},bundle:[{path:'models/cube.bin',source:{id:'fs_'+ 'c'.repeat(24),rev:'d'.repeat(64)}}]};
test('pending or escaping dependencies cannot become retained context provenance',()=>{
 assert.equal(fileContextManifest({...ref,bundle:[{path:'cube.bin',local:'browser-only'}]}),null);
 for(const path of ['../outside.bin','https://remote.test/x','C:/private.bin'])assert.equal(fileContextManifest({...ref,bundle:[{...ref.bundle[0],path}]}),null);
});
test('retained provenance strips local state and unrelated private context',()=>{
 const id='file:'+source.id+'@'+source.rev;
 const [saved]=retainedFileSources({sources:[{id,kind:'file',label:'Cube',attached:true,fileRef:{...ref,local:'blob:private',job:'private-job'}},{id:'doc:private',kind:'doc',text:'private words'}]});
 assert.equal(saved.attached,false);assert.equal(saved.fileRef.local,undefined);assert.equal(saved.fileRef.job,undefined);
 assert.equal(saved.fileRef.bundle.length,1);assert.deepEqual(saved.fileRef.source,source);
 assert.deepEqual(retainedFileSources({sources:[{...saved,id:'file:wrong'}]}),[]);
});
