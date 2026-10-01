import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { parseRepository, repositoriesFetch, repositoryAccess, RepositoryImports, ownerRepositories } from '../src/repositories.js';
import { repositoryTool, REPOSITORY_SYSTEM, REPOSITORY_TOOLS } from '../src/repository-context.js';
import { researchAnswer } from '../src/learn-research.js';
import { liveDb, memoryBucket } from './live-storage-spy.js';
import { putUploadedPaper } from '../src/learn-paper.js';
import { aiSettings } from '../src/ask.js';

const sha='a'.repeat(40), newer='b'.repeat(40);
const snapshot={repo:'example/project',commit:sha,version:'graphifyy-0.9.63-small-1',files:{'model.py':'class Model:\n    def forward(self, x):\n        return x + 1','README.md':'A model'},skipped:[],graph:{nodes:[{id:'model',label:'Model',path:'model.py',line:1},{id:'forward',label:'forward()',path:'model.py',line:2}],edges:[{source:'model',target:'forward',relation:'contains',confidence:'EXTRACTED'}]}};
function fixture(t){
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());sqlite.exec(readFileSync(new URL('../repository-schema.sql',import.meta.url),'utf8'));
  sqlite.exec(`INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(1,'team','repo-example','owner@test','example/project','main','${sha}','ready'); INSERT INTO repository_versions VALUES(1,'${sha}','snapshot',datetime('now'));`);
  const db={prepare:sql=>{let args=[];const stmt=sqlite.prepare(sql);return{bind(...v){args=v;return this;},first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:stmt.run(...args)})};},batch:async statements=>Promise.all(statements.map(s=>s.run()))};
  const assets=new Map([['snapshot',snapshot]]),data=new Map();
  const env={LEARN_DB:db,SCENE_WORKER_URL:'https://worker.test',SCENE_WORKER_TOKEN:'secret',CONTROL_PLANE:{fetch:async req=>req.headers.get('cookie')==='denied'?new Response('',{status:401}):Response.json({org:req.headers.get('x-small-workspace')||'team',email:req.headers.get('x-email')||'owner@test',apps:[]})},REPOSITORY_SNAPSHOTS:{get:async k=>assets.has(k)?{json:async()=>typeof assets.get(k)==='string'?JSON.parse(assets.get(k)):assets.get(k)}:null,put:async(k,v)=>assets.set(k,v)},RUNS:{get(){throw Error('live bucket touched');},put(){throw Error('live bucket touched');}}};
  const state={storage:{get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v)),setAlarm:async()=>{}},blockConcurrencyWhile:async fn=>fn()};
  return{env,sqlite,data,assets,state,actor:new RepositoryImports(state,env),send:(path,body,headers={})=>repositoriesFetch(new Request(`https://dev.test/api/repositories/repo-example/${path}`,{method:body?'POST':'GET',headers, ...(body?{body:JSON.stringify(body)}:{})}),env,{})};
}
test('only public GitHub repository URLs are accepted',()=>{
  assert.equal(parseRepository('https://github.com/karpathy/nanoGPT.git'),'karpathy/nanoGPT');
  for(const url of ['file:///etc/passwd','https://evil.test/a/b','https://github.com/a/b/tree/main','https://u:p@github.com/a/b','https://github.com/a/b?q=x','https://github.com:888/a/b'])assert.throws(()=>parseRepository(url));
});
test('graph retrieval is bounded, keeps confidence, reads numbered source, rejects paths',()=>{
  assert.equal(repositoryTool(snapshot,'get_repo_overview').commit,sha);
  assert.equal(repositoryTool(snapshot,'search_code',{query:'forward'}).nodes[0].id,'forward');
  assert.equal(repositoryTool(snapshot,'get_relationships',{nodeId:'model'}).edges[0].confidence,'EXTRACTED');
  assert.match(repositoryTool(snapshot,'read_source',{path:'model.py',start:2,end:3}).content,/2:     def forward/);
  for(const input of [{path:'../secret'},{path:'__proto__'},{path:'model.py',start:0},{path:'model.py',start:1,end:121}])assert.throws(()=>repositoryTool(snapshot,'read_source',input));
});
test('workspace and session authorization precede source access; refresh is owner-only',async t=>{
  const f=fixture(t);assert.equal((await f.send('snapshot')).status,200);
  assert.equal((await f.send('snapshot',null,{'x-small-workspace':'other'})).status,404);
  assert.equal((await f.send('snapshot',null,{cookie:'denied'})).status,401);
  assert.equal((await f.send('refresh',{}, {'x-email':'viewer@test'})).status,404);
  assert.equal((await f.send('file',{path:'../../secret'})).status,404);
  const access=await repositoryAccess(new Request('https://dev.test',{headers:{'x-small-workspace':'other'}}),f.env,'repo-example');assert.equal(access.status,404);
});

test('graph explanations, queries and shortest paths retain direction and confidence',()=>{
  const extended={...snapshot,graph:{nodes:[...snapshot.graph.nodes,{id:'end',label:'Output',path:'model.py',line:3},{id:'other',label:'Other',path:null}],edges:[...snapshot.graph.edges,{source:'end',target:'forward',relation:'references',confidence:'INFERRED'}]}};
  const explanation=repositoryTool(extended,'explain_symbol',{symbol:'Model'});assert.equal(explanation.degree,1);assert.equal(explanation.node.path,'model.py');
  const path=repositoryTool(extended,'find_connection_path',{from:'Model',to:'Output'});assert.equal(path.hops,2);assert.deepEqual(path.edges.map(e=>e.traversal),['forward','reverse']);assert.equal(path.edges[1].confidence,'INFERRED');
  assert.equal(repositoryTool(extended,'find_connection_path',{from:'Model',to:'Model'}).hops,0);
  assert.equal(repositoryTool(extended,'find_connection_path',{from:'Model',to:'Other'}).status,'disconnected');
  const ambiguous={...extended,graph:{...extended.graph,nodes:[...extended.graph.nodes,{id:'duplicate',label:'Model',path:'other.py',line:1}]}};
  assert.equal(repositoryTool(ambiguous,'explain_symbol',{symbol:'Model'}).status,'ambiguous');
  assert.equal(repositoryTool(ambiguous,'find_connection_path',{from:'Model',to:'Output'}).status,'choose_symbols');
  const query=repositoryTool(extended,'query_graph',{query:'How does forward connect?'});assert(query.nodes.some(n=>n.id==='model'));assert(query.edges.some(e=>e.confidence==='INFERRED'));assert.equal(query.method,'Label and path matching with one-hop expansion');
  assert.throws(()=>repositoryTool(extended,'query_graph',{query:''}));
});
test('source and courses retain version; curriculum approval remains owner-only',async t=>{
  const f=fixture(t);
  const file=await(await f.send('file',{path:'model.py',commit:sha})).json();assert.equal(file.commit,sha);
  assert.equal((await f.send('file',{path:'model.py',commit:newer})).status,400);
  assert.equal((await f.send('learn-course',{action:'brief',revision:0,brief:{audience:'Students',goal:'Understand models',knowledge:'Python',duration:'20 minutes'}})).status,200);
  assert.equal((await f.send('learn-course',{action:'approve',revision:1},{'x-email':'viewer@test'})).status,404);
});
test('private chat histories cannot be read across users or projects',async t=>{
  const f=fixture(t);f.sqlite.prepare('INSERT INTO threads(id,org,user,scope_ref,commit_sha,title) VALUES(?,?,?,?,?,?)').run('repochat-test','team','owner@test','repo-example',sha,'Question');
  assert.equal((await f.send('threads/repochat-test')).status,200);
  assert.equal((await f.send('threads/repochat-test',null,{'x-email':'viewer@test'})).status,404);
  assert.equal((await f.send('ask',{message:'Hi',thread_id:'repochat-test'},{'x-email':'viewer@test'})).status,404);
});
test('workspace fallback cannot bypass an explicit workspace request',async t=>{
  const f=fixture(t);f.env.CONTROL_PLANE.fetch=async()=>Response.json({org:'team',email:'owner@test',apps:[]});
  assert.equal((await f.send('snapshot',null,{'x-small-workspace':'unknown'})).status,403);
});

test('selected code uses stored source, survives chat history and rejects mismatched or invalid ranges',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let prompt;
  globalThis.fetch=async(_,options)=>{prompt=JSON.parse(options.body);return Response.json({content:[{type:'text',text:'The method returns x plus one. Sources: model.py:2-3'}],stop_reason:'end_turn'});};
  const response=await f.send('ask',{message:'Explain these lines',repository_context:{commit:sha,range:{path:'model.py',start:2,end:3,text:'fabricated code'}}});
  assert.equal(response.status,200);assert.match(await response.text(),/returns x plus one/);
  assert.match(JSON.stringify(prompt.messages),/return x \+ 1/);assert.doesNotMatch(JSON.stringify(prompt.messages),/fabricated code/);
  const history=f.sqlite.prepare("SELECT content FROM messages WHERE role='user'").get();assert.match(history.content,/Selected code: model.py:2-3/);
  const thread=f.sqlite.prepare('SELECT id FROM threads').get();
  assert.equal((await f.send('ask',{message:'Explain',thread_id:thread.id,repository_context:{commit:newer,range:{path:'model.py',start:2,end:3}}})).status,409);
  for(const range of [{path:'../secret',start:1,end:2},{path:'model.py',start:0,end:3},{path:'model.py',start:1,end:122}])assert.equal((await f.send('ask',{message:'Explain',repository_context:{commit:sha,range}})).status,400);
});

// C4 models-1, repository row: same resolution as apiAsk; Auto keeps the server-side fallback.
test('repository chat runs Auto as claude-opus-5 with fallback, and a picked key as that id alone',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});const sent=[];
  f.env.ANTHROPIC_API_KEY='a';f.env.OPENAI_API_KEY='o';
  globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);sent.push({host:new URL(url).host,model:body.model,fallbacks:body.fallbacks});return Response.json({content:[{type:'text',text:'ok'}],stop_reason:'end_turn'});};
  for(const model of [undefined,'sonnet-5','gpt-5'])await(await f.send('ask',{message:'Hi',...(model?{model}:{})})).text();
  assert.deepEqual(sent,[{host:'api.anthropic.com',model:'claude-opus-5',fallbacks:'default'},{host:'api.anthropic.com',model:'claude-sonnet-5',fallbacks:undefined},{host:'api.anthropic.com',model:'claude-opus-5',fallbacks:'default'}]);
});
// models-4: repository asks and course authoring reach the dev worker through
// /api/repositories before its owner gate, so repositoriesFetch applies it itself.
test('subscription mode: only the owner may ask or author courses on a repository, and course model actions get 503',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});const hosts=[];
  Object.assign(f.env,{SUBSCRIPTION_ONLY:'true',SUBSCRIPTION_OWNER_EMAIL:'owner@test',SUBSCRIPTION_BRIDGE_URL:'https://bridge.test',SUBSCRIPTION_BRIDGE_TOKEN:'t',ANTHROPIC_API_KEY:'paid'});
  globalThis.fetch=async url=>{hosts.push(new URL(url).host);return Response.json({billing:'claude-subscription',content:[{type:'text',text:'ok'}],stop_reason:'end_turn'});};
  const member={'x-email':'viewer@test'};
  // Privacy P0: another person's project answers 404 like a missing one, before any owner gate.
  assert.equal((await f.send('ask',{message:'Hi'},member)).status,404);
  for(const action of ['brief','draft'])assert.equal((await f.send('learn-course',{action,revision:0},member)).status,404,action);
  for(const action of ['draft','generate','revise_section'])assert.equal((await f.send('learn-course',{action,revision:0})).status,503,action);
  assert.deepEqual(hosts,[]);
  await(await f.send('ask',{message:'Hi'})).text();
  assert.deepEqual(hosts,['bridge.test']);
});
test('graph answers stream an exact view and retain it with the saved answer',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let calls=0;
  globalThis.fetch=async()=>Response.json(++calls===1?{content:[{type:'tool_use',id:'path',name:'find_connection_path',input:{from:'Model',to:'forward'}}]}:{content:[{type:'text',text:'Model contains forward (EXTRACTED).'}],stop_reason:'end_turn'});
  const response=await f.send('ask',{message:'How does Model connect to forward?'}),events=await response.text();
  assert.match(events,/event: graph/);assert.match(events,/EXTRACTED/);
  const id=f.sqlite.prepare('SELECT id FROM threads').get().id;
  const saved=await(await f.send(`threads/${id}`)).json(),answer=saved.messages.find(m=>m.role==='assistant');
  assert.equal(answer.graph.commit,sha);assert.deepEqual(answer.graph.nodes.map(n=>n.id),['model','forward']);assert.equal(answer.graph.edges[0].relation,'contains');
});

// C1 (docs/features/learn-cleanup.md): a repository answer that shows a video logs the moment
// through learnMomentsDb, which is LEARN_DB on dev. The live DB is a recording spy, because the
// moment log swallows its errors (ask.js), and small-learn-dev has no learn_moments table yet,
// so the dev log goes quiet: the video still streams, with no momentId.
test('a repository video answer writes no learn_moments row to the live DB',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  const live=liveDb();Object.assign(f.env,{DB:live,LEARN_MEDIA:memoryBucket(),EXA_API_KEY:'test'});
  const replies=[{content:[{type:'tool_use',id:'find',name:'find_video_moments',input:{query:'backprop'}}]},{content:[{type:'tool_use',id:'show',name:'show_video',input:{videoId:'Ilg3gGewQ5U'}}]},{content:[{type:'text',text:'Watch the chain rule.'}],stop_reason:'end_turn'}];
  globalThis.fetch=async url=>{
    const host=new URL(String(url)).hostname;
    if(host==='api.exa.ai')return Response.json({results:[{url:'https://www.youtube.com/watch?v=Ilg3gGewQ5U',title:'Backprop - YouTube'}]});
    if(host==='api.anthropic.com')return Response.json(replies.shift());
    return new Response('',{status:404});
  };
  const events=await(await f.send('ask',{message:'show me a video about backprop'})).text();
  assert.match(events,/event: video/);assert.match(events,/event: done/);
  assert.doesNotMatch(events,/momentId/);
  assert.deepEqual(live.calls,[]);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM messages').get().n,2);
});

test('canvas block branches have isolated saved histories and remain permission scoped', async t => {
  const f=fixture(t), original=globalThis.fetch; t.after(()=>{globalThis.fetch=original;});
  const prompts=[];
  globalThis.fetch=async(_,options)=>{prompts.push(JSON.parse(options.body));return Response.json({content:[{type:'text',text:'A follow-up answer.'}],stop_reason:'end_turn'});};
  const branch=async(label)=>{
    const response=await f.send('ask',{message:`Follow up ${label}`,canvas_seed:{question:`Question ${label}`,answer:`Answer ${label}`}});
    assert.equal(response.status,200); const events=await response.text();
    return JSON.parse(events.match(/event: done\ndata: ([^\n]+)/)[1]).threadId;
  };
  const a=await branch('Alpha'), b=await branch('Beta'); assert.notEqual(a,b);
  assert.match(JSON.stringify(prompts[0].messages),/Answer Alpha/);
  assert.doesNotMatch(JSON.stringify(prompts[1].messages),/Alpha/);
  const next=await f.send('ask',{message:'Continue Alpha',thread_id:a}); await next.text();
  assert.match(JSON.stringify(prompts[2].messages),/Answer Alpha/);
  assert.doesNotMatch(JSON.stringify(prompts[2].messages),/Beta/);
  const saved=await(await f.send(`threads/${a}`)).json();
  assert.equal(saved.messages[0].content,'Question Alpha'); assert.equal(saved.messages[1].content,'Answer Alpha');
  assert.equal((await f.send('ask',{message:'Hijack',thread_id:a},{'x-email':'viewer@test'})).status,404);
  assert.equal((await f.send('ask',{message:'Replace',thread_id:a,canvas_seed:{question:'X',answer:'Y'}})).status,400);
});
test('durable indexing queues, persists new snapshot, preserves old version and reuses unchanged commit',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let calls=0;
  globalThis.fetch=async(url,opts)=>{calls++;assert.equal(opts.headers.Authorization,'Bearer secret');return Response.json(String(url).endsWith('/asset')?{...snapshot,commit:newer}:{status:'ready'});};
  const request=()=>new Request('https://index/start',{method:'POST',body:JSON.stringify({appId:1,repo:snapshot.repo,branch:'main',commit:newer})});
  assert.equal((await f.actor.fetch(request())).status,202);assert.equal(calls,0);
  assert.equal((await f.actor.fetch(request())).status,409);
  await f.actor.alarm();await new RepositoryImports(f.state,f.env).alarm();
  assert.equal(f.data.get('job').status,'ready');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM repository_versions').get().n,2);
  assert.equal(f.sqlite.prepare('SELECT commit_sha FROM repository_apps').get().commit_sha,newer);
  assert.equal((await(await f.actor.fetch(request())).json()).reused,true);assert.equal(calls,3);
});
test('failed refresh preserves existing usable commit and can be retried',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async()=>Response.json({status:'failed',error:'Repository exceeds indexing limit'});
  const request=()=>new Request('https://index/start',{method:'POST',body:JSON.stringify({appId:1,repo:snapshot.repo,branch:'main',commit:newer})});
  await f.actor.fetch(request());await f.actor.alarm();await f.actor.alarm();
  assert.equal(f.data.get('job').status,'failed');assert.equal(f.sqlite.prepare('SELECT commit_sha FROM repository_apps').get().commit_sha,sha);
  assert.equal((await f.actor.fetch(request())).status,202);
});
test('Learn tool loop retrieves actual source instead of sending the whole repository',async()=>{
  let calls=0;
  const result=await researchAnswer({},[{role:'user',content:'What does forward return?'}],'Teach',null,{tools:REPOSITORY_TOOLS,runTool:async(name,input)=>repositoryTool(snapshot,name,input),callModel:async(_,body)=>{
    calls++;assert(body.tools.some(t=>t.name==='read_source'));
    if(calls===1)return Response.json({content:[{type:'tool_use',id:'r1',name:'read_source',input:{path:'model.py',start:2,end:3}}]});
    assert.match(JSON.stringify(body.messages),/return x \+ 1/);return Response.json({content:[{type:'text',text:'It adds one. Sources: model.py:3'}],stop_reason:'end_turn'});
  }});assert.match(result.answer,/model.py:3/);assert.equal(calls,2);
});

// Regression pin, not TDD: it passes on first run because it pins current behaviour. If it ever
// fails, a T02 section 16 condition is false, D7 wins, and connect_repository must render Blocked.
test('T02 section 16 pin: connect_repository writes only LEARN_DB rows and learn-repositories-dev keys, and calls no live mutation API',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  const hosts=new Set(),seen=[],identity=f.env.CONTROL_PLANE.fetch;
  globalThis.fetch=async url=>{url=new URL(url);hosts.add(url.host);return Response.json(url.pathname==='/repository-metadata'?{commit:newer}:url.pathname.endsWith('/asset')?{...snapshot,commit:newer}:{status:'ready'});};
  f.env.CONTROL_PLANE.fetch=async req=>{seen.push(`${req.method} ${new URL(req.url).pathname}`);return identity(req);};
  f.env.DB={prepare(){throw Error('live D1 touched');},batch(){throw Error('live D1 touched');}};
  f.env.REPOSITORY_IMPORTS={idFromName:String,get:()=>({fetch:(url,init)=>f.actor.fetch(new Request(url,init))})};
  const response=await repositoriesFetch(new Request('https://dev.test/api/repositories',{method:'POST',body:JSON.stringify({url:'https://github.com/example/project',branch:'main'})}),f.env,{});
  assert.equal(response.status,202);
  const row=f.sqlite.prepare('SELECT * FROM repository_apps WHERE name=?').get((await response.json()).name);
  assert.equal(row.org,'team');assert.equal(row.owner_email,'owner@test');assert.ok(row.created_at); // 16.1, 16.5: a LEARN_DB row, found by org, owner_email, created_at
  await f.actor.alarm();await f.actor.alarm();
  const key=`learn-repositories-dev/${row.id}/${newer}/graphify-0.9.63.json`;
  assert.deepEqual([...f.assets.keys()].filter(k=>k!=='snapshot'),[key]); // 16.2, 16.3: prefix plus LEARN_DB id plus commit
  assert.equal(f.sqlite.prepare('SELECT storage_key FROM repository_versions WHERE app_id=?').get(row.id).storage_key,key); // 16.5: R2 found through repository_versions
  assert.deepEqual([...new Set(seen)],['GET /api/me']); // 16.4: identity read only (side-effect free, dev-prod-write-barrier.md)
  assert.deepEqual([...hosts],['worker.test']);
  assert.equal(f.sqlite.prepare('SELECT status FROM repository_apps WHERE id=?').get(row.id).status,'ready');
});

// Dev storage hygiene (user, 2026-09-28): dev repository snapshots live in their own bucket, never in the
// live small-runs bucket under a prefix. The dev config binds that bucket; production has no such binding.
const jsonc=(path)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8').replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,(m,str)=>str||'').replace(/,(\s*[}\]])/g,'$1'));
// Every packages/web config that deploys dev-worker.js (the shared dev worker and the clone recipe) needs it:
// without the binding every repository ask fails at repositorySnapshot.
test('dev repository snapshots cannot reach the production bucket',()=>{
  const web=new URL('../../web/',import.meta.url),live=jsonc('../wrangler.jsonc');
  const devs=readdirSync(web).filter(name=>/^wrangler\..*\.jsonc$/.test(name)).filter(name=>jsonc(`../../web/${name}`).main==='dev-worker.js');
  assert.deepEqual(devs.sort(),['wrangler.dev.jsonc','wrangler.parallel.jsonc']);
  const liveBuckets=(live.r2_buckets||[]).map(b=>b.bucket_name);
  for(const name of devs){
    const snapshots=(jsonc(`../../web/${name}`).r2_buckets||[]).find(b=>b.binding==='REPOSITORY_SNAPSHOTS');
    assert.ok(snapshots,`${name} binds REPOSITORY_SNAPSHOTS`);
    assert.equal(snapshots.bucket_name,'rabbit-hole-dev-repositories',name);
    assert.ok(!liveBuckets.includes(snapshots.bucket_name),`${snapshots.bucket_name} is a production bucket`);
  }
  assert.ok(!(live.r2_buckets||[]).some(b=>b.binding==='REPOSITORY_SNAPSHOTS'),'production binds REPOSITORY_SNAPSHOTS');
  const source=readFileSync(new URL('../src/repositories.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/env\.RUNS\b/,'repositories.js still reads or writes the live RUNS bucket');
});

test('a why-question gets the code explained, inference labelled, and no invented history (WP6 two truths)', () => {
  assert.ok(REPOSITORY_SYSTEM.includes("I don't have a recorded project decision explaining why the team chose this."));
  assert.match(REPOSITORY_SYSTEM, /No decision, question or session records are captured for this project/);
  assert.match(REPOSITORY_SYSTEM, /label them as inferred from the source/);
});

// C5 context-1: the same schema-max explanation card as learn-chat.test.js, wrapped as ask.jsx did.
const LONG_CARD=[`Explanation: ${'T'.repeat(120)}`,'b'.repeat(2000),...[1,2,3].map(n=>`[${'L'.repeat(40)}] ${String(n).repeat(800)}`)].join('\n');
const wrappedCardQuestion=question=>`Question about this Explanation block on the lesson canvas:\n${LONG_CARD}\n\nLearner question: ${question}`;
test('a long card wrapped into the message is refused by the 4000-character limit (context-1)',async t=>{
  const f=fixture(t),res=await f.send('ask',{message:wrappedCardQuestion('why?')});
  assert.equal(res.status,400);assert.deepEqual(await res.json(),{error:'Question must be 1–4000 characters'});
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM threads').get().n,0);
});
test('a canvas_target card rides as its own bounded context section on a repository ask (context-1)',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});const prompts=[];
  globalThis.fetch=async(_,options)=>{prompts.push(JSON.parse(options.body));return Response.json({content:[{type:'text',text:'Because.'}],stop_reason:'end_turn'});};
  const res=await f.send('ask',{message:'why?',canvas_target:{id:'block-1',kind:'Explanation',title:'Softmax',text:LONG_CARD}});
  assert.equal(res.status,200);await res.text();
  const turn=JSON.stringify(prompts[0].messages.at(-1));
  assert.ok(turn.includes(JSON.stringify(JSON.stringify(LONG_CARD)).slice(1,-1)),'the whole card reaches the model');
  assert.match(turn,/untrusted/);
  assert.equal(f.sqlite.prepare("SELECT content FROM messages WHERE role='user'").get().content,'why?');
  assert.equal(f.sqlite.prepare('SELECT title FROM threads').get().title,'why?');
  await (await f.send('ask',{message:'and this?',canvas_target:{id:'b2',kind:'Table',title:'Big',text:'x'.repeat(9000)}})).text();
  assert.match(JSON.stringify(prompts[1].messages.at(-1)),/\[card text truncated: showing 8000 of 9000 characters\]/);
  assert.equal((await f.send('ask',{message:'q',canvas_target:{id:'b',kind:'Explanation',text:''}})).status,400);
});

// C5 context-5, context-6, prompts-10: a repository ask reads the same attached sources a chat ask
// does, through learn-ask-context.js: context text only, no outline or Wikipedia tools.
test('repository asks read the outline, video window, Wikipedia section and uploaded PDF the way chat asks do',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});const prompts=[];
  f.env.LEARN_MEDIA=memoryBucket();
  globalThis.fetch=async(url,options)=>{const u=String(url);
    if(u.includes('wikipedia.org')&&u.includes('prop=tocdata'))return Response.json({parse:{title:'Machine learning',tocdata:{sections:[{index:'1',tocLevel:1,line:'History',anchor:'History'}]}}});
    if(u.includes('wikipedia.org'))return Response.json({parse:{text:'<div><p>Arthur Samuel coined the term.</p></div>'}});
    prompts.push(JSON.parse(options.body));return Response.json({content:[{type:'text',text:'Ok.'}],stop_reason:'end_turn'});};
  const turn=()=>JSON.stringify(prompts.at(-1).messages.at(-1)),tools=()=>(prompts.at(-1).tools||[]).map(tool=>tool.name);
  const {id}=await putUploadedPaper(f.env,{org:'team',name:'repo-example',email:'owner@test'},new File([new TextEncoder().encode('%PDF-1.4 test')],'notes.pdf',{type:'application/pdf'}));
  const selection={region:{x:0.2,y:0.3,w:0.4,h:0.2},preview:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='};
  let res=await f.send('ask',{message:'what does this say?',paper_context:{id,page:2,selection}});
  assert.equal(res.status,200);await res.text();
  const blocks=prompts.at(-1).messages.at(-1).content;
  assert.equal(blocks[0].type,'document');assert.equal(blocks[0].source.data,Buffer.from('%PDF-1.4 test').toString('base64'));
  assert.equal(blocks[1].type,'image');
  assert.match(turn(),/Answer from the attached paper/);assert.match(turn(),/selectedRegion/);
  await (await f.send('ask',{message:'structure?',outline:[{id:'h1',label:'Attention heads',level:1,done:false}]})).text();
  assert.match(turn(),/This lesson's table of contents/);assert.match(turn(),/Attention heads/);
  assert.equal(tools().includes('propose_lesson_outline'),false);
  await (await f.send('ask',{message:'what is shown?',video_context:{videoId:'Ilg3gGewQ5U',start:240,end:300,title:'Backprop'}})).text();
  assert.match(turn(),/You have not read its transcript/);assert.match(turn(),/4:00 to 5:00/);
  await (await f.send('ask',{message:'who coined it?',wiki_context:{title:'Machine_learning',section:1}})).text();
  assert.match(turn(),/Arthur Samuel coined the term/);assert.match(turn(),/cannot be read here/);
  assert.equal(tools().includes('read_wikipedia'),false);
  for(const body of [{outline:'x'},{video_context:{videoId:'nope'}},{wiki_context:{title:'',section:0}},{paper_context:{id,page:101}},{image_context:{id:'../x'}}])assert.equal((await f.send('ask',{message:'q',...body})).status,400,JSON.stringify(body));
  const missing=await f.send('ask',{message:'q',paper_context:{id:'upload:0123456789ab',page:1}});
  assert.equal(missing.status,502);assert.deepEqual(await missing.json(),{error:'Could not read the referenced paper. Try again.'});
});
// duplication-2, context-7, lifecycle-14: the composer's + attachment (up to 4 MB) works on a repository
// ask; every JSON request, and the JSON part of the ask, keep the 64 KB cap.
test('a repository ask takes a + attachment up to 4 MB while JSON requests keep the 64 KB cap',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});const prompts=[];
  globalThis.fetch=async(_,options)=>{prompts.push(JSON.parse(options.body));return Response.json({content:[{type:'text',text:'A square.'}],stop_reason:'end_turn'});};
  const upload=(bytes,body={message:'what is in this picture?'})=>{const form=new FormData();form.set('body',JSON.stringify(body));form.set('file',new Blob([bytes],{type:'image/png'}),'shot.png');
    return repositoriesFetch(new Request('https://dev.test/api/repositories/repo-example/ask',{method:'POST',body:form}),f.env,{});};
  const res=await upload(new Uint8Array(100000));
  assert.equal(res.status,200);await res.text();
  assert.equal(prompts[0].messages.at(-1).content[0].type,'image');
  const big=await upload(new Uint8Array(4*1024*1024+1));
  assert.equal(big.status,400);assert.deepEqual(await big.json(),{error:'attachment too large - 4 MB max'});
  assert.equal((await upload(new Uint8Array(10),{message:'q',lesson_snapshot:'x'.repeat(70000)})).status,413,'the JSON part stays under 64 KB');
  assert.equal((await f.send('ask',{message:'q',outline:[{id:'h',label:'x'.repeat(70000),level:1,done:false}]})).status,413);
  assert.equal((await f.send('file',{path:'x'.repeat(70000)})).status,413);
});
// context-11: a mention the repository chat cannot read says so instead of vanishing.
test('an unknown or fourth repository mention is named as not available',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});const prompts=[];
  globalThis.fetch=async(_,options)=>{prompts.push(JSON.parse(options.body));return Response.json({content:[{type:'text',text:'Ok.'}],stop_reason:'end_turn'});};
  await (await f.send('ask',{message:'compare',mentions:['repo-missing','counter','repo-a','repo-b']})).text();
  const turn=JSON.stringify(prompts[0].messages.at(-1));
  assert.match(turn,/Mentioned app repo-missing: not available to this chat\./);
  assert.match(turn,/Mentioned app counter: not available to this chat\./);
  assert.match(turn,/Mentioned app repo-b: not available to this chat \(a question reads at most 3 mentioned apps\)\./);
});
// usage-credits.md §14 (privacy P0): a shared email domain is not a shared Library.
test('a colleague on the same email domain can neither list nor open another person\'s project',async t=>{
  const f=fixture(t),colleague={'x-email':'viewer@test'};
  assert.deepEqual((await ownerRepositories(f.env,{org:'team',email:'viewer@test'})).map(a=>a.name),[]);
  assert.deepEqual((await ownerRepositories(f.env,{org:'team',email:'owner@test'})).map(a=>a.name),['repo-example']);
  for(const path of['snapshot','threads'])assert.equal((await f.send(path,null,colleague)).status,404,path);
  assert.equal((await f.send('file',{path:'model.py'},colleague)).status,404);
  assert.equal((await f.send('ask',{message:'Hi'},colleague)).status,404);
  assert.equal((await f.send('learn-course',{action:'approve',revision:1},colleague)).status,404);
  const access=await repositoryAccess(new Request('https://dev.test',{headers:colleague}),f.env,'repo-example');assert.equal(access.status,404);
  assert.equal((await f.send('snapshot')).status,200); // the owner is unaffected
});
test('an @-mention of another person\'s project adds nothing to the answer',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  f.sqlite.exec(`INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(2,'team','repo-mine','viewer@test','example/mine','main','${sha}','ready'); INSERT INTO repository_versions VALUES(2,'${sha}','snapshot',datetime('now'));`);
  let sent;globalThis.fetch=async(url,init)=>{sent=JSON.parse(init.body);return new Response('event: message_stop\ndata: {}\n\n',{headers:{'content-type':'text/event-stream'}});};
  const response=await repositoriesFetch(new Request('https://dev.test/api/repositories/repo-mine/ask',{method:'POST',headers:{'x-email':'viewer@test'},body:JSON.stringify({message:'Compare',mentions:['repo-example']})}),f.env,{});
  await response.text();
  assert.ok(sent,'the model request was captured');
  const typed=JSON.stringify(sent.messages);
  assert.doesNotMatch(typed,/model\.py|class Model|example\/project|A model/,'no private project content reaches the model');
  assert.match(typed,/Mentioned app repo-example: not available to this chat\./);
  let missing;globalThis.fetch=async(url,init)=>{missing=JSON.parse(init.body);return new Response('event: message_stop\ndata: {}\n\n',{headers:{'content-type':'text/event-stream'}});};
  await (await repositoriesFetch(new Request('https://dev.test/api/repositories/repo-mine/ask',{method:'POST',headers:{'x-email':'viewer@test'},body:JSON.stringify({message:'Compare',mentions:['repo-nothere']})}),f.env,{})).text();
  assert.equal(typed.replaceAll('repo-example','NAME'),JSON.stringify(missing.messages).replaceAll('repo-nothere','NAME'),'a refused mention reads exactly like a nonexistent one');
});
test('the owner opens the project by its direct URL, and only in their own workspace',async t=>{
  const f=fixture(t),direct=headers=>repositoriesFetch(new Request('https://dev.test/api/repositories/repo-example',{headers}),f.env,{});
  assert.equal((await direct({})).status,200);
  assert.equal((await f.send('snapshot',null,{'x-small-workspace':'other'})).status,404);
  assert.deepEqual(await ownerRepositories(f.env,{org:'other',email:'owner@test'}),[]);
});
test('a refused project answers exactly like one that does not exist',async t=>{
  const f=fixture(t),get=(name,headers)=>repositoriesFetch(new Request(`https://dev.test/api/repositories/${name}/snapshot`,{headers}),f.env,{});
  const denied=await get('repo-example',{'x-email':'viewer@test'}),missing=await get('repo-does-not-exist',{'x-email':'viewer@test'});
  assert.equal(denied.status,missing.status);assert.equal(await denied.text(),await missing.text());
});
test('the 25-project import cap counts only projects the caller owns, never the whole org',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async()=>Response.json({commit:newer});
  f.env.REPOSITORY_IMPORTS={idFromName:String,get:()=>({fetch:(url,init)=>f.actor.fetch(new Request(url,init))})};
  const fill=(email,n)=>{for(let i=0;i<n;i++)f.sqlite.prepare("INSERT INTO repository_apps(org,name,owner_email,repo,branch) VALUES('team',?,?,'example/x','main')").run(`repo-${email}-${i}`,email);};
  const connect=()=>repositoriesFetch(new Request('https://dev.test/api/repositories',{method:'POST',body:JSON.stringify({url:'https://github.com/example/project',branch:'main'})}),f.env,{});
  fill('viewer@test',25);
  assert.equal((await connect()).status,202); // 25 projects owned by a colleague leave this person's quota untouched
  fill('owner@test',24); // the connect above plus these 24 make 25 owned
  const refused=await connect();
  assert.match(JSON.stringify(await refused.json()),/You have reached the 25 repository preview limit/);
});

// dev-prod-write-barrier.md: Learn on a dev worker never reads a customer's org_ai row (their OpenAI key or
// Bedrock role) from production D1. The course draft uses the default provider; no DB means no settings.
test('a repository course draft uses the default provider and reads no org_ai row from production D1',async t=>{
  const f=fixture(t),live=liveDb(),original=globalThis.fetch,hosts=[];
  Object.assign(f.env,{DB:live,ANTHROPIC_API_KEY:'test'});
  globalThis.fetch=async url=>{hosts.push(new URL(String(url)).hostname);return Response.json({content:[{type:'text',text:'{}'}],stop_reason:'end_turn'});};
  t.after(()=>{globalThis.fetch=original;});
  assert.equal((await f.send('learn-course',{action:'brief',revision:0,brief:{audience:'Students',goal:'Understand models',knowledge:'Python',duration:'20 minutes'}})).status,200);
  await (await f.send('learn-course',{action:'draft',revision:1})).text();
  assert.ok(hosts.length&&hosts.every(host=>host==='api.anthropic.com'),hosts.join());
  assert.deepEqual(live.calls,[]);
  assert.equal(await aiSettings({},'team'),null);
});

// Scene-worker diagnosis (2026-10-01): repository import reaches the lesson-renderer Fly app through
// workerRequest with SCENE_WORKER_URL + SCENE_WORKER_TOKEN, both read on the dev worker that runs this file.
test('the indexer call carries the bearer token; an unconfigured indexer is refused before any row or request',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});const calls=[];
  globalThis.fetch=async(url,init)=>{calls.push({url:String(url),method:init.method,auth:init.headers.Authorization});return Response.json({repo:'example/project',defaultBranch:'main',branches:['main']});};
  const branches=await repositoriesFetch(new Request('https://dev.test/api/repositories/branches?url=https://github.com/example/project'),f.env,{});
  assert.equal(branches.status,200);
  assert.deepEqual(calls,[{url:'https://worker.test/repository-metadata',method:'POST',auth:'Bearer secret'}]);
  const rows=()=>f.sqlite.prepare('SELECT count(*) n FROM repository_apps').get().n,before=rows();
  for(const unset of ['SCENE_WORKER_TOKEN','SCENE_WORKER_URL']){
    const env={...f.env};delete env[unset];calls.length=0;
    const response=await repositoriesFetch(new Request('https://dev.test/api/repositories',{method:'POST',body:JSON.stringify({url:'https://github.com/example/project',branch:'main'})}),env,{});
    assert.equal(response.ok,false,unset);assert.deepEqual(calls,[],unset);assert.equal(rows(),before,unset);
  }
});
