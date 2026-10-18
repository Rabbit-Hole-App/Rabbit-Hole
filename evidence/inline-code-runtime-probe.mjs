import {Miniflare,convertV4MiniflareOptions} from '../../../node_modules/miniflare/dist/src/index.js';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=await readFile(new URL('../packages/control-plane/src/inline-code-runtime.js',import.meta.url),'utf8');
const script=source+`\nexport default {async fetch(request,env){const args=await request.json();return Response.json(await createInlineCodeRuntime({loader:env.LOADER}).run(args));}};`;
let outbound=0;const start=performance.now();
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-08-01',workerLoaders:{LOADER:{}},bindings:{PARENT_SENTINEL:'fixture-only'},outboundService:()=>{outbound++;throw Error('forbidden');}}));
try {
 const run=async(code,input=null)=>{const response=await mf.dispatchFetch('https://parent.invalid',{method:'POST',body:JSON.stringify({language:'javascript',code,input})});assert.equal(response.status,200);return response.json();};
 const arithmetic=await run('console.log("answer",input.x); return input.x * 2;',{x:10});assert.equal(arithmetic.status,'ok');assert.equal(arithmetic.result,20);assert.deepEqual(arithmetic.stdout,[{level:'log',text:'answer 10'}]);
 const thrown=await run('throw Error("fixture failure");');assert.equal(thrown.status,'error');assert.equal(thrown.error.message,'fixture failure');
 const blocked=await run('try { await fetch("https://example.invalid"); return false; } catch { return true; }');assert.equal(blocked.result,true);assert.equal(outbound,0);
 const large=await run('return "x".repeat(33000);');assert.equal(large.status,'error');assert.equal(large.error.message,'output_limit');
 const first=await run('globalThis.fixtureCount=(globalThis.fixtureCount||0)+1; return globalThis.fixtureCount;'),second=await run('globalThis.fixtureCount=(globalThis.fixtureCount||0)+1; return globalThis.fixtureCount;');assert.equal(first.result,1);assert.equal(second.result,1);
 console.log(JSON.stringify({passed:5,failed:0,skipped:0,runtime:'Miniflare/workerd',elapsedMs:performance.now()-start,parentOutboundCalls:outbound,limitations:['Finite computations only; CPU termination and deployed runtime remain unverified.','No paid invocation, binding deployment, model call or UI integration.']},null,2));
} finally {await mf.dispose();}
