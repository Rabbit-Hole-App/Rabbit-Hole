import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createInlineCodeRuntime} from '../src/inline-code-runtime.js';
const digest = s => createHash('sha256').update(s).digest('hex');
const response = () => Response.json({status:'ok',stdout:[{level:'log',text:'done'}],result:20,error:null});
const fake = (fetch = async () => response()) => {const calls=[];return {calls,loader:{load(options){calls.push(options);return {getEntrypoint(){return {fetch};}};}}};};
test('fresh isolated load, exact source/input hashes and synthetic headers',async()=>{
  const requests=[];const f=fake(async r=>{requests.push(r);return response();});const runtime=createInlineCodeRuntime(f);
  const code='return input.x * 2;';const a=await runtime.run({language:'javascript',code,input:{x:10}});await runtime.run({language:'javascript',code,input:{x:10}});
  assert.equal(a.status,'ok');assert.equal(a.result,20);assert.equal(a.executionStarted,true);assert.equal(a.sourceSha256,digest(code));assert.equal(a.inputSha256,digest('{"x":10}'));assert.equal(f.calls.length,2);
  assert.deepEqual(f.calls[0].env,{});assert.equal(f.calls[0].globalOutbound,null);assert.deepEqual(f.calls[0].limits,{cpuMs:1000,subRequests:0});assert.deepEqual([...requests[0].headers.keys()],['content-type']);
});
test('reject unsupported language and oversized UTF8/input without load',async()=>{
 const f=fake(),runtime=createInlineCodeRuntime(f);for(const input of [{language:'python',code:'1'},{language:'javascript',code:'é'.repeat(17000)},{language:'javascript',code:'',input:'x'.repeat(16385)}]) assert.equal((await runtime.run(input)).status,'error');assert.equal(f.calls.length,0);
});
test('abort before start never loads; absent loader is unavailable',async()=>{
 const f=fake(),signal=AbortSignal.abort();assert.equal((await createInlineCodeRuntime(f).run({language:'javascript',code:'return 1',signal})).executionStarted,false);assert.equal(f.calls.length,0);assert.equal((await createInlineCodeRuntime().run({language:'javascript',code:''})).status,'unavailable');
});
test('abort after start returns cancelled without claiming termination or retry',async()=>{
 const f=fake(()=>new Promise(()=>{})),controller=new AbortController();const pending=createInlineCodeRuntime(f).run({language:'javascript',code:'return 1',signal:controller.signal});setTimeout(()=>controller.abort(),20);const result=await pending;assert.equal(result.status,'cancelled');assert.equal(result.executionStarted,true);assert.equal(result.terminationConfirmed,false);assert.equal(f.calls.length,1);
});
test('bounded output rejects over-limit response and malformed stdout',async()=>{
 for(const value of [new Response('x'.repeat(32769)),Response.json({status:'ok',stdout:[{level:'evil',text:'x'}],result:1})]) {const result=await createInlineCodeRuntime(fake(async()=>value)).run({language:'javascript',code:''});assert.equal(result.status,'error');}
});
test('wall deadline reports timeout without claiming isolate stopped',async()=>{
 const f=fake(()=>new Promise(()=>{}));const result=await createInlineCodeRuntime(f).run({language:'javascript',code:'return 1'});assert.equal(result.status,'timeout');assert.equal(result.terminationConfirmed,false);assert.equal(f.calls.length,1);
});
