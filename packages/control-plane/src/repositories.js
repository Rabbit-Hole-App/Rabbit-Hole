import { workerRequest } from './learn-scene.js';
import { NOT_TRASHED } from './library-trash.js';
import { canvasSeed, threadTurns } from './canvas-conversation.js';
import { validateLearnContext, validateCanvasTarget, appendCanvasTarget, appendOutline, readLearnSource } from './learn-ask-context.js';
import { handleLearnCourse, generateCourseContent } from './learn-course.js';
import { askStream, attachmentBlocks, readAskRequest, ATTACHMENT_LIMIT } from './ask.js';
import { askModel, MESSAGE_LIMIT, MENTION_LIMIT } from './learn-models.js';
import { LEARN_SYSTEM, LEARN_SNAPSHOT_SYSTEM, validateLessonSnapshot } from './learn-context.js';
import { REPOSITORY_TOOLS, REPOSITORY_SYSTEM, repositoryTool } from './repository-context.js';
import { readArxivPaper } from './arxiv.js';
import { uploadedMediaAsImage } from './learn-media.js';
import { uploadedPaperAsDocument } from './learn-paper.js';
import { readWikipedia } from './learn-wiki.js';
import { subscriptionOwnerRefusal, subscriptionCourseRefusal } from './subscription-transport.js';
import { videoMomentTools } from './learn-youtube.js';
import { devIdentity } from './dev-forwarding.js';
import { emptyBoard } from './canvases.js';
import { CANVAS_CONTEXT_RULES, CANVAS_PACKAGE_CHARS, canvasContextText, validateCanvasContext } from './canvas-context.js';
// A Learn ask's JSON (repositoriesFetch): 64 KB of its own fields, plus the canvas_context package at its cap, plus context_refs at
// their A2 worst case (20 refs x 2 KB without text + 32,000 characters of text, under 80,000 as JSON).
const ASK_JSON=64000+CANVAS_PACKAGE_CHARS+80000;

const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function parseRepository(value) {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.hostname!=='github.com'||url.port||url.username||url.password||url.search||url.hash) throw Error('Use a public https://github.com/owner/repository URL');
  const match=url.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)\/?$/);
  if(!match||[match[1],match[2]].some(v=>v==='.'||v==='..')) throw Error('Use the repository URL, without a branch or file path');
  return `${match[1]}/${match[2].replace(/\.git$/,'')}`;
}
// The indexer is the lesson-renderer Fly app. Each failure gets its own safe message and status, never 401:
// the web api() reads 401 as signed out (packages/web/src/api.js). Wiring: docs/features/learn-repositories.md.
const unavailable=(message,status=503)=>Object.assign(Error(message),{status});
const INDEXER_DOWN='Repository import is unavailable right now because the indexing service did not respond. Try again in a minute.';
async function repositoryMetadata(env, repo, options={}) {
  if(!/^https:\/\//i.test(env.SCENE_WORKER_URL||'')||!env.SCENE_WORKER_TOKEN)throw unavailable('Repository import is unavailable because the indexing service is not configured on this server.');
  const response=await workerRequest(env,'/repository-metadata',{repo,...options}).catch(()=>{throw unavailable(INDEXER_DOWN);});
  if([401,403].includes(response.status))throw unavailable('Repository import is unavailable because the indexing service rejected this server\'s credential.',502);
  if(response.status>=500)throw unavailable(INDEXER_DOWN);
  // Only the worker's own JSON carries a reason; a redirect or an HTML error page means it is not answering.
  const data=await response.json().catch(()=>null);if(!data)throw unavailable(INDEXER_DOWN);
  if(!response.ok)throw Error(data.error||'Public repository metadata unavailable');
  return data;
}
// {email, org, orgName} from production without side effects (dev-forwarding.js devIdentity).
export async function repositoryIdentity(req,env) {
  const user=await devIdentity(req,env); if(user instanceof Response) return user;
  const requested=req.headers.get('x-small-workspace');
  if(requested&&requested!==user.org)return json({error:'You are not a member of the requested workspace'},403);
  return user;
}
// A project's own fields beside its row, read and never stored on it (visibility-menu.md "Projects", owner 2026-10-09):
// its display name - the Main canvas board's title, renamed from the card or the project's header (null: the repository's
// name) - whether its repository is confirmed public, and the states its visibility is made of: the Main canvas board's
// link (on: unlisted, public view: public) and its live canvases (published: public, link on: unlisted, else private).
// Functions, not constants: library-trash.js imports this module, so NOT_TRASHED may not exist yet when it loads.
const IN_PROJECT=()=>`c.org=r.org AND c.owner_email=r.owner_email AND c.project=r.name AND c.archived_at IS NULL AND ${NOT_TRASHED('c.org','c.name')}`;
const PUBLISHED_CANVAS='EXISTS(SELECT 1 FROM canvas_publications p WHERE p.org=c.org AND p.canvas=c.name)';
const LINKED_CANVAS="EXISTS(SELECT 1 FROM learn_boards cb WHERE cb.org=c.org AND cb.owner_email=c.owner_email AND cb.app=c.name AND cb.board='main' AND cb.shared=1 AND cb.view_token IS NOT NULL)";
export const PROJECT_FIELDS=()=>`(SELECT b.title FROM learn_boards b WHERE b.org=r.org AND b.owner_email=r.owner_email AND b.app=r.name AND b.board='main') AS title,
  EXISTS(SELECT 1 FROM repository_visibility v WHERE v.app_id=r.id AND v.visibility='public') AS repo_public,
  (SELECT CASE WHEN b.shared=1 AND b.view_token IS NOT NULL THEN CASE WHEN b.public_view=1 THEN 'public' ELSE 'unlisted' END ELSE 'private' END FROM learn_boards b WHERE b.org=r.org AND b.owner_email=r.owner_email AND b.app=r.name AND b.board='main') AS main_access,
  (SELECT count(*) FROM canvases c WHERE ${IN_PROJECT()}) AS canvases_total,
  (SELECT count(*) FROM canvases c WHERE ${IN_PROJECT()} AND ${PUBLISHED_CANVAS}) AS canvases_public,
  (SELECT count(*) FROM canvases c WHERE ${IN_PROJECT()} AND NOT ${PUBLISHED_CANVAS} AND ${LINKED_CANVAS}) AS canvases_unlisted`;
// One visibility for the whole project when every part has the same one, else 'mixed'.
export function projectAccess(row){
  if(!row)return 'private';
  const states=new Set([row.main_access||'private']);
  if(row.canvases_public)states.add('public');
  if(row.canvases_unlisted)states.add('unlisted');
  if(row.canvases_total-row.canvases_public-row.canvases_unlisted>0)states.add('private');
  return states.size===1?[...states][0]:'mixed';
}
const projectFields=({main_access,canvases_total,canvases_public,canvases_unlisted,...row})=>main_access===undefined&&canvases_total===undefined?row
  :{...row,access:projectAccess({main_access,canvases_total,canvases_public,canvases_unlisted}),repo_public:!!row.repo_public};
export function repositoryApp(row,user) {
  row=projectFields(row);
  return {...row,kind:'repository',hosting:'repository',email:user.email,orgName:user.orgName,visibility:'domain',members:[],canView:true,canEdit:row.owner_email===user.email,
    repo_url:`https://github.com/${row.repo}`,repo_branch:row.branch,repo_commit:row.commit_sha,description:`Learn from ${row.repo}`,url:`/apps/${row.name}`,inputs:{},outputs:{},board_saved:!!row.board_saved};
}
// The caller's own projects (usage-credits.md §14, privacy P0): a shared email domain is not a
// shared Library. Nothing is shared explicitly yet, so owned is the whole personal Library.
export async function ownerRepositories(env,user){
  // The owner's @handle and display name by reference (docs/features/user-handles.md), as on canvas cards; never an email.
  // board_saved: its Learn main board (LearnPage boardPath /api/learn/boards/<repo>/main) is on the server (canvas-persistence.md, step 8).
  // canvas_count (docs/features/project-canvases.md): its Main canvas plus the owner's live canvases in it - the switcher's list.
  const {results}=await env.LEARN_DB.prepare(`SELECT r.*,(SELECT handle FROM user_handles WHERE email=r.owner_email) AS owner_handle,(SELECT name FROM user_profiles WHERE email=r.owner_email) AS owner_name,EXISTS(SELECT 1 FROM learn_boards b WHERE b.org=r.org AND b.owner_email=r.owner_email AND b.app=r.name AND b.board='main') AS board_saved,1+(SELECT count(*) FROM canvases c WHERE c.org=r.org AND c.owner_email=r.owner_email AND c.project=r.name AND c.archived_at IS NULL AND ${NOT_TRASHED('c.org','c.name')}) AS canvas_count,${PROJECT_FIELDS()} FROM repository_apps r WHERE r.org=? AND r.owner_email=? AND ${NOT_TRASHED('r.org','r.name')} ORDER BY r.created_at DESC`).bind(user.org,user.email).all();
  return results.map(row=>repositoryApp(row,user));
}
// D1 occasionally throws a transient internal error ("object to be reset");
// one retry absorbs it instead of failing the learner's request.
async function d1(run){try{return await run();}catch(error){if(!/D1_ERROR|object to be reset/i.test(String(error?.message)))throw error;await new Promise(resolve=>setTimeout(resolve,150));return run();}}
export async function repositoryAccess(req,env,name) {
  const user=await repositoryIdentity(req,env); if(user instanceof Response) return user;
  const row=await d1(()=>env.LEARN_DB.prepare('SELECT * FROM repository_apps WHERE org=? AND name=? AND owner_email=?').bind(user.org,name,user.email).first());
  return row?repositoryApp(row,user):json({error:'Repository not found in this workspace'},404);
}
export async function repositorySnapshot(env,app,commit=app.commit_sha) {
  const row=await d1(()=>env.LEARN_DB.prepare('SELECT storage_key FROM repository_versions WHERE app_id=? AND commit_sha=?').bind(app.id,commit).first());
  if(!row) throw Error('This repository version is not indexed yet');
  const object=await env.REPOSITORY_SNAPSHOTS.get(row.storage_key); if(!object) throw Error('Repository snapshot unavailable');
  return object.json();
}
// Visibility (docs/features/shared-canvas-ask.md): the metadata read is anonymous git ls-remote, so success confirms the
// repository public now, and the indexer refusing it (private now, gone, or the branch gone) makes it unknown, which a
// share treats as private. Best effort: a missing table leaves it unknown, never blocks an import.
const markVisibility=(env,app,known)=>env.LEARN_DB.prepare(known?"INSERT OR REPLACE INTO repository_visibility(app_id,visibility,checked_at) VALUES(?,'public',datetime('now'))":'DELETE FROM repository_visibility WHERE app_id=?').bind(app.id).run().catch(()=>{});
async function enqueue(env,app,repo,branch,resolved=null) {
  const head=resolved||await repositoryMetadata(env,repo,{branch}).catch(async error=>{if(!error.status)await markVisibility(env,app,false);throw error;});
  await markVisibility(env,app,true);
  if(!/^[a-f0-9]{40}$/.test(head.commit)) throw Error('GitHub returned an invalid commit');
  const actor=env.REPOSITORY_IMPORTS.get(env.REPOSITORY_IMPORTS.idFromName(String(app.id)));
  const response=await actor.fetch('https://index/start',{method:'POST',body:JSON.stringify({appId:app.id,repo,branch,commit:head.commit})});
  if(!response.ok) throw Error((await response.json()).error);
  return response.json();
}
export class RepositoryImports {
  constructor(state,env){this.state=state;this.env=env;}
  async fetch(req){
    return this.state.blockConcurrencyWhile(async()=>{
      const job=await req.json(), previous=await this.state.storage.get('job');
      if(previous&&['queued','indexing'].includes(previous.status)) return json({error:'An import is already running'},409);
      const cached=await this.env.LEARN_DB.prepare('SELECT storage_key FROM repository_versions WHERE app_id=? AND commit_sha=?').bind(job.appId,job.commit).first();
      if(cached){await this.env.LEARN_DB.prepare("UPDATE repository_apps SET commit_sha=?,branch=?,status='ready',error=NULL WHERE id=?").bind(job.commit,job.branch,job.appId).run();return json({status:'ready',commit:job.commit,reused:true});}
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({...job,attempt:crypto.randomUUID()})));
      job.key=[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join(''); job.status='queued';job.started=Date.now();
      await this.state.storage.put('job',job);
      await this.env.LEARN_DB.prepare("UPDATE repository_apps SET status='queued',error=NULL WHERE id=?").bind(job.appId).run();
      await this.state.storage.setAlarm(Date.now()+100);return json({status:'queued',commit:job.commit},202);
    });
  }
  async alarm(){
    const job=await this.state.storage.get('job');if(!job||!['queued','indexing'].includes(job.status))return;
    try{
      if(Date.now()-job.started>10*60*1000)throw Error('Indexing timed out. Retry the import.');
      if(job.status==='queued'){
        const r=await workerRequest(this.env,'/repositories',job);
        if(r.ok)job.status='indexing';else if(![429,502,503,504].includes(r.status))throw Error('Indexer rejected the request');
      }else{
        const r=await workerRequest(this.env,`/repositories/${job.key}`);
        if(r.status===404)job.status='queued';
        else if(r.ok){
          const result=await r.json();if(result.status==='failed')throw Error(result.error);
          if(result.status==='ready'){
            const asset=await workerRequest(this.env,`/repositories/${job.key}/asset`);if(!asset.ok)throw Error('Index download failed');
            const snapshot=await asset.json();
            if(snapshot.commit!==job.commit||snapshot.repo!==job.repo||!snapshot.graph?.nodes||!snapshot.files)throw Error('Invalid index result');
            const key=`learn-repositories-dev/${job.appId}/${job.commit}/graphify-0.9.63.json`;
            await this.env.REPOSITORY_SNAPSHOTS.put(key,JSON.stringify(snapshot),{httpMetadata:{contentType:'application/json'}});
            await this.env.LEARN_DB.prepare('INSERT OR IGNORE INTO repository_versions(app_id,commit_sha,storage_key) VALUES(?,?,?)').bind(job.appId,job.commit,key).run();
            await this.env.LEARN_DB.prepare("UPDATE repository_apps SET commit_sha=?,branch=?,status='ready',error=NULL WHERE id=?").bind(job.commit,job.branch,job.appId).run();job.status='ready';
          }
        }
      }
    }catch(error){
      if(Date.now()-job.started>10*60*1000||!/fetch|network|connection|timeout/i.test(error.message)){job.status='failed';job.error=error.message;}
    }
    await this.state.storage.put('job',job);
    if(job.status!=='ready')await this.env.LEARN_DB.prepare('UPDATE repository_apps SET status=?,error=? WHERE id=?').bind(job.status,job.error||null,job.appId).run();
    if(['queued','indexing'].includes(job.status))await this.state.storage.setAlarm(Date.now()+5000);
  }
}

export async function repositoriesFetch(req,env,ctx){
  const url=new URL(req.url),path=url.pathname;
  const user=await repositoryIdentity(req,env);if(user instanceof Response)return user;
  const db=env.LEARN_DB;
  try{
    if(!['GET','POST','PATCH','DELETE'].includes(req.method))return json({error:'Method not allowed'},405);
    // A Learn ask may carry the composer's + file (attachmentBlocks bounds it at 4 MB), and its JSON the canvas_context package
    // and context_refs beside its own 64 KB (ASK_JSON; repositoryAsk holds the rest to 64 KB). Every other request keeps 64 KB.
    const ask=req.method==='POST'&&/^\/api\/repositories\/[^/]+\/ask$/.test(path),upload=ask&&req.headers.get('content-type')?.includes('multipart/form-data'),cap=ask?ASK_JSON:64000;
    if(upload?Number(req.headers.get('content-length'))>ATTACHMENT_LIMIT+cap||(await req.clone().arrayBuffer()).byteLength>ATTACHMENT_LIMIT+cap:req.method!=='GET'&&(Number(req.headers.get('content-length'))>cap||(await req.clone().text()).length>cap))return json({error:upload?'Request exceeds 4 MB':`Request exceeds ${Math.round(cap/1000)} KB`},413);
    if(path==='/api/repositories/branches'){
      const repo=parseRepository(url.searchParams.get('url'));
      return json(await repositoryMetadata(env,repo,{page:Math.max(1,Math.min(100,Number(url.searchParams.get('page'))||1))}));
    }
    if(path==='/api/repositories'&&req.method==='POST'){
      const body=await req.json(),repo=parseRepository(body.url);
      if(typeof body.branch!=='string'||!body.branch.trim()||body.branch.length>250)throw Error('Choose a branch');
      const name=`repo-${crypto.randomUUID().slice(0,8)}-${repo.split('/')[1].toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,28)}`;
      // Confirm public visibility and branch before creating a project.
      const head=await repositoryMetadata(env,repo,{branch:body.branch});
      const count=await db.prepare('SELECT COUNT(*) AS n FROM repository_apps WHERE org=? AND owner_email=?').bind(user.org,user.email).first();if(count.n>=25)throw Error('You have reached the 25 repository preview limit');
      // With its Learn main board (canvases.js emptyBoard), in one batch: a project is never without one.
      await db.batch([db.prepare('INSERT INTO repository_apps(org,name,owner_email,repo,branch) VALUES(?,?,?,?,?)').bind(user.org,name,user.email,repo,body.branch),emptyBoard(db,user.org,user.email,name)]);
      const row=await db.prepare('SELECT * FROM repository_apps WHERE org=? AND name=?').bind(user.org,name).first();
      try{await enqueue(env,row,repo,body.branch,head);}catch(error){await db.prepare("UPDATE repository_apps SET status='failed',error=? WHERE id=?").bind(error.message,row.id).run();}
      return json({name},202);
    }
    const match=path.match(/^\/api\/repositories\/([^/]+)(?:\/(snapshot|refresh|learn-course|file|ask|threads))?(?:\/([^/]+))?$/);
    if(!match)return json({error:'Not found'},404);
    const row=await db.prepare(`SELECT r.*,${PROJECT_FIELDS()} FROM repository_apps r WHERE r.org=? AND r.name=? AND r.owner_email=?`).bind(user.org,match[1],user.email).first();if(!row)return json({error:'Repository not found in this workspace'},404);
    const app=repositoryApp(row,user),action=match[2];
    // Dev subscription mode: the dev worker routes these here before its own owner gate.
    if(env.SUBSCRIPTION_ONLY==='true'&&req.method==='POST'&&(action==='ask'||action==='learn-course')){
      const refused=subscriptionOwnerRefusal(env,user)||(action==='learn-course'&&subscriptionCourseRefusal(env,(await req.clone().json().catch(()=>null))?.action));
      if(refused)return refused;
    }
    // Rename (owner, 2026-10-09): the project's display name only - its Main canvas board's title; the repository stays its
    // provenance and its subtitle. Empty goes back to the repository's name.
    if(!action&&req.method==='PATCH'){
      if(req.headers.has('origin')&&req.headers.get('origin')!==url.origin)return json({error:'Invalid origin'},403);
      const body=await req.json().catch(()=>null);
      if(typeof body?.title!=='string'||body.title.trim().length>120)return json({error:'Use a name of up to 120 characters'},400);
      const title=body.title.trim()||null;
      await db.batch([emptyBoard(db,user.org,user.email,row.name),db.prepare("UPDATE learn_boards SET title=? WHERE org=? AND owner_email=? AND app=? AND board='main'").bind(title,user.org,user.email,row.name)]);
      return json(repositoryApp({...row,title},user));
    }
    if(!action)return req.method==='GET'?json(app):json({error:'Repository updates use the refresh action'},405);
    if(['snapshot'].includes(action)&&req.method!=='GET'||['file','ask'].includes(action)&&req.method!=='POST')return json({error:'Method not allowed'},405);
    if(action==='refresh'){
      if(req.method!=='POST')return json({error:'POST required'},405);
      if(!app.canEdit)return json({error:'Only the importer can refresh'},403);
      return json(await enqueue(env,app,app.repo,app.branch),202);
    }
    if(action==='learn-course')return handleLearnCourse(req,{...env,DB:db},user,app.name,{
      // org null: the default provider. A dev worker must not read a customer's org_ai row (their OpenAI key or Bedrock role) from production D1.
      generate:(_,__,context,instruction,system)=>generateCourseContent(env,null,context,instruction,system),
      appForUser:async()=>app,sourceSection:async()=>{
        const snapshot=await repositorySnapshot(env,app), overview=repositoryTool(snapshot,'get_repo_overview');
        const paths=[...new Set(['README.md',...overview.symbols.map(n=>n.path)].filter(p=>p&&Object.hasOwn(snapshot.files,p)))].slice(0,6);
        return {deployId:app.commit_sha,text:JSON.stringify({overview,source:paths.map(path=>repositoryTool(snapshot,'read_source',{path,start:1,end:120})),note:'Partial source; graph covers the indexed repository. Do not infer missing functionality.'})};
      }});
    if(action==='threads')return repositoryThreads(req,db,user,app,match[3]);
    const commit=url.searchParams.get('commit')||app.commit_sha;
    if(action==='snapshot'){
      const snapshot=await repositorySnapshot(env,app,commit);
      return json({repo:app.repo,commit:snapshot.commit,version:snapshot.version,graph:snapshot.graph,files:Object.entries(snapshot.files).map(([path,content])=>({path,lines:content.split('\n').length})),skipped:snapshot.skipped});
    }
    if(action==='file'){
      const body=await req.json(),snapshot=await repositorySnapshot(env,app,body.commit||commit);
      if(!Object.hasOwn(snapshot.files,body.path))return json({error:'File not in this snapshot'},404);
      return json({path:body.path,content:snapshot.files[body.path],commit:snapshot.commit});
    }
    if(action==='ask')return await repositoryAsk(req,env,user,app);
    return json({error:'Not found'},404);
  }catch(error){return json({error:error.message},error.status||400);}
}
// A node's conversation (owner, 2026-10-08; docs/features/inspector.md, Chat): one thread per learner, project, selected
// object and commit, in the same threads/messages tables as the project chat - no migration. Its scope_ref is
// `<app>#<object id>` (a graph node id, file:<path> or range:<path>:<a>-<b>), so the project's own listing (scope_ref = app)
// never shows it, and every read and write carries the same org, user and project-owner checks.
const NODE_KEY=/^[^\x00-\x1f]{1,400}$/;
export const nodeScope=(app,node)=>typeof node==='string'&&NODE_KEY.test(node)?`${app.name}#${node}`:null;
const nodeThread=(db,user,scopeRef,commit)=>db.prepare('SELECT * FROM threads WHERE org=? AND user=? AND scope_ref=? AND commit_sha=? ORDER BY created_at DESC, rowid DESC LIMIT 1').bind(user.org,user.email,scopeRef,commit).first();
export async function repositoryThreads(req,db,user,app,id){
  // ?node=<object id>&commit=<sha>: that object's saved conversation at that commit, or none.
  const query=new URL(req.url).searchParams;
  if(!id&&query.has('node')){
    const scopeRef=nodeScope(app,query.get('node')),commit=query.get('commit')||app.commit_sha;
    if(!scopeRef)return json({error:'Choose a node'},400);
    const thread=await nodeThread(db,user,scopeRef,commit);
    if(!thread)return json({id:null,messages:[],commit});
    const {results}=await db.prepare('SELECT role,content FROM messages WHERE thread_id=? ORDER BY id').bind(thread.id).all();
    return json({id:thread.id,messages:results,commit:thread.commit_sha});
  }
  // History (chat-workspace-CONTRACT.md A3): newest activity first, ?q= matches a title or any message, ?limit=1..50.
  if(!id){
    const q=(query.get('q')||'').trim().slice(0,200),limit=Math.min(50,Math.max(1,Number.parseInt(query.get('limit'),10)||30)),like=`%${q.replace(/[\\%_]/g,c=>`\\${c}`)}%`;
    const list=state=>{const activity=state?'COALESCE(st.last_activity_at,t.created_at)':'t.created_at';return db.prepare(`SELECT t.id,t.title,t.created_at,t.commit_sha,${activity} AS activity,(SELECT substr(content,1,400) FROM messages WHERE thread_id=t.id ORDER BY id DESC LIMIT 1) AS latest FROM threads t${state?' LEFT JOIN chat_thread_state st ON st.thread_id=t.id':''} WHERE t.org=? AND t.user=? AND t.scope_ref=?${q?" AND (t.title LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM messages s WHERE s.thread_id=t.id AND s.content LIKE ? ESCAPE '\\'))":''} ORDER BY datetime(${activity}) DESC, t.rowid DESC LIMIT ?`).bind(user.org,user.email,app.name,...(q?[like,like]:[]),limit).all();};
    const {results}=await withoutChatTables(()=>list(true),()=>list(false));
    return json({threads:results.map(({activity,latest,...t})=>({...t,createdAt:isoTime(t.created_at),lastActivityAt:isoTime(activity),preview:(latest||'').replace(/\s+/g,' ').trim().slice(0,140)}))});
  }
  const thread=await db.prepare('SELECT * FROM threads WHERE id=? AND org=? AND user=? AND scope_ref=?').bind(id,user.org,user.email,app.name).first();if(!thread)return json({error:'Chat not found'},404);
  if(req.method==='DELETE'){
    // Feedback first: it finds its rows through the messages it belongs to.
    const base=()=>[db.prepare('DELETE FROM messages WHERE thread_id=?').bind(id),db.prepare('DELETE FROM threads WHERE id=?').bind(id)];
    await withoutChatTables(()=>db.batch([db.prepare('DELETE FROM chat_message_feedback WHERE message_id IN (SELECT id FROM messages WHERE thread_id=?)').bind(id),db.prepare('DELETE FROM chat_message_meta WHERE thread_id=?').bind(id),db.prepare('DELETE FROM chat_thread_state WHERE thread_id=?').bind(id),...base()]),()=>db.batch(base()));
    return json({ok:true});
  }
  if(req.method==='PATCH'){const {title}=await req.json();if(typeof title!=='string'||!title.trim()||title.length>120)throw Error('Invalid chat title');await db.prepare('UPDATE threads SET title=? WHERE id=?').bind(title,id).run();return json({ok:true});}
  // Restore (A2): the thread's mode, attached refs and draft, and its messages with Part B's meta and this user's feedback.
  const rows=full=>db.prepare(`SELECT m.id,m.role,m.content,g.graph_json${full?',cm.meta_json,cm.alternative_of,f.rating,f.reason':''} FROM messages m LEFT JOIN repository_message_graphs g ON g.message_id=m.id${full?' LEFT JOIN chat_message_meta cm ON cm.message_id=m.id LEFT JOIN chat_message_feedback f ON f.message_id=m.id AND f.user=?':''} WHERE m.thread_id=? ORDER BY m.id`).bind(...(full?[user.email]:[]),id).all();
  const [{results},state]=await Promise.all([withoutChatTables(()=>rows(true),()=>rows(false)),withoutChatTables(()=>db.prepare('SELECT mode,context_json,draft_json FROM chat_thread_state WHERE thread_id=?').bind(id).first(),()=>null)]);
  const contextRefs=parsed(state?.context_json);
  return json({id,title:thread.title,mode:CHAT_MODES.includes(state?.mode)?state.mode:'auto',contextRefs:Array.isArray(contextRefs)?contextRefs:[],draft:parsed(state?.draft_json),messages:threadMessages(results),commit:thread.commit_sha});
}
// The chat workspace's side tables (learn-migrations 0019: chat_message_meta, chat_message_feedback, chat_thread_state).
// A database without them answers as before (plain messages, created_at order); nothing here ever creates them.
export const CHAT_MODES=['auto','ask','tutor'];
const withoutChatTables=async(read,fallback)=>{try{return await read();}catch(error){if(/no such table/i.test(error?.message||''))return fallback();throw error;}};
const parsed=text=>{try{return text?JSON.parse(text):null;}catch{return null;}};
const isoTime=value=>value&&!value.includes('T')?`${value.replace(' ','T')}Z`:value||null;
// Rows oldest first. A turn's regenerated answers (alternative_of = its first answer) collapse to the newest, in the first
// answer's place, with every answer of the turn in meta.alternatives (B2). A message without a meta row is an old one:
// plain and done, nothing invented; only a rating given to it since comes back, as meta.feedback.
export function threadMessages(rows){
  const turnOf=row=>String(row.alternative_of??row.id),turns=new Map(),shown=new Set(),messages=[];
  for(const row of rows)if(row.role==='assistant'&&row.meta_json)turns.set(turnOf(row),[...(turns.get(turnOf(row))||[]),row]);
  for(const row of rows){
    const turn=row.role==='assistant'&&row.meta_json?turns.get(turnOf(row)):null;
    if(turn&&shown.has(turnOf(row)))continue;
    if(turn)shown.add(turnOf(row));
    const {id,role,content,graph_json,meta_json,alternative_of,rating,reason}=turn?turn.at(-1):row,meta=parsed(meta_json),feedback=rating?{rating,reason:reason??null}:null;
    const message={messageId:String(id),role,content,status:'done',...(graph_json?{graph:JSON.parse(graph_json)}:{})};
    if(role==='user'&&meta)messages.push({...message,...(CHAT_MODES.includes(meta.mode)?{mode:meta.mode}:{}),command:meta.command??null,contextRefs:Array.isArray(meta.contextRefs)?meta.contextRefs:[]});
    else if(role==='assistant'&&meta){const {kind,status,...rest}=meta;messages.push({...message,status:status==='stopped'?'stopped':'done',...(kind?{kind}:{}),meta:{...rest,alternativeOf:alternative_of==null?null:String(alternative_of),alternatives:turn.map(r=>String(r.id)),feedback}});}
    else messages.push(role==='assistant'&&feedback?{...message,meta:{feedback}}:message);
  }
  return messages;
}
// A selected line range, read from stored source. A large one keeps its identity (repository-browser.md, owner brief §10):
// the stored question names every selected line, and only the first 120 ride along, with a note; the model reads the rest
// with read_source. A range past the file's end is refused, never clamped into a different selection.
function selectedRange(snapshot,{path,start,end}){
  const code=repositoryTool(snapshot,'read_source',{path,start,end:Number.isInteger(end)?Math.min(end,start+119):end});
  if(end>code.totalLines)throw Error('Choose a valid range of lines in this file');
  return end>code.end?{...code,selectedEnd:end,note:`The learner selected lines ${start}-${end} (${end-start+1} lines). Only lines ${start}-${code.end} are included here; read the rest with read_source.`}:code;
}
async function repositoryAsk(req,env,user,app){
  const {body,file}=await readAskRequest(req);
  // The ask's own fields keep 64 KB; the canvas package is bounded by its validator and context_refs by ASK_JSON.
  const {canvas_context:_canvas,context_refs:_refs,...own}=body;
  if(JSON.stringify(own).length>64000)return json({error:'Request exceeds 64 KB'},413);
  const canvas=body.canvas_context==null?null:validateCanvasContext(body.canvas_context);
  const seed=canvasSeed(body);
  if(typeof body.message!=='string'||!body.message.trim()||body.message.length>MESSAGE_LIMIT)throw Error('Question must be 1–4000 characters');
  if(body.lesson_snapshot)validateLessonSnapshot(body.lesson_snapshot);
  const videoContext=validateLearnContext(body,'learn'),canvasTarget=validateCanvasTarget(body.canvas_target,'learn');
  const db=env.LEARN_DB;
  // A node question (body.node) joins that node's own thread at the context's commit, found on the server, so the
  // conversation stays with the node whatever the learner selects while it streams; anything else is the project's chat.
  if(body.node!==undefined&&!nodeScope(app,body.node))return json({error:'Choose a node'},400);
  const scopeRef=body.node!==undefined?nodeScope(app,body.node):app.name;
  let thread=body.thread_id?await db.prepare('SELECT * FROM threads WHERE id=? AND org=? AND user=? AND scope_ref=?').bind(body.thread_id,user.org,user.email,scopeRef).first()
    :body.node!==undefined?await nodeThread(db,user,scopeRef,body.repository_context?.commit||app.commit_sha):null;
  if(body.thread_id&&!thread)return json({error:'Chat not found'},404);
  const commit=thread?.commit_sha||body.repository_context?.commit||app.commit_sha;
  if(thread&&(body.repository_context?.nodeId||body.repository_context?.range||body.repository_context?.path)&&body.repository_context?.commit!==commit)return json({error:'This chat uses an earlier commit. Start a new chat to ask about the selected code.'},409);
  const snapshot=await repositorySnapshot(env,app,commit);
  const selected=body.repository_context?.nodeId?repositoryTool(snapshot,'get_relationships',{nodeId:body.repository_context.nodeId}):null;
  const selectedCode=body.repository_context?.range?selectedRange(snapshot,body.repository_context.range):null;
  // A whole file in the composer's context (workspace-dock.md): its opening lines and length, never a line selection, so no
  // 'Selected code' suffix is stored with the question; the model reads further with read_source.
  const selectedFile=!selected&&!selectedCode&&typeof body.repository_context?.path==='string'?repositoryTool(snapshot,'read_source',{path:body.repository_context.path}):null;
  let graphView=null;
  // The video-moment tools ride here too: a repository canvas is the main
  // Learn surface, and the show_video bargain is the same on it - a window
  // only from passages read this answer (or a trusted hot candidate).
  const videos=videoMomentTools(env,user.org);
  const runTool=async(name,input)=>{
    const video=await videos.run(name,input);if(video!==undefined)return video;
    const result=repositoryTool(snapshot,name,input);
    if(['explain_symbol','get_relationships','find_connection_path','query_graph'].includes(name)&&result.edges&&(!result.status||result.status==='found')){
      const nodes=result.nodes||(result.node?[result.node,...result.neighbors]:[]);
      if(nodes.length)graphView={id:crypto.randomUUID(),commit,kind:name,title:name==='find_connection_path'?`${input.from} → ${input.to}`:name==='query_graph'?input.query:result.node?.label||'Connections',nodes:nodes.map(n=>({...n,commit})),edges:result.edges};
    }
    return result;
  };
  const question=selectedCode?`${body.message}\n\nSelected code: ${selectedCode.path}:${selectedCode.start}-${selectedCode.selectedEnd||selectedCode.end} (commit ${commit})`:body.message;
  const extraBlocks=[],papers=[];
  // A file from the composer's +: an image or PDF as a block, anything else as text.
  if(file)extraBlocks.push(...(await attachmentBlocks(file)).blocks);
  // @-mentioned repositories in this workspace ride as their overview (files and
  // most connected symbols); at most three. A mention not read says so, as on chat asks.
  const mentioned=[],notRead=[];
  for(const [index,name] of (Array.isArray(body.mentions)?body.mentions:[]).filter(n=>typeof n==='string'&&n!==app.name).entries()){
    const row=index<MENTION_LIMIT?await db.prepare('SELECT * FROM repository_apps WHERE org=? AND name=? AND owner_email=?').bind(user.org,name,user.email).first():null;
    if(!row?.commit_sha){notRead.push(`Mentioned app ${name}: not available to this chat${index<MENTION_LIMIT?'':` (a question reads at most ${MENTION_LIMIT} mentioned apps)`}.`);continue;}
    mentioned.push({name,...repositoryTool(await repositorySnapshot(env,repositoryApp(row,user)),'get_repo_overview')});
  }
  // The one attached source (paper, image, article or watched video) as chat asks read it; the
  // outline and article are context text only here, with no outline or Wikipedia tools.
  let source;
  try{source=await readLearnSource(env,body,app,{extraBlocks,papers,foundVideos:videos.found,videoContext,wikiTool:false},{readArxivPaper,uploadedPaperAsDocument,uploadedMediaAsImage,readWikipedia});}
  catch(error){return json({error:error.message},502);}
  const id=thread?.id||`repochat-${crypto.randomUUID()}`;
  if(!thread)await db.prepare('INSERT INTO threads(id,org,user,scope_ref,commit_sha,title) VALUES(?,?,?,?,?,?)').bind(id,user.org,user.email,scopeRef,commit,body.message.slice(0,120)).run();
  const history=await threadTurns(db,id,seed,question);
  // Whole-canvas context (canvas-context.js): the same block and rules as /api/learn/ask, on every ask that sends it.
  const board=canvas?`\n\n${canvasContextText(canvas)}`:'',rules=canvas?`\n${CANVAS_CONTEXT_RULES}`:'';
  return askStream(env,appendCanvasTarget(appendOutline(JSON.stringify({repo:app.repo,commit,selected,selectedCode,...(selectedFile?{selectedFile}:{}),lesson:body.lesson_snapshot||null,paper:null,...source,...(mentioned.length?{mentionedRepositories:mentioned}:{})})+notRead.map(line=>`\n\n${line}`).join(''),body.outline),canvasTarget)+board,history,question,
    async answer=>{const message=await db.prepare('INSERT INTO messages(thread_id,role,content) VALUES(?,?,?) RETURNING id').bind(id,'assistant',answer).first();if(graphView)await db.prepare('INSERT INTO repository_message_graphs(message_id,graph_json) VALUES(?,?)').bind(message.id,JSON.stringify(graphView)).run();},{threadId:id,commit},extraBlocks,null,askModel(body.model),null,
    (body.lesson_snapshot?LEARN_SNAPSHOT_SYSTEM:LEARN_SYSTEM)+rules,{papers,system:[REPOSITORY_SYSTEM,videos.system].filter(Boolean).join('\n'),tools:[...REPOSITORY_TOOLS,...videos.tools],runTool,getGraphView:()=>graphView,shownVideo:videos.shown,org:user.org});
}

export async function repositoryEvidence(env,app,input){
  const snapshot=await repositorySnapshot(env,app,input.repository_context?.commit||app.commit_sha),ranges=[];
  // Resolve cited ranges against stored source; previous assistant text is not evidence itself.
  for(const match of input.answer.matchAll(/([A-Za-z0-9_./-]+\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?/g)){
    if(Object.hasOwn(snapshot.files,match[1])){
      const start=Number(match[2]),end=Math.min(Number(match[3]||start+30),start+119);
      try{ranges.push(repositoryTool(snapshot,'read_source',{path:match[1],start,end}));}catch{}
    }
    if(ranges.length===3)break;
  }
  return {repo:snapshot.repo,commit:snapshot.commit,source:ranges,note:'These are verified ranges from the indexed commit. Do not infer source behavior beyond them.'};
}
