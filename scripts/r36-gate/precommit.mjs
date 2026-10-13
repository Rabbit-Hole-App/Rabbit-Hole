// Full units for one reviewed, uncommitted application tree on the clean Windows runner.
// This is precommit evidence only, never a complete gate attestation.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const app = resolve(process.env.APP_ROOT || '.');
const bash = process.env.GATE_BASH;
if (!bash) throw Error('GATE_BASH must identify supported Git Bash');
if (process.argv.includes('--unit-child')) {
  const child = spawn(bash, ['-c', 'cd -- "$APP_ROOT" && make test-unit'], {
    cwd: app, windowsHide: true, stdio: 'inherit',
    env: { ...process.env, APP_ROOT: app.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`) },
  });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const out = resolve(process.env.ARTIFACT_ROOT || (() => { throw Error('ARTIFACT_ROOT required'); })());
  mkdirSync(out, { recursive: true });
  const patch = fileURLToPath(new URL('./patches/routing-proposal.patch', import.meta.url));
  const baseSha = '46fbe04283a424e69db5272f9e1f3c7b9c19e846';
  const baseTree = '2555e2aa4a6784b2984e629ee5ed77dd37bff0be';
  const testedTree = '3f28a065c11254583d4e3eb88372e9f7dfa63f78';
  const expectedFiles = ['packages/web/src/answer-destination.js', 'packages/web/src/answer-destination.test.mjs'];
  const git = (...args) => execFileSync('git', args, { cwd: app, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const receipt = { kind: 'precommit-unit-only', baseSha, baseTree, testedTree, harnessSha: process.env.HARNESS_SHA,
    node: process.version, command: 'make test-unit', started: new Date().toISOString(), pass: false };
  try {
    const harness = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dirname(fileURLToPath(import.meta.url)), encoding: 'utf8' }).trim();
    if (receipt.harnessSha !== harness || process.version !== 'v24.19.0') throw Error('Harness identity or Node pin mismatch');
    const patchText=readFileSync(patch,'utf8').replaceAll('\r\n','\n');
    receipt.patchSha256 = createHash('sha256').update(patchText).digest('hex');
    if(receipt.patchSha256!=='0a78a297bd24c6b299c5f32f9f491151a29f21d961a2db81837286d0e7034758')throw Error('Reviewed patch content changed');
    const normalizedPatch=join(out,'routing-proposal.patch');
    writeFileSync(normalizedPatch,patchText);
    receipt.lockfiles = Object.fromEntries(['package-lock.json', 'uv.lock'].map(name => [name, createHash('sha256').update(readFileSync(join(app, name))).digest('hex')]));
    receipt.baseCheck={sha:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),indexTree:git('write-tree'),changed:git('diff','--name-only','HEAD')};
    // npm rewrites bin line endings on Windows. Match the application's verifier:
    // normalized tracked content and index identity, not the stat-cache status flag.
    if (receipt.baseCheck.sha !== baseSha || receipt.baseCheck.tree !== baseTree || receipt.baseCheck.indexTree !== baseTree || receipt.baseCheck.changed) throw Error('Base application identity or tracked content mismatch');
    const privateBindings = Object.entries(process.env).filter(([name, value]) => value && /_API_KEY$|^CLOUDFLARE_API_TOKEN$|^ELEVENLABS_|^SUBSCRIPTION_/i.test(name));
    if (privateBindings.length) throw Error(`Disallowed credential binding names: ${privateBindings.map(([name]) => name).join(', ')}`);
    receipt.freeMiB = Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', '[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1024)'], { encoding: 'utf8', timeout: 30000 }).trim());
    if (!Number.isFinite(receipt.freeMiB) || receipt.freeMiB < 1500) throw Error('Precommit memory guard requires at least1500MiB free');
    git('apply', '--check', normalizedPatch);
    git('apply', '--index', normalizedPatch);
    const changed = git('diff', '--cached', '--name-only').split(/\r?\n/).sort();
    if (JSON.stringify(changed) !== JSON.stringify(expectedFiles) || git('write-tree') !== testedTree || git('diff', '--name-only')) throw Error('Reviewed patch tree or changed-file scope mismatch');
    const unitLog = join(out, 'unit.log');
    const child = spawn(process.execPath, [fileURLToPath(new URL('./supervise.mjs', import.meta.url)), join(out, 'unit-process'), '--', fileURLToPath(import.meta.url), '--unit-child'], { cwd: app, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const { appendFileSync } = await import('node:fs');
    for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { appendFileSync(unitLog, bytes); process.stdout.write(bytes); });
    const timer = setTimeout(() => {
      receipt.timeout = true;
      for (const name of readdirSync(out).filter(name => name.startsWith('unit-process-') && name.endsWith('.start.json'))) {
        writeFileSync(join(out, name.replace(/\.start\.json$/, '.stop')), 'precommit unit timeout: retire only observed descendants');
      }
    }, 20 * 60 * 1000);
    try {
      receipt.exit = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', code => done(code)); });
    } finally { clearTimeout(timer); }
    const monitorFiles = readdirSync(out).filter(name => name.startsWith('unit-process-') && name.endsWith('.monitor-exit.json'));
    receipt.cleanupPassed = monitorFiles.length === 1 && JSON.parse(readFileSync(join(out, monitorFiles[0]), 'utf8')).code === 0;
    receipt.unchanged = git('rev-parse', 'HEAD') === baseSha && git('write-tree') === testedTree && !git('diff', '--name-only');
    receipt.pass = receipt.exit === 0 && !receipt.timeout && receipt.cleanupPassed && receipt.unchanged;
    if (!receipt.pass) throw Error('Precommit units, cleanup or tested-tree integrity failed');
  } catch (error) { receipt.failure = error.message; process.exitCode = 1; }
  receipt.ended = new Date().toISOString();
  writeFileSync(join(out, 'precommit-receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
}
