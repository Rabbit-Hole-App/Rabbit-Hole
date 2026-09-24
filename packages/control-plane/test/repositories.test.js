import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { parseRepository, repositoriesFetch, repositoryAccess, RepositoryImports } from '../src/repositories.js';
import { repositoryTool, REPOSITORY_TOOLS } from '../src/repository-context.js';
import { researchAnswer } from '../src/learn-research.js';

const sha='a'.repeat(40), newer='b'.repeat(40);
const snapshot={repo:'example/project',commit:sha,version:'graphifyy-0.9.63-small-1',files:{'model.py':'class Model:\n    def forward(self, x):\n        return x + 1','README.md':'A model'},skipped:[],graph:{nodes:[{id:'model',label:'Model',path:'model.py',line:1},{id:'forward',label:'forward()',path:'model.py',line:2}],edges:[{source:'model',target:'forward',relation:'contains',confidence:'EXTRACTED'}]}};
function fixture(t){
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());sqlite.exec(readFileSync(new URL('../repository-schema.sql',import.meta.url),'utf8'));
  sqlite.exec(`INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(1,'team','repo-example','owner@test','example/project','main','${sha}','ready'); INSERT INTO repository_versions VALUES(1,'${sha}','snapshot',datetime('now'));`);
  const db={prepare:sql=>{let args=[];const stmt=sqlite.prepare(sql);return{bind(...v){args=v;return this;},first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:stmt.run(...args)})};},batch:async statements=>Promise.all(statements.map(s=>s.run()))};
  const assets=new Map([['snapshot',snapshot]]),data=new Map();
  const env={LEARN_DB:db,SCENE_WORKER_URL:'https://worker.test',SCENE_WORKER_TOKEN:'secret',CONTROL_PLANE:{fetch:async req=>req.headers.get('cookie')==='denied'?new Response('',{status:401}):Response.json({org:req.headers.get('x-small-workspace')||'team',email:req.headers.get('x-email')||'owner@test',apps:[]})},RUNS:{get:async k=>assets.has(k)?{json:async()=>typeof assets.get(k)==='string'?JSON.parse(assets.get(k)):assets.get(k)}:null,put:async(k,v)=>assets.set(k,v)}};
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
  assert.equal((await f.send('refresh',{}, {'x-email':'viewer@test'})).status,403);
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
  assert.equal((await f.send('learn-course',{action:'approve',revision:1},{'x-email':'viewer@test'})).status,403);
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

test('graph answers stream an exact view and retain it with the saved answer',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let calls=0;
  globalThis.fetch=async()=>Response.json(++calls===1?{content:[{type:'tool_use',id:'path',name:'find_connection_path',input:{from:'Model',to:'forward'}}]}:{content:[{type:'text',text:'Model contains forward (EXTRACTED).'}],stop_reason:'end_turn'});
  const response=await f.send('ask',{message:'How does Model connect to forward?'}),events=await response.text();
  assert.match(events,/event: graph/);assert.match(events,/EXTRACTED/);
  const id=f.sqlite.prepare('SELECT id FROM threads').get().id;
  const saved=await(await f.send(`threads/${id}`)).json(),answer=saved.messages.find(m=>m.role==='assistant');
  assert.equal(answer.graph.commit,sha);assert.deepEqual(answer.graph.nodes.map(n=>n.id),['model','forward']);assert.equal(answer.graph.edges[0].relation,'contains');
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
  assert.deepEqual([...new Set(seen)],['GET /api/apps']); // 16.4: identity read only
  assert.deepEqual([...hosts],['worker.test']);
  assert.equal(f.sqlite.prepare('SELECT status FROM repository_apps WHERE id=?').get(row.id).status,'ready');
});
