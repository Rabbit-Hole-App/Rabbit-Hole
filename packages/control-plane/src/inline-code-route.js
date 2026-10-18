// Unregistered leaf route: execution remains unavailable until explicitly configured.
const ROOT = '/api/learn/code-runs';
const ID = /^cj_[a-f0-9]{32}$/;
const encoder = new TextEncoder();
const json = (value,status=200) => Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const unavailable = () => json({error:'JavaScript execution is not configured.',code:'not_configured'},503);
const defaults = {
  identity:async(req,env)=>(await import('./repositories.js')).repositoryIdentity(req,env),
  access:async(req,env,app)=>(await import('./learn-board.js')).authorizedBoardApp(req,env,app),
  board:async(req,env,app,board)=>{
    const {boardOwner,ownerRow}=await import('./learn-boards.js');
    const owner=await boardOwner(req,env,app);
    return owner instanceof Response ? owner : {owner,row:await ownerRow(env,owner,app,board)};
  },
};
function positiveInteger(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) return null;
  const parsed=Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
export function inlineCodePolicy(env) {
  const maxRuns=positiveInteger(env.INLINE_CODE_MAX_RUNS);
  const maxMicros=positiveInteger(env.INLINE_CODE_MAX_MICROS);
  const reserveMicros=positiveInteger(env.INLINE_CODE_RESERVE_MICROS);
  if (!maxRuns || !maxMicros || !reserveMicros || reserveMicros>maxMicros) return null;
  return {maxRuns,maxMicros,reserveMicros};
}
async function readJson(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||'')) throw Error('JSON required');
  const reader=req.body?.getReader();
  if (!reader) throw Error('Body required');
  const chunks=[];let length=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>262144)throw Error('Body limit');chunks.push(value);}
  } catch(error){await reader.cancel().catch(()=>{});throw error;}
  const bytes=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function validCreate(body) {
  const allowed=new Set(['id','app','board','language','code','input','executionConfirmed','maxReservedMicros']);
  return body && typeof body==='object' && !Array.isArray(body) && Object.keys(body).every(key=>allowed.has(key)) &&
    typeof body.id==='string' && ID.test(body.id) &&
    typeof body.app==='string' && /^[a-z0-9-]{1,100}$/.test(body.app) &&
    typeof body.board==='string' && /^[A-Za-z0-9_.:-]{1,200}$/.test(body.board) &&
    body.language==='javascript' && typeof body.code==='string' && encoder.encode(body.code).byteLength<=32768 &&
    Object.hasOwn(body,'input') && encoder.encode(JSON.stringify(body.input)).byteLength<=16384 &&
    body.executionConfirmed===true && Number.isSafeInteger(body.maxReservedMicros) && body.maxReservedMicros>0;
}
function trustedOwner(user) {
  return user && typeof user.org==='string' && user.org && typeof user.email==='string' && user.email ? {org:user.org,email:user.email} : null;
}
function call(env,action,body) {
  const stub=env.FILE_JOBS.get(env.FILE_JOBS.idFromName('inline-code:global-v1'));
  return stub.fetch(new Request(`https://inline-code.internal/inline-code/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
}
export async function inlineCodeRoute(path,req,env,dependencies=defaults) {
  const root=path===ROOT,match=path.match(/^\/api\/learn\/code-runs\/(cj_[a-f0-9]{32})(?:\/(cancel))?$/);
  if(!root&&!match)return null;
  const allowed=root?['GET','POST']:[match[2]?'POST':'GET'];
  if(!allowed.includes(req.method))return json({error:'Method not allowed'},405);
  const origin=req.headers.get('origin');
  if(req.method==='POST'&&origin&&origin!==new URL(req.url).origin)return json({error:'Origin not allowed'},403);
  const user=await dependencies.identity(req,env);
  if(user instanceof Response)return user;
  const owner=trustedOwner(user);
  if(!owner)return json({error:'Sign in required'},401);
  if(!env.FILE_JOBS)return unavailable();
  if(!root)return call(env,match[2]?'cancel':'status',{id:match[1],owner});
  const policy=inlineCodePolicy(env);
  const available=env.INLINE_CODE_ENABLED==='true' && !!policy && typeof env.INLINE_CODE_LOADER?.load==='function';
  if(req.method==='GET')return json({available,language:'javascript',maximumReservedMicros:available?policy.reserveMicros:null,limits:available?{maxRuns:policy.maxRuns,maxMicros:policy.maxMicros}:null});
  if(!available)return unavailable();
  let body;try{body=await readJson(req);}catch{return json({error:'A bounded JSON request is required'},400);}
  if(!validCreate(body))return json({error:'An explicit, bounded JavaScript execution request is required'},400);
  if(body.maxReservedMicros<policy.reserveMicros)return json({error:'The reservation exceeds the approved maximum',code:'consent_bound'},409);
  const access=await dependencies.access(req,env,body.app);
  if(access instanceof Response)return access;
  if(!access||access.org!==owner.org||(access.owner_email||access.email)!==owner.email||access.canEdit===false)return json({error:'Owner access required'},403);
  const scope=await dependencies.board(req,env,body.app,body.board);
  if(scope instanceof Response)return scope;
  if(!scope?.row||scope.owner?.org!==owner.org||scope.owner?.email!==owner.email)return json({error:'Owned board required'},404);
  return call(env,'create',{id:body.id,owner,scope:{app:body.app,board:body.board},language:body.language,code:body.code,input:body.input,executionConfirmed:true,maxReservedMicros:body.maxReservedMicros});
}
