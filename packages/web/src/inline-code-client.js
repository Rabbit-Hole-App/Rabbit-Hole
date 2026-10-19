// Explicit execution transport/controller. Mounting never submits or resumes a job.
const ROOT='/api/learn/code-runs';
const encoder=new TextEncoder();
const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const terminal=new Set(['succeeded','failed','cancelled','unknown']);
const phases=new Set(['queued','started',...terminal]);
const scalar=(value,max=500)=>typeof value==='string'&&value.length>0&&value.length<=max;
const exact=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fault=message=>new Error(message);
function scopeOf(scope){
  if(!scope||!scalar(scope.app,100)||!scalar(scope.board,200)||!scalar(scope.sourceId,200))throw fault('An explicit source and canvas are required.');
  return {app:scope.app,board:scope.board,sourceId:scope.sourceId};
}
export async function inlineCodeTicketKey({ownerKey,scope,code,input}) {
  if(!scalar(ownerKey)||typeof code!=='string')throw fault('An explicit owner and code snapshot are required.');
  const boundScope=scopeOf(scope),snapshot=await hash(JSON.stringify([code,input]));
  return `small.code-run:${JSON.stringify([ownerKey,boundScope,snapshot])}`;
}
async function readResponse(response){
  if(!response.ok)throw fault(`Execution request was not confirmed (${response.status}). Do not automatically resubmit.`);
  const reader=response.body?.getReader();if(!reader)throw fault('Missing execution response.');
  const chunks=[];let count=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>65536)throw fault('Execution response exceeded its limit.');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
  const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export function createInlineCodeClient({ownerKey,scope,language,code,input=null,current,persistTicket,headers={},fetchImpl=globalThis.fetch,pollMs=500}={}){
  const boundScope=scopeOf(scope),serialized=JSON.stringify(input);
  if(!scalar(ownerKey)||language!=='javascript'||typeof code!=='string'||!code.trim()||encoder.encode(code).length>32768||typeof serialized!=='string'||encoder.encode(serialized).length>16384||typeof current!=='function'||typeof persistTicket!=='function'||!Number.isInteger(pollMs)||pollMs<0||pollMs>30000)throw fault('Bounded JavaScript source, JSON input and persistence are required.');
  const boundInput=JSON.parse(serialized),hashes=Promise.all([hash(code),hash(serialized)]);
  let submitted=false, persisted=null;
  function checkIdentity(){const live=current();if(!live||live.readOnly||live.ownerKey!==ownerKey||!exact(scopeOf(live.scope),boundScope))throw fault('The source, canvas or owner changed; execution is unavailable.');return live;}
  async function validateCurrent(){const live=checkIdentity();if(live.language!==language||live.code!==code||JSON.stringify(live.input??null)!==serialized)throw fault('The source or input changed. This execution belongs to an earlier snapshot.');return true;}
  async function ticketOf(raw){
    const [sourceSha256,inputSha256]=await hashes;
    if(raw?.version!==1||typeof raw.id!=='string'||!/^cj_[a-f0-9]{32}$/.test(raw.id)||raw.ownerKey!==ownerKey||!exact(raw.scope,boundScope)||raw.language!==language||raw.sourceSha256!==sourceSha256||raw.inputSha256!==inputSha256||!Number.isSafeInteger(raw.maxReservedMicros)||raw.maxReservedMicros<=0)throw fault('This execution ticket does not match the current owner and source snapshot.');
    return {version:1,id:raw.id,ownerKey,scope:{...boundScope},language,sourceSha256,inputSha256,maxReservedMicros:raw.maxReservedMicros};
  }
  async function request(path,method,body,signal){signal?.throwIfAborted();return readResponse(await fetchImpl(path,{method,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal}));}
  function jobOf(job,ticket){
    if(!job||job.id!==ticket.id||!phases.has(job.phase)||job.sourceSha256!==ticket.sourceSha256||job.inputSha256!==ticket.inputSha256||job.scope?.app!==boundScope.app||job.scope?.board!==boundScope.board)throw fault('Execution result does not match this source snapshot.');
    if(job.result&&(!['ok','error','timeout','cancelled','unavailable'].includes(job.result.status)||!Array.isArray(job.result.stdout)||job.result.stdout.some(line=>!line||typeof line.text!=='string'||typeof line.level!=='string')))throw fault('Invalid execution output.');
    if(job.reason!=null&&typeof job.reason!=='string'||job.result?.error!=null&&typeof job.result.error.message!=='string')throw fault('Invalid execution error.');
    return structuredClone(job);
  }
  async function resume(raw,{signal,onProgress,timeoutMs=30000}={}){
    await validateCurrent();const ticket=await ticketOf(raw);submitted=true;persisted=ticket;
    if(!Number.isInteger(timeoutMs)||timeoutMs<=0||timeoutMs>180000)throw fault('Invalid execution wait bound.');
    const wait=signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs);
    for(;;){wait.throwIfAborted();await validateCurrent();const value=await request(`${ROOT}/${ticket.id}`,'GET',null,wait);await validateCurrent();const job=jobOf(value.job,ticket);onProgress?.(job);if(terminal.has(job.phase))return {ticket,job};
      await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(wait.reason);};const timer=setTimeout(()=>{wait.removeEventListener('abort',abort);resolve();},pollMs);wait.addEventListener('abort',abort,{once:true});if(wait.aborted)abort();});
    }
  }
  return {
    validateCurrent,
    getTicket:()=>persisted?structuredClone(persisted):null,
    async quote({signal}={}){checkIdentity();const value=await request(ROOT,'GET',null,signal);if(typeof value.available!=='boolean'||value.available&&(!Number.isSafeInteger(value.maximumReservedMicros)||value.maximumReservedMicros<=0))throw fault('Invalid execution reservation quote.');return {available:value.available,maximumReservedMicros:value.available?value.maximumReservedMicros:null};},
    async run({confirmed,maxReservedMicros,signal,onProgress,onTicket}={}){
      if(submitted)throw fault('An execution was already submitted; resume its ticket instead.');
      if(confirmed!==true||!Number.isSafeInteger(maxReservedMicros)||maxReservedMicros<=0)throw fault('Confirm the execution reservation before running.');
      signal?.throwIfAborted();await validateCurrent();const [sourceSha256,inputSha256]=await hashes;
      const id='cj_'+crypto.randomUUID().replaceAll('-','');
      const ticket=await ticketOf({version:1,id,ownerKey,scope:boundScope,language,sourceSha256,inputSha256,maxReservedMicros});
      await persistTicket(structuredClone(ticket));
      persisted=ticket;
      onTicket?.(structuredClone(ticket));
      signal?.throwIfAborted();await validateCurrent();submitted=true;
      const value=await request(ROOT,'POST',{id,app:boundScope.app,board:boundScope.board,language,code,input:boundInput,executionConfirmed:true,maxReservedMicros},signal);
      jobOf(value.job,ticket);return resume(ticket,{signal,onProgress});
    },
    resume,
    async cancel(raw,{signal}={}){checkIdentity();const ticket=await ticketOf(raw);const value=await request(`${ROOT}/${ticket.id}/cancel`,'POST',{},signal);return {ticket,job:jobOf(value.job,ticket)};},
  };
}
