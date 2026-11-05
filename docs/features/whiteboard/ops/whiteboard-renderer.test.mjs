// Offline harness for whiteboard-renderer.mjs: real git and node, a throwaway repo, stubs for fly, wrangler, curl and sh, and fake credentials.
// No real credential is in the environment, nothing reaches Fly, Cloudflare or production, and the real pins are never read (the script is
// copied next to a test pins file). Run: node --test docs/features/whiteboard/ops/whiteboard-renderer.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FAKE = ['FAKE_FLY_ORG_VALUE_1', 'FAKE_CF_TOKEN_VALUE_2', 'FAKE_CF_ACCOUNT_VALUE_3'];
const PROVIDER = ['FAKE_ANTHROPIC_VALUE_4', 'FAKE_FISH_VALUE_5'];
const MUTATING = /^(fly (apps create|secrets import|deploy)|wrangler secret put)/;

function harness(state = {}, { dirty = false, wrongSha = false, credentials = FAKE, clone = false } = {}) {
  const T = mkdtempSync(join(tmpdir(), 'wb-launcher-'));
  const git = (...a) => spawnSync('git', ['-C', join(T, 'w'), ...a], { encoding: 'utf8' });
  spawnSync('git', ['init', '-q', join(T, 'w')]);
  git('config', 'user.name', 'harness'); git('config', 'user.email', 'h@example.test');
  writeFileSync(join(T, 'w', 'a.txt'), 'a'); git('add', '.'); git('commit', '-q', '-m', 'c');
  const sha = git('rev-parse', 'HEAD').stdout.trim();
  if (dirty) writeFileSync(join(T, 'w', 'a.txt'), 'changed');
  writeFileSync(join(T, 'creds.env'), [...['FLY_ORG_TOKEN', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'].map((n, i) => credentials[i] === undefined ? '' : `${n}=${credentials[i]}`), `ANTHROPIC_API_KEY=${PROVIDER[0]}`, `FISH_AUDIO_API_KEY=${PROVIDER[1]}`].join('\n'));
  copyFileSync(join(HERE, 'whiteboard-renderer.mjs'), join(T, 'whiteboard-renderer.mjs'));
  copyFileSync(join(HERE, 'whiteboard-renderer.stub.mjs'), join(T, 'stub.mjs'));
  const st = join(T, 'state.json');
  writeFileSync(st, JSON.stringify({ apps: ['rabbit-hole-motion-renderer'], flySecrets: [], workerSecrets: [], revision: null, ...state }));
  const stub = name => `${process.execPath}|${join(T, 'stub.mjs')}|${name}`;
  writeFileSync(join(T, 'whiteboard-renderer.pins'), [`SHA=${wrongSha ? 'a'.repeat(40) : sha}`, `W=${join(T, 'w')}`, `ENV_FILE=${join(T, 'creds.env')}`, 'APP=rabbit-hole-whiteboard-renderer', 'ORG=rabbit-hole',
    'WORKER=rabbit-hole-app', ...(clone ? ['CLONE=rabbit-hole-web-dev-test', 'PROVIDER_SECRETS=ANTHROPIC_API_KEY,FISH_AUDIO_API_KEY'] : []), `FLY=${stub('fly')}`, `WRANGLER=${stub('wrangler')}`, `CURL=${stub('curl')}`, `SH=${stub('sh')}`, 'CONTEXT_SH=context.sh'].join('\n'));
  const run = (...args) => {
    const r = spawnSync(process.execPath, [join(T, 'whiteboard-renderer.mjs'), ...args], { cwd: T, encoding: 'utf8', env: { STUB_STATE: st, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: tmpdir(), TMP: tmpdir() } });
    const log = (() => { try { return readFileSync(st + '.log', 'utf8').trim().split('\n').filter(Boolean); } catch { return []; } })();
    return { status: r.status, out: r.stdout + r.stderr, log, mutations: log.filter(l => MUTATING.test(l)), state: JSON.parse(readFileSync(st, 'utf8')), sha };
  };
  return { run, done: () => rmSync(T, { recursive: true, force: true }) };
}
const noLeak = r => {
  for (const v of [...FAKE, ...PROVIDER, r.state.tokenFly, r.state.tokenWorker].filter(Boolean)) assert.ok(!r.out.includes(v) && !r.log.join('\n').includes(v), 'output or call log shows a secret value');
};

test('--check on a fresh account changes nothing and says what it would do', () => {
  const h = harness(); const r = h.run('--check'); h.done();
  assert.equal(r.status, 0, r.out); assert.deepEqual(r.mutations, []);
  assert.match(r.out, /will be created in rabbit-hole/); assert.match(r.out, /CHECK OK: nothing was changed/); noLeak(r);
});

test('a first run creates the app, sets one token on the app and the Worker, deploys the pinned commit with one machine, and proves the token', () => {
  const h = harness(); const r = h.run(); h.done();
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(r.mutations.map(l => l.split(' ').slice(0, 2).join(' ')), ['fly apps', 'fly secrets', 'wrangler secret', 'fly deploy']);
  assert.match(r.state.tokenFly, /^[0-9a-f]{48}$/); assert.equal(r.state.tokenWorker, r.state.tokenFly, 'the same value on both sides');
  const deploy = r.log.find(l => l.startsWith('fly deploy'));
  assert.match(deploy, /--build-arg MOTION_RENDERER_BUILD=[0-9a-f]{40} --ha=false --yes -a rabbit-hole-whiteboard-renderer$/); assert.ok(deploy.includes(r.sha));
  assert.ok(!r.mutations.some(l => /rabbit-hole-motion-renderer(?!-)/.test(l)), 'Motion\'s renderer is never touched');
  assert.match(r.out, /bearer token accepted by the app/); assert.match(r.out, /^OK: /m); noLeak(r);
});

test('a rerun when everything is done changes nothing', () => {
  const h = harness(); const first = h.run(); assert.equal(first.status, 0);
  const second = h.run(); h.done();
  assert.equal(second.status, 0, second.out); assert.equal(second.mutations.length, first.mutations.length, 'no new mutating call'); assert.match(second.out, /already done/);
});

test('one secret missing: both get a fresh value; the app is not recreated', () => {
  const h = harness({ apps: ['rabbit-hole-whiteboard-renderer'], flySecrets: ['MOTION_RENDERER_TOKEN'], workerSecrets: [], revision: 'old' }); const r = h.run(); h.done();
  assert.equal(r.status, 0, r.out); assert.ok(!r.log.some(l => l.startsWith('fly apps create'))); assert.equal(r.state.tokenWorker, r.state.tokenFly); assert.match(r.out, /both get a fresh value/);
});

test('a new commit with both secrets present redeploys without touching a secret', () => {
  const h = harness({ apps: ['rabbit-hole-whiteboard-renderer'], flySecrets: ['MOTION_RENDERER_TOKEN'], workerSecrets: ['WHITEBOARD_RENDERER_TOKEN'], revision: 'b'.repeat(40) }); const r = h.run(); h.done();
  assert.equal(r.status, 0, r.out); assert.deepEqual(r.mutations.map(l => l.split(' ')[1]), ['deploy']); assert.doesNotMatch(r.out, /bearer token accepted/, 'no token was issued, so none is probed');
});

test('stops before any call when the worktree is at another commit, dirty, or a credential is missing', () => {
  for (const [opts, why] of [[{ wrongSha: true }, /not the pinned/], [{ dirty: true }, /uncommitted changes/], [{ credentials: [FAKE[0], FAKE[1], undefined] }, /CLOUDFLARE_ACCOUNT_ID is missing/]]) {
    const h = harness({}, opts); const r = h.run(); h.done();
    assert.equal(r.status, 1, r.out); assert.match(r.out, why); assert.deepEqual(r.log, [], 'no tool was called');
  }
});

test('a failed deploy stops with a nonzero exit and the output holds no secret value', () => {
  const h = harness({ failDeploy: true }); const r = h.run(); h.done();
  assert.equal(r.status, 1); assert.match(r.out, /STOP: fly deploy failed/); assert.ok(r.out.includes('<value>'), 'the token in the tool error was redacted'); noLeak(r);
});

test('the script reads nothing from the environment and has no confirmation switch', () => {
  const src = readFileSync(join(HERE, 'whiteboard-renderer.mjs'), 'utf8');
  const envReads = [...src.matchAll(/process\.env\b/g)].length;
  assert.equal(envReads, 1, 'process.env appears once: it is passed through to the child tools, never read for a value');
  assert.deepEqual([...src.matchAll(/process\.argv[^\n]*/g)].map(m => m[0]), ["process.argv.includes('--check');"], '--check is the only flag');
});

test('with a review clone: one token on the app, the prod Worker and the clone, the provider keys on the clone only, nothing printed', () => {
  const h = harness({ apps: ['rabbit-hole-whiteboard-renderer'], flySecrets: ['MOTION_RENDERER_TOKEN'], workerSecrets: ['WHITEBOARD_RENDERER_TOKEN'], revision: 'old' }, { clone: true }); const r = h.run(); h.done();
  assert.equal(r.status, 0, r.out);
  assert.equal(r.state.cloneValues.WHITEBOARD_RENDERER_TOKEN, r.state.tokenFly, 'the same token on the clone');
  assert.equal(r.state.tokenWorker, r.state.tokenFly, 'and on the Worker');
  assert.deepEqual(r.state.cloneValues.ANTHROPIC_API_KEY, PROVIDER[0]); assert.deepEqual(r.state.cloneValues.FISH_AUDIO_API_KEY, PROVIDER[1]);
  assert.ok(!r.log.some(l => /secret put (ANTHROPIC|FISH)/.test(l) && /rabbit-hole-app/.test(l)), 'provider keys never go to the production Worker');
  assert.match(r.out, /clone secret ANTHROPIC_API_KEY set/); noLeak(r);
});

test('with a review clone that already has everything, a rerun at the same commit changes nothing', () => {
  const h = harness({ apps: ['rabbit-hole-whiteboard-renderer'], flySecrets: ['MOTION_RENDERER_TOKEN'], workerSecrets: ['WHITEBOARD_RENDERER_TOKEN'], cloneSecrets: ['WHITEBOARD_RENDERER_TOKEN', 'ANTHROPIC_API_KEY', 'FISH_AUDIO_API_KEY'] }, { clone: true });
  const first = h.run(); const second = h.run(); h.done();
  assert.equal(first.status, 0, first.out); assert.equal(second.status, 0, second.out); assert.equal(second.mutations.length, first.mutations.length, 'no new mutating call'); assert.match(second.out, /already done/);
});
