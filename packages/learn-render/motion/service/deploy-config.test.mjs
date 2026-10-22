// The identity and permission model the image ships (Dockerfile, sudoers, sandbox-init). The
// first Fly run failed with EACCES on job.json because motion-svc's shared group was only a
// supplementary group, which Fly does not apply. service.linux.test.mjs proves the model with
// the real uids; these checks fail on any host if the model drifts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const read = f => readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const dockerfile = read('./Dockerfile'), sudoers = read('./sudoers'), init = read('./sandbox-init'), server = read('./server.mjs');
const useradd = name => dockerfile.match(new RegExp(`useradd [^\\n&]* ${name}\\b`))?.[0] ?? '';

test('motion-svc and motion-render: distinct uids, the same primary group motion, no supplementary groups', () => {
  assert.match(dockerfile, /groupadd -g 10010 motion\b/);
  for (const user of ['motion-svc', 'motion-render']) {
    const line = useradd(user);
    assert.match(line, / -g motion /, `${user} has motion as its primary group`);
    assert.doesNotMatch(line, / -G /, `${user} has no supplementary groups`);
  }
  const uid = user => useradd(user).match(/-u (\d+)/)[1];
  assert.notEqual(uid('motion-svc'), uid('motion-render'));
  assert.match(dockerfile, /^USER motion-svc$/m);
  assert.doesNotMatch(dockerfile, /^USER root$/m);
});

test('the job tree is motion-svc:motion 2770 (setgid) and the service writes 2770 directories and a 0640 job input', () => {
  assert.match(dockerfile, /install -d -m 2770 -o motion-svc -g motion \/var\/motion\/jobs/);
  assert.match(server, /chmodSync\(d, 0o2770\)/);
  assert.match(server, /job\.json'\), JSON\.stringify\([^\n]*\{ mode: 0o640 \}\)/);
});

test('one sudo rule: motion-svc may start the launcher and nothing else', () => {
  const rules = sudoers.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('Defaults'));
  assert.deepEqual(rules, ['motion-svc ALL=(root) NOPASSWD: /usr/local/sbin/motion-sandbox']);
});

test('sandbox-init checks the workspace before the child starts, and the child runs as motion-render with only motion', () => {
  const preflight = init.indexOf('preflight_fail()'), exec = init.indexOf('exec setpriv');
  assert.ok(preflight > 0 && preflight < exec, 'the preflight runs before the child');
  for (const check of [
    '[ "$(stat -c %G "$d")" = motion ]', '[ "$(stat -c %a "$d")" = 2770 ]',
    '[ "$(stat -c %G /tmp/job/job.json)" = motion ]', '[ "$(stat -c %a /tmp/job/job.json)" = 640 ]',
    'asrender test -r /tmp/job/job.json', 'asrender test -w /tmp/job/out',
    'asrender ls -A /var/motion', 'asrender ls -A /home', 'asrender test -r /etc/sudoers.d/motion',
  ]) assert.ok(init.includes(check), check);
  assert.match(init, /exec setpriv --reuid=motion-render --regid=motion --clear-groups --no-new-privs/);
});

// The image is built from context.sh's archive and the Dockerfile's COPY lines, nothing else. The
// first M5/M6 Fly build crashed at boot: motion/duration.js imports the shared duration parser
// from packages/control-plane, which neither the archive nor the image carried. This builds the
// same archive from the working tree (context.sh --paths, a temporary index, git archive), lays
// out /app exactly as the COPY lines do (node_modules linked in, as npm ci would install them),
// then boots the service there, runs the render child on a job it refuses, and resolves every
// relative import of the service from inside that tree.
const HERE = dirname(fileURLToPath(import.meta.url));
const git = (args, opts = {}) => { const r = spawnSync('git', args, { encoding: 'utf8', ...opts }); if (r.status) throw Error(`git ${args[0]}: ${r.stderr}`); return r.stdout; };
const noShell = spawnSync('sh', ['-c', 'true']).error ? 'needs sh (context.sh)' : false;

function imageTree(target = 'renderer-dev', dockerfile = 'Dockerfile') {
  const root = git(['rev-parse', '--show-toplevel'], { cwd: HERE }).trim();
  const paths = spawnSync('sh', [join(HERE, 'context.sh'), '--target', target, '--paths'], { cwd: root, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const ctx = mkdtempSync(join(tmpdir(), 'motion-context-'));
  const env = { ...process.env, GIT_INDEX_FILE: join(ctx, 'index') };
  git(['read-tree', 'HEAD'], { cwd: root, env });
  git(['add', '-A', '--', ...paths], { cwd: root, env });
  const tree = git(['write-tree'], { cwd: root, env }).trim();
  git(['archive', '--format=tar', '-o', join(ctx, 'src.tar'), tree, '--', ...paths], { cwd: root });
  mkdirSync(join(ctx, 'src'));
  assert.equal(spawnSync('tar', ['-xf', '../src.tar'], { cwd: join(ctx, 'src') }).status, 0, 'tar');
  const app = join(ctx, 'app'), links = [];
  // The links stand in for npm ci's install; they are removed (not followed) before the tree is.
  const link = (target, at) => { symlinkSync(target, at, 'junction'); links.push(at); };
  const copies = [...readFileSync(join(HERE, dockerfile), 'utf8').replace(/\r\n/g, '\n').matchAll(/^COPY --from=build \/src\/(\S+) \/app\/(\S+)$/gm)].map(m => [m[1], m[2]]);
  for (const [from, to] of copies) {
    mkdirSync(dirname(join(app, to)), { recursive: true });
    if (from === 'node_modules') link(join(root, 'node_modules'), join(app, to));
    else cpSync(join(ctx, 'src', from), join(app, to), { recursive: true });
  }
  const own = join(root, 'packages', 'learn-render', 'node_modules');
  if (existsSync(own)) link(own, join(app, 'packages', 'learn-render', 'node_modules'));
  return { ctx, app, paths, copies, links };
}

function relativeImports(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const m of readFileSync(file, 'utf8').matchAll(/(?:^|\s)(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    const target = resolve(dirname(file), m[1] || m[2]);
    assert.ok(existsSync(target), `${file} imports ${m[1] || m[2]}, which the image does not contain`);
    relativeImports(target, seen);
  }
  return seen;
}

test('the generated Docker context boots the Motion service: every shared file it imports is archived and copied', { skip: noShell, timeout: 120000 }, async t => {
  const { ctx, app, paths, copies, links } = imageTree();
  t.after(() => { for (const l of links) rmSync(l, { force: true }); rmSync(ctx, { recursive: true, force: true, maxRetries: 3 }); });
  const svc = join(app, 'packages', 'learn-render', 'motion', 'service');

  // The render child, linked and run from the image tree: a job it refuses still writes result.json.
  const job = join(ctx, 'job');
  mkdirSync(job);
  writeFileSync(join(job, 'job.json'), JSON.stringify({ render_id: 'context-test', brief: null, storyboard: null, composition: { composition_id: 'x', source: '' } }));
  const child = spawnSync(process.execPath, [join(svc, 'child.mjs'), job], { cwd: join(app, 'packages', 'learn-render'), encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
  assert.equal(child.status, 0, `the child did not start from the image tree: ${child.stderr.split('\n').find(l => /Error/.test(l)) || child.stderr.slice(0, 300)}`);
  assert.ok(existsSync(join(job, 'out', 'result.json')));

  // The service, started from the image tree as the image's CMD starts it (sandbox off here).
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, ['motion/service/server.mjs'], { cwd: join(app, 'packages', 'learn-render'), env: { ...process.env, MOTION_SANDBOX: 'none', MOTION_ALLOW_UNSANDBOXED: '1', MOTION_RENDERER_TOKEN: 'c'.repeat(40), PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', d => { stderr += d; });
  const exited = new Promise(r => proc.on('exit', code => r(code)));
  let health = null;
  try {
    for (let i = 0; i < 100 && !health; i++) {
      if (await Promise.race([exited.then(() => true), new Promise(r => setTimeout(() => r(false), 100))])) break;
      health = await fetch(`http://127.0.0.1:${port}/health`).then(r => r.json(), () => null);
    }
  } finally {
    proc.kill(); // before the tree it runs from is removed (Windows cannot remove a running process's cwd)
    await exited;
  }
  assert.ok(health, `the service did not boot from the image tree: ${stderr.split('\n').find(l => /Error/.test(l)) || stderr.slice(0, 300)}`);
  assert.equal(health.service, 'rabbit-hole-motion-renderer');
  assert.equal(health.ok, true);

  // Every relative import of the service resolves inside the image, and the shared parser is the
  // one file outside packages/learn-render, kept in its own package (one parser, never a copy).
  const graph = ['server.mjs', 'child.mjs'].reduce((seen, f) => relativeImports(join(svc, f), seen), new Set());
  assert.deepEqual([...graph].map(f => f.slice(app.length + 1).split(/[\\/]/).join('/')).filter(f => !f.startsWith('packages/learn-render/')), ['packages/control-plane/src/request-duration.js']);
  assert.ok(paths.includes('packages/control-plane/src/request-duration.js'), 'context.sh archives the shared duration parser');
  for (const f of ['packages/control-plane/src/request-duration.js', 'packages/control-plane/package.json']) assert.ok(copies.some(([, to]) => to === f), `the Dockerfile copies ${f}`);
  assert.equal(JSON.parse(readFileSync(join(app, 'packages', 'control-plane', 'package.json'), 'utf8')).type, 'module');
});

// The production configs (prepared, not deployed): the renderer is the proven dev service under its production name, with
// the same image, sandbox, limits and single machine; the orchestrator has no volume (the worker holds the durable record).
test('the production renderer config is the dev config under its production name; the orchestrator config has no volume', () => {
  const body = f => read(f).split('\n').filter(l => !l.startsWith('#') && !l.startsWith('app =')).join('\n');
  assert.match(read('./fly.prod.toml'), /^app = "rabbit-hole-motion-renderer"$/m);
  assert.equal(body('./fly.prod.toml'), body('./fly.dev.toml'));
  const orchestrator = read('./fly.orchestrator.toml');
  assert.match(orchestrator, /^app = "rabbit-hole-motion-orchestrator"$/m);
  assert.match(orchestrator, /dockerfile = "Dockerfile.orchestrator"/);
  assert.doesNotMatch(orchestrator, /^\s*\[+mounts\]+/m);
  assert.doesNotMatch(orchestrator, /^\s*\w*(TOKEN|API_KEY)\s*=/m, 'secrets are fly secrets, never in the file');
  assert.match(orchestrator, /MOTION_RENDERER_URL = "https:\/\/rabbit-hole-motion-renderer\.fly\.dev"/);
  assert.doesNotMatch(read('./Dockerfile.orchestrator'), /remotion browser ensure|motion-sandbox|sudo/, 'no Chrome and no sandbox launcher: it never renders');
});

test('the orchestrator Docker context boots the hostable entry: every file it imports is archived and copied', { skip: noShell, timeout: 120000 }, async t => {
  const { ctx, app, links } = imageTree('orchestrator', 'Dockerfile.orchestrator');
  t.after(() => { for (const l of links) rmSync(l, { force: true }); rmSync(ctx, { recursive: true, force: true, maxRetries: 3 }); });
  const cwd = join(app, 'packages', 'learn-render');
  const base = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  // Without its configuration it refuses to start and names what is missing (names only).
  const bare = spawnSync(process.execPath, ['motion/orchestrator-main.mjs'], { cwd, encoding: 'utf8', env: base });
  assert.equal(bare.status, 2, bare.stderr);
  assert.match(bare.stderr, /MOTION_ORCHESTRATOR_TOKEN: at least 32 characters/);
  // With its tokens and no model key yet (production before the dedicated workspace's secret is set), it serves /health from
  // the image tree as the image's CMD starts it, and says it is not ready.
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, ['motion/orchestrator-main.mjs'], { cwd, env: { ...base, HOST: '127.0.0.1', PORT: String(port), MOTION_WORK_DIR: join(ctx, 'jobs'),
    MOTION_ORCHESTRATOR_TOKEN: 'o'.repeat(40), MOTION_RENDERER_URL: 'http://127.0.0.1:9', MOTION_RENDERER_TOKEN: 'r'.repeat(40) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', d => { stderr += d; });
  const exited = new Promise(r => proc.on('exit', code => r(code)));
  let health = null;
  try {
    for (let i = 0; i < 100 && !health; i++) {
      if (await Promise.race([exited.then(() => true), new Promise(r => setTimeout(() => r(false), 100))])) break;
      health = await fetch(`http://127.0.0.1:${port}/health`).then(r => r.json(), () => null);
    }
  } finally { proc.kill(); await exited; }
  // boot: the random id of this run, which grants are bound to (MOT-08).
  assert.deepEqual({ ...health, boot: /^[0-9a-f]{32}$/.test(health?.boot) ? 'id' : health?.boot },{ ok: true, active: false, boot: 'id', ready: false, missing: ['ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID'] }, `the orchestrator did not boot from the image tree: ${stderr.split('\n').find(l => /Error/.test(l)) || stderr.slice(0, 300)}`);
  relativeImports(join(cwd, 'motion', 'orchestrator-main.mjs'));
});
