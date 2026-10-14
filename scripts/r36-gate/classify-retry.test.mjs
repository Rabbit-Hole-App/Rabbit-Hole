import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, utimesSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { classifyRetry } from './templates/classify-retry.mjs';
import { prepare, FIXTURE_ADAPTERS } from './prepare.mjs';
import { ORDER, UNIT_STAGES } from './shards.mjs';

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
test('every signature string must be in the same wrangler log, not spread over two', () => {
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

// ---- the CLI int35.sh calls: node classify-retry.mjs <name> <exit> <alive 0|1> <checkLog> <stackDir> <retriesUsed> ----
const CLI = fileURLToPath(new URL('./templates/classify-retry.mjs', import.meta.url));
const SIGNATURE = 'Error in ProxyController: Error inside ProxyWorker: Network connection lost.';
function stack(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'r36-retry-cli-'));
  for (const [path, text] of Object.entries(files)) { mkdirSync(join(dir, path, '..'), { recursive: true }); writeFileSync(join(dir, path), text); }
  return dir;
}
const cli = (dir, { name = 'cross-device', exit = 1, alive = 0, log = 'Error: timed out', used = 0 } = {}) => {
  writeFileSync(join(dir, 'check.log'), log);
  const r = spawnSync(process.execPath, [CLI, name, String(exit), String(alive), join(dir, 'check.log'), dir, String(used)], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
test('the CLI prints retry <id> for the signature in a wrangler log of the stack', () => {
  const dir = stack({ 'wrangler-logs/wrangler-1.log': SIGNATURE, 'app.log': 'GET / 200' });
  try { assert.equal(cli(dir), 'retry proxy-keepalive'); } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('the CLI reads the worker exception from app.log and cp.log', () => {
  for (const file of ['app.log', 'cp.log']) {
    const dir = stack({ 'wrangler-logs/wrangler-1.log': SIGNATURE, [file]: '✘ [ERROR] Uncaught (in promise) TypeError: x' });
    try { assert.match(cli(dir), /^fail worker exception/); } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});
test('the CLI prints fail and exits 0 when the stack dir, the logs or the check are unknown', () => {
  const dir = stack();
  try {
    assert.match(cli(dir), /^fail stack died without a recognized transient/);
    assert.match(cli(dir, { name: 'no-such-check' }), /^fail /);
    const r = spawnSync(process.execPath, [CLI, 'cross-device', '1', '0', join(dir, 'missing.log'), join(dir, 'missing-dir'), '0'], { encoding: 'utf8' });
    assert.equal(r.status, 0); assert.match(r.stdout, /^fail /);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('a broken invocation is a fail verdict, never a crash or a retry', () => {
  const r = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^fail classifier error: /);
});
test('a wrangler log written before the stage started belongs to an earlier crash, so it is not this stage\'s signature', () => {
  const dir = stack({ 'wrangler-logs/old.log': SIGNATURE, 'wrangler-logs/new.log': 'idle', 'stage-start': '' });
  const now = Date.now() / 1000;
  utimesSync(join(dir, 'wrangler-logs/old.log'), now - 60, now - 60);
  utimesSync(join(dir, 'stage-start'), now - 30, now - 30);
  utimesSync(join(dir, 'wrangler-logs/new.log'), now - 5, now - 5);
  try {
    assert.match(cli(dir), /^fail stack died without a recognized transient/);
    writeFileSync(join(dir, 'wrangler-logs/new.log'), SIGNATURE); // the stack died during this stage
    utimesSync(join(dir, 'wrangler-logs/new.log'), now - 5, now - 5);
    assert.equal(cli(dir), 'retry proxy-keepalive');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- transients.json: the audit table ----
const cfg = JSON.parse(readFileSync(new URL('./templates/transients.json', import.meta.url), 'utf8'));
// Stages that never go through a retry: the units part runs the unit stages, and the bundle checks have no stack to restart.
const NO_RETRY = [...UNIT_STAGES, 'bundle(dist)', 'bundle(dist-dev)'];
test('transients.json decides every gate stage exactly once: retry-safe with its evidence line, or not with its reason', () => {
  const safe = Object.keys(cfg.retrySafe), unsafe = Object.keys(cfg.notRetrySafe);
  assert.deepEqual([...safe, ...unsafe].sort(), [...ORDER].sort(), 'a stage added to or removed from the gate needs an audit decision here');
  assert.deepEqual(unsafe.filter(s => NO_RETRY.includes(s)).sort(), [...NO_RETRY].sort());
  for (const [stage, evidence] of Object.entries(cfg.retrySafe)) assert.match(evidence, /^[\w.-]+\.mjs:\d+ \S/, `${stage}: evidence starts with file:line`);
  for (const [stage, why] of Object.entries(cfg.notRetrySafe)) assert.ok(why.length > 20, `${stage}: a reason`);
});
test('project-canvases stays out: its published-feed filter is a fixed project label shared by every run', () => {
  assert.ok(!('project-canvases' in cfg.retrySafe));
  assert.match(cfg.notRetrySafe['project-canvases'], /acme\/project-canvases/);
});
test('the retry rule is the one in the brief: one transient, two retries a part', () => {
  assert.deepEqual(cfg.transients, [{ id: 'proxy-keepalive', all: ['Error inside ProxyWorker', 'Network connection lost'] }]);
  assert.equal(cfg.maxRetriesPerPart, 2);
  for (const e of ['Uncaught', '✘ [ERROR] Uncaught', 'TypeError:', 'ReferenceError:', 'SyntaxError:']) assert.ok(cfg.workerErrors.includes(e), e);
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
    assert.equal(spawnSync(process.execPath, [join(gate, 'classify-retry.mjs'), 'cross-device', '0', '1', join(root, 'none'), root, '0'], { encoding: 'utf8' }).stdout.trim(), 'fail passed');
    for (const script of ['fork/stack.sh', 'fork/stack-app.sh', 'lp1h/jstack.sh']) {
      const text = readFileSync(join(gate, script), 'utf8');
      const log = text.indexOf('export WRANGLER_LOG=debug WRANGLER_LOG_PATH="$J/wrangler-logs"; mkdir -p "$WRANGLER_LOG_PATH"');
      assert.ok(log > 0, `${script} exports the wrangler debug log`);
      assert.ok(log < text.indexOf('supervise.mjs'), `${script}: before the first wrangler start`);
    }
    const int35 = readFileSync(join(gate, 'int35.sh'), 'utf8');
    assert.doesNotMatch(int35, /rerun once|One rerun on any failure/);
    const sites = [...int35.matchAll(/^( *)if retry_check [^\n]*; then\n\1  (bash [^\n]*)\n/gm)];
    // run(), canvas-toolbar, rh-local, journey, tutor-slice, blank-hooks, practice-card, canvas-chrome
    assert.equal(int35.match(/^ *if retry_check /gm).length, 8);
    assert.equal(sites.length, 8, 'each call site restarts the stack on the very next line');
    for (const [, , restart] of sites) assert.match(restart, /^bash \$(?:F\/(?:\$S|stack\.sh) restart|LP\/jstack\.sh) \| tail -1$/);
    assert.deepEqual(sites.map(s => s[0].match(/retry_check ('[^']+'|\S+)/)[1]), ['"$N"', 'canvas-toolbar', 'rh-local', "'journey J1-J8'", 'tutor-slice', 'blank-hooks', 'practice-card', 'canvas-chrome']);
    const bash = process.env.GATE_BASH || process.env.GIT_BASH_PATH;
    if (bash) assert.equal(spawnSync(bash, ['-n', join(gate, 'int35.sh')], { windowsHide: true }).status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---- retry_check in a real bash: the verdict, the budget and the first attempt's evidence ----
const bash = process.env.GATE_BASH || process.env.GIT_BASH_PATH;
const helper = readFileSync(new URL('./templates/int35.sh', import.meta.url), 'utf8').replace(/\r\n/g, '\n').match(/^retry_check\(\) \{\n[\s\S]*?\n\}\n/m)?.[0];
const posix = p => p.replaceAll('\\', '/');
function shell(files, call, { retries = 0, curl = 'return 1' } = {}) {
  assert.ok(helper, 'int35.sh defines retry_check');
  const dir = stack(files), gate = join(dir, 'gate');
  mkdirSync(gate);
  for (const f of ['classify-retry.mjs', 'transients.json']) copyFileSync(new URL(`./templates/${f}`, import.meta.url), join(gate, f));
  const script = `J=${posix(gate)}\nRETRIES=${retries}\ncurl() { ${curl}; }\n${helper}\nD=${posix(dir)}\n${call}\necho "status=$? retries=$RETRIES id=$RETRY_ID"\n`;
  const r = spawnSync(bash, ['-c', script], { encoding: 'utf8', windowsHide: true });
  return { dir, out: r.stdout, err: r.stderr };
}
const skip = !bash;
test('retry_check: the signature on a retry-safe check saves the first attempt and counts the retry', { skip }, () => {
  const { dir, out } = shell({ 'check.log': 'ok 1\nError: timed out', 'app.log': 'app', 'cp.log': 'cp', 'wrangler-logs/wrangler-1.log': SIGNATURE, 'shots/a.png': 'png' },
    'retry_check cross-device 1 "$D/check.log" "$D" 0 "$D/shots"');
  try {
    assert.match(out, /cross-device: exit 1 \(stack alive: no\) - retry proxy-keepalive\n/);
    assert.match(out, /status=0 retries=1 id=proxy-keepalive\n$/);
    const e1 = join(dir, 'attempt-1/cross-device');
    assert.equal(readFileSync(join(e1, 'check.log'), 'utf8'), 'ok 1\nError: timed out');
    assert.equal(readFileSync(join(e1, 'app.log'), 'utf8'), 'app');
    assert.equal(readFileSync(join(e1, 'cp.log'), 'utf8'), 'cp');
    assert.equal(readFileSync(join(e1, 'wrangler-logs/wrangler-1.log'), 'utf8'), SIGNATURE);
    assert.equal(readFileSync(join(e1, 'shots/a.png'), 'utf8'), 'png');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('retry_check: a refusal changes nothing and says why', { skip }, () => {
  const files = { 'check.log': 'FAIL step 2', 'wrangler-logs/wrangler-1.log': SIGNATURE };
  const { dir, out } = shell(files, 'retry_check cross-device 1 "$D/check.log" "$D" 0');
  try {
    assert.match(out, /cross-device: exit 1 \(stack alive: no\) - fail assertion failure/);
    assert.match(out, /status=1 retries=0 id=\n$/);
    assert.ok(!existsSync(join(dir, 'attempt-1')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const spent = shell({ ...files, 'check.log': 'timed out' }, 'retry_check cross-device 1 "$D/check.log" "$D" 0', { retries: 2 });
  try { assert.match(spent.out, /fail retry budget of 2 used in this part[\s\S]*status=1 retries=2/); } finally { rmSync(spent.dir, { recursive: true, force: true }); }
  const alive = shell({ ...files, 'check.log': 'timed out' }, 'retry_check cross-device 1 "$D/check.log" "$D" 1');
  try { assert.match(alive.out, /\(stack alive: yes\) - fail failed with the stack alive[\s\S]*status=1/); } finally { rmSync(alive.dir, { recursive: true, force: true }); }
});
test('retry_check: a stage name with spaces keeps its evidence in a directory without them', { skip }, () => {
  const { dir, out } = shell({ 'check.log': 'timed out', 'wrangler-logs/wrangler-1.log': SIGNATURE }, "retry_check 'journey J1-J8' 1 \"$D/check.log\" \"$D\" 0");
  try {
    assert.match(out, /journey J1-J8: exit 1 .* - retry proxy-keepalive/);
    assert.deepEqual(readdirSync(join(dir, 'attempt-1')), ['journey-J1-J8']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('retry_check: provider calls the first attempt made are not erased by the restart', { skip }, () => {
  const files = { 'check.log': 'timed out', 'wrangler-logs/wrangler-1.log': SIGNATURE };
  const hit = shell(files, 'retry_check cross-device 1 "$D/check.log" "$D" 0', { curl: `echo '{"hits":[{"u":"a"},{"u":"b"}]}'` });
  try { assert.match(hit.out, /^cross-device attempt-1 provider-tripwire hits: 2$/m); } finally { rmSync(hit.dir, { recursive: true, force: true }); }
  const none = shell(files, 'retry_check cross-device 1 "$D/check.log" "$D" 0'); // the dead stack cannot answer: no line, no failure
  try { assert.doesNotMatch(none.out, /attempt-1 provider-tripwire/); assert.match(none.out, /status=0 retries=1/); } finally { rmSync(none.dir, { recursive: true, force: true }); }
});
