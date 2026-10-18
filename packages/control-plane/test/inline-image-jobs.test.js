import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { inlineImageJobsRoute, imageJobFetch, imageJobAlarm } from '../src/inline-image-jobs.js';
const image = new Uint8Array([1,2,3]);
const digest = Buffer.from(await crypto.subtle.digest('SHA-256', image)).toString('hex');
const sourceId = 'fs_' + 'a'.repeat(24);
function fixture() {
  const records = new Map(), alarms = [], calls = { admit:0, edit:0, publish:0 };
  let queue = Promise.resolve();
  const storage = { get:async key=>structuredClone(records.get(key)), put:async(key,value)=>records.set(key,structuredClone(value)), setAlarm:async time=>alarms.push(time), transaction(fn) { const result=queue.then(()=>fn(storage)); queue=result.catch(()=>{}); return result; } };
  const state = { storage };
  const source = { id:sourceId, org:'org',owner_email:'owner',media_type:'image/png',bytes:3,sha256:digest,r2_key:'original',status:'stored' };
  const board = { id:'board',state_json:JSON.stringify({blocks:[{id:'card',type:'file',kind:'image',fileRef:{source:{id:sourceId,rev:digest}}}]}) };
  const deps = { admitSpend:async()=>{calls.admit++;return {refused:false};}, settleSpend:async()=>{},edit:async()=>{calls.edit++;return {bytes:new Uint8Array([4]),mimeType:'image/png',validation:'png-pixels'};},publish:async()=>{calls.publish++;return {id:'fs_'+'b'.repeat(24)};} };
  const env = { INLINE_IMAGE_EDIT_ENABLED:'true',OPENAI_API_KEY:'fixture-not-a-key',INLINE_IMAGE_EDIT_RESERVED_USD:'0.2', LEARN_MEDIA:{get:async()=>({size:3,arrayBuffer:async()=>image.buffer})}, LEARN_DB:{prepare(sql){return {bind(){return {first:async()=>sql.includes('learn_boards')?board:sql.includes('file_source_refs')?{ok:1}:source};}}}} };
  env.FILE_JOBS={idFromName:name=>name,get:()=>({fetch:req=>imageJobFetch(state,env,req,deps)})};
  const access={board:async()=>({owner:{org:'org',email:'owner'},row:board}),source:async()=>({source}),identity:async()=>({org:'org',email:'owner'})};
  const body={operation:'remove_background',sourceId,app:'canvas',cardId:'card',idempotencyKey:'unique-key',paidConfirmation:true};
  const submit=async(patch={},dependencies=access)=>inlineImageJobsRoute('/api/learn/files/image-edits',new Request('https://app/api/learn/files/image-edits',{method:'POST',body:JSON.stringify({...body,...patch})}),env,dependencies);
  const status=async(id,who='owner',action='status')=>imageJobFetch(state,env,new Request('https://internal/image-edit/'+action,{method:'POST',body:JSON.stringify({id,identity:{org:'org',email:who}})}),deps);
  return {records,alarms,calls,state,source,board,deps,env,access,submit,status};
}
test('disabled or absent reservation fails closed without creating a job',async()=>{
 for(const patch of [{INLINE_IMAGE_EDIT_ENABLED:'false'},{INLINE_IMAGE_EDIT_RESERVED_USD:'0'},{OPENAI_API_KEY:''}]) { const h=fixture();Object.assign(h.env,patch);assert.equal((await h.submit()).status,503);assert.equal(h.records.size,0);assert.equal(h.calls.admit,0); }
});
test('confirmed current source required; foreign source and readonly owner refusals preserved',async()=>{
 const h=fixture();assert.equal((await h.submit({paidConfirmation:false})).status,400);
 h.source.sha256='b'.repeat(64);assert.equal((await h.submit()).status,409);h.source.sha256=digest;
 assert.equal((await h.submit({}, {...h.access,source:async()=>new Response(null,{status:404})})).status,404);
 assert.equal((await h.submit({}, {...h.access,board:async()=>new Response(null,{status:403})})).status,403);
 assert.equal(h.calls.admit,0);
});
test('duplicate immutable creation and owner-only status/cancel',async()=>{
 const h=fixture(), first=await (await h.submit()).json();const id=first.job.id;
 assert.match(id,/^ij_[a-f0-9]{32}$/);assert.equal((await h.submit()).status,201);
 assert.equal((await h.status(id,'other')).status,404);
 assert.equal((await h.status(id,'other','cancel')).status,404);
 assert.equal((await h.status(id)).status,200);
 h.env.INLINE_IMAGE_EDIT_RESERVED_USD='0.3';assert.equal((await h.submit()).status,409);
 assert.equal((await h.status(id,'owner','cancel')).status,200);
 await imageJobAlarm(h.state,h.env,h.deps);assert.equal(h.calls.edit,0);
});
test('alarm reserves once, publishes once, persists reloadable status and recovery fence',async()=>{
 const h=fixture(),{job}=await (await h.submit()).json();
 await imageJobAlarm(h.state,h.env,h.deps);await imageJobAlarm(h.state,h.env,h.deps);
 assert.deepEqual(h.calls,{admit:1,edit:1,publish:1});assert.ok(h.alarms.some(time=>time>Date.now()+170000));
 const result=await (await h.status(job.id)).json();assert.equal(result.job.phase,'ready');assert.ok(result.job.artifactId);assert.equal(result.job.prompt,undefined);
});
test('source revision or current card removal cancels before admission',async()=>{
 for(const change of [h=>h.source.sha256='c'.repeat(64),h=>h.board.state_json='{"blocks":[]}']) {const h=fixture();await h.submit();change(h);await imageJobAlarm(h.state,h.env,h.deps);assert.equal(h.calls.admit,0);assert.equal(h.calls.edit,0);}
});
test('recovered in-flight marker is unknown and never executes again',async()=>{
 const h=fixture(),{job}=await (await h.submit()).json();const key='image-edit:'+job.id;
 h.records.set(key,{...h.records.get(key),phase:'started',reservation:'held'});
 await imageJobAlarm({storage:h.state.storage},h.env,h.deps);
 assert.equal(h.records.get(key).phase,'unknown');assert.equal(h.calls.edit,0);assert.equal(h.calls.admit,0);
});
test('legacy namespace alarms are untouched and arbitrary Retry is not routed',async()=>{
 const h=fixture();assert.equal(await imageJobAlarm(h.state,h.env,h.deps),false);
 assert.equal(await inlineImageJobsRoute('/api/learn/files/image-edits/ij_'+ 'a'.repeat(32)+'/retry',new Request('https://app'),h.env,h.access),null);
});
test('oversized request rejected before access or admission',async()=>{
 const h=fixture();assert.equal((await h.submit({unused:'x'.repeat(17000)})).status,400);assert.equal(h.records.size,0);
});
test('default publisher stores an independently owned immutable source without editing board',async()=>{
 const h=fixture(), writes=[], puts=[];
 delete h.deps.publish;
 const originalPrepare=h.env.LEARN_DB.prepare;
 h.env.LEARN_DB.prepare=sql=>sql.startsWith('INSERT INTO file_sources')?{bind:(...args)=>({run:async()=>writes.push(args)})}:sql==='SELECT * FROM file_sources WHERE id = ?'?{bind:()=>({first:async()=>null})}:originalPrepare(sql);
 h.env.LEARN_MEDIA.put=async(...args)=>puts.push(args);
 const before=h.board.state_json;const {job}=await (await h.submit()).json();
 await imageJobAlarm(h.state,h.env,h.deps);
 const ready=(await (await h.status(job.id)).json()).job;
 assert.equal(ready.phase,'ready');assert.match(ready.artifactId,/^fs_[a-f0-9]{24}$/);
 assert.equal(writes.length,1);assert.equal(writes[0][1],'org');assert.equal(writes[0][2],'owner');
 assert.equal(puts.length,1);assert.equal(puts[0][2].httpMetadata.contentType,'image/png');
 assert.equal(h.board.state_json,before);assert.notEqual(ready.artifactId,sourceId);
});

test('nonimage and citation-bearing cards refuse before scheduling and again before admission',async()=>{
 for(const patch of [{type:'code',kind:'code'},{citations:[{id:'citation'}]},{locked:true}]) {
  const h=fixture(), original=JSON.parse(h.board.state_json);
  h.board.state_json=JSON.stringify({blocks:[{...original.blocks[0],...patch}]});
  assert.equal((await h.submit()).status,404);
  h.board.state_json=JSON.stringify(original);await h.submit();
  h.board.state_json=JSON.stringify({blocks:[{...original.blocks[0],...patch}]});
  await imageJobAlarm(h.state,h.env,h.deps);assert.equal(h.calls.admit,0);
 }
});
test('real migration schema accepts immutable publication and retains original source',async t=>{
 const h=fixture(), db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec(readFileSync(new URL('../learn-migrations/0023-file-imports.sql',import.meta.url),'utf8'));
 db.exec('CREATE TABLE learn_boards (id TEXT,org TEXT,owner_email TEXT,state_json TEXT)');
 db.prepare('INSERT INTO learn_boards VALUES (?,?,?,?)').run('board','org','owner',h.board.state_json);
 db.prepare("INSERT INTO file_sources (id,org,owner_email,app,family,name,media_type,bytes,sha256,r2_key,status,created_at) VALUES (?,?,?,'canvas','image','original.png','image/png',?,?,?,'stored',0)").run(sourceId,'org','owner',3,digest,'original');
 h.env.LEARN_DB={prepare:sql=>({bind:(...args)=>({first:async()=>db.prepare(sql).get(...args)||null,run:async()=>db.prepare(sql).run(...args)})})};
 const writes=[];h.env.LEARN_MEDIA.put=async(...args)=>writes.push(args);delete h.deps.publish;
 const {job}=await (await h.submit()).json();await imageJobAlarm(h.state,h.env,h.deps);
 const ready=(await (await h.status(job.id)).json()).job;assert.equal(ready.phase,'ready');
 const row=db.prepare('SELECT * FROM file_sources WHERE id=?').get(ready.artifactId);
 assert.equal(row.family,'image');assert.equal(row.status,'stored');assert.equal(row.owner_email,'owner');assert.equal(row.org,'org');assert.equal(row.bytes,1);
 assert.equal(db.prepare('SELECT count(*) AS n FROM file_sources').get().n,2);assert.equal(writes.length,1);
 assert.equal(db.prepare('SELECT state_json FROM learn_boards').get().state_json,h.board.state_json);
});
