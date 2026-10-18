import { Miniflare, convertV4MiniflareOptions } from '../../../node_modules/miniflare/dist/src/index.js';
import { build } from '../../../node_modules/esbuild/lib/main.js';
import { deflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const cwd=process.cwd(),started=performance.now();
const entry=`
import { inspectPngPixels } from './packages/control-plane/src/inline-image-png.js';
import { createImageEditJobCoordinator } from './packages/control-plane/src/inline-image-edit-job.js';
export class Probe {
 constructor(state){this.state=state;}
 async fetch(req){
  const body=await req.json(),image=new Uint8Array([1,2,3]);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',image)),n=>n.toString(16).padStart(2,'0')).join('');
  const calls={admit:0,edit:0,publish:0};
  const make=()=>createImageEditJobCoordinator({storage:this.state.storage,
   admitSpend:async()=>{calls.admit++;return {refused:false};},settleSpend:async()=>{},
   edit:async()=>{calls.edit++;return{bytes:new Uint8Array([4]),mimeType:'image/png',validation:'png-pixels'};},
   publish:async()=>{calls.publish++;return{id:'fixture-asset'};}});
  const job=make();await job.create({id:body.id,operation:'remove_background',sourceSha256:digest,reservedUsd:.1});
  if(body.recover){const key='image-edit:'+body.id;await this.state.storage.put(key,{...await this.state.storage.get(key),phase:'started',reservation:'held'});}
  const result=await make().run(body.id,{image});await make().run(body.id,{image});
  return Response.json({phase:result.phase,reservation:result.reservation,calls,storage:!!await this.state.storage.get('image-edit:'+body.id)});
 }
}
export default {async fetch(req,env){
 const input=await req.json();
 if(input.job)return env.PROBE.get(env.PROBE.idFromName(input.id)).fetch(new Request('https://probe',{method:'POST',body:JSON.stringify(input)}));
 try {const bytes=Uint8Array.from(atob(input.deflate),c=>c.charCodeAt(0));const result=await inspectPngPixels({width:1024,height:1024,alphaChannel:true,idat:[bytes]});return Response.json({ok:true,result});}
 catch{return Response.json({ok:false});}
}};`;
const bundled=await build({stdin:{contents:entry,resolveDir:cwd,sourcefile:'worker-image-probe.js'},bundle:true,format:'esm',platform:'browser',write:false,logLevel:'silent'});
let outbound=0;
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-08-01',durableObjects:{PROBE:{className:'Probe',useSQLite:true}},outboundService:()=>{outbound++;throw Error('Network forbidden');},limits:{cpuMs:1000},persist:false}));
const post=async body=>{const response=await mf.dispatchFetch('https://probe',{method:'POST',body:JSON.stringify(body)});assert.equal(response.status,200);return response.json();};
const kill=setTimeout(()=>{process.stderr.write('Probe exceeded 30-second bound\n');process.exit(2);},30000);
try {
 const raw=Buffer.alloc(1024*(4096+1));raw[4]=255;raw[8]=128;
 const decodeStart=performance.now(),pixels=await post({deflate:deflateSync(raw).toString('base64')});
 assert.equal(pixels.ok,true);assert.equal(pixels.result.transparentPixels,1048574);
 const decodeWallMs=performance.now()-decodeStart;
 assert.equal((await post({deflate:Buffer.from([1,2,3]).toString('base64')})).ok,false);
 const normal=await post({job:true,id:'normal'});assert.equal(normal.phase,'ready');assert.deepEqual(normal.calls,{admit:1,edit:1,publish:1});assert.equal(normal.storage,true);
 const restored=await post({job:true,id:'recovered',recover:true});assert.equal(restored.phase,'unknown');assert.deepEqual(restored.calls,{admit:0,edit:0,publish:0});assert.equal(restored.reservation,'held');assert.equal(outbound,0);
 console.log(JSON.stringify({runtime:'Miniflare 5.20260903.0-alpha/workerd',compatibilityDate:'2026-08-01',passed:4,failed:0,skipped:0,outboundCalls:outbound,decodeWallMs,totalWallMs:performance.now()-started,limitations:['Wall time includes runtime startup; not measured CPU.','DO coordinator/storage verified; FileJobs alarm/router, D1/R2 and provider path not exercised.','1024 RGBA fixture only; maximum-dimension memory not qualified.']},null,2));
} finally {clearTimeout(kill);await mf.dispose();}

