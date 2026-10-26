// Harness for the owner command that stands up the production converter. Two layers, both with NO route to production:
//  1. the core run in-process against a simulated Fly and Cloudflare (fake credentials, fake tools, fake HTTP): nothing real exists to reach;
//  2. the REAL entry point as a child with an environment holding only PATH, PATH holding only stubs of flyctl and git, and Node's permission model
//     denying every child process and worker: if the entry tried to start a tool it would die with ERR_ACCESS_DENIED. Mocks and tests run in the
//     same process environment as the code they exercise; the entry has no test hook and answers no confirmation from an env var, flag or file.
// Run: node --test packages/file-convert/activation/prod-convert.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNT, CONVERTERS, CONVERT_URL, FLY_APP, PHRASE, WORKER, WORKER_SECRETS, parse, readByName, run } from './prod-convert-core.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SHA = 'a'.repeat(40);
const FAKE = `CLOUDFLARE_API_TOKEN=cf-FAKE-token-value\nCLOUDFLARE_ACCOUNT_ID=${ACCOUNT}\nFLY_ORG_TOKEN="fo1_FAKE-fly-org-token"\nOTHER=zzz\n`;
const VALUES = ['cf-FAKE-token-value', 'fo1_FAKE-fly-org-token'];

// A simulated world: what Fly and the Worker hold, every tool call recorded with its stdin and env, a scripted answer per prompt.
function world(over = {}) {
  const w = { calls: [], lines: [], state: '', fly: { apps: ['rabbit-hole-convert-dev'], secrets: [], machines: [{ id: 'm1' }, { id: 'm2' }] }, worker: ['ANTHROPIC_API_KEY'], fails: {}, answers: [], asked: [], inMain: true, healthy: true, urls: [], randoms: 0 };
  const rows = (names, key = 'name') => JSON.stringify(names.map(n => ({ [key]: n })));
  w.deps = {
    out: l => w.lines.push(l), now: () => '2026-10-26T18:00:00.000Z', readCredentials: () => FAKE,
    state: { read: () => w.state, append: l => { w.state += `${l}\n`; } },
    wrangler: () => ({ path: 'W.js', version: '4.150.0' }), flyctl: () => true, interactive: () => true,
    ask: async q => { w.asked.push(q); return w.answers.shift() ?? ''; },
    random: size => Buffer.alloc(size, ++w.randoms), sleep: async () => {}, makeContext: sha => `/ctx/${sha.slice(0, 7)}`, cleanup: d => w.calls.push({ tool: 'cleanup', args: [d] }),
    spawn: (tool, args, { input, env } = {}) => {
      w.calls.push({ tool, args, input, env });
      const key = `${tool} ${args.slice(0, 2).join(' ')}`;
      if (w.fails[key]) return { status: 1, stdout: '' };
      if (tool === 'git') return { status: args[0] === 'merge-base' && !w.inMain ? 1 : 0, stdout: '' };
      if (key === 'wrangler secret list') return { status: 0, stdout: `banner\n${rows(w.worker)}\n` };
      if (key === 'wrangler secret put') { w.worker.push(args[2]); return { status: 0, stdout: '' }; }
      if (key === 'wrangler secret delete') { w.worker = w.worker.filter(n => n !== args[2]); return { status: 0, stdout: '' }; }
      if (key === 'fly apps list') return { status: 0, stdout: rows(w.fly.apps, 'Name') };
      if (key === 'fly apps create') { w.fly.apps.push(args[2]); return { status: 0, stdout: '' }; }
      if (key === 'fly apps destroy') { w.fly.apps = w.fly.apps.filter(n => n !== args[2]); return { status: 0, stdout: '' }; }
      if (key === 'fly secrets import') { w.fly.secrets.push('CONVERT_TOKEN'); return { status: 0, stdout: '' }; }
      if (key === 'fly secrets list') return { status: 0, stdout: rows(w.fly.secrets) };
      if (key === 'fly machines list') return { status: 0, stdout: rows(w.fly.machines.map(m => m.id), 'id') };
      return { status: 0, stdout: '' };
    },
    fetch: async (url, init = {}) => {
      w.urls.push(`${init.method || 'GET'} ${url}`);
      if (url.endsWith('/health')) return { status: 200, json: async () => w.healthBody() };
      return { status: 401 };
    },
    ...over,
  };
  w.healthBody = () => ({ ok: w.healthy, service: 'rabbit-hole-convert', version: `file-convert-1-abc+${SHA.slice(0, 12)}`, sandbox: 'linux', slots: 2, converters: Object.fromEntries(CONVERTERS.map(c => [c, `${c}/1`])) });
  w.text = () => w.lines.join('\n');
  w.mutations = () => w.calls.filter(c => (c.tool === 'wrangler' && ['put', 'delete'].includes(c.args[1])) || (c.tool === 'fly' && ['create', 'import', 'deploy', 'destroy', 'stop'].some(v => c.args.includes(v))));
  return w;
}
const ALL = [PHRASE.app, PHRASE.secrets, PHRASE.deploy];
const noLeak = w => { for (const v of VALUES) assert.ok(!w.text().includes(v) && !w.state.includes(v), 'a credential value leaked into output or state'); };

test('dry run reads no credential, starts no tool and cannot reach anything, for every command', async () => {
  const trap = () => { throw new Error('dry run touched the outside world'); };
  for (const argv of [['--dry-run'], ['--dry-run', 'run', '--sha', SHA], ['--dry-run', 'rotate'], ['--dry-run', 'rollback', 'L1'], ['--dry-run', 'rollback', 'L2'], ['--dry-run', 'rollback', 'L3']]) {
    const w = world({ readCredentials: trap, spawn: trap, fetch: trap, ask: trap, random: trap, makeContext: trap, wrangler: trap, flyctl: trap, state: { read: () => '', append: trap } });
    assert.equal(await run(argv, w.deps), 0, argv.join(' '));
    assert.match(w.text(), /Nothing was run, called or changed/);
    assert.match(w.text(), /rabbit-hole-convert-prod/);
    assert.match(w.text(), /US\$1\.5 to US\$9\.8 a month/, 'the cost is shown');
  }
});

test('arguments are validated before anything is read; unknown flags and answers are refused', async () => {
  for (const argv of [['--yes'], ['rollback'], ['rollback', 'L9'], ['run', '--sha', 'abc'], ['rotate', '--sha', SHA], ['--dry-run', '--preflight'], ['--confirm', 'DEPLOY CONVERTER'], ['rollback', 'L1', 'L2'], ['L1']]) {
    const w = world({ readCredentials: () => { throw new Error('read credentials'); } });
    assert.equal(await run(argv, w.deps), 2, argv.join(' '));
    assert.equal(w.calls.length, 0);
  }
  assert.equal(parse(['run', '--sha', SHA]).sha, SHA);
  assert.equal(parse([]).cmd, 'run');
});

test('without an interactive terminal nothing is read or run, and answers cannot be preset', async () => {
  const w = world({ interactive: () => false, readCredentials: () => { throw new Error('read credentials'); }, ask: async () => { throw new Error('asked'); } });
  assert.equal(await run(['run', '--sha', SHA], w.deps), 1);
  assert.match(w.text(), /interactive terminal/);
  assert.equal(w.calls.length, 0);
});

test('a missing credential, tool or the wrong Cloudflare account stops before any call', async () => {
  for (const over of [{ readCredentials: () => FAKE.replace('FLY_ORG_TOKEN', 'FLY_X') }, { wrangler: () => null }, { flyctl: () => false }, { readCredentials: () => FAKE.replace(ACCOUNT, 'f'.repeat(32)) }]) {
    const w = world(over);
    assert.equal(await run(['--preflight'], w.deps), 1);
    assert.equal(w.calls.length, 0);
    noLeak(w);
  }
});

test('preflight only reads: listings and git, never a create, put, deploy or delete', async () => {
  const w = world();
  assert.equal(await run(['--preflight', '--sha', SHA], w.deps), 0);
  assert.equal(w.mutations().length, 0);
  assert.deepEqual(w.calls.map(c => `${c.tool} ${c.args.slice(0, 2).join(' ')}`), ['fly apps list', 'wrangler secret list', 'git cat-file -e', 'git merge-base --is-ancestor']);
  assert.match(w.text(), /does not exist/);
  assert.match(w.text(), /is in rabbit-hole\/main/);
  assert.equal(w.asked.length, 0);
  noLeak(w);
});

test('a full run: create, secrets over stdin only, deploy one commit, verify health; then every step is skipped on a re-run', async () => {
  const w = world(); w.answers = [...ALL];
  assert.equal(await run(['run', '--sha', SHA], w.deps), 0, w.text());
  const seq = w.calls.filter(c => c.tool !== 'git' && c.tool !== 'cleanup').map(c => `${c.tool} ${c.args.slice(0, 2).join(' ')}`);
  assert.deepEqual(seq, ['fly apps list', 'wrangler secret list', 'fly apps create', 'fly apps list', 'fly secrets import', 'wrangler secret put', 'wrangler secret put', 'wrangler secret list', 'fly secrets list', 'fly deploy /ctx/aaaaaaa']);
  const create = w.calls.find(c => c.args[1] === 'create'), imp = w.calls.find(c => c.args[1] === 'import'), puts = w.calls.filter(c => c.args[1] === 'put'), deploy = w.calls.find(c => c.args[0] === 'deploy');
  assert.deepEqual(create.args, ['apps', 'create', FLY_APP, '--org', 'rabbit-hole']);
  assert.deepEqual(imp.args, ['secrets', 'import', '--stage', '-a', FLY_APP]);
  assert.deepEqual(puts.map(c => c.args), WORKER_SECRETS.map(n => ['secret', 'put', n, '--name', WORKER]));
  const token = imp.input.replace(/^CONVERT_TOKEN=|\n$/g, '');
  assert.equal(puts[0].input, token, 'the same CONVERT_TOKEN reaches Fly and the Worker');
  assert.notEqual(puts[1].input, token, 'FILE_JOB_SECRET is a different value');
  for (const v of [token, puts[1].input]) { assert.ok(v.length >= 64, 'at least 32 characters, in fact 64'); assert.ok(!w.text().includes(v) && !w.state.includes(v), 'no generated value in output or state'); assert.ok(!w.calls.some(c => (c.args || []).join(' ').includes(v)), 'no value in argv'); }
  assert.deepEqual(deploy.args, ['deploy', `/ctx/${SHA.slice(0, 7)}`, '--config', `/ctx/${SHA.slice(0, 7)}/fly.prod.toml`, '-a', FLY_APP, '--build-arg', `CONVERT_BUILD=${SHA}`, '--ha=false', '--remote-only']);
  assert.ok(w.calls.some(c => c.tool === 'cleanup'));
  for (const c of w.calls.filter(c => c.tool !== 'git' && c.env)) assert.ok(Object.keys(c.env).every(k => ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'FLY_API_TOKEN'].includes(k)));
  assert.deepEqual(w.state.trim().split('\n').map(l => l.split(' ')[1]), ['APP', 'SECRETS_STARTED', 'SECRETS', 'DEPLOY', 'HEALTH']);
  assert.ok(w.urls.includes(`POST ${CONVERT_URL}/jobs`), 'the 401 checks ran');
  assert.match(w.text(), /NEXT \(owner\): release the two vars/);
  noLeak(w);
  // Resume: nothing is created, put or deployed again.
  const before = w.calls.length, mutated = w.mutations().length; w.answers = [];
  assert.equal(await run(['run', '--sha', SHA], w.deps), 0);
  assert.equal(mutated, 5, 'create, import, two puts and the deploy');
  assert.equal(w.mutations().length, mutated, 'the re-run repeats none of them');
  assert.equal(w.asked.length, 3, 'no new question on the re-run');
  assert.ok(w.calls.slice(before).every(c => ['list', 'cat-file', 'merge-base'].includes(c.args[1]) || c.tool === 'git' || c.tool === 'cleanup'));
});

test('every typed phrase is required exactly: a wrong, blank or lower-case answer changes nothing further', async () => {
  const after = { app: 0, secrets: 1, deploy: 4 }; // mutations made before the wrong answer: nothing; create; create, import, put, put
  for (const [i, phrase] of ALL.entries()) {
    for (const bad of ['', 'yes', phrase.toLowerCase(), `${phrase}X`]) {
      const w = world(); w.answers = [...ALL.slice(0, i), bad];
      assert.equal(await run(['run', '--sha', SHA], w.deps), 1);
      assert.equal(w.mutations().length, Object.values(after)[i], `a wrong answer at ${phrase}: "${bad}"`);
      assert.ok(!w.calls.some(c => c.args?.[0] === 'deploy') || i > 2);
    }
  }
});

test('a deploy that fails is retried from the deploy; the app and secrets are not touched again', async () => {
  const w = world(); w.answers = [...ALL]; w.fails['fly deploy /ctx/aaaaaaa'] = true;
  assert.equal(await run(['run', '--sha', SHA], w.deps), 1);
  assert.match(w.text(), /fly deploy failed/);
  assert.ok(w.calls.some(c => c.tool === 'cleanup'), 'the build context is removed even when the deploy fails');
  assert.deepEqual(w.state.trim().split('\n').map(l => l.split(' ')[1]), ['APP', 'SECRETS_STARTED', 'SECRETS']);
  delete w.fails['fly deploy /ctx/aaaaaaa']; w.answers = [PHRASE.deploy];
  const before = w.mutations().length;
  assert.equal(await run(['run', '--sha', SHA], w.deps), 0, w.text());
  assert.equal(w.mutations().length, before + 1, 'only the deploy ran again');
});

test('a secret that fails halfway is redone as a pair on the next run without `rotate`; existing foreign secrets are never overwritten', async () => {
  const w = world(); w.answers = [PHRASE.app, PHRASE.secrets]; let puts = 0;
  const real = w.deps.spawn;
  w.deps.spawn = (t, a, o) => (t === 'wrangler' && a[1] === 'put' && ++puts === 2 ? (w.calls.push({ tool: t, args: a, input: o.input }), { status: 1, stdout: '' }) : real(t, a, o));
  assert.equal(await run(['run', '--sha', SHA], w.deps), 1);
  assert.match(w.text(), /FILE_JOB_SECRET failed/);
  w.answers = [PHRASE.secrets, PHRASE.deploy];
  assert.equal(await run(['run', '--sha', SHA], w.deps), 0, w.text());
  assert.equal(w.calls.filter(c => c.tool === 'wrangler' && c.args[1] === 'put').length, 4, 'one put, a failed one, then both again');
  // A secret this script did not put: stop, never replace.
  const f = world(); f.worker.push('CONVERT_TOKEN'); f.answers = [PHRASE.app, PHRASE.secrets];
  assert.equal(await run(['run', '--sha', SHA], f.deps), 1);
  assert.match(f.text(), /CONVERT_TOKEN already exist.* never overwrites/);
  assert.equal(f.calls.filter(c => c.args[1] === 'put' || c.args[1] === 'import').length, 0);
});

test('an app that already exists is adopted behind the same phrase, never recreated', async () => {
  const w = world(); w.fly.apps.push(FLY_APP); w.answers = [PHRASE.app, PHRASE.secrets, PHRASE.deploy];
  assert.equal(await run(['run', '--sha', SHA], w.deps), 0);
  assert.ok(!w.calls.some(c => c.args?.[1] === 'create'));
  assert.match(w.text(), /ADOPTED, not recreated/);
});

test('only a commit of rabbit-hole/main is deployed, and a deploy needs --sha', async () => {
  const w = world(); w.inMain = false; w.answers = [...ALL];
  assert.equal(await run(['run', '--sha', SHA], w.deps), 1);
  assert.match(w.text(), /not in rabbit-hole\/main/);
  assert.equal(w.mutations().length, 0);
  const n = world(); n.answers = [PHRASE.app, PHRASE.secrets];
  assert.equal(await run(['run'], n.deps), 1);
  assert.match(n.text(), /DEPLOY step needs --sha/);
  assert.ok(!n.calls.some(c => c.args?.[0] === 'deploy'));
});

test('health must show four converters, the deployed commit and a 401 for a missing and a wrong token', async () => {
  const bad = [
    w => { w.healthBody = () => ({ ok: true, service: 'rabbit-hole-convert', version: `v+${SHA.slice(0, 12)}`, converters: { slides: 'x' } }); },
    w => { w.healthBody = () => ({ ok: true, service: 'rabbit-hole-convert', version: 'file-convert-1-abc+bbbbbbbbbbbb', converters: Object.fromEntries(CONVERTERS.map(c => [c, 'x'])) }); },
    w => { w.healthy = false; },
    w => { const real = w.deps.fetch; w.deps.fetch = async (u, i) => (u.endsWith('/jobs') ? { status: 200 } : real(u, i)); },
  ];
  for (const sabotage of bad) {
    const w = world(); w.answers = [...ALL]; sabotage(w);
    assert.equal(await run(['run', '--sha', SHA], w.deps), 1);
    assert.match(w.text(), /HEALTH FAILED/);
    assert.ok(!w.state.includes('HEALTH'), 'a failed health is not recorded');
  }
});

test('rotate replaces both secrets (Fly not staged), only after a first run and behind its phrase', async () => {
  const none = world();
  assert.equal(await run(['rotate'], none.deps), 1);
  assert.match(none.text(), /nothing to rotate/);
  const w = world(); w.answers = [...ALL]; await run(['run', '--sha', SHA], w.deps);
  const first = w.calls.find(c => c.args[1] === 'import').input;
  w.answers = ['no']; assert.equal(await run(['rotate'], w.deps), 1);
  w.answers = [PHRASE.rotate]; assert.equal(await run(['rotate'], w.deps), 0, w.text());
  const second = w.calls.filter(c => c.args[1] === 'import').at(-1);
  assert.deepEqual(second.args, ['secrets', 'import', '-a', FLY_APP]);
  assert.notEqual(second.input, first);
  noLeak(w);
});

test('rollback: L1 deletes only CONVERT_TOKEN, L2 stops every machine, L3 destroys the app; each behind its own phrase', async () => {
  for (const [level, check] of [
    ['L1', (w) => { assert.deepEqual(w.calls.find(c => c.args[1] === 'delete').args, ['secret', 'delete', 'CONVERT_TOKEN', '--name', WORKER]); assert.ok(!w.worker.includes('CONVERT_TOKEN')); assert.ok(w.worker.includes('ANTHROPIC_API_KEY'), 'other secrets untouched'); }],
    ['L2', (w) => assert.deepEqual(w.calls.find(c => c.args[1] === 'stop').args, ['machine', 'stop', 'm1', 'm2', '-a', FLY_APP])],
    ['L3', (w) => { assert.deepEqual(w.calls.find(c => c.args[1] === 'destroy').args, ['apps', 'destroy', FLY_APP, '--yes']); assert.ok(!w.fly.apps.includes(FLY_APP)); }],
  ]) {
    const w = world(); w.worker.push('CONVERT_TOKEN'); w.fly.apps.push(FLY_APP);
    w.answers = ['wrong'];
    assert.equal(await run(['rollback', level], w.deps), 1);
    assert.equal(w.mutations().length, 0, `${level}: a wrong phrase changes nothing`);
    w.answers = [PHRASE[level]];
    assert.equal(await run(['rollback', level], w.deps), 0, w.text());
    check(w);
    noLeak(w);
  }
});

test('the committed configs agree with the command: app name, Worker name, converter URL, origin, and the VM unchanged from dev', () => {
  const dir = join(HERE, '..'), body = t => t.split(/\r?\n/).filter(l => !l.startsWith('app = ') && !l.startsWith('#') && !l.includes('CONVERT_ALLOWED_ORIGINS')).join('\n');
  const prod = readFileSync(join(dir, 'fly.prod.toml'), 'utf8'), dev = readFileSync(join(dir, 'fly.dev.toml'), 'utf8');
  assert.match(prod, new RegExp(`^app = "${FLY_APP}"\\r?$`, 'm'));
  assert.equal(body(prod), body(dev), 'the validated dev runtime, health check, VM and lifecycle are unchanged');
  assert.match(prod, /^\s*CONVERT_ALLOWED_ORIGINS = "https:\/\/digrabbithole\.com"\r?$/m);
  assert.ok(!/CONVERT_TOKEN/.test(prod.split(/\r?\n/).filter(l => !l.trim().startsWith('#')).join('\n')), 'no secret in the config');
  assert.match(readFileSync(join(dir, '../web/wrangler.rabbit-hole-prod.jsonc'), 'utf8'), new RegExp(`"name":\\s*"${WORKER}"`));
  assert.equal(CONVERT_URL, `https://${FLY_APP}.fly.dev`);
  assert.deepEqual(CONVERTERS, ['audio-playback', 'office-pdf', 'slides', 'step-glb']);
  assert.equal(readByName('export A="x y"\nB=\nC=\'z\'\n', 'A'), 'x y');
  assert.equal(readByName('B=\n', 'B'), null);
});

test('REAL entry as a child: stripped environment, stub-only PATH, permission model denying every child process; nothing can be started or answered', () => {
  const stubs = mkdtempSync(join(tmpdir(), 'convert-stubs-'));
  for (const name of ['flyctl', 'git', 'wrangler']) { writeFileSync(join(stubs, name), `#!/bin/sh\necho STUB-RAN >> "${join(stubs, 'ran')}"\nexit 1\n`); chmodSync(join(stubs, name), 0o755); }
  const entry = join(HERE, 'prod-convert.mjs'), base = { PATH: stubs, ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) };
  const start = (args, env = base, input = '') => spawnSync(process.execPath, ['--permission', '--allow-fs-read=*', entry, ...args], { env, encoding: 'utf8', input });
  const out = r => `${r.stdout}${r.stderr}`;
  const dry = start(['--dry-run', 'run', '--sha', SHA]);
  assert.equal(dry.status, 0, out(dry));
  assert.match(out(dry), /Nothing was run, called or changed/);
  assert.doesNotMatch(out(dry), /ERR_ACCESS_DENIED/, 'the dry run never tried to start a process');
  const real = start(['run', '--sha', SHA], base, `${PHRASE.app}\n`);
  assert.equal(real.status, 1);
  assert.match(out(real), /needs an interactive terminal/);
  assert.doesNotMatch(out(real), /ERR_ACCESS_DENIED/, 'it stopped before reaching any tool');
  for (const [name, value] of [['FLY_API_TOKEN', 'x'], ['CLOUDFLARE_API_TOKEN', 'x'], ['WRANGLER_API_TOKEN', 'x'], ['NODE_OPTIONS', '--no-warnings'], ['HTTPS_PROXY', 'http://127.0.0.1:1'], ['ASSUME_YES', '1'], ['CONVERT_CONFIRM', 'DEPLOY CONVERTER']]) {
    const r = start(['--dry-run'], { ...base, [name]: value });
    assert.equal(r.status, 1, name);
    assert.match(out(r), new RegExp(`environment sets .*${name}`));
  }
  assert.equal(start(['--yes']).status, 2);
  assert.equal(start(['run', '--confirm', PHRASE.deploy]).status, 2);
  assert.throws(() => readFileSync(join(stubs, 'ran')), 'no stub was ever executed');
});
