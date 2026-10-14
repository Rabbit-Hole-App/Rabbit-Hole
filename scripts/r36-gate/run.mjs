import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, appendFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SOURCE, prepare, files, sha256 } from './prepare.mjs';
import { prerequisite, keepsProbeStack } from './phases.mjs';
import { SHARDS, CONDITIONAL, canary } from './shards.mjs';

const APP_SHA=process.env.TESTED_SHA, APP_TREE=process.env.TESTED_TREE;
if(!/^[a-f0-9]{40}$/.test(APP_SHA||'')||!/^[a-f0-9]{40}$/.test(APP_TREE||''))throw Error('Explicit exact TESTED_SHA and TESTED_TREE are required');
const phase=process.argv[2]||'all',shard=/^shard-\d+$/.test(phase),fresh=phase==='all'||phase==='preflight'||phase==='focused'||shard,units=phase==='units';
const app=resolve(process.env.APP_ROOT||''),state=resolve(process.env.GATE_ROOT||''),out=resolve(process.env.ARTIFACT_ROOT||'');
const config=join(app,'packages/control-plane/integ-local.jsonc'),persist=join(state,'gates/int35/fork/local');
for(const name of ['APP_ROOT','GATE_ROOT','ARTIFACT_ROOT','HARNESS_SHA','GATE_GRANT_ID'])if(!process.env[name])throw Error(`Missing ${name}`);
if(!process.env.GITHUB_ACTIONS && process.env.R36_LOCAL_VALIDATION!=='1')throw Error('Use the authorized isolated Windows CI job');
if(process.platform!=='win32')throw Error('This complete gate uses the supported Windows/Bash stack');
if(process.version!=='v24.19.0')throw Error(`Node pin mismatch: ${process.version}`);
if([app,state,out].some(p=>p===resolve('.'))||app===state||out===state||out===app)throw Error('Use separate app, state and artifact paths');
if((fresh||units)&&(existsSync(join(out,'receipt.json'))||existsSync(join(state,'gates'))))throw Error('Use fresh runner state; do not append to an earlier receipt');
mkdirSync(out,{recursive:true});
const git=(...args)=>execFileSync('git',args,{cwd:app,encoding:'utf8',windowsHide:true}).trim();
const unchanged=()=>{
  if(git('rev-parse','HEAD')!==APP_SHA||git('rev-parse','HEAD^{tree}')!==APP_TREE||git('write-tree')!==APP_TREE||git('diff','--name-only','HEAD'))throw Error('Tested application checkout changed');
};
unchanged();
const inTree=p=>{try{git('cat-file','-e',`${APP_SHA}:${p}`);return true;}catch{return false;}};
const harnessRoot=resolve(SOURCE,'../..');
const actualHarness=execFileSync('git',['rev-parse','HEAD'],{cwd:harnessRoot,encoding:'utf8',windowsHide:true}).trim();
if(actualHarness!==process.env.HARNESS_SHA)throw Error('Harness revision mismatch');
const denied=Object.keys(process.env).filter(k=>process.env[k]&&/_API_KEY|^ELEVENLABS_|^SUBSCRIPTION_|^(?:CLOUDFLARE|CF)_.*(?:TOKEN|KEY)$/i.test(k));
if(denied.length)throw Error(`Provider/deployment environment refused: ${denied.join(', ')}`);
// Wrangler 4.150.0 is allowed beside 4.129.0 while branches move to it: 4.129 dev exits when its proxy reuses a dropped keep-alive.
const allowed={wrangler:['4.129.0','4.150.0'],'@playwright/test':['1.62.1'],vite:['8.2.2']};
const pins=Object.fromEntries(Object.entries(allowed).map(([name,ok])=>{const version=JSON.parse(readFileSync(join(app,'node_modules',name,'package.json'),'utf8')).version;if(!ok.includes(version))throw Error(`Dependency mismatch: ${name}`);return [name,version];}));
const receipt={applicationSha:APP_SHA,applicationTree:APP_TREE,harnessSha:actualHarness,grant:process.env.GATE_GRANT_ID,phase,started:new Date().toISOString(),node:process.version,pins,lockfiles:{npm:sha256(join(app,'package-lock.json')),uv:sha256(join(app,'uv.lock'))},stages:[],pass:false};
const priorFile=join(out,`${phase==='dive'?'preflight':'dive'}-receipt.json`);
const prior=!fresh&&existsSync(priorFile)?JSON.parse(readFileSync(priorFile,'utf8')):null;
const priorError=prerequisite(phase,prior,receipt);if(priorError)throw Error(priorError);
if(prior)receipt.prerequisite={phase:prior.phase,sha256:sha256(priorFile)};
writeFileSync(join(out,fresh?'identity.json':`identity-${phase}.json`),JSON.stringify(receipt,null,2));
let gate=fresh||units?null:resolve(state,'gates/int35').replaceAll('\\','/'),secret;
let env={...process.env,CI:'true',INT35_EXPECTED_SHA:APP_SHA,INT35_EXPECTED_TREE:APP_TREE,INT35_GRANT_ID:process.env.GATE_GRANT_ID};
for(const name of Object.keys(env))if(!env[name]&&/_API_KEY|^ELEVENLABS_|^SUBSCRIPTION_/i.test(name))delete env[name];
function command(file,args,{cwd=app,log,timeout=1800000,allowFailure=false,extra={},stream=false}={}) {
  return new Promise((resolve,reject)=>{
    const began=new Date().toISOString();
    console.log(`${began} start ${file} ${args.join(' ')}`);
    const child=spawn(file,args,{cwd,env:{...env,...extra},windowsHide:true,stdio:['ignore','pipe','pipe']});
    let timer=setTimeout(()=>{child.kill();},timeout);let tail='';
    for(const output of [child.stdout,child.stderr])output.on('data',b=>{if(log)appendFileSync(log,b);if(stream)process.stdout.write(b);tail=(tail+b.toString()).slice(-5000);});
    child.once('error',e=>{clearTimeout(timer);reject(e);});
    child.once('close',(code,signal)=>{
      clearTimeout(timer);receipt.stages.push({command:[file,...args],started:began,ended:new Date().toISOString(),code,signal,log});
      if(code!==0&&!allowFailure)reject(Error(`Command failed (${code}/${signal}): ${file} ${args.join(' ')}; see ${log}`));else resolve({code,signal,tail});
    });
  });
}
const bash=process.env.GATE_BASH||process.env.GIT_BASH_PATH||'bash.exe';
async function memory(label) {
  const result=await command('powershell.exe',['-NoProfile','-Command','[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1024)']);
  const free=Number(result.tail.trim());appendFileSync(join(out,'memory.jsonl'),JSON.stringify({at:new Date().toISOString(),label,freeMiB:free})+'\n');
  if(!Number.isFinite(free)||free<1500)throw Error(`Memory preflight ${label}: ${free} MiB <1500`);
}
async function stop() {
  if(!gate)return;
  const browserReceipts=files(gate).filter(p=>dirname(p)===resolve(gate)&&p.endsWith('.start.json'));
  for(const p of browserReceipts)writeFileSync(p.replace(/\.start\.json$/,'.stop'),'stop');
  const results=[];
  for(const script of ['fork/stop.ps1','lp1h/stop.ps1'])results.push(await command('powershell.exe',['-NoProfile','-File',join(gate,script),'-DeferPortCheck'],{allowFailure:true,log:join(out,'cleanup.log')}));
  if(results.some(r=>r.code!==0))throw Error('Scoped cleanup failed; see cleanup.log');
  await command('powershell.exe',['-NoProfile','-Command','if (@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(8878,8879,9318,9319) }).Count) { throw "Gate ports remain occupied after cleanup" }; "Gate ports clear"'],{log:join(out,'cleanup.log')});
  for(const p of browserReceipts) {
    const exit=p.replace(/\.start\.json$/,'.monitor-exit.json');
    if(!existsSync(exit)||JSON.parse(readFileSync(exit,'utf8')).code!==0)throw Error(`Browser cleanup receipt missing or failed: ${exit}`);
  }
}
function preserveDive() {
  const summary={applicationSha:APP_SHA,harnessSha:actualHarness,workers:{}};
  for(const role of ['app','cp']) {
    const path=join(gate,'fork',`${role}.log`);
    if(!existsSync(path))continue;
    const log=readFileSync(path,'utf8');writeFileSync(join(out,`dive-${role}.log`),log);
    const lines=log.split(/\r?\n/),requests=lines.filter(l=>/\b(?:GET|POST|PUT|DELETE|PATCH) \/.*\b\d{3}\b/.test(l));
    summary.workers[role]={lastCompletedRequest:requests.at(-1)||null,thumbnailRequests:requests.filter(l=>/thumbnail/.test(l)),errors:lines.filter(l=>/Network connection lost|runtime.*crash|out of memory|fatal|ERROR/i.test(l)).slice(-30)};
  }
  writeFileSync(join(out,'dive-diagnostics.json'),JSON.stringify(summary,null,2));
}
async function request(url,options={}) {return fetch(url,{...options,signal:AbortSignal.timeout(15000)});}
async function auth() {
  const mint=s=>request('http://127.0.0.1:8879/test/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'yudhisteer.chin@gmail.com',secret:s})});
  if((await mint('wrong-local-secret')).status!==401)throw Error('Wrong-secret request was not refused');
  const r=await mint(secret);if(r.status!==200)throw Error(`Local test auth failed ${r.status}`);
  const {session}=await r.json();if(!session)throw Error('Local session missing');
  for(const port of [8878,8879])if((await request(`http://127.0.0.1:${port}/api/apps`,{headers:{cookie:`small_session=${session}`}})).status!==200)throw Error(`Authenticated apps failed on ${port}`);
  writeFileSync(join(out,'auth.json'),JSON.stringify({wrongSecret:401,correctSecret:200,app:200,cp:200}));
}
async function tripwire() {
  const r=await request('http://127.0.0.1:8878/__provider-tripwire');if(r.status!==200)throw Error('Tripwire unavailable');
  const b=await r.json();if(!Array.isArray(b.hits)||b.hits.length)throw Error('Provider tripwire is not zero');
}
try {
  await memory('preflight');
  if(units) {
  // Full units and the nanoGPT fixture regression on the exact committed tree, supervised like every gate child: no stack
  // and no local credentials. No shard runs these two stages (shards.mjs UNIT_STAGES). The record carries the head and the
  // two stage lines in the format int35.sh echoes for them, so collect.mjs merges them where gateVerdict reads them.
  const log=join(out,'gate-shard.log'),unitLog=join(out,'int35-unit.log'),fixLog=join(out,'fixture.log');
  writeFileSync(log,`INT35 preflight: candidate ${APP_TREE}; grant ${process.env.GATE_GRANT_ID}; local keyless prerequisites checked.\ntree HEAD ${git('rev-parse','--short','HEAD')} MERGE_HEAD  index ${APP_TREE}\n`);
  const u=await command(process.execPath,[join(SOURCE,'supervise.mjs'),join(out,'unit-process'),'--','-e',"const c=require('node:child_process').spawnSync(process.env.GATE_BASH,['-c','make test-unit'],{stdio:'inherit',windowsHide:true});process.exit(c.status??1)"],{log:unitLog,timeout:3600000,stream:true,allowFailure:true,extra:{UV_OFFLINE:'1'}});
  const summary=readFileSync(unitLog,'utf8').replace(/\x1b\[[0-9;]*m/g,'').split(/\r?\n/).filter(l=>/^ℹ (tests|fail) /.test(l)).join(' ');
  appendFileSync(log,`make test-unit exit ${u.code}  ${summary}\n`);
  const f=await command(process.execPath,['--test','--test-reporter=tap','e2e/nanogpt-repository-fixture.test.mjs'],{cwd:join(app,'packages/web'),log:fixLog,allowFailure:true});
  const fx=readFileSync(fixLog,'utf8').split(/\r?\n/).filter(l=>/^# (pass|fail)/.test(l)).join(' ');
  appendFileSync(log,`fixture regression exit ${f.code}  ${fx}\nINT35-DONE\n`);
  unchanged();
  if(u.code!==0||f.code!==0)throw Error('units failed; see int35-unit.log and fixture.log');
  } else if(fresh) {
  await command(process.execPath,['-e','const c=require("node:child_process").spawnSync(process.execPath,["-e","process.exit(0)"]);if(c.status!==0)process.exit(1)']);
  await command('powershell.exe',['-NoProfile','-Command','$ErrorActionPreference="Stop"; $self=Get-CimInstance Win32_Process -Filter "ProcessId = $PID"; if (-not $self.CreationDate) { throw "Process identity unavailable" }; $null=(Get-Process -Id $PID).Handle; $null=Get-NetTCPConnection -State Listen; "Process observation capability passed"'],{log:join(out,'process-preflight.log')});
  await command(bash,['-c','for tool in make timeout curl sed python powershell; do command -v "$tool" || exit 1; done; make --version && python --version'],{log:join(out,'tools.log')});
  ({gate,secret}=prepare({app,state,sha:APP_SHA,tree:APP_TREE,grant:env.INT35_GRANT_ID}));
  await command('powershell.exe',['-NoProfile','-Command','if (@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(8878,8879,9318,9319) }).Count) { throw "Required ports occupied" }']);
  const wrangler=join(app,'node_modules/wrangler/bin/wrangler.js');
  for(const [db,file] of [['rabbit-hole-dev','packages/control-plane/bootstrap.sql'],['rabbit-hole-dev',null],['rabbit-hole-learn-dev','packages/control-plane/repository-schema.sql'],['rabbit-hole-byoc-dev','packages/byoc/schema.sql']]) {
    const args=file?['d1','execute',db,'--file',file]:['d1','migrations','apply',db];
    await command(process.execPath,[wrangler,...args,'--local','--config',config,'--persist-to',persist],{log:join(out,'schema.log')});
  }
  const schema=await command(process.execPath,[wrangler,'d1','execute','rabbit-hole-learn-dev','--local','--config',config,'--persist-to',persist,'--json','--command',"SELECT name, sql FROM sqlite_master WHERE name IN ('library_folders','library_folder_items','usage_operations') ORDER BY name"],{log:join(out,'schema-identity.json')});
  const tables=JSON.parse(schema.tail).flatMap(r=>r.results||[]);
  if(tables.length!==3||tables.some(t=>!t.sql))throw Error('Required folders/spend schema missing');
  writeFileSync(join(gate,'fork/SCHEMA-PREPARED-TREE'),APP_TREE+'\n');
  await command(process.execPath,[join(gate,'preflight.cjs')],{log:join(out,'preflight.log')});
  await command(bash,[join(gate,'fork/stack.sh'),'dev'],{log:join(out,'dive-stack.log')});
  await auth();
  if(!keepsProbeStack(phase))await stop();
  } else {
    const vars=readFileSync(join(app,'packages/control-plane/.dev.vars'),'utf8');
    secret=vars.match(/^TEST_BYPASS_SECRET=([a-f0-9]{48})\r?$/m)?.[1];
    if(!secret||vars!==readFileSync(join(app,'packages/web/.dev.vars'),'utf8'))throw Error('Prepared local authentication changed or missing');
    for(const [file,hash] of Object.entries(prior.localConfigHashes||{}))if(sha256(join(app,file))!==hash)throw Error(`Prepared local configuration changed: ${file}`);
    if(!prior.localConfigHashes||Object.keys(prior.localConfigHashes).length<3)throw Error('Prepared local configuration receipt missing');
  }
  if(phase==='all'||phase==='dive') {
  if(!fresh) {await command(bash,[join(gate,'fork/stack.sh'),'restart'],{log:join(out,'dive-stack.log')});await auth();}
  await memory('dive-start');
  const browserEnv={BASE:'http://127.0.0.1:8878',SMALL_CP:'http://127.0.0.1:8879',PERSIST:persist,D1_CONFIG:config};
  try {
    await command(process.execPath,[join(gate,'supervise.mjs'),join(gate,'dive-reproduction'),'--','e2e/dive-check.mjs',join(gate,'dive-reproduction-shots')],{cwd:join(app,'packages/web'),log:join(out,'dive-reproduction.log'),timeout:1200000,extra:browserEnv});
  } finally { preserveDive(); }
  await tripwire();unchanged();
  writeFileSync(join(out,'dive-verdict.json'),JSON.stringify({sha:APP_SHA,tree:APP_TREE,harness:actualHarness,pass:true,providerHits:0}));
  await stop();await memory('after-dive-cleanup');
  }
  if(phase==='focused') {
    await command(bash,[join(gate,'focused.sh')],{log:join(out,'focused.log'),timeout:5400000,stream:true});
    unchanged();
    const {stageCount}=await import(pathToFileURL(join(app,'scripts/dev-deploy.mjs')));
    const record=readFileSync(join(out,'focused.log'),'utf8');
    const required=[['sca','sca'],['selected-pill','selected-pill'],['journey J1-J8','journey'],['tutor-slice','slice']];
    const results=required.map(([stage,wire])=>{
      const line=[...record.matchAll(new RegExp(`^${stage} exit (\\d+)\\b(.*)$`,'gm'))].at(-1);
      return {stage,exit:line?.[1],count:stageCount(line?.[2]),pass:line?.[1]==='0'&&stageCount(line[2])>0&&new RegExp(`^${wire} provider-tripwire hits: 0\\r?$`,'m').test(record)};
    });
    const pass=results.every(r=>r.pass)&&/^R36-FOCUSED-DONE\r?$/m.test(record);
    writeFileSync(join(out,'focused-verdict.json'),JSON.stringify({applicationSha:APP_SHA,applicationTree:APP_TREE,harnessSha:actualHarness,kind:'focused-only',results,pass},null,2));
    if(!pass)throw Error('Focused four-stage verification failed; see focused-verdict.json');
  }
  if(shard) {
    // One slice of int35.sh on this fresh runner (shards.mjs). collect.mjs merges the slices and runs gateVerdict.
    const n=Number(phase.slice(6)),script=join(gate,`${phase}.sh`);
    if(!SHARDS[n-1])throw Error(`Unknown gate shard: ${phase}`);
    writeFileSync(script,canary(readFileSync(script,'utf8'),process.env.GATE_CANARY_FAIL_STAGE));
    await command(bash,[script],{log:join(out,'gate-shard.log'),timeout:7200000,stream:true});
    unchanged();
    const {stageCount}=await import(pathToFileURL(join(app,'scripts/dev-deploy.mjs')));
    const record=readFileSync(join(out,'gate-shard.log'),'utf8');
    const exits=[...record.matchAll(/^([^:\r\n]+?) exit (\d+)\b(.*)$/gm)];
    const results=SHARDS[n-1].filter(s=>!CONDITIONAL[s]||inTree(CONDITIONAL[s])).map(stage=>{
      const line=exits.filter(m=>m[1]===stage).at(-1);
      return {stage,exit:line?.[2],count:stageCount(line?.[3]),pass:line?.[2]==='0'&&stageCount(line[3])>0};
    });
    const counts=[...record.matchAll(/(tripwire hits|model key bindings in app log): (\S+)/g)].map(m=>m[2]);
    const pass=results.every(r=>r.pass)&&counts.every(v=>v==='0')&&/^INT35-DONE\r?$/m.test(record);
    writeFileSync(join(out,'shard-verdict.json'),JSON.stringify({applicationSha:APP_SHA,applicationTree:APP_TREE,harnessSha:actualHarness,kind:'shard-only',shard:n,results,providerCounts:counts,pass},null,2));
    if(!pass)throw Error(`Gate ${phase} failed; see shard-verdict.json`);
  }
  if(phase==='all'||phase==='gate') {
  await command(bash,[join(gate,'int35.sh')],{log:join(out,'gate.log'),timeout:7200000,stream:true});
  unchanged();
  const {gateVerdict,stageCount}=await import(pathToFileURL(join(app,'scripts/dev-deploy.mjs')));
  const record=readFileSync(join(out,'gate.log'),'utf8');
  const verdict=gateVerdict(record,APP_TREE,inTree);
  const last=name=>[...record.matchAll(new RegExp(`^${name} exit (\\d+)\\b(.*)$`,'gm'))].at(-1);
  const routing=last('answer-routing'),project=last('project-menu');
  const extraPassed=routing?.[1]==='0'&&stageCount(routing[2])>=15&&project?.[1]==='0'&&stageCount(project[2])===12&&/^answer-routing provider-tripwire hits: 0\r?$/m.test(record)&&/^project-menu provider-tripwire hits: 0\r?$/m.test(record);
  writeFileSync(join(out,'gate-verdict.json'),JSON.stringify({applicationSha:APP_SHA,applicationTree:APP_TREE,harnessSha:actualHarness,gateVerdict:verdict,extraPassed,pass:verdict===null&&extraPassed},null,2));
  if(verdict||!extraPassed)throw Error(`Complete gate rejected: ${verdict||'routing/project-menu receipts missing'}`);
  }
  if(!units)receipt.localConfigHashes=Object.fromEntries(['packages/control-plane/.dev.vars','packages/web/.dev.vars',...files(join(gate,'config-templates')).map(p=>p.slice(join(gate,'config-templates').length+1).replaceAll('\\','/'))].map(p=>[p,sha256(join(app,p))]));
  receipt.pass=true;
} catch(error) {
  receipt.failure=error.message;console.error(error.message);process.exitCode=1;
} finally {
  try { await stop(); } catch(error) { receipt.pass=false;receipt.cleanupFailure=error.message;process.exitCode=1; }
  // Only diagnostic extensions are exported; configs, state databases and vars stay private.
  const secrets=[];
  const varsFiles=[...(gate&&existsSync(gate)?files(gate).filter(p=>p.endsWith('.dev.vars')):[]),...['packages/control-plane','packages/web'].map(p=>join(app,p,'.dev.vars'))];
  for(const p of varsFiles)if(existsSync(p))for(const line of readFileSync(p,'utf8').split(/\r?\n/))if(/^(MASTER_KEY|TEST_BYPASS_SECRET)=/.test(line))secrets.push(line.slice(line.indexOf('=')+1));
  const scrub=text=>{
    for(const value of secrets)if(value)text=text.replaceAll(value,'[local-test-secret]');
    return text.replace(/(small_session=)[^;\s"']+/gi,'$1[local-session]')
      .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi,'$1[redacted]')
      .replace(/("session"\s*:\s*")[^"]+/g,'$1[local-session]');
  };
  if(gate)for(const p of files(gate))if(/\.(log|out|png|jsonl)$/.test(p)||/\.(?:start|exit|owned)\.json$/.test(p)) {
    const target=join(out,'diagnostics',p.slice(gate.length+1));mkdirSync(dirname(target),{recursive:true});
    if(p.endsWith('.png'))copyFileSync(p,target);else writeFileSync(target,scrub(readFileSync(p,'utf8')));
  }
  for(const p of files(out))if(!p.endsWith('.png'))writeFileSync(p,scrub(readFileSync(p,'utf8')));
  receipt.ended=new Date().toISOString();writeFileSync(join(out,phase==='all'||phase==='gate'?'receipt.json':`${phase}-receipt.json`),JSON.stringify(receipt,null,2));
  console.log(JSON.stringify({applicationSha:APP_SHA,harnessSha:actualHarness,pass:receipt.pass,failure:receipt.failure,artifacts:out}));
}
