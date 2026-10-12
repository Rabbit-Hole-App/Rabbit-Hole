import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
export const SOURCE = fileURLToPath(new URL('.', import.meta.url));
export function files(root) {
  return readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(root,e.name)):[join(root,e.name)]);
}
export const sha256 = p=>createHash('sha256').update(readFileSync(p)).digest('hex');
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
      // Every existing e2e invocation is retained, with a supervisor around its Node child.
      text=text.replace(/timeout (\d+) node e2e\/([^\s]+)/g,'timeout $1 node "$J/supervise.mjs" "$J/process-$2" -- e2e/$2');
      text=text.replace('run stack.sh sketch explain-back-sketch-check.mjs','run stack.sh sketch explain-back-sketch-check.mjs\nexport LOCAL_CP_VARS="$W/packages/control-plane/.dev.vars"\nrun stack.sh answer-routing r36-routing-operator.mjs');
    }
    if(['fork/stop.ps1','lp1h/stop.ps1'].includes(relative)) {
      text='param([switch]$DeferPortCheck)\n'+text.replace('if ($taskListeners.Count) {','if ($taskListeners.Count -and -not $DeferPortCheck) {');
      text=text.replace('$taskSnapshot = @(Get-CimInstance Win32_Process)',`# Ask the process observers to retire their recorded children and write exit receipts first.
Get-ChildItem -LiteralPath $PSScriptRoot -Filter 'worker-*.start.json' -ErrorAction SilentlyContinue | ForEach-Object {
  $base=$_.FullName -replace '\\.start\\.json$',''
  Set-Content -LiteralPath "$base.stop" -Value 'stop'
}
Start-Sleep -Seconds 5
$taskSnapshot = @(Get-CimInstance Win32_Process)`);
    }
    const out=join(gate,relative);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,text);
  }
  for(const name of ['supervise.mjs','process-watch.ps1'])copyFileSync(join(SOURCE,name),join(gate,name));
  // Every template stays byte-identical to the ignored config the original preflight compares.
  for(const f of files(join(gate,'config-templates'))) {
    const out=join(app,f.slice(join(gate,'config-templates').length+1));
    mkdirSync(dirname(out),{recursive:true});copyFileSync(f,out);
  }
  const secret=randomBytes(24).toString('hex'), master=randomBytes(32).toString('hex');
  const vars=`SMALL_ENV=test\nTEST_BYPASS_SECRET=${secret}\nMASTER_KEY=${master}\nOAUTH_MOCK=true\nJOURNEY_MODEL_STUB=fixtures\n`;
  for(const folder of ['packages/web','packages/control-plane'])writeFileSync(join(app,folder,'.dev.vars'),vars);
  copyFileSync(join(gate,'answer-routing.mjs'),join(app,'packages/web/e2e/r36-routing-operator.mjs'));
  mkdirSync(state,{recursive:true});
  writeFileSync(join(state,'heavy-tests.md'),`## Slot\nState: RUNNING\nHolder: Parallel (r35)\nGrant ID: ${grant}\nTarget: ${sha} / ${tree}\nCommand: portable complete gate after Dive reproduction\nStart time: ${new Date().toISOString()}\n`);
  return {gate,secret};
}
