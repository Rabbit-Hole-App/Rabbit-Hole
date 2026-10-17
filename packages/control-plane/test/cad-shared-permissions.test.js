// Real SQLite board/reference permissions against the integrated CAD candidate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {learnDb} from './learn-grade-fixture.js';
const root=process.env.CAD_IMPLEMENTATION_DIR;
const source=name=>root?pathToFileURL(resolve(root,'packages/control-plane/src',name)).href:new URL('../src/'+name,import.meta.url).href;
const {learnBoardsRoute}=await import(source('learn-boards.js'));
const {authorizeFileSource}=await import(source('file-access.js'));
const {cadRoute}=await import(source('cad-jobs.js'));
const {newCadId}=await import(source('cad-contract.js'));
const PEOPLE = { owner: { email: 'owner@test', org: 'team' }, friend: { email: 'friend@elsewhere', org: 'elsewhere' } };
const OWN = '/api/learn/boards/demo-app/main';
const FRIEND_CANVAS = 'canvas-0f0f0f0f';

function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS canvases (id INTEGER PRIMARY KEY, org TEXT NOT NULL, name TEXT NOT NULL, owner_email TEXT NOT NULL, title TEXT NOT NULL, project TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT, device_id TEXT, UNIQUE(org,name))`);
  sqlite.prepare("INSERT INTO canvases(org,name,owner_email,title) VALUES('elsewhere',?,'friend@elsewhere','Mine')").run(FRIEND_CANVAS);
  const CONTROL_PLANE = {
    fetch: async request => {
      const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
      if (!who) return new Response('sign in', { status: 401 });
      const path = new URL(request.url).pathname;
      if (path === '/api/me') return Response.json(who);
      if (path === '/api/apps/demo-app' && who === PEOPLE.owner) return Response.json({ name: 'demo-app', ...who });
      return new Response('no', { status: 404 });
    },
  };
  const env = { CAD_JOBS:{idFromName:id=>id,get:()=>({fetch:async()=>{throw Error('Shared viewer reached private CAD history');}})}, LEARN_DB, CONTROL_PLANE, LEARN_MEDIA: { put: async () => {}, get: async () => null, list: async () => ({ objects: [] }), delete: async () => {} } };
  const request = as => new Request('https://dev.test/x', { headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) } });
  const call = async (method, path, as, body) => {
    const response = await learnBoardsRoute(path, new Request(`https://dev.test${path}`, { method, headers: { 'Content-Type': 'application/json', cookie: `small_session=${as}` }, body: JSON.stringify(body) }), env);
    return { status: response.status, body: await response.json() };
  };
  const source = (id, owner = PEOPLE.owner, status = 'stored') => sqlite.prepare(`INSERT INTO file_sources (id, org, owner_email, app, family, name, media_type, bytes, sha256, r2_key, status, created_at)
    VALUES (?, ?, ?, 'demo-app', 'video', 'clip.mp4', 'video/mp4', 10, 'abc', ?, ?, 1)`).run(id, owner.org, owner.email, `file-sources/${id}/original`, status);
  const refs = () => sqlite.prepare('SELECT source_id, board_id FROM file_source_refs ORDER BY source_id, board_id').all().map(r => `${r.source_id}@${r.board_id}`);
  const rowOf = (org, email, app) => sqlite.prepare("SELECT * FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ? AND board = 'main'").get(org, email, app);
  return { env, request, call, source, refs, rowOf, sqlite };
}

const state=blocks=>({blocks,shapes:[],items:[],links:[],strokes:[],exchanges:[]});
const cad=(source='fs_model')=>({id:'cad-card',type:'cad',jobId:'original-private-job',modelId:'original-model',revisionId:'r1',status:'ready',fileRef:{source:{id:source}},manifest:{schema:'cad-model/1',revisionId:'r1',sourceId:source,artifacts:[{kind:'step',url:`/api/learn/files/${source}/d/fd_step`}]}});
test('CAD shared saved snapshot cannot list or retrieve private live job history',async t=>{
 const f=setup(t);f.source('fs_model');await f.call('PUT',OWN,'owner',{state:state([cad()])});
 const links=(await f.call('POST',OWN+'/share','owner',{shared:true,view:true})).body.sharing;
 const original=f.rowOf('team','owner@test','demo-app');
 for(const path of ['/api/learn/cad/jobs',`/api/learn/cad/jobs/${newCadId(original.id)}`]){
  const req=new Request(`https://dev.test${path}?share=${links.view}`,{headers:{cookie:'small_session=friend'}});
  const response=await cadRoute(path,req,f.env);assert.equal(response.status,403);const body=await response.json();assert.ok(!body.job&&!body.jobs&&!body.blocks);assert.match(body.error,/saved artifacts/);
 }
 assert.equal((await authorizeFileSource(f.request('friend'),f.env,'fs_model',{token:links.view})).via,'link','denying live history preserves saved artifacts');
});
test('CAD fork is detached and inherits only genuine saved artifact references',async t=>{
 const f=setup(t);f.source('fs_model');f.source('fs_unrelated');f.source('fs_foreign',PEOPLE.friend);
 await f.call('PUT',OWN,'owner',{state:state([cad(),{...cad('fs_foreign'),id:'forged'}])});
 const links=(await f.call('POST',OWN+'/share','owner',{shared:true,view:true})).body.sharing;
 assert.equal((await authorizeFileSource(f.request('friend'),f.env,'fs_foreign',{token:links.view})).status,404,'a forged source id never grants access');
 assert.equal((await authorizeFileSource(f.request('friend'),f.env,'fs_unrelated',{token:links.view})).status,404,'another private CAD revision is not in the saved board');
 const forked=await f.call('POST','/api/learn/boards/fork','friend',{source:{token:links.view},request_id:'cad-fork'});assert.equal(forked.status,201);
 const fork=f.rowOf('elsewhere','friend@elsewhere',forked.body.name),copied=JSON.parse(fork.state_json).blocks[0];
 assert.equal(copied.cadDetached,true);assert.equal(copied.jobId,undefined);assert.equal(copied.modelId,undefined);assert.equal(copied.manifest.revisionId,'r1');
 assert.equal((await authorizeFileSource(f.request('friend'),f.env,'fs_model',{row:fork})).via,'board');
 assert.equal((await authorizeFileSource(f.request('friend'),f.env,'fs_unrelated',{row:fork})).status,404);
});
test('CAD shared artifact access ends when link is revoked',async t=>{
 const f=setup(t);f.source('fs_model');await f.call('PUT',OWN,'owner',{state:state([cad()])});
 const links=(await f.call('POST',OWN+'/share','owner',{shared:true,view:true})).body.sharing;
 assert.equal((await authorizeFileSource(f.request('friend'),f.env,'fs_model',{token:links.view})).via,'link');
 await f.call('POST',OWN+'/share','owner',{shared:false});
 assert.equal((await authorizeFileSource(f.request('friend'),f.env,'fs_model',{token:links.view})).status,404);
});
