import { workerRequest } from './learn-scene.js';
import { canvasSeed, threadTurns } from './canvas-conversation.js';
import { handleLearnCourse, generateCourseContent } from './learn-course.js';
import { askStream, attachmentBlocks, readAskRequest } from './ask.js';
import { askModel, MESSAGE_LIMIT, MENTION_LIMIT } from './learn-models.js';
import { LEARN_SYSTEM, LEARN_SNAPSHOT_SYSTEM, validateLessonSnapshot } from './learn-context.js';
import { REPOSITORY_TOOLS, REPOSITORY_SYSTEM, repositoryTool } from './repository-context.js';
import { readArxivPaper, paperDocument } from './arxiv.js';
import { paperSelectionImage } from './learn-preview-review.js';
import { isUploadedMediaId, uploadedMediaAsImage } from './learn-media.js';
import { paperIdentity, PAPER_PAGE_LIMIT } from './learn-paper.js';
import { subscriptionOwnerRefusal, subscriptionCourseRefusal } from './subscription-transport.js';
import { videoMomentTools } from './learn-youtube.js';

const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function parseRepository(value) {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.hostname!=='github.com'||url.port||url.username||url.password||url.search||url.hash) throw Error('Use a public https://github.com/owner/repository URL');
  const match=url.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)\/?$/);
  if(!match||[match[1],match[2]].some(v=>v==='.'||v==='..')) throw Error('Use the repository URL, without a branch or file path');
  return `${match[1]}/${match[2].replace(/\.git$/,'')}`;
}
async function repositoryMetadata(env, repo, options={}) {
  const response=await workerRequest(env,'/repository-metadata',{repo,...options});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Public repository metadata unavailable');
  return data;
}
export async function repositoryIdentity(req,env) {
  const url=new URL(req.url); url.pathname='/api/apps'; url.search='';
  const response=await env.CONTROL_PLANE.fetch(new Request(url,{headers:req.headers,redirect:'manual'}));
  if(!response.ok||!response.headers.get('content-type')?.includes('json')) return json({error:'Sign in to this workspace first'},response.status===403?403:401);
  const catalog=await response.json();
  if(!catalog.org||!catalog.email) return json({error:'Workspace membership required'},403);
  const requested=req.headers.get('x-small-workspace');
  if(requested&&requested!==catalog.org)return json({error:'You are not a member of the requested workspace'},403);
  return catalog;
}
export function repositoryApp(row,user) {
  return {...row,kind:'repository',hosting:'repository',email:user.email,orgName:user.orgName,visibility:'domain',members:[],canView:true,canEdit:row.owner_email===user.email,
    repo_url:`https://github.com/${row.repo}`,repo_branch:row.branch,repo_commit:row.commit_sha,description:`Learn from ${row.repo}`,url:`/apps/${row.name}`,inputs:{},outputs:{}};
}
// D1 occasionally throws a transient internal error ("object to be reset");
// one retry absorbs it instead of failing the learner's request.
async function d1(run){try{return await run();}catch(error){if(!/D1_ERROR|object to be reset/i.test(String(error?.message)))throw error;await new Promise(resolve=>setTimeout(resolve,150));return run();}}
export async function repositoryAccess(req,env,name) {
  const user=await repositoryIdentity(req,env); if(user instanceof Response) return user;
  const row=await d1(()=>env.LEARN_DB.prepare('SELECT * FROM repository_apps WHERE org=? AND name=?').bind(user.org,name).first());
  return row?repositoryApp(row,user):json({error:'Repository not found in this workspace'},404);
}
export async function repositorySnapshot(env,app,commit=app.commit_sha) {
  const row=await d1(()=>env.LEARN_DB.prepare('SELECT storage_key FROM repository_versions WHERE app_id=? AND commit_sha=?').bind(app.id,commit).first());
  if(!row) throw Error('This repository version is not indexed yet');
  const object=await env.REPOSITORY_SNAPSHOTS.get(row.storage_key); if(!object) throw Error('Repository snapshot unavailable');
  return object.json();
}
async function enqueue(env,app,repo,branch,resolved=null) {
  const head=resolved||await repositoryMetadata(env,repo,{branch});
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
    if(req.method!=='GET'&&(Number(req.headers.get('content-length'))>64000||(await req.clone().text()).length>64000))return json({error:'Request exceeds 64 KB'},413);
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
      const count=await db.prepare('SELECT COUNT(*) AS n FROM repository_apps WHERE org=?').bind(user.org).first();if(count.n>=25)throw Error('This workspace has reached the 25 repository preview limit');
      const row=await db.prepare('INSERT INTO repository_apps(org,name,owner_email,repo,branch) VALUES(?,?,?,?,?) RETURNING *').bind(user.org,name,user.email,repo,body.branch).first();
      try{await enqueue(env,row,repo,body.branch,head);}catch(error){await db.prepare("UPDATE repository_apps SET status='failed',error=? WHERE id=?").bind(error.message,row.id).run();}
      return json({name},202);
    }
    const match=path.match(/^\/api\/repositories\/([^/]+)(?:\/(snapshot|refresh|learn-course|file|ask|threads))?(?:\/([^/]+))?$/);
    if(!match)return json({error:'Not found'},404);
    const row=await db.prepare('SELECT * FROM repository_apps WHERE org=? AND name=?').bind(user.org,match[1]).first();if(!row)return json({error:'Repository not found in this workspace'},404);
    const app=repositoryApp(row,user),action=match[2];
    // Dev subscription mode: the dev worker routes these here before its own owner gate.
    if(env.SUBSCRIPTION_ONLY==='true'&&req.method==='POST'&&(action==='ask'||action==='learn-course')){
      const refused=subscriptionOwnerRefusal(env,user)||(action==='learn-course'&&subscriptionCourseRefusal(env,(await req.clone().json().catch(()=>null))?.action));
      if(refused)return refused;
    }
    if(!action)return req.method==='GET'?json(app):json({error:'Repository updates use the refresh action'},405);
    if(['snapshot'].includes(action)&&req.method!=='GET'||['file','ask'].includes(action)&&req.method!=='POST')return json({error:'Method not allowed'},405);
    if(action==='refresh'){
      if(req.method!=='POST')return json({error:'POST required'},405);
      if(!app.canEdit)return json({error:'Only the importer can refresh'},403);
      return json(await enqueue(env,app,app.repo,app.branch),202);
    }
    if(action==='learn-course')return handleLearnCourse(req,{...env,DB:db},user,app.name,{
      generate:(_,org,context,instruction,system)=>generateCourseContent(env,org,context,instruction,system),
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
  }catch(error){return json({error:error.message},400);}
}
export async function repositoryThreads(req,db,user,app,id){
  if(!id){const {results}=await db.prepare('SELECT id,title,created_at,commit_sha FROM threads WHERE org=? AND user=? AND scope_ref=? ORDER BY created_at DESC LIMIT 20').bind(user.org,user.email,app.name).all();return json({threads:results});}
  const thread=await db.prepare('SELECT * FROM threads WHERE id=? AND org=? AND user=? AND scope_ref=?').bind(id,user.org,user.email,app.name).first();if(!thread)return json({error:'Chat not found'},404);
  if(req.method==='DELETE'){await db.batch([db.prepare('DELETE FROM messages WHERE thread_id=?').bind(id),db.prepare('DELETE FROM threads WHERE id=?').bind(id)]);return json({ok:true});}
  if(req.method==='PATCH'){const {title}=await req.json();if(typeof title!=='string'||!title.trim()||title.length>120)throw Error('Invalid chat title');await db.prepare('UPDATE threads SET title=? WHERE id=?').bind(title,id).run();return json({ok:true});}
  const {results}=await db.prepare('SELECT m.role,m.content,g.graph_json FROM messages m LEFT JOIN repository_message_graphs g ON g.message_id=m.id WHERE m.thread_id=? ORDER BY m.id').bind(id).all();return json({id,messages:results.map(({graph_json,...m})=>({...m,...(graph_json?{graph:JSON.parse(graph_json)}:{})})),commit:thread.commit_sha});
}
async function repositoryAsk(req,env,user,app){
  const {body,file}=await readAskRequest(req);
  const seed=canvasSeed(body);
  if(typeof body.message!=='string'||!body.message.trim()||body.message.length>MESSAGE_LIMIT)throw Error('Question must be 1–4000 characters');
  if(body.lesson_snapshot)validateLessonSnapshot(body.lesson_snapshot);
  const db=env.LEARN_DB;
  let thread=body.thread_id?await db.prepare('SELECT * FROM threads WHERE id=? AND org=? AND user=? AND scope_ref=?').bind(body.thread_id,user.org,user.email,app.name).first():null;
  if(body.thread_id&&!thread)return json({error:'Chat not found'},404);
  const commit=thread?.commit_sha||body.repository_context?.commit||app.commit_sha;
  if(thread&&(body.repository_context?.nodeId||body.repository_context?.range)&&body.repository_context?.commit!==commit)return json({error:'This chat uses an earlier commit. Start a new chat to ask about the selected code.'},409);
  const snapshot=await repositorySnapshot(env,app,commit);
  const selected=body.repository_context?.nodeId?repositoryTool(snapshot,'get_relationships',{nodeId:body.repository_context.nodeId}):null;
  const selectedCode=body.repository_context?.range?repositoryTool(snapshot,'read_source',body.repository_context.range):null;
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
  const question=selectedCode?`${body.message}\n\nSelected code: ${selectedCode.path}:${selectedCode.start}-${selectedCode.end} (commit ${commit})`:body.message;
  const extraBlocks=[],papers=[];
  // A file from the composer's +: an image or PDF as a block, anything else as text.
  if(file)extraBlocks.push(...(await attachmentBlocks(file)).blocks);
  // @-mentioned repositories in this workspace ride as their overview (files and
  // most connected symbols); at most three.
  const mentioned=[];
  for(const name of (Array.isArray(body.mentions)?body.mentions:[]).filter(n=>typeof n==='string'&&n!==app.name).slice(0,MENTION_LIMIT)){
    const row=await db.prepare('SELECT * FROM repository_apps WHERE org=? AND name=?').bind(user.org,name).first();
    if(!row?.commit_sha)continue;
    mentioned.push({name,...repositoryTool(await repositorySnapshot(env,repositoryApp(row,user)),'get_repo_overview')});
  }
  if(body.paper_context){
    const page=body.paper_context.page;
    if(!Number.isInteger(page)||page<1||page>PAPER_PAGE_LIMIT)throw Error('Invalid paper page');
    const paper=await readArxivPaper(body.paper_context.id);papers.push(paper);extraBlocks.push(paperDocument(paper));
    if(body.paper_context.selection)extraBlocks.push(paperSelectionImage(body.paper_context.selection));
  }
  // A canvas image the learner attached - a dropped picture, or a group's
  // rendered snapshot - rides as a vision block, same as on regular apps.
  if(body.image_context){
    if(!isUploadedMediaId(body.image_context.id))throw Error('Invalid image context');
    const media=await uploadedMediaAsImage(env,paperIdentity(app),body.image_context.id);
    extraBlocks.push(media.image);
  }
  const id=thread?.id||`repochat-${crypto.randomUUID()}`;
  if(!thread)await db.prepare('INSERT INTO threads(id,org,user,scope_ref,commit_sha,title) VALUES(?,?,?,?,?,?)').bind(id,user.org,user.email,app.name,commit,body.message.slice(0,120)).run();
  const history=await threadTurns(db,id,seed,question);
  return askStream(env,JSON.stringify({repo:app.repo,commit,selected,selectedCode,lesson:body.lesson_snapshot||null,paper:body.paper_context?{id:body.paper_context.id,page:body.paper_context.page}:null,...(mentioned.length?{mentionedRepositories:mentioned}:{})}),history,question,
    async answer=>{const message=await db.prepare('INSERT INTO messages(thread_id,role,content) VALUES(?,?,?) RETURNING id').bind(id,'assistant',answer).first();if(graphView)await db.prepare('INSERT INTO repository_message_graphs(message_id,graph_json) VALUES(?,?)').bind(message.id,JSON.stringify(graphView)).run();},{threadId:id,commit},extraBlocks,null,askModel(body.model),null,
    body.lesson_snapshot?LEARN_SNAPSHOT_SYSTEM:LEARN_SYSTEM,{papers,system:[REPOSITORY_SYSTEM,videos.system].filter(Boolean).join('\n'),tools:[...REPOSITORY_TOOLS,...videos.tools],runTool,getGraphView:()=>graphView,shownVideo:videos.shown,org:user.org});
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
