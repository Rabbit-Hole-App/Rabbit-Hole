import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, utimesSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { classifyRetry } from './templates/classify-retry.mjs';
import { prepare, FIXTURE_ADAPTERS } from './prepare.mjs';
import { ORDER, UNIT_STAGES } from './shards.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');
const base = { name: 'cross-device', exitCode: 1, stackAlive: false, checkLog: 'ok 1\nError: timed out', appLog: '[wrangler:info] GET /a 200',
  wranglerLogs: ['Error in ProxyController: Error inside ProxyWorker ... Network connection lost.'], retrySafe: { 'cross-device': 'x' },
  transients: [{ id: 'proxy-keepalive', all: ['Error inside ProxyWorker', 'Network connection lost'] }], workerErrors: ['Uncaught'], retriesUsed: 0 };
test('the recognized transient on a retry-safe check is retried once', () => assert.deepEqual(classifyRetry(base), { retry: true, reason: 'proxy-keepalive' }));
test('a failure with the stack alive is not retried', () => assert.equal(classifyRetry({ ...base, stackAlive: true }).retry, false));
test('an assertion before the stack died is not retried', () => assert.equal(classifyRetry({ ...base, checkLog: '✗ step 2 failed' }).retry, false));
test('a worker exception is a regression, not a transient', () => assert.equal(classifyRetry({ ...base, appLog: 'Uncaught TypeError: x is undefined' }).retry, false));
test('an unknown crash signature is not retried', () => assert.equal(classifyRetry({ ...base, wranglerLogs: ['something else'] }).retry, false));
test('a check not proven retry-safe is not retried', () => assert.equal(classifyRetry({ ...base, retrySafe: {} }).retry, false));
test('more than the per-part budget of retries fails', () => assert.equal(classifyRetry({ ...base, retriesUsed: 2 }).retry, false));

test('a passing check is never retried, and one retry used still leaves budget', () => {
  assert.deepEqual(classifyRetry({ ...base, exitCode: 0 }), { retry: false, reason: 'passed' });
  assert.equal(classifyRetry({ ...base, retriesUsed: 1 }).retry, true);
  assert.equal(classifyRetry({ ...base, retriesUsed: 1, maxRetries: 1 }).retry, false);
});
test('every signature string must be in the same wrangler log entry, not spread over two', () => {
  assert.equal(classifyRetry({ ...base, wranglerLogs: ['Error inside ProxyWorker', 'Network connection lost'] }).retry, false);
});
test('each refusal names its reason', () => {
  assert.match(classifyRetry({ ...base, stackAlive: true }).reason, /stack alive/);
  assert.match(classifyRetry({ ...base, checkLog: 'FAIL x' }).reason, /assertion/);
  assert.match(classifyRetry({ ...base, appLog: 'ReferenceError: y' , workerErrors: ['ReferenceError:'] }).reason, /worker exception/);
  assert.match(classifyRetry({ ...base, wranglerLogs: [] }).reason, /recognized transient/);
  assert.match(classifyRetry({ ...base, retrySafe: {} }).reason, /not proven retry-safe/);
  assert.match(classifyRetry({ ...base, retriesUsed: 2 }).reason, /retry budget of 2/);
});

// ---- a crash of the app is never the transient (spec 2.2: no retry for an out of memory or any other crash) ----
const cfg = JSON.parse(readFileSync(new URL('./templates/transients.json', import.meta.url), 'utf8'));
const real = { ...base, workerErrors: cfg.workerErrors };
test('an out of memory, a fatal kj exception, a D1 error or a stack overflow in the app log is a crash, not the transient', () => {
  for (const appLog of ['Fatal JavaScript out of memory: Reached heap limit', '*** Fatal uncaught kj::Exception: kj/async-io.c++:1: failed', '✘ [ERROR] Error: D1_ERROR: no such table: learn_boards',
    '✘ [ERROR] RangeError: Maximum call stack size exceeded', 'workerd: segfault at 0', 'Process terminated by SIGSEGV', 'out-of-memory in the isolate', 'FATAL: the worker is gone']) {
    const r = classifyRetry({ ...real, appLog: `[wrangler:info] GET /a 200\n${appLog}\n` });
    assert.equal(r.retry, false, appLog);
    assert.match(r.reason, /worker exception/, appLog);
  }
  // The transient's own lines in the app log (its ProxyWorker error, or an empty error line) are not a crash of the app.
  for (const appLog of ['✘ [ERROR] Error in ProxyController: Error inside ProxyWorker\n', '✘ [ERROR]\n\n  Network connection lost.\n', '[wrangler:info] GET /a 200\n[wrangler:info] POST /b 200\n']) {
    assert.deepEqual(classifyRetry({ ...real, appLog }), { retry: true, reason: 'proxy-keepalive' }, appLog);
  }
});
// Process-level deaths of the app's workers (the review's second list): each one, with the stack dead and the signature present, is a crash.
for (const [marker, line] of [['std::bad_alloc', 'terminate called after throwing an instance of std::bad_alloc'], ['Aborted (core dumped)', 'workerd: Aborted (core dumped)'], ['workerd exited with code', 'workerd exited with code 1'],
  ['Unhandled Rejection', 'Unhandled Rejection at: Promise { <rejected> }'], ['ENOMEM', 'Error: spawn ENOMEM']]) {
  test(`${marker} in the app log is a crash, not the transient`, () => {
    assert.deepEqual(classifyRetry({ ...real }), { retry: true, reason: 'proxy-keepalive' });
    const r = classifyRetry({ ...real, appLog: `[wrangler:info] GET /a 200\n${line}\n` });
    assert.equal(r.retry, false, line);
    assert.match(r.reason, /worker exception/, line);
  });
}
test('matching a worker exception ignores case', () => {
  assert.equal(classifyRetry({ ...base, appLog: 'UNCAUGHT in promise' }).retry, false);
  assert.equal(classifyRetry({ ...real, appLog: 'out Of Memory' }).retry, false);
});
// ---- the audit goes stale when the candidate changed the check ----
const safeAt = blob => ({ 'cross-device': { file: 'packages/web/e2e/cross-device-check.mjs', blob, evidence: 'cross-device-check.mjs:17 x' } });
test('a retry-safe entry holds only for the check file it was audited against', () => {
  const entry = { ...base, retrySafe: safeAt('a'.repeat(40)) };
  assert.deepEqual(classifyRetry({ ...entry, candidateBlob: 'a'.repeat(40) }), { retry: true, reason: 'proxy-keepalive' });
  assert.deepEqual(classifyRetry({ ...entry, candidateBlob: 'b'.repeat(40) }), { retry: false, reason: 'retry-safe audit stale (re-audit needed)' });
  // A harness-owned check (answer-routing.mjs) is pinned by the harness sha, not by the candidate tree.
  const harness = { 'answer-routing': { file: 'scripts/r36-gate/templates/answer-routing.mjs', owner: 'harness', blob: 'c'.repeat(40), evidence: 'answer-routing.mjs:30 x' } };
  assert.equal(classifyRetry({ ...base, name: 'answer-routing', retrySafe: harness, candidateBlob: '' }).retry, true);
});
test('a candidate blob that cannot be read is a stale audit, never a pass', () => {
  for (const candidateBlob of [undefined, '']) assert.equal(classifyRetry({ ...base, retrySafe: safeAt('a'.repeat(40)), candidateBlob }).reason, 'retry-safe audit stale (re-audit needed)');
});
// ---- the CLI int35.sh calls: node classify-retry.mjs <name> <exit> <alive 0|1> <checkLog> <stackDir> <retriesUsed> <candidate blob> ----
const CLI = fileURLToPath(new URL('./templates/classify-retry.mjs', import.meta.url));
// wrangler's debug log format (wrangler-dist log-file.ts appendToDebugLogFile): a blank line, `--- <ISO time> <level>`, the message, `---`.
const entry = (msAgo, text, level = 'error') => `\n--- ${new Date(Date.now() - msAgo).toISOString()} ${level}\n${text}\n---\n`;
const SIGNATURE = 'Error in ProxyController: Error inside ProxyWorker\n  cause: Network connection lost.';
function stack(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'r36-retry-cli-'));
  for (const [path, text] of Object.entries(files)) { mkdirSync(join(dir, path, '..'), { recursive: true }); writeFileSync(join(dir, path), text); }
  return dir;
}
const cli = (dir, { name = 'cross-device', exit = 1, alive = 0, log = 'Error: timed out', used = 0, blob = cfg.retrySafe[name]?.blob ?? '' } = {}) => {
  writeFileSync(join(dir, 'check.log'), log);
  const r = spawnSync(process.execPath, [CLI, name, String(exit), String(alive), join(dir, 'check.log'), dir, String(used), blob], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const startedAgo = (dir, seconds) => { writeFileSync(join(dir, 'stage-start'), ''); const t = Date.now() / 1000 - seconds; utimesSync(join(dir, 'stage-start'), t, t); };
test('the signature is the two strings in one wrangler log entry of this stage, not in two entries', () => {
  const dir = stack({ 'wrangler-logs/wrangler-1.log': entry(20000, 'idle', 'log') + entry(5000, SIGNATURE), 'app.log': 'GET / 200' });
  startedAgo(dir, 30);
  const apart = stack({ 'wrangler-logs/wrangler-1.log': entry(8000, 'Error in ProxyController: Error inside ProxyWorker') + entry(5000, 'later: Network connection lost.') });
  try {
    assert.equal(cli(dir), 'retry proxy-keepalive');
    assert.match(cli(apart), /^fail stack died without a recognized transient/);
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(apart, { recursive: true, force: true }); }
});
test('an entry written before the stage started is an earlier crash, however recent the file is', () => {
  const dir = stack({ 'wrangler-logs/wrangler-1.log': entry(60000, SIGNATURE) + entry(2000, 'idle', 'log') });
  startedAgo(dir, 30);
  try {
    assert.match(cli(dir), /^fail stack died without a recognized transient/);
    writeFileSync(join(dir, 'wrangler-logs/wrangler-2.log'), entry(4000, SIGNATURE)); // the stack died during this stage
    assert.equal(cli(dir), 'retry proxy-keepalive');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('text that is not a wrangler log entry carries no signature', () => {
  const dir = stack({ 'wrangler-logs/drill.log': SIGNATURE });
  try { assert.match(cli(dir), /^fail stack died without a recognized transient/); } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('the CLI reads the worker exception from app.log and cp.log', () => {
  for (const file of ['app.log', 'cp.log']) {
    const dir = stack({ 'wrangler-logs/wrangler-1.log': entry(5000, SIGNATURE), [file]: '✘ [ERROR] Uncaught (in promise) TypeError: x' });
    try { assert.match(cli(dir), /^fail worker exception/); } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});
test('the CLI checks the candidate blob against the audited one', () => {
  const dir = stack({ 'wrangler-logs/wrangler-1.log': entry(5000, SIGNATURE) });
  try {
    assert.equal(cli(dir), 'retry proxy-keepalive');
    assert.equal(cli(dir, { blob: '0'.repeat(40) }), 'fail retry-safe audit stale (re-audit needed)');
    assert.equal(cli(dir, { blob: '' }), 'fail retry-safe audit stale (re-audit needed)');
    assert.equal(cli(dir, { name: 'answer-routing' }), 'retry proxy-keepalive');
    assert.equal(cli(dir, { name: 'answer-routing', blob: '' }), 'fail retry-safe audit stale (re-audit needed)');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('the CLI prints fail and exits 0 when the stack dir, the logs or the check are unknown', () => {
  const dir = stack();
  try {
    assert.match(cli(dir), /^fail stack died without a recognized transient/);
    assert.match(cli(dir, { name: 'no-such-check' }), /^fail /);
    const r = spawnSync(process.execPath, [CLI, 'cross-device', '1', '0', join(dir, 'missing.log'), join(dir, 'missing-dir'), '0', ''], { encoding: 'utf8' });
    assert.equal(r.status, 0); assert.match(r.stdout, /^fail /);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('a broken invocation is a fail verdict, never a crash or a retry', () => {
  const r = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^fail classifier error: /);
});

// ---- transients.json: the audit table ----
// Stages that never go through a retry: the units part runs the unit stages, and the bundle checks have no stack to restart.
const NO_RETRY = [...UNIT_STAGES, 'bundle(dist)', 'bundle(dist-dev)'];
const git = (...args) => spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });
test('transients.json decides every gate stage exactly once: retry-safe with its evidence line and audited blob, or not with its reason', () => {
  const safe = Object.keys(cfg.retrySafe), unsafe = Object.keys(cfg.notRetrySafe);
  assert.deepEqual([...safe, ...unsafe].sort(), [...ORDER].sort(), 'a stage added to or removed from the gate needs an audit decision here');
  assert.deepEqual(unsafe.filter(s => NO_RETRY.includes(s)).sort(), [...NO_RETRY].sort());
  for (const [stage, e] of Object.entries(cfg.retrySafe)) {
    assert.match(e.evidence, /^[\w.-]+\.mjs:\d+ \S/, `${stage}: evidence starts with file:line`);
    assert.match(e.blob, /^[0-9a-f]{40}$/, `${stage}: the audited blob`);
    assert.match(e.file, /^(packages\/web\/e2e|scripts\/r36-gate\/templates)\/[\w.-]+\.mjs$/, `${stage}: the audited file`);
    assert.ok(e.evidence.startsWith(e.file.split('/').at(-1)), `${stage}: the evidence cites its own file`);
  }
  for (const [stage, why] of Object.entries(cfg.notRetrySafe)) assert.ok(why.length > 20, `${stage}: a reason`);
});
test('the audited blobs are the files of 9e2b459e (an entry a harness owns would be its template as committed)', { skip: git('cat-file', '-e', '9e2b459e').status !== 0 }, () => {
  for (const [stage, e] of Object.entries(cfg.retrySafe)) {
    if (e.owner === 'harness') assert.equal(git('hash-object', e.file).stdout.trim(), e.blob, `${stage}: the harness template changed, so its audit needs a re-read`);
    else assert.equal(git('rev-parse', `9e2b459e:${e.file}`).stdout.trim(), e.blob, stage);
  }
});
test('project-canvases stays out: its published-feed filter is a fixed project label shared by every run', () => {
  assert.ok(!('project-canvases' in cfg.retrySafe));
  assert.match(cfg.notRetrySafe['project-canvases'], /acme\/project-canvases/);
});
test('the retry rule: one transient, two retries a part, two a gate', () => {
  assert.deepEqual(cfg.transients, [{ id: 'proxy-keepalive', all: ['Error inside ProxyWorker', 'Network connection lost'] }]);
  assert.equal(cfg.maxRetriesPerPart, 2);
  assert.equal(cfg.maxRetriesPerGate, 2);
  for (const e of ['Uncaught', '✘ [ERROR] Uncaught', 'TypeError:', 'ReferenceError:', 'SyntaxError:', 'RangeError:', 'out of memory', 'Fatal', 'kj::Exception', 'SIGSEGV', 'segfault', 'std::bad_alloc', 'Aborted (core dumped)', 'workerd exited with code', 'Unhandled Rejection', 'ENOMEM']) assert.ok(cfg.workerErrors.includes(e), e);
});

// ---- the prepared gate ----
test('the prepared gate carries the classifier, the stack scripts log wrangler, and every rerun in int35.sh is qualified', () => {
  const root = mkdtempSync(join(tmpdir(), 'r36-retry-prep-'));
  try {
    const app = join(root, 'app');
    mkdirSync(join(app, 'packages/web/e2e'), { recursive: true });
    assert.ok(process.env.R36_FIXTURE_SOURCE_ROOT, 'R36_FIXTURE_SOURCE_ROOT must identify the reviewed application checkout');
    for (const name of Object.keys(FIXTURE_ADAPTERS)) copyFileSync(join(process.env.R36_FIXTURE_SOURCE_ROOT, 'packages/web/e2e', name), join(app, 'packages/web/e2e', name));
    const { gate } = prepare({ app, state: join(root, 'state'), sha: 'a'.repeat(40), tree: 'b'.repeat(40), grant: 'self-test' });
    assert.deepEqual(JSON.parse(readFileSync(join(gate, 'transients.json'), 'utf8')), cfg);
    assert.equal(spawnSync(process.execPath, [join(gate, 'classify-retry.mjs'), 'cross-device', '0', '1', join(root, 'none'), root, '0', ''], { encoding: 'utf8' }).stdout.trim(), 'fail passed');
    for (const script of ['fork/stack.sh', 'fork/stack-app.sh', 'lp1h/jstack.sh']) {
      const text = readFileSync(join(gate, script), 'utf8');
      const log = text.indexOf('export WRANGLER_LOG=debug WRANGLER_LOG_PATH="$J/wrangler-logs"; mkdir -p "$WRANGLER_LOG_PATH"');
      assert.ok(log > 0, `${script} exports the wrangler debug log`);
      assert.ok(log < text.indexOf('supervise.mjs'), `${script}: before the first wrangler start`);
    }
    const int35 = readFileSync(join(gate, 'int35.sh'), 'utf8');
    assert.doesNotMatch(int35, /rerun once|One rerun on any failure/);
    const sites = [...int35.matchAll(/^( *)if retry_check ([^\n]*); then\n\1  (bash [^\n]*)\n/gm)];
    // run(), canvas-toolbar, rh-local, journey, tutor-slice, blank-hooks, practice-card, canvas-chrome
    assert.equal(int35.match(/^ *if retry_check /gm).length, 8);
    assert.equal(sites.length, 8, 'each call site restarts the stack on the very next line');
    for (const [, , , restart] of sites) assert.match(restart, /^bash \$(?:F\/(?:\$S|stack\.sh) restart|LP\/jstack\.sh) \| tail -1$/);
    assert.deepEqual(sites.map(s => s[2].match(/^('[^']+'|\S+)/)[1]), ['"$N"', 'canvas-toolbar', 'rh-local', "'journey J1-J8'", 'tutor-slice', 'blank-hooks', 'practice-card', 'canvas-chrome']);
    // The file each site hands retry_check is the file its stage was audited against.
    const runFile = Object.fromEntries([...int35.matchAll(/^ *run stack(?:-app)?\.sh ([\w()-]+) (r36-)?([\w.-]+\.mjs)$/gm)].map(m => [m[1], m[3]]));
    for (const beta of ['library-folders', 'share-revocation']) runFile[beta] = `${beta}-check.mjs`;
    const siteFile = Object.fromEntries(sites.slice(1).map(s => [s[2].match(/^('[^']+'|\S+)/)[1].replaceAll("'", ''), s[2].match(/"?packages\/web\/e2e\/(?:r36-)?([\w.-]+\.mjs)"?$/)?.[1]]));
    assert.match(sites[0][2], /"packages\/web\/e2e\/\$\{C#r36-\}"$/, 'run() hands over the check file it runs');
    for (const [stage, e] of Object.entries(cfg.retrySafe)) {
      if (e.owner === 'harness') continue;
      if (stage === 'answer-routing') continue; // the template or the candidate's own check runs: prepare-sources.test.mjs
      const file = runFile[stage] ?? siteFile[stage];
      assert.ok(file, `${stage}: int35.sh hands its check file to retry_check`);
      assert.equal(`packages/web/e2e/${file}`, e.file, stage);
    }
    const bash = process.env.GATE_BASH || process.env.GIT_BASH_PATH;
    if (bash) assert.equal(spawnSync(bash, ['-n', join(gate, 'int35.sh')], { windowsHide: true }).status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---- retry_check in a real bash: the verdict, the budget and the first attempt's evidence ----
const bash = process.env.GATE_BASH || process.env.GIT_BASH_PATH;
const helper = readFileSync(new URL('./templates/int35.sh', import.meta.url), 'utf8').replace(/\r\n/g, '\n').match(/^retry_check\(\) \{\n[\s\S]*?\n\}\n/m)?.[0];
const posix = p => p.replaceAll('\\', '/');
const CHECK = 'packages/web/e2e/cross-device-check.mjs';
// A candidate repository holding one check, and a transients.json whose entries were audited against that check (or, with
// `audited: 'other'`, against a different version of it).
function shell(files, call, { retries = 0, curl = 'return 1', audited = 'same' } = {}) {
  assert.ok(helper, 'int35.sh defines retry_check');
  const dir = stack(files), gate = join(dir, 'gate'), repo = join(dir, 'repo');
  mkdirSync(gate); mkdirSync(join(repo, 'packages/web/e2e'), { recursive: true });
  writeFileSync(join(repo, CHECK), 'console.log("cross-device");\n');
  const run = (...args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  run('init', '-q'); run('add', '-A');
  const tree = run('write-tree').stdout.trim(), blob = run('rev-parse', `:${CHECK}`).stdout.trim();
  assert.match(blob, /^[0-9a-f]{40}$/);
  const e = { file: CHECK, blob: audited === 'same' ? blob : '0'.repeat(40), evidence: 'cross-device-check.mjs:17 x' };
  writeFileSync(join(gate, 'transients.json'), JSON.stringify({ ...cfg, retrySafe: { 'cross-device': e, 'journey J1-J8': e } }));
  copyFileSync(new URL('./templates/classify-retry.mjs', import.meta.url), join(gate, 'classify-retry.mjs'));
  const script = `J=${posix(gate)}\nW=${posix(repo)}\nINT35_EXPECTED_TREE=${tree}\nRETRIES=${retries}\ncurl() { ${curl}; }\n${helper}\nD=${posix(dir)}\n${call}\necho "status=$? retries=$RETRIES id=$RETRY_ID"\n`;
  const r = spawnSync(bash, ['-c', script], { encoding: 'utf8', windowsHide: true });
  return { dir, out: r.stdout, err: r.stderr };
}
const skip = !bash;
const LOGS = { 'wrangler-logs/wrangler-1.log': entry(3000, SIGNATURE) };
test('retry_check: the signature on a retry-safe check saves the first attempt and counts the retry', { skip }, () => {
  const { dir, out } = shell({ 'check.log': 'ok 1\nError: timed out', 'app.log': 'app', 'cp.log': 'cp', ...LOGS, 'shots/a.png': 'png' },
    `retry_check cross-device 1 "$D/check.log" "$D" 0 "$D/shots" ${CHECK}`);
  try {
    assert.match(out, /cross-device: exit 1 \(stack alive: no\) - retry proxy-keepalive\n/);
    assert.match(out, /status=0 retries=1 id=proxy-keepalive\n$/);
    const e1 = join(dir, 'attempt-1/cross-device');
    assert.equal(readFileSync(join(e1, 'check.log'), 'utf8'), 'ok 1\nError: timed out');
    assert.equal(readFileSync(join(e1, 'app.log'), 'utf8'), 'app');
    assert.equal(readFileSync(join(e1, 'cp.log'), 'utf8'), 'cp');
    assert.equal(readFileSync(join(e1, 'wrangler-logs/wrangler-1.log'), 'utf8'), LOGS['wrangler-logs/wrangler-1.log']);
    assert.equal(readFileSync(join(e1, 'shots/a.png'), 'utf8'), 'png');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('retry_check: a candidate whose check differs from the audited one is not retry-safe, and says so', { skip }, () => {
  const call = `retry_check cross-device 1 "$D/check.log" "$D" 0 "" ${CHECK}`;
  // The prepared gate hands the adapted r36- file name; the audit is of the original file in the candidate tree.
  const same = shell({ 'check.log': 'timed out', ...LOGS }, 'retry_check cross-device 1 "$D/check.log" "$D" 0 "" packages/web/e2e/r36-cross-device-check.mjs');
  try { assert.match(same.out, /status=0 retries=1 id=proxy-keepalive/); assert.doesNotMatch(same.out, /audit stale/); } finally { rmSync(same.dir, { recursive: true, force: true }); }
  const changed = shell({ 'check.log': 'timed out', ...LOGS }, call, { audited: 'other' });
  try {
    assert.match(changed.out, /^cross-device: retry-safe audit stale \(re-audit needed\)$/m);
    assert.match(changed.out, /status=1 retries=0 id=\n$/);
    assert.ok(!existsSync(join(changed.dir, 'attempt-1')));
  } finally { rmSync(changed.dir, { recursive: true, force: true }); }
  const missing = shell({ 'check.log': 'timed out', ...LOGS }, 'retry_check cross-device 1 "$D/check.log" "$D" 0 "" packages/web/e2e/no-such-check.mjs');
  try { assert.match(missing.out, /^cross-device: retry-safe audit stale \(re-audit needed\)$/m); assert.match(missing.out, /status=1/); } finally { rmSync(missing.dir, { recursive: true, force: true }); }
});
test('retry_check: a refusal changes nothing and says why', { skip }, () => {
  const files = { 'check.log': 'FAIL step 2', ...LOGS };
  const { dir, out } = shell(files, `retry_check cross-device 1 "$D/check.log" "$D" 0 "" ${CHECK}`);
  try {
    assert.match(out, /cross-device: exit 1 \(stack alive: no\) - fail assertion failure/);
    assert.match(out, /status=1 retries=0 id=\n$/);
    assert.ok(!existsSync(join(dir, 'attempt-1')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const spent = shell({ ...files, 'check.log': 'timed out' }, `retry_check cross-device 1 "$D/check.log" "$D" 0 "" ${CHECK}`, { retries: 2 });
  try { assert.match(spent.out, /fail retry budget of 2 used in this part[\s\S]*status=1 retries=2/); } finally { rmSync(spent.dir, { recursive: true, force: true }); }
  const alive = shell({ ...files, 'check.log': 'timed out' }, `retry_check cross-device 1 "$D/check.log" "$D" 1 "" ${CHECK}`);
  try { assert.match(alive.out, /\(stack alive: yes\) - fail failed with the stack alive[\s\S]*status=1/); } finally { rmSync(alive.dir, { recursive: true, force: true }); }
});
test('retry_check: a stage name with spaces keeps its evidence in a directory without them', { skip }, () => {
  const { dir, out } = shell({ 'check.log': 'timed out', ...LOGS }, `retry_check 'journey J1-J8' 1 "$D/check.log" "$D" 0 "" ${CHECK}`);
  try {
    assert.match(out, /journey J1-J8: exit 1 .* - retry proxy-keepalive/);
    assert.deepEqual(readdirSync(join(dir, 'attempt-1')), ['journey-J1-J8']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('retry_check: provider calls the first attempt made are not erased by the restart', { skip }, () => {
  const files = { 'check.log': 'timed out', ...LOGS }, call = `retry_check cross-device 1 "$D/check.log" "$D" 0 "" ${CHECK}`;
  const hit = shell(files, call, { curl: `echo '{"hits":[{"u":"a"},{"u":"b"}]}'` });
  try { assert.match(hit.out, /^cross-device attempt-1 provider-tripwire hits: 2$/m); } finally { rmSync(hit.dir, { recursive: true, force: true }); }
  const none = shell(files, call); // the dead stack cannot answer: no line, no failure
  try { assert.doesNotMatch(none.out, /attempt-1 provider-tripwire/); assert.match(none.out, /status=0 retries=1/); } finally { rmSync(none.dir, { recursive: true, force: true }); }
});
