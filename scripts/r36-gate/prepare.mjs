import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { adaptSharedCanvas, adaptSelectedPill, adaptTutorSlice, adaptRepoBrowser } from './fixture-adapters.mjs';
import { SHARDS, shardScript } from './shards.mjs';
export const FIXTURE_ADAPTERS = {
  'shared-canvas-ask-check.mjs': adaptSharedCanvas,
  'selected-pill-check.mjs': adaptSelectedPill,
  'tutor-slice-check.mjs': adaptTutorSlice,
  'repo-browser-check.mjs': adaptRepoBrowser,
};
// The gate stage each adapted check belongs to, for the adapters.log lines.
const ADAPTED_STAGE = { 'shared-canvas-ask-check.mjs': 'sca', 'selected-pill-check.mjs': 'selected-pill', 'tutor-slice-check.mjs': 'tutor-slice', 'repo-browser-check.mjs': 'repo-browser' };
// The candidate's own answer-routing-check.mjs runs in the gate only when it takes the gate's environment: it reads
// LOCAL_CP_VARS (the private control plane's vars, exported after sketch), as the harness template does. The check on the app's
// branches at 9e2b459e, release/r38-trial and feature/ui-polish-r38 does not: it is bound to the dev review clone (a hostname
// guard, the dev control plane's secret from a local .env, no LOCAL_CP_VARS), so the template runs until the app's check moves.
export const GATE_ENV_MARKER = 'process.env.LOCAL_CP_VARS';
export const SOURCE = fileURLToPath(new URL('.', import.meta.url));
export function files(root) {
  return readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(root,e.name)):[join(root,e.name)]);
}
export const sha256 = p=>createHash('sha256').update(readFileSync(p)).digest('hex');
export function focusedScript(full) {
  const unit=full.indexOf('memcheck unit\n');
  const journey=full.indexOf('# Journeys + tutor slice');
  const after=full.indexOf('# Next Steps on a blank canvas',journey);
  if(unit<0||journey<unit||after<journey)throw Error('Original gate section boundaries changed');
  // The check file each of the two stages runs in this preparation: the r36- copy of an adapted check, or the candidate's own.
  const runFile=stage=>full.match(new RegExp(`^run stack\\.sh ${stage} (\\S+)$`,'m'))?.[1];
  if(!runFile('sca')||!runFile('selected-pill'))throw Error('Original gate section boundaries changed');
  return full.slice(0,unit)+[
    'bash $F/stack.sh restart | tail -1 || exit 6',
    `run stack.sh sca ${runFile('sca')}`,
    `run stack.sh selected-pill ${runFile('selected-pill')}`,
    'powershell -NoProfile -ExecutionPolicy Bypass -File "$F/stop.ps1" | tail -1',
    full.slice(journey,after),
    'powershell -NoProfile -ExecutionPolicy Bypass -File "$LP/stop.ps1" | tail -1',
    'echo R36-FOCUSED-DONE',
    '',
  ].join('\n');
}
export function prepare({app,state,sha,tree,grant}) {
  const gate=resolve(state,'gates/int35').replaceAll('\\','/');
  app=resolve(app).replaceAll('\\','/');
  if(/[\s'"`$]/.test(app+gate))throw Error('Use a short workspace/temp path without shell metacharacters or whitespace');
  for(const folder of ['packages/web','packages/control-plane']) {
    try { readFileSync(join(app,folder,'.dev.vars')); } catch(error) { if(error.code==='ENOENT')continue;throw error; }
    throw Error('Refusing to overwrite existing local credentials; use the disposable checkout');
  }
  const source=join(SOURCE,'templates');
  const replacements=s=>s.replaceAll('@@APP_ROOT@@',app).replaceAll('@@GATE_ROOT@@',gate);
  // The gate judges the candidate's own checks. An adapter rewrites a check only until the app carries the fix itself: a check
  // that already has it runs as it is (no r36- copy), and a stage that needs the adapter still gets one.
  const e2e=join(app,'packages/web/e2e'), notes=[], adapted=new Map();
  for(const [name,adapt] of Object.entries(FIXTURE_ADAPTERS)) {
    const original=readFileSync(join(e2e,name),'utf8'),out=adapt(original);
    adapted.set(name,out===original?null:out);
    notes.push(`${ADAPTED_STAGE[name]}: adapter ${out===original?'not needed':'applied'}`);
  }
  // answer-routing runs the candidate's own check when it takes the gate's environment, else the harness template.
  const candidateRouting=join(e2e,'answer-routing-check.mjs');
  const ownRouting=existsSync(candidateRouting)&&readFileSync(candidateRouting,'utf8').includes(GATE_ENV_MARKER);
  const routingFile=ownRouting?'answer-routing-check.mjs':'r36-routing-operator.mjs';
  notes.push(ownRouting?'answer-routing: the candidate check answer-routing-check.mjs runs as it is'
    :`answer-routing: ${existsSync(candidateRouting)?'the candidate check answer-routing-check.mjs does not take the gate environment (no LOCAL_CP_VARS)':'the candidate has no answer-routing-check.mjs'}; the harness template runs`);
  for(const file of files(source)) {
    const relative=file.slice(source.length+1).replaceAll('\\','/');
    let text=replacements(readFileSync(file,'utf8').replace(/\r\n/g,'\n'));
    if(['fork/stack.sh','fork/stack-app.sh','lp1h/jstack.sh'].includes(relative)) {
      text=text.split('\n').map(line=>{
        if(!line.includes('npx --no-install wrangler dev'))return line;
        const role=line.includes('> $J/cp.log')||line.includes('> "$J/cp.log"')?'cp':'app';
        const root=relative.startsWith('lp1h')?'$R':'$W';
        return line.replace('npx --no-install wrangler dev',`WRANGLER_REGISTRY_PATH=$J/registry-${role} node "$J/../supervise.mjs" "$J/worker-${role}" -- "${root}/node_modules/wrangler/bin/wrangler.js" dev`);
      }).join('\n');
    }
    if(relative==='int35.sh') {
      for (const [name,out] of adapted) if(out!==null) text=text.replaceAll(name, `r36-${name}`);
      text=text.replace('E="BASE=', 'E="WRANGLER_BIN=$W/node_modules/wrangler/bin/wrangler.js BASE=');
      // Every existing e2e invocation is retained, with a supervisor around its Node child.
      text=text.replace(/timeout (\d+) node e2e\/([^\s]+)/g,'timeout $1 node "$J/supervise.mjs" "$J/process-$2" -- e2e/$2');
      text=text.replace('run stack.sh sketch explain-back-sketch-check.mjs','run stack.sh sketch explain-back-sketch-check.mjs\nexport LOCAL_CP_VARS="$W/packages/control-plane/.dev.vars"\nrun stack.sh answer-routing '+routingFile);
    }
    if(['fork/stop.ps1','lp1h/stop.ps1'].includes(relative)) {
      text='param([switch]$DeferPortCheck)\n'+text.replace('if ($taskListeners.Count) {','if ($taskListeners.Count -and -not $DeferPortCheck) {');
      text=text.replace('$taskSnapshot = @(Get-CimInstance Win32_Process)',()=>`# Ask the process observers to retire their recorded children and write exit receipts first.
Get-ChildItem -LiteralPath $PSScriptRoot -Filter 'worker-*.start.json' -ErrorAction SilentlyContinue | ForEach-Object {
  $base=$_.FullName -replace '\\.start\\.json$',''
  Set-Content -LiteralPath "$base.stop" -Value 'stop'
}
Start-Sleep -Seconds 5
$taskSnapshot = @(Get-CimInstance Win32_Process)`);
    }
    const out=join(gate,relative);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,text);
    if(relative==='int35.sh') {
      writeFileSync(join(gate,'focused.sh'),focusedScript(text));
      SHARDS.forEach((_,k)=>writeFileSync(join(gate,`shard-${k+1}.sh`),shardScript(text,k+1)));
    }
  }
  for(const name of ['supervise.mjs','process-watch.ps1','process-ownership.ps1'])copyFileSync(join(SOURCE,name),join(gate,name));
  // Every template stays byte-identical to the ignored config the original preflight compares.
  for(const f of files(join(gate,'config-templates'))) {
    const out=join(app,f.slice(join(gate,'config-templates').length+1));
    mkdirSync(dirname(out),{recursive:true});copyFileSync(f,out);
  }
  const secret=randomBytes(24).toString('hex'), master=randomBytes(32).toString('hex');
  const vars=`SMALL_ENV=test\nTEST_BYPASS_SECRET=${secret}\nMASTER_KEY=${master}\nOAUTH_MOCK=true\nJOURNEY_MODEL_STUB=fixtures\n`;
  for(const folder of ['packages/web','packages/control-plane'])writeFileSync(join(app,folder,'.dev.vars'),vars);
  if(!ownRouting)copyFileSync(join(gate,'answer-routing.mjs'),join(e2e,'r36-routing-operator.mjs'));
  for (const [name, out] of adapted) if(out!==null)writeFileSync(join(e2e,`r36-${name}`), out);
  writeFileSync(join(gate,'adapters.log'),notes.map(line=>`${line}\n`).join(''));
  for(const line of notes)console.log(line);
  mkdirSync(state,{recursive:true});
  writeFileSync(join(state,'heavy-tests.md'),`## Slot\nState: RUNNING\nHolder: Parallel (r35)\nGrant ID: ${grant}\nTarget: ${sha} / ${tree}\nCommand: portable complete gate after Dive reproduction\nStart time: ${new Date().toISOString()}\n`);
  return {gate,secret};
}
