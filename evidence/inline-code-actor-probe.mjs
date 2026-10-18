import {Miniflare,convertV4MiniflareOptions} from '../../../node_modules/miniflare/dist/src/index.js';
import {build} from '../../../node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
const started=performance.now();let outbound=0;
const entry=`import {inlineCodeActorFetch,inlineCodeActorAlarm} from './packages/control-plane/src/inline-code-actor.js';
export class CodeJobs {constructor(state,env){this.state=state;this.env=env;}fetch(req){return inlineCodeActorFetch(this.state,this.env,req);}alarm(){return inlineCodeActorAlarm(this.state,this.env);}}
export default {fetch(req,env){return env.FILE_JOBS.get(env.FILE_JOBS.idFromName('inline-code:global-v1')).fetch(req);}};`;
const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'code-actor-probe.js'},bundle:true,format:'esm',platform:'browser',write:false,logLevel:'silent',plugins:[{name:'unused-auth',setup(build){build.onResolve({filter:/\/(repositories|learn-board|learn-boards)\.js$/},args=>({path:args.path,namespace:'unused'}));build.onLoad({filter:/.*/,namespace:'unused'},()=>({contents:'export function repositoryIdentity(){throw Error("unused")} export function authorizedBoardApp(){throw Error("unused")} export function boardOwner(){throw Error("unused")} export function ownerRow(){throw Error("unused")}',loader:'js'}));}}]});
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-08-01',durableObjects:{FILE_JOBS:{className:'CodeJobs',useSQLite:true}},workerLoaders:{INLINE_CODE_LOADER:{}},bindings:{INLINE_CODE_ENABLED:'true',INLINE_CODE_MAX_RUNS:'20',INLINE_CODE_MAX_MICROS:'100000',INLINE_CODE_RESERVE_MICROS:'5000'},outboundService:()=>{outbound++;throw Error('Network forbidden');}}));
try {
 const owner={org:'fixture',email:'owner'},id='cj_'+'c'.repeat(32);
 const call=async(action,body)=>mf.dispatchFetch('https://probe.invalid/inline-code/'+action,{method:'POST',body:JSON.stringify(body)});
 const body={id,owner,scope:{app:'canvas-12345678',board:'main'},language:'javascript',code:'console.log("finite"); return input.x*2;',input:{x:21},executionConfirmed:true,maxReservedMicros:5000};
 assert.equal((await call('create',body)).status,201);
 let job;const deadline=Date.now()+8000;
 while(Date.now()<deadline){job=(await(await call('status',{id,owner})).json()).job;if(job.phase==='succeeded')break;await new Promise(r=>setTimeout(r,25));}
 assert.equal(job.phase,'succeeded');assert.equal(job.result.result,42);assert.deepEqual(job.result.stdout,[{level:'log',text:'finite'}]);
 const first=job;const duplicate=await(await call('create',body)).json();assert.deepEqual(duplicate.job,first);
 assert.equal((await call('status',{id,owner:{org:'fixture',email:'other'}})).status,404);
 const second='cj_'+'d'.repeat(32);await call('create',{...body,id:second});const cancelled=await(await call('cancel',{id:second,owner})).json();assert.equal(cancelled.job.phase,'cancelled');await new Promise(r=>setTimeout(r,100));assert.equal((await(await call('status',{id:second,owner})).json()).job.phase,'cancelled');
 assert.equal(outbound,0);
 console.log(JSON.stringify({passed:4,failed:0,skipped:0,runtime:'Miniflare SQLite Durable Object + Dynamic Worker loader',elapsedMs:performance.now()-started,outbound,limitations:['Private actor dispatch only; external session auth uses separate route tests.','Finite code only; cloud CPU termination and paid deployment remain unverified.']},null,2));
}finally{await mf.dispose();}
