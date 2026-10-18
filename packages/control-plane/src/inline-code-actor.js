// Delegate only this protocol from the existing FILE_JOBS class. No namespace reset.
import {createInlineCodeCoordinator} from './inline-code-job.js';
import {createInlineCodeRuntime} from './inline-code-runtime.js';
import {inlineCodePolicy} from './inline-code-route.js';
const MARKER='code:actor';
const controllers=new WeakMap();
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const available=env=>env.INLINE_CODE_ENABLED==='true'&&typeof env.INLINE_CODE_LOADER?.load==='function'&&!!inlineCodePolicy(env);
const samePolicy=(a,b)=>a&&b&&['maxRuns','maxMicros','reserveMicros'].every(key=>a[key]===b[key]);
async function controller(state,env,dependencies={}) {
  if(controllers.has(state))return controllers.get(state);
  const promise=(async()=>{
    const budget=await state.storage.get('code:budget');
    const policy=budget?.policy||inlineCodePolicy(env);
    return createInlineCodeCoordinator({storage:state.storage,policy,execute:dependencies.execute||((input)=>createInlineCodeRuntime({loader:env.INLINE_CODE_LOADER}).run(input))});
  })();
  controllers.set(state,promise);
  try{return await promise;}catch(error){controllers.delete(state);throw error;}
}
async function pending(state) {
  const records=await state.storage.list({prefix:'code:job:'});
  return [...records.values()].filter(job=>job.phase==='queued'||job.phase==='started');
}
export async function inlineCodeActorFetch(state,env,req,dependencies={}) {
  const path=new URL(req.url).pathname;
  if(!path.startsWith('/inline-code/'))return null;
  const action=path.slice('/inline-code/'.length);
  if(req.method!=='POST'||!['create','status','cancel'].includes(action))return json({error:'Unknown code-job operation'},404);
  let body;
  try {const text=await req.text();if(new TextEncoder().encode(text).length>262144)throw Error();body=JSON.parse(text);}catch{return json({error:'Invalid code-job request'},400);}
  if(!body||typeof body.id!=='string'||!/^cj_[a-f0-9]{32}$/.test(body.id)||typeof body.owner?.org!=='string'||!body.owner.org||typeof body.owner?.email!=='string'||!body.owner.email)return json({error:'Invalid code-job identity'},400);
  if(action==='create') {
    if(!available(env))return json({error:'Execution unavailable'},503);
    const budget=await state.storage.get('code:budget');
    if(budget&&!samePolicy(budget.policy,inlineCodePolicy(env)))return json({error:'Durable budget policy changed; admission paused'},409);
    try {
      // Arm before admitting so a process restart cannot strand a persisted job.
      await state.storage.put(MARKER,{version:1});
      await state.storage.setAlarm(Date.now()+50);
      const job=await (await controller(state,env,dependencies)).create(body);
      // Acknowledgement requires durable scheduling even for duplicate queued jobs.
      if(job.phase==='queued'||job.phase==='started')await state.storage.setAlarm(Date.now()+50);
      return json({job},201);
    }catch{return json({error:'Code-job admission or durable scheduling failed'},409);}
  }
  if(!await state.storage.get(MARKER))return json({error:'Job unavailable'},404);
  try {
    const control=await controller(state,env,dependencies);
    const job=await control[action](body.id,body.owner);
    return json({job});
  }catch{return json({error:'Job unavailable'},404);}
}
export async function inlineCodeActorAlarm(state,env,dependencies={}) {
  if(!await state.storage.get(MARKER))return false;
  const jobs=await pending(state);
  const next=jobs[0];
  if(!next)return true;
  // Host execution waits at most 3 seconds; retain recovery alarm beyond that.
  await state.storage.setAlarm(Date.now()+10000);
  try {
    const control=await controller(state,env,dependencies);
    if(next.phase==='queued'&&!available(env))await control.cancel(next.id,next.owner);
    else await control.run(next.id,next.owner);
  }finally {
    // Failure never deletes legacy storage or prevents subsequent queued work.
    if((await pending(state)).length)await state.storage.setAlarm(Date.now()+50);
  }
  return true;
}
