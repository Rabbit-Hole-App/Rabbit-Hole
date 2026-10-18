import test from 'node:test';
import assert from 'node:assert/strict';
import {inlineCodeRoute,inlineCodePolicy} from '../src/inline-code-route.js';
const root='/api/learn/code-runs',id='cj_'+'a'.repeat(32);
function fixture(){
 const calls=[],names=[];
 const owner={org:'workspace',email:'owner@example.test'};
 const deps={identity:async()=>owner,access:async()=>({...owner,canEdit:true}),board:async()=>({owner,row:{id:'board'}})};
 const env={INLINE_CODE_ENABLED:'true',INLINE_CODE_MAX_RUNS:'20',INLINE_CODE_MAX_MICROS:'100000',INLINE_CODE_RESERVE_MICROS:'5000',INLINE_CODE_LOADER:{load(){}},FILE_JOBS:{idFromName(name){names.push(name);return name;},get(){return {async fetch(req){calls.push({path:new URL(req.url).pathname,body:await req.json()});return Response.json({job:{id}});}};}}};
 const body={id,app:'canvas-12345678',board:'main',language:'javascript',code:'return input.x+1;',input:{x:1},executionConfirmed:true,maxReservedMicros:5000};
 const send=(patch={},options={})=>inlineCodeRoute(root,new Request('https://app'+root,{method:'POST',headers:{'content-type':'application/json',...(options.headers||{})},body:JSON.stringify({...body,...patch})}),env,options.deps||deps);
 return {calls,names,owner,deps,env,body,send};
}
test('validated owner submission goes only to fixed global actor with immutable scope',async()=>{
 const h=fixture();assert.equal((await h.send()).status,200);assert.deepEqual(h.names,['inline-code:global-v1']);assert.deepEqual(h.calls,[{path:'/inline-code/create',body:{id,owner:h.owner,scope:{app:h.body.app,board:'main'},language:'javascript',code:h.body.code,input:{x:1},executionConfirmed:true,maxReservedMicros:5000}}]);
});
test('disabled/malformed policy or absent loader cannot create and quote hides reservation',async()=>{
 for(const patch of [{INLINE_CODE_ENABLED:'false'},{INLINE_CODE_MAX_RUNS:'0'},{INLINE_CODE_MAX_MICROS:'NaN'},{INLINE_CODE_RESERVE_MICROS:'100001'},{INLINE_CODE_LOADER:null}]){const h=fixture();Object.assign(h.env,patch);assert.equal((await h.send()).status,503);const quote=await (await inlineCodeRoute(root,new Request('https://app'+root),h.env,h.deps)).json();assert.equal(quote.available,false);assert.equal(quote.maximumReservedMicros,null);assert.equal(h.calls.length,0);}
 assert.equal(inlineCodePolicy({INLINE_CODE_MAX_RUNS:'1e2',INLINE_CODE_MAX_MICROS:'100',INLINE_CODE_RESERVE_MICROS:'1'}),null);
});
test('cross-origin mutations refuse before identity or actor; trusted CLI and same-origin work',async()=>{
 const h=fixture();assert.equal((await h.send({}, {headers:{origin:'https://foreign'},deps:{identity:()=>{throw Error('must not authenticate');}}})).status,403);assert.equal(h.calls.length,0);assert.equal((await h.send({}, {headers:{origin:'https://app'}})).status,200);assert.equal((await h.send()).status,200);
 const response=await inlineCodeRoute(root+'/'+id+'/cancel',new Request('https://app'+root+'/'+id+'/cancel',{method:'POST',headers:{origin:'https://foreign'}}),h.env,h.deps);assert.equal(response.status,403);assert.equal(h.calls.length,2);
});
test('strict request fields, explicit consent, IDs, language, bytes and reservation are required',async()=>{
 const h=fixture();for(const patch of [{id:[id]},{executionConfirmed:false},{code:'   '},{owner:h.owner},{language:'python'},{code:'é'.repeat(17000)},{input:'x'.repeat(16385)},{maxReservedMicros:'5000'},{board:'../private'},{app:['canvas-12345678']}])assert.equal((await h.send(patch)).status,400);
 assert.equal((await h.send({maxReservedMicros:4999})).status,409);assert.equal(h.calls.length,0);
});
test('owner identity and board access required; viewer/foreign org/missing board refused',async()=>{
 const h=fixture();for(const access of [{...h.owner,canEdit:false},{...h.owner,email:'other'},{...h.owner,org:'other'}])assert.equal((await h.send({}, {deps:{...h.deps,access:async()=>access}})).status,403);
 assert.equal((await h.send({}, {deps:{...h.deps,board:async()=>({owner:h.owner,row:null})}})).status,404);assert.equal((await h.send({}, {deps:{...h.deps,identity:async()=>new Response(null,{status:401})}})).status,401);assert.equal(h.calls.length,0);
});
test('status and explicit cancel remain authenticated after admission disabled without loader',async()=>{
 const h=fixture();h.env.INLINE_CODE_ENABLED='false';delete h.env.INLINE_CODE_LOADER;
 for(const [suffix,method,action] of [['','GET','status'],['/cancel','POST','cancel']]){const path=root+'/'+id+suffix;assert.equal((await inlineCodeRoute(path,new Request('https://app'+path,{method}),h.env,h.deps)).status,200);assert.deepEqual(h.calls.at(-1),{path:'/inline-code/'+action,body:{id,owner:h.owner}});}
});
test('streamed oversized and non-JSON bodies reject without actor; unsupported methods/routes untouched',async()=>{
 const h=fixture();const req=new Request('https://app'+root,{method:'POST',headers:{'content-type':'application/json'},body:new ReadableStream({start(c){c.enqueue(new Uint8Array(262145));c.close();}}),duplex:'half'});assert.equal((await inlineCodeRoute(root,req,h.env,h.deps)).status,400);
 assert.equal((await h.send({}, {headers:{'content-type':'text/plain'}})).status,400);assert.equal(h.calls.length,0);assert.equal((await inlineCodeRoute(root,new Request('https://app'+root,{method:'DELETE'}),h.env,h.deps)).status,405);assert.equal(await inlineCodeRoute(root+'/'+id+'/retry',new Request('https://app'),h.env,h.deps),null);
});
