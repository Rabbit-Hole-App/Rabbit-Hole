import { Miniflare, convertV4MiniflareOptions } from '../../../node_modules/miniflare/dist/src/index.js';
import { build } from '../../../node_modules/esbuild/lib/main.js';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const started=performance.now();
// Auth fixtures replace only external session/board-owner resolution, not source ACL or job handlers.
const auth=`export async function repositoryIdentity(req){return req.headers.get('x-fixture-owner') ? {org:'fixture',email:req.headers.get('x-fixture-owner')} : new Response(null,{status:401});}
export async function boardOwner(req,env){const who=await repositoryIdentity(req);if(who instanceof Response)return who;return who.email==='owner'?who:new Response(null,{status:403});}
export async function ownerRow(env,owner,app,board){return env.LEARN_DB.prepare('SELECT * FROM learn_boards WHERE org=? AND owner_email=? AND app=? AND board=?').bind(owner.org,owner.email,app,board).first();}
export async function sharedAccess(){throw Error('Share auth is outside this fixture');}
export async function memberContext(){throw Error('Legacy converter is outside this fixture');}`;
const entry=`import { FileJobs } from './packages/control-plane/src/file-jobs.js';export {FileJobs};
import {inlineImageJobsRoute} from './packages/control-plane/src/inline-image-jobs.js';
import {authorizeFileSource} from './packages/control-plane/src/file-access.js';
export default {async fetch(req,env){const path=new URL(req.url).pathname;
 if(path.startsWith('/read/')){const access=await authorizeFileSource(req,env,path.slice(6));if(access instanceof Response)return access;return new Response((await env.LEARN_MEDIA.get(access.source.r2_key)).body,{headers:{'Content-Type':'image/png'}});}
 return await inlineImageJobsRoute(path,req,env)||new Response(null,{status:404});}};`;
const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'file-job-probe.js'},bundle:true,format:'esm',platform:'browser',write:false,logLevel:'silent',plugins:[{name:'identity-fixture',setup(build){build.onResolve({filter:/\/(repositories|learn-boards|canvas-comments)\.js$/},args=>({path:args.path,namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:auth,loader:'js'}));}}]});
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,data){const value=Buffer.concat([Buffer.from(type),data]),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE(crc(value));return Buffer.concat([head,value,tail]);}
function png(w,h){const hdr=Buffer.alloc(13);hdr.writeUInt32BE(w);hdr.writeUInt32BE(h,4);hdr[8]=8;hdr[9]=6;const raw=Buffer.alloc(h*(w*4+1));raw[4]=255;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
const original=png(2,2),output=png(1024,1024),hash=createHash('sha256').update(original).digest('hex'),sourceId='fs_'+'a'.repeat(24);
let fakeProviderCalls=0,forbiddenOutbound=0;
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-08-01',durableObjects:{FILE_JOBS:{className:'FileJobs',useSQLite:true}},d1Databases:['LEARN_DB'],r2Buckets:['LEARN_MEDIA'],bindings:{INLINE_IMAGE_EDIT_ENABLED:'true',INLINE_IMAGE_EDIT_RESERVED_USD:'0.2',OPENAI_API_KEY:'fixture-not-real',USAGE_PLATFORM_DAY_USD:'1'},outboundService:async req=>{if(req.url==='https://api.openai.com/v1/images/edits'){fakeProviderCalls++;return Response.json({data:[{b64_json:output.toString('base64')}],usage:{total_tokens:12}});}forbiddenOutbound++;throw Error('External network forbidden');}}));
const watchdog=setTimeout(()=>{process.stderr.write('Probe exceeded30s');process.exit(2);},30000);
const request=(path,method='GET',body,owner='owner')=>mf.dispatchFetch('https://fixture'+path,{method,headers:{'x-fixture-owner':owner},...(body?{body:JSON.stringify(body)}:{})});
try{
 const db=await mf.getD1Database('LEARN_DB'),bucket=await mf.getR2Bucket('LEARN_MEDIA');
 for(const filename of ['0023-file-imports.sql','0016-usage-operations.sql']){const sql=readFileSync('packages/control-plane/learn-migrations/'+filename,'utf8').replace(/--.*$/gm,'');for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();}
 await db.prepare('CREATE TABLE learn_boards(id TEXT, org TEXT, owner_email TEXT, app TEXT, board TEXT, state_json TEXT)').run();
 const board={blocks:[{id:'card',type:'file',kind:'image',fileRef:{source:{id:sourceId,rev:hash}}}]};
 await db.prepare('INSERT INTO learn_boards VALUES(?,?,?,?,?,?)').bind('board','fixture','owner','canvas','main',JSON.stringify(board)).run();
 await db.prepare("INSERT INTO file_sources(id,org,owner_email,app,family,name,media_type,bytes,sha256,r2_key,status,created_at) VALUES(?,?,?,'canvas','image','fixture.png','image/png',?,?,?,'stored',0)").bind(sourceId,'fixture','owner',original.length,hash,'original').run();
 await db.prepare('INSERT INTO file_source_refs(source_id,board_id) VALUES(?,?)').bind(sourceId,'board').run();await bucket.put('original',original);
 const path='/api/learn/files/image-edits',body={operation:'remove_background',sourceId,app:'canvas',board:'main',cardId:'card',idempotencyKey:'runtime-fixture',paidConfirmation:true,maxReservedUsd:0.2};
 assert.equal((await request(path,'POST',body,'other')).status,403);
 const created=await request(path,'POST',body);assert.equal(created.status,201);const id=(await created.json()).job.id;
 assert.equal((await request(path+'/'+id,'GET',null,'other')).status,404);
 let job;for(let i=0;i<60;i++){job=(await(await request(path+'/'+id)).json()).job;if(['ready','unknown','refused','cancelled'].includes(job.phase))break;await new Promise(r=>setTimeout(r,50));}
 if(job.phase!=='ready')console.log(JSON.stringify({job,fakeProviderCalls,forbiddenOutbound,ledger:await db.prepare('SELECT status,calls,error FROM usage_operations').all(),sources:await db.prepare('SELECT id,status FROM file_sources').all()}));assert.equal(job.phase,'ready',JSON.stringify(job));assert.equal(fakeProviderCalls,1);
 assert.equal((await request(path,'POST',body)).status,201);assert.equal(fakeProviderCalls,1);
 const derived=await db.prepare('SELECT * FROM file_sources WHERE id=?').bind(job.artifactId).first();assert.equal(derived.owner_email,'owner');assert.equal(derived.status,'stored');
 assert.deepEqual(Buffer.from(await(await request('/read/'+job.artifactId)).arrayBuffer()),output);
 assert.equal((await request('/read/'+job.artifactId,'GET',null,'other')).status,404);
 const ledger=await db.prepare('SELECT * FROM usage_operations').first();assert.equal(ledger.status,'settled');assert.equal(ledger.calls,1);assert.equal(ledger.cost_usd,.2);
 assert.equal((await db.prepare('SELECT state_json FROM learn_boards').first()).state_json,JSON.stringify(board));assert.deepEqual(Buffer.from(await(await bucket.get('original')).arrayBuffer()),original);assert.equal(forbiddenOutbound,0);
 console.log(JSON.stringify({source:'3b429e7c (runtime run used equivalent 8827632c plus redirect-only source diff)',runtime:'Miniflare/workerd',passed:7,failed:0,skipped:0,fakeProviderCalls,realProviderCalls:0,forbiddenOutbound,totalWallMs:performance.now()-started,coverage:['owner refusal','status ACL','automatic real FileJobs alarm + actual ledger/adapter decode/publication','duplicate creation','owner artifact read + foreign refusal','settled held bound','original + board unchanged'],limits:['External session/board-owner resolution is fixture-injected.','Provider response is deterministic, no quality/billing verification.','No full web dev-worker routing, cancellation race or maximum-memory qualification.']},null,2));
}finally{clearTimeout(watchdog);await mf.dispose();}
