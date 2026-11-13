// The MVP fast path: the owner's standing policy of 2026-11-03 (CLAUDE.md#mvp-fast-path, docs/features/mvp-fast-path.md).
//   node scripts/mvp-fast-path.mjs preview --mvp --sha <40-hex> --smoke "<command>" [--smoke "<command>" ...]
//        --recovery <branch> [--worker rabbit-hole-web-dev-<name>] [--base <ref>] [--no-deploy]
//   node scripts/mvp-fast-path.mjs verify --sha <40-hex> [--record <file>] [--json] [--fetch]
// --recovery is required (the owner's MVP minimum, 2026-11-03): a branch already on rabbit-hole, cut by the lane, whose tip is a
// strict descendant of the release commit (the recovery on top of it). It is checked before anything is built and recorded.
// verify only reads: it reads the newest MVP record of the sha (default: the common dir record file) and exits 0 only when
// production would accept it, the recovery branch included (--fetch first updates that one remote-tracking branch from rabbit-hole);
// --json prints that record's line. The owner's release launcher uses it.
// For MVP-labelled work only, and only when asked for: preview refuses to run without --mvp, and production takes the
// record it writes only through `prod-release.mjs prepare --mvp`. It runs the build, the tests the change affects and the
// focused smoke command(s) (each must exit 0), then deploys the isolated clone and checks that it serves the new build.
// The record it appends to <git common dir>/rabbit-hole-dev-deploys.jsonl names the exact commit, tree, build, clone and
// every check actually run with its exit code, and says broad CI and the release gate were bypassed, never passed.
// A failed required check still writes a record (so the attempt is on file) but deploys nothing and is never accepted.
// Never touches the stable preview (deploy-dev.yml), never production, never runs a migration, never prints a secret.
// Needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (rabbit-hole) and VITE_TLDRAW_LICENSE_KEY in the environment.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { entryScript } from './dev-deploy.mjs';

export const MVP_BANNER = 'MVP MODE: broad CI and release gate BYPASSED by owner policy';
// What an accepted record must show passing. `preview` is the deploy of the isolated clone and the check that it serves the build.
export const REQUIRED = ['build', 'affected-tests', 'smoke', 'preview'];
const SHA = /^[0-9a-f]{40}$/;
const ACCOUNT = 'c08d3dbdc53a3afd3cb09a536ac42318'; // the rabbit-hole Cloudflare account, as in dev-deploy.mjs and prod-release.mjs
const CLONE = /^rabbit-hole-web-dev-[a-z0-9][a-z0-9-]*$/;
const STABLE = 'rabbit-hole-web-dev-small-parallel'; // preview.digrabbithole.com: deploy-dev.yml owns it

// ---- the record ----
const stable = v => Array.isArray(v) ? `[${v.map(stable)}]` : v && typeof v === 'object' ? `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`)}}` : JSON.stringify(v);
// Catches an edited record (a check flipped to pass, a sha swapped). It is not a signature: whoever can rewrite the line can recompute it.
export const recordDigest = ({ digest: _, ...rest }) => createHash('sha256').update(stable(rest)).digest('hex').slice(0, 16);

export function makeRecord({ sha, tree, base, build, targets, checks, recovery, version, run, at }) {
  const r = { mvp: true, sha, tree, gates: 'bypassed', broad_ci: 'bypassed', release_gate: 'bypassed', base, build, targets, checks, recovery, ...(version && { version }), run, at };
  return { ...r, digest: recordDigest(r) };
}

// The recovery branch (owner's MVP minimum): it exists on rabbit-hole and its tip is a strict descendant of the release commit, so
// recovering forward is a push away. rev(ref) -> sha | null and isAncestor(a, b) read the local clone's remote-tracking refs (no
// network): git fetch rabbit-hole <branch> first. -> { tip } | { error }.
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
export function checkRecovery(sha, branch, { rev, isAncestor }) {
  if (typeof branch !== 'string' || !BRANCH.test(branch) || branch.includes('..') || branch.endsWith('/') || branch.endsWith('.lock')) return { error: `recovery: ${branch} is not a branch name` };
  if (['main', 'dev'].includes(branch)) return { error: `recovery: ${branch} is not a recovery branch; cut one from the release commit with the recovery on top` };
  const tip = ['rabbit-hole', 'origin'].map(r => rev(`refs/remotes/${r}/${branch}`)).find(Boolean);
  if (!tip) return { error: `recovery: branch ${branch} is not on rabbit-hole (push it, then git fetch rabbit-hole ${branch})` };
  if (tip === sha) return { error: `recovery: branch ${branch} is at the release commit itself; it must carry the recovery on top of it` };
  if (!isAncestor(sha, tip)) return { error: `recovery: branch ${branch} (${tip.slice(0, 8)}) does not contain ${sha.slice(0, 8)} as an ancestor` };
  return { tip };
}

// The newest MVP record of `sha` in a dev-deploy record (jsonl). -> { record } | { error }. Every required check passed, the
// record is this commit's own tree, the bypass is stated as bypassed, the target is a dev clone, and it names a recovery branch:
// or it is refused. checkBranch(branch) -> { tip } | { error } (checkRecovery on the local refs) is the caller's live look at that
// branch; without it only the record's own claim is checked.
export function mvpVerdict(text, sha, treeOf = () => null, checkBranch = null) {
  const r = String(text || '').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).findLast(x => x?.sha === sha && x.mvp === true);
  if (!r) return { error: `no MVP preview record is recorded for ${sha}` };
  const no = error => ({ error });
  if (!r.digest) return no('the record has no digest');
  if (r.digest !== recordDigest(r)) return no('the record does not match its digest (edited after it was written)');
  for (const name of REQUIRED) {
    const cs = (r.checks || []).filter(c => c.name === name);
    if (!cs.length) return no(`required check ${name} is missing`);
    const bad = cs.find(c => c.exit !== 0 || c.result !== 'pass');
    if (bad) return no(`required check ${name} did not pass (exit ${bad.exit})`);
  }
  for (const k of ['tree', 'build', 'version', 'run', 'at']) if (!r[k]) return no(`the record has no ${k}`);
  if (!SHA.test(r.tree) || !/^[0-9a-f]{12}$/.test(r.build)) return no('the record\'s tree or build is malformed');
  if (r.tree !== treeOf(sha)) return no('the record names another tree than this commit\'s');
  if (r.gates !== 'bypassed' || r.broad_ci !== 'bypassed' || r.release_gate !== 'bypassed') return no('broad CI and the release gate must be recorded as bypassed, never passed');
  if (r.targets?.env !== 'dev' || !CLONE.test(r.targets?.worker || '')) return no('the preview target is not a rabbit-hole-web-dev-* clone');
  if (typeof r.recovery?.branch !== 'string' || !SHA.test(r.recovery.tip || '')) return no('the record names no recovery branch (the owner\'s MVP minimum: preview --mvp ... --recovery <branch>)');
  const live = checkBranch?.(r.recovery.branch);
  if (live?.error) return no(live.error);
  return { record: r };
}

// What the prepared build and the release receipt carry of the record.
export const mvpSummary = r => ({ digest: r.digest, worker: r.targets.worker, checks: r.checks.map(c => `${c.name}:${c.result}`), recovery: r.recovery, broad_ci: r.broad_ci, release_gate: r.release_gate });

// ---- the affected tests ----
// A suite owns the changed files under `own`; its tests are the files matching `test`; `all` runs the whole suite.
export const SUITES = [
  { cwd: 'packages/web', own: /^packages\/web\/src\//, test: /\.test\.mjs$/, all: ['--test', 'src/**/*.test.mjs'] },
  { cwd: 'packages/control-plane', own: /^packages\/control-plane\/(?!.*\.md$)/, test: /^packages\/control-plane\/test\/.+\.test\.js$/, all: ['--test'] },
  { cwd: '.', own: /^scripts\/[^/]+\.mjs$/, test: /^scripts\/[^/]+\.test\.mjs$/, all: ['--test', 'scripts/*.test.mjs'] },
];
// changed: paths added, copied, modified or renamed; tests: Map(path -> text) of every test file. A changed test runs itself; a
// changed module runs the tests that import it by relative path (one hop). A suite whose changed files select no test at all runs
// whole, so a code change never "passes" on zero tests; the changed files no test imports are listed as uncovered.
// -> [{ cwd, args, ran, uncovered }] (empty: no unit-tested code changed).
export function affectedTests(changed, tests, suites = SUITES) {
  return suites.flatMap(s => {
    const own = changed.filter(p => s.own.test(p)), hit = new Set(), uncovered = [];
    if (!own.length) return [];
    for (const p of own) {
      if (s.test.test(p)) { hit.add(p); continue; }
      const name = posix.basename(p).replace(/\.[^.]+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const imports = new RegExp(`['"]\\.{1,2}/(?:[^'"]*/)?${name}(?:\\.[mc]?jsx?)?['"]`);
      const found = [...tests].filter(([t, text]) => s.test.test(t) && imports.test(text)).map(([t]) => t);
      if (found.length) found.forEach(t => hit.add(t)); else uncovered.push(p);
    }
    const files = [...hit].sort();
    return [files.length ? { cwd: s.cwd, args: ['--test', ...files.map(f => posix.relative(s.cwd, f))], ran: files, uncovered }
      : { cwd: s.cwd, args: s.all, ran: [`all ${s.cwd}`], uncovered }];
  });
}

// ---- the preview ----
// io: build() / tests() / smoke() / deploy() -> { exit, cmd, ... } (a throw is a failed check). Required checks run in order and
// each stops the run on failure; the clone is deployed only after all three focused checks passed. -> the record.
export async function runPreview({ sha, tree, base, worker, recovery, deploy: wantDeploy = true, run = 'local', now = () => new Date() }, io) {
  const checks = [];
  const go = async (name, step) => {
    let r; try { r = await step(); } catch (e) { r = { exit: 1, cmd: name, error: e.message }; }
    checks.push({ name, cmd: r.cmd, ...(r.ran && { ran: r.ran }), ...(r.uncovered?.length && { uncovered: r.uncovered }), ...(r.error && { error: r.error }), exit: r.exit, result: r.exit === 0 ? 'pass' : 'fail' });
    return r;
  };
  const b = await go('build', io.build);
  const ok = b.exit === 0 && (await go('affected-tests', io.tests)).exit === 0 && (await go('smoke', io.smoke)).exit === 0;
  const p = ok && wantDeploy ? await go('preview', io.deploy) : null;
  return makeRecord({ sha, tree, base, build: b.build, recovery, targets: { worker, url: `https://${worker}.tryrabbithole.workers.dev`, account: ACCOUNT, env: 'dev' }, checks, version: p?.version, run, at: now().toISOString() });
}

export function previewArgs(argv, dir = 'worktree') {
  const o = { smoke: [], deploy: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mvp') o.mvp = true;
    else if (a === '--no-deploy') o.deploy = false;
    else if (['--sha', '--worker', '--base', '--recovery'].includes(a)) o[a.slice(2)] = argv[++i];
    else if (a === '--smoke') o.smoke.push(argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.mvp) throw new Error('--mvp is required: this launcher is the owner\'s MVP fast path (CLAUDE.md#mvp-fast-path); an ordinary preview goes through the dev workflow');
  if (!SHA.test(o.sha || '')) throw new Error('--sha must be a full 40-character commit sha');
  if (!o.smoke.length || o.smoke.some(s => !s)) throw new Error('--smoke "<command>" is required: the focused feature smoke check, which must exit 0');
  if (!o.recovery) throw new Error('--recovery <branch> is required: the owner\'s MVP minimum includes a recovery branch already on rabbit-hole whose tip contains the release commit');
  o.worker ??= `rabbit-hole-web-dev-${dir}`;
  if (!CLONE.test(o.worker) || o.worker === STABLE) throw new Error(`--worker must be your own rabbit-hole-web-dev-<worktree> clone, not ${o.worker} (the stable preview and production are never an MVP target)`);
  return o;
}

export function verifyArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--fetch') o.fetch = true;
    else if (a === '--sha' || a === '--record') o[a.slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  if (!SHA.test(o.sha || '')) throw new Error('--sha must be a full 40-character commit sha');
  return o;
}

// ---- CLI ----
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WEB = join(ROOT, 'packages/web');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const say = line => console.log(line);
const revOf = ref => { try { return git('rev-parse', '--verify', '-q', `${ref}^{commit}`); } catch { return null; } };
const ancestorOf = (a, b) => { try { execFileSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: ROOT, stdio: 'ignore' }); return true; } catch { return false; } };
const recoveryOf = sha => branch => checkRecovery(sha, branch, { rev: revOf, isAncestor: ancestorOf });
// Updates only refs/remotes/rabbit-hole/<branch>; a branch that is not there is reported as not on rabbit-hole by checkRecovery.
const fetchBranch = branch => { try { git('fetch', '-q', 'rabbit-hole', `+refs/heads/${branch}:refs/remotes/rabbit-hole/${branch}`); } catch { /* checkRecovery says what is missing */ } };
const status = (cmd, args, o = {}) => spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...o }).status ?? 1;
const tool = (pkg, file) => join(ROOT, 'node_modules', pkg, file);
// The pages' identity, as dev-deploy.mjs hashes dist-dev: every file, path and bytes.
const buildHash = dir => {
  const h = createHash('sha256');
  for (const f of readdirSync(dir, { recursive: true }).map(String).filter(f => statSync(join(dir, f)).isFile()).sort()) h.update(f.replace(/\\/g, '/')).update('\0').update(readFileSync(join(dir, f)));
  return h.digest('hex').slice(0, 12);
};

async function serves(url, entry) { // the new version serves some seconds after deploy returns: two hits in a row
  for (let i = 0, streak = 0; i < 40; i++) {
    const r = await fetch(`${url}/library`, { redirect: 'manual', headers: { 'User-Agent': 'rabbit-hole-mvp-preview' } }).catch(() => null);
    streak = r?.status === 200 && (await r.text()).includes(entry) ? streak + 1 : 0;
    if (streak >= 2) return true;
    await new Promise(res => setTimeout(res, 3000));
  }
  return false;
}

function verify(o) {
  const file = o.record ?? join(git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'rabbit-hole-dev-deploys.jsonl');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const treeOf = s => { try { return git('rev-parse', `${s}^{tree}`); } catch { return null; } };
  const named = mvpVerdict(text, o.sha, treeOf).record?.recovery?.branch;
  if (o.fetch && named && BRANCH.test(named)) fetchBranch(named);
  const v = mvpVerdict(text, o.sha, treeOf, recoveryOf(o.sha));
  if (v.error) throw new Error(`${o.sha.slice(0, 8)}: ${v.error}`);
  say(o.json ? JSON.stringify(v.record) : `✓ MVP record ${v.record.digest} for ${o.sha.slice(0, 8)}: ${v.record.checks.map(c => `${c.name} ${c.result}`).join(', ')}; ${v.record.targets.worker}; recovery ${v.record.recovery.branch}; broad CI and the release gate bypassed`);
}

async function preview(o) {
  const stop = line => { throw new Error(line); };
  say(MVP_BANNER);
  fetchBranch(o.recovery); // the owner's minimum: no build for a release that could not be recovered forward
  const recovery = recoveryOf(o.sha)(o.recovery);
  if (recovery.error) stop(recovery.error);
  say(`✓ recovery: ${o.recovery} (${recovery.tip.slice(0, 8)}) contains ${o.sha.slice(0, 8)}`);
  if (git('rev-parse', `${o.sha}^{commit}`) !== o.sha) stop(`${o.sha} is not a commit here`);
  if (git('rev-parse', 'HEAD') !== o.sha) stop(`this checkout is not at ${o.sha.slice(0, 8)}; the preview builds the exact commit`);
  if (git('diff', '--name-only', 'HEAD')) stop('this checkout has tracked changes; commit them first (the record names a commit)');
  if (o.deploy && process.env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT) stop('CLOUDFLARE_ACCOUNT_ID must be the rabbit-hole account');
  if (!process.env.VITE_TLDRAW_LICENSE_KEY) stop('VITE_TLDRAW_LICENSE_KEY is not in the environment');
  const base = git('merge-base', o.base ?? ['rabbit-hole/main', 'origin/main'].find(r => { try { git('rev-parse', '--verify', r); return true; } catch { return false; } }) ?? stop('--base <ref> is needed: no rabbit-hole/main or origin/main here'), o.sha);
  const changed = git('diff', '--name-only', '--diff-filter=ACMR', base, o.sha).split('\n').filter(Boolean);
  const tests = new Map(git('ls-files', '--', '*.test.mjs', '*.test.js').split('\n').filter(Boolean).map(p => [p, readFileSync(join(ROOT, p), 'utf8')]));
  const plan = affectedTests(changed, tests);
  let entry = null, built = null;
  const io = {
    build: () => {
      const env = { ...process.env, VITE_COACHING_DEV: 'true' }; // the documented dev build (CLAUDE.md, Development deployments)
      let exit = 0;
      for (const out of ['dist', 'dist-dev']) exit ||= status(process.execPath, [tool('vite', 'bin/vite.js'), 'build', '--outDir', out], { cwd: WEB, env, stdio: ['ignore', 'ignore', 'inherit'] });
      if (exit) return { exit, cmd: 'vite build --outDir dist, dist-dev' };
      entry = entryScript(readFileSync(join(WEB, 'dist-dev/index.html'), 'utf8'));
      built = buildHash(join(WEB, 'dist-dev'));
      return { exit: entry ? 0 : 1, cmd: 'vite build --outDir dist, dist-dev', build: built };
    },
    tests: () => { // one at a time
      let exit = 0;
      for (const p of plan) exit ||= status(process.execPath, p.args, { cwd: join(ROOT, p.cwd) });
      return { exit, cmd: plan.map(p => `node ${p.args.join(' ')} (${p.cwd})`).join('; ') || 'no unit-tested code changed', ran: plan.flatMap(p => p.ran), uncovered: plan.flatMap(p => p.uncovered) };
    },
    smoke: () => {
      let exit = 0;
      for (const s of o.smoke) exit ||= status(s, [], { shell: true });
      return { exit, cmd: o.smoke.join('; ') };
    },
    deploy: async () => {
      const wrangler = spawnSync(process.execPath, [tool('wrangler', 'bin/wrangler.js'), 'deploy', '--config', 'wrangler.dev.jsonc', '--name', o.worker, '--message', `mvp ${o.sha} build ${built}`], { cwd: WEB, encoding: 'utf8', env: { ...process.env, CI: 'true' } });
      if (wrangler.status) return { exit: wrangler.status, cmd: `wrangler deploy --name ${o.worker}`, error: wrangler.stderr.split('\n').find(l => /error/i.test(l)) ?? 'wrangler failed' };
      const version = wrangler.stdout.match(/Current Version ID: (\S+)/)?.[1];
      return { exit: version && await serves(`https://${o.worker}.tryrabbithole.workers.dev`, entry) ? 0 : 1, cmd: `wrangler deploy --name ${o.worker}; GET /library serves ${entry}`, version };
    },
  };
  const rec = await runPreview({ sha: o.sha, tree: git('rev-parse', `${o.sha}^{tree}`), base, worker: o.worker, recovery: { branch: o.recovery, tip: recovery.tip }, deploy: o.deploy, run: process.env.GITHUB_RUN_ID ?? 'local' }, io);
  for (const c of rec.checks) say(`${c.result === 'pass' ? '✓' : '✗'} ${c.name}: ${c.cmd}${c.ran ? ` [${c.ran.length} test file(s)]` : ''}${c.uncovered ? ` (no test imports: ${c.uncovered.join(', ')})` : ''}${c.error ? ` - ${c.error}` : ''}`);
  const line = JSON.stringify(rec);
  appendFileSync(join(git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'rabbit-hole-dev-deploys.jsonl'), `${line}\n`);
  const failed = rec.checks.filter(c => c.result !== 'pass').map(c => c.name);
  if (failed.length) { say(`✗ required check failed: ${failed.join(', ')}; production will not accept this record`); process.exitCode = 1; return; }
  if (!o.deploy) { say('✓ checks passed. --no-deploy: no preview was deployed, so production will not accept this record'); return; }
  const verdict = mvpVerdict(line, o.sha, () => rec.tree);
  if (verdict.error) { say(`✗ no preview record that production would accept: ${verdict.error}`); process.exitCode = 1; return; }
  try { git('notes', '--ref=dev-deploys', 'append', '-m', line, o.sha); } catch (e) { say(`! could not attach the record as a git note: ${e.message.split('\n')[0]}`); }
  say(`✓ MVP preview of ${o.sha.slice(0, 8)} at ${rec.targets.url} (build ${rec.build}, record ${rec.digest}); broad CI and the release gate are recorded as bypassed`);
  say('  To let a push to main release this exact commit: git push rabbit-hole refs/notes/dev-deploys (fetch and merge the remote notes first if it is refused)');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [, , cmd, ...rest] = process.argv;
    if (cmd === 'verify') verify(verifyArgs(rest));
    else if (cmd === 'preview') await preview(previewArgs(rest, basename(ROOT).toLowerCase().replace(/[^a-z0-9]+/g, '-')));
    else throw new Error('usage: mvp-fast-path.mjs preview --mvp --sha <sha> --smoke "<command>" [--smoke ...] [--worker <clone>] [--base <ref>] [--no-deploy] | verify --sha <sha> [--record <file>] [--json]');
  } catch (e) { console.error(`✗ ${e.message}`); process.exitCode = 1; }
}
