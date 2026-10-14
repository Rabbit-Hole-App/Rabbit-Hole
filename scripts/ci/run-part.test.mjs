// scripts/ci/run-part.test.mjs - run-part.sh against a scratch repo with stand-ins for the stack, Vite and the checks:
// which server each check gets, the env fork checks get, what is stopped, and what a failure looks like. Needs bash, curl and
// timeout; skipped when they are missing or a harness port (5189, 5186, 5391) is already taken on this machine.
//   node --test scripts/ci/run-part.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const slash = p => p.replaceAll('\\', '/');
const script = slash(fileURLToPath(new URL('./run-part.sh', import.meta.url)));
const tools = spawnSync('bash', ['-c', 'command -v curl timeout']).status === 0;
const busy = port => new Promise(res => { const s = net.createServer().once('error', () => res(true)).listen(port, () => s.close(() => res(false))); });
const skip = !tools || (await Promise.all([5189, 5186, 5391].map(busy))).some(Boolean);

// A scratch repo: check-map.json, a stack.sh that only records its calls, a vite.js that records its args and listens, and one stand-in per check.
function scratch(checks) {
  const t = slash(mkdtempSync(`${slash(tmpdir())}/rp-`)), put = (p, s) => { mkdirSync(`${t}/${p.replace(/\/[^/]*$/, '')}`, { recursive: true }); writeFileSync(`${t}/${p}`, s); };
  spawnSync('git', ['init', '-q'], { cwd: t });
  put('scripts/ci/check-map.json', JSON.stringify({ checks: Object.fromEntries(Object.entries(checks).map(([c, v]) => [c, { runner: v.runner }])) }));
  put('scripts/ci/stack.sh', 'echo "$1" >> "$(dirname "$0")/../../stack-calls.txt"; mkdir -p "$2"\n');
  put('node_modules/vite/bin/vite.js', `const a = process.argv.slice(2), e = process.env;
require('fs').appendFileSync(__dirname + '/../../../vite-calls.jsonl', JSON.stringify({ args: a, coaching: e.VITE_COACHING_DEV ?? null, byoc: e.VITE_BYOC_DEV ?? null, cp: e.RABBIT_HOLE_DEV_CP ?? null }) + '\\n');
if (e.FAKE_VITE_FAIL) process.exit(1);
require('http').createServer((q, s) => s.end('ok')).listen(Number(a[a.indexOf('--port') + 1]));
`);
  for (const [c, v] of Object.entries(checks)) put(`packages/web/e2e/${c}`, `import { appendFileSync } from 'node:fs';
const port = ${v.port ?? 'null'}; let up = null;
if (port) up = await fetch('http://localhost:' + port + '/').then(r => r.status, () => 'down');
const keys = ['BASE', 'PRACTICE_BASE', 'VOICE_BASE', 'SMALL_CP', 'PERSIST', 'D1_CONFIG'];
appendFileSync(new URL('../../../calls.jsonl', import.meta.url), JSON.stringify({ check: '${c}', args: process.argv.slice(2), up, env: Object.fromEntries(keys.map(k => [k, process.env[k] ?? null])) }) + '\\n');
console.log('1/1 checks passed'); process.exit(${v.fail ? 1 : 0});
`);
  writeFileSync(`${t}/sel.json`, JSON.stringify({ checks: Object.keys(checks) }));
  const lines = f => existsSync(`${t}/${f}`) ? readFileSync(`${t}/${f}`, 'utf8').trim().split('\n').filter(Boolean) : [];
  return { t, calls: () => lines('calls.jsonl').map(l => JSON.parse(l)), vite: () => lines('vite-calls.jsonl').map(l => JSON.parse(l)), stack: () => lines('stack-calls.txt'),
    run: env => spawnSync('bash', [script, `${t}/sel.json`, `${t}/out`], { cwd: t, encoding: 'utf8', env: { ...process.env, ...env } }) };
}
const listening = port => fetch(`http://localhost:${port}/`).then(() => true, () => false);

test('fork checks get the gate env and a shots dir; harness checks get their port and nothing else; everything is stopped', { skip }, async () => {
  const s = scratch({ 'a-check.mjs': { runner: 'fork' }, 'b-check.mjs': { runner: 'fork', fail: true }, 'dark-ink-check.mjs': { runner: 'harness', port: 5189 },
    'wiki-check.mjs': { runner: 'harness', port: 5189 }, 'canvas-editing-check.mjs': { runner: 'harness', port: 5391 }, 'nanogpt-audio-check.mjs': { runner: 'harness', port: 5186 },
    'voice-tts-stream-check.mjs': { runner: 'harness' } });
  const r = s.run();
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.deepEqual(s.stack(), ['start', 'stop']);
  const by = Object.fromEntries(s.calls().map(c => [c.check, c]));
  assert.equal(Object.keys(by).length, 7);
  for (const c of ['a-check.mjs', 'b-check.mjs']) {
    const { PERSIST, D1_CONFIG, ...env } = by[c].env;
    assert.deepEqual(env, { BASE: 'http://127.0.0.1:8878', PRACTICE_BASE: 'http://127.0.0.1:8878', VOICE_BASE: 'http://127.0.0.1:8878', SMALL_CP: 'http://127.0.0.1:8879' });
    assert.match(PERSIST, /\/out\/stack\/local$/);
    assert.match(D1_CONFIG, /\/out\/stack\/integ-local-cp\.jsonc$/);
    assert.equal(by[c].args.length, 1);
    assert.match(by[c].args[0], new RegExp(`/out/${c.replace('.mjs', '')}-shots$`));
  }
  for (const c of ['dark-ink', 'wiki', 'canvas-editing', 'nanogpt-audio', 'voice-tts-stream']) {
    const h = by[`${c}-check.mjs`];
    assert.deepEqual(h.args, [], `${c} takes no argument (nanogpt-audio reads argv[2] as seconds)`);
    assert.ok(Object.values(h.env).every(v => v === null), `${c} gets no fork env`);
  }
  assert.deepEqual(['dark-ink', 'wiki', 'canvas-editing', 'nanogpt-audio'].map(c => by[`${c}-check.mjs`].up), [200, 200, 200, 200]);
  assert.equal(by['voice-tts-stream-check.mjs'].up, null);
  // One server per port, started once: dev with the review flags, the preview of dist-dev, dev without flags; the proxy is dead.
  const v = s.vite();
  assert.deepEqual(v.map(x => x.args), [['--port', '5189', '--strictPort'], ['preview', '--outDir', 'dist-dev', '--port', '5186', '--strictPort'], ['--port', '5391', '--strictPort', '--host', '127.0.0.1']]);
  assert.deepEqual(v.map(x => [x.coaching, x.byoc]), [['true', 'true'], [null, null], [null, null]]);
  assert.ok(v.every(x => x.cp === 'http://127.0.0.1:1'));
  assert.deepEqual(await Promise.all([5189, 5186, 5391].map(listening)), [false, false, false], 'servers are stopped');
  assert.match(r.stdout, /^b exit 1 /m);
  assert.match(r.stdout, /--- b log tail ---/);
  assert.match(r.stdout, /^a exit 0 {2}1\/1 checks passed/m);
  assert.equal(readFileSync(`${s.t}/out/fast.log`, 'utf8').trim().split('\n').length, 7);
});

test('a harness-only part never starts the stack', { skip }, () => {
  const s = scratch({ 'inline-ai-check.mjs': { runner: 'harness', port: 5397 } });
  const r = s.run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(s.stack(), []);
  assert.deepEqual(s.calls().map(c => c.up), [200]);
});

test('a server that never starts fails its checks without running them; a runner the tier cannot run is a stop', { skip }, () => {
  const s = scratch({ 'dark-ink-check.mjs': { runner: 'harness', port: 5189 }, 'x-check.mjs': { runner: 'windows-only' } });
  const r = s.run({ FAKE_VITE_FAIL: '1' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /dark-ink exit 97 {2}server on port 5189 did not start/);
  assert.match(r.stdout, /x-check\.mjs: runner 'windows-only' cannot run in the fast tier/);
  assert.deepEqual(s.calls(), []);
});
