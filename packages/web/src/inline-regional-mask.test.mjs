import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMaskRegion,readRegionalOriginal,regionalMaskBlob} from './inline-regional-mask.js';
test('rectangle must be explicit and contained in actual source dimensions',()=>{
 for(const region of [null,{x:0,y:0,width:0,height:2},{x:9,y:0,width:2,height:2},{x:0.5,y:0,width:2,height:2}])assert.throws(()=>validateMaskRegion(region,10,10));
 assert.deepEqual(validateMaskRegion({x:1,y:2,width:3,height:4},10,10),{x:1,y:2,width:3,height:4});
});
test('mask paints opaque outside and clears precisely the explicit rectangle',async()=>{
 const calls=[];const previous=globalThis.OffscreenCanvas;
 globalThis.OffscreenCanvas=class{constructor(w,h){calls.push(['size',w,h]);}getContext(){return{set fillStyle(v){calls.push(['color',v]);},fillRect:(...v)=>calls.push(['fill',...v]),clearRect:(...v)=>calls.push(['clear',...v])};}async convertToBlob(){return new Blob(['mask'],{type:'image/png'});}};
 try{await regionalMaskBlob({x:1,y:2,width:3,height:4},10,12);assert.deepEqual(calls,[['size',10,12],['color','#000000'],['fill',0,0,10,12],['clear',1,2,3,4]]);}finally{globalThis.OffscreenCanvas=previous;}
});
test('original reader scopes authorized source and refuses revision mismatch before reading bytes',async()=>{
 let read=false;
 await assert.rejects(readRegionalOriginal({block:{fileRef:{source:{id:'fs_original',rev:'a'.repeat(64)}}},scope:{app:'canvas',board:'main'},fetchImpl:async path=>{assert.match(path,/app=canvas&board=main/);return{ok:true,headers:new Headers({'x-source-rev':'wrong','content-type':'image/png'}),get body(){read=true;throw Error('unexpected');}};}}));
 assert.equal(read,false);
});
