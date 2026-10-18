const encoder = new TextEncoder();
const MAX_OUTPUT = 32768;
const WALL_MS = 3000;
const sha256 = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), b => b.toString(16).padStart(2, '0')).join('');

function childModule(code) {
  return `export default {async fetch(request) {
    const lines = []; let used = 0;
    const console = Object.fromEntries(['log','info','warn','error','debug'].map(level => [level, (...args) => {
      const text = args.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ');
      used += new TextEncoder().encode(text).length;
      if (used > 16384 || lines.length >= 128) throw Error('stdout_limit');
      lines.push({level,text});
    }]));
    try {
      const input = await request.json();
      const result = await (async function(input,console) {
${code}
      })(input,console);
      const body = JSON.stringify({status:'ok',stdout:lines,result:result === undefined ? null : result,error:null});
      if (new TextEncoder().encode(body).length > ${MAX_OUTPUT}) throw Error('output_limit');
      return new Response(body,{headers:{'content-type':'application/json'}});
    } catch (error) {
      return Response.json({status:'error',stdout:lines,result:null,error:{kind:'execution',message:String(error?.message || error).slice(0,1024)}});
    }
  }};`;
}

async function boundedJson(response) {
  if (!response.ok || !response.body) throw Error('invalid_runtime_response');
  const reader = response.body.getReader();
  const chunks = []; let length = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_OUTPUT) throw Error('output_limit');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  const value = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if (!['ok','error'].includes(value.status) || !Array.isArray(value.stdout) || value.stdout.length > 128 || value.stdout.some(line => !line || !['log','info','warn','error','debug'].includes(line.level) || typeof line.text !== 'string')) throw Error('invalid_runtime_response');
  if (value.status === 'error' && (!value.error || typeof value.error.message !== 'string')) throw Error('invalid_runtime_response');
  return {status:value.status,stdout:value.stdout,result:value.result ?? null,error:value.status === 'error' ? {kind:'execution',message:value.error.message.slice(0,1024)} : null};
}

// Leaf adapter only. No route, billing admission, automatic retry or inherited bindings.
export function createInlineCodeRuntime({loader, now = () => performance.now()} = {}) {
  return {async run({language,code,input = null,signal} = {}) {
    const started = now(); let executionStarted = false;
    let sourceSha256 = null, inputSha256 = null;
    const finish = value => ({stdout:[],result:null,error:null,...value,sourceSha256,inputSha256,elapsedMs:Math.max(0,now()-started),executionStarted,terminationConfirmed:false});
    let serialized;
    try {
      if (language !== 'javascript') throw Error('unsupported_language');
      if (typeof code !== 'string' || encoder.encode(code).length > 32768) throw Error('code_limit');
      serialized = JSON.stringify(input);
      if (typeof serialized !== 'string' || encoder.encode(serialized).length > 16384) throw Error('input_limit');
      [sourceSha256,inputSha256] = await Promise.all([sha256(code),sha256(serialized)]);
    } catch (error) { return finish({status:'error',error:{kind:'validation',message:error.message}}); }
    if (signal?.aborted) return finish({status:'cancelled'});
    if (!loader || typeof loader.load !== 'function') return finish({status:'unavailable'});
    const controller = new AbortController(); let timedOut = false;
    let timer, onAbort;
    const stopped = new Promise((_,reject) => {
      onAbort = () => { controller.abort(); reject(Error('cancelled')); };
      signal?.addEventListener('abort',onAbort,{once:true});
      timer = setTimeout(() => { timedOut = true; controller.abort(); reject(Error('timeout')); },WALL_MS);
    });
    try {
      executionStarted = true;
      const work = async () => {
        const worker = await loader.load({compatibilityDate:'2026-08-01',mainModule:'run.js',modules:{'run.js':childModule(code)},env:{},globalOutbound:null,limits:{cpuMs:1000,subRequests:0}});
        if (controller.signal.aborted) throw Error('cancelled');
        const response = await worker.getEntrypoint().fetch(new Request('https://inline-code.invalid/run',{method:'POST',headers:{'content-type':'application/json'},body:serialized,signal:controller.signal}));
        return boundedJson(response);
      };
      return finish(await Promise.race([work(),stopped]));
    } catch (error) {
      return finish({status:timedOut ? 'timeout' : signal?.aborted ? 'cancelled' : 'error',error:{kind:timedOut ? 'timeout' : signal?.aborted ? 'cancelled' : 'runtime',message:timedOut ? 'Execution deadline exceeded; termination is unconfirmed.' : signal?.aborted ? 'Waiting cancelled; termination is unconfirmed.' : String(error.message).slice(0,1024)}});
    } finally {clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
  }};
}
