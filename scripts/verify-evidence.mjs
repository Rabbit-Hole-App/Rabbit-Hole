// The verify workflow's evidence (.github/workflows/verify.yml): what was built and tested, by which run, from which
// exact commit, tree and locked dependencies. The dev deploy refuses a commit without a passing one (dev-deploy.mjs).
//   node scripts/verify-evidence.mjs write --unit <exit code> --out <file>
//   node scripts/verify-evidence.mjs write --unit <exit code> --build <exit code> --out <file>
//   node scripts/verify-evidence.mjs runs --sha <commit> --out <file> [--wait <minutes>]   (GITHUB_TOKEN with actions: read)
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const LOCKS = ['package-lock.json', 'uv.lock'];
const sha256 = buf => createHash('sha256').update(buf).digest('hex').slice(0, 16);
// Line endings aside: a Windows checkout and the Linux runner digest the same lockfile alike.
export const lockDigest = root => Object.fromEntries(LOCKS.map(f => [f, sha256(readFileSync(join(root, f), 'utf8').replace(/\r\n/g, '\n'))]));

// -> null when the evidence proves a passing verify run of exactly this commit, tree and lockfiles, else the reason.
export function checkEvidence(evidence, { sha, tree, locks }) {
  if (!evidence) return 'no verify evidence for this commit';
  if (evidence.sha !== sha) return `the verify evidence is for ${String(evidence.sha).slice(0, 8)}, not ${sha.slice(0, 8)}`;
  if (evidence.tree !== tree) return `the verify evidence names tree ${String(evidence.tree).slice(0, 8)}, not ${tree.slice(0, 8)}`;
  for (const f of LOCKS) if (evidence.locks?.[f] !== locks[f]) return `the verify evidence was built from another ${f}`;
  if (evidence.unit !== 'pass' || evidence.build !== 'pass') return `the verify run did not pass (unit ${evidence.unit}, build ${evidence.build})`;
  if (!/^\d+\.\d+$/.test(evidence.run || '')) return 'the verify evidence names no run';
  return null;
}

// OPS-04 (owner, 2026-10-21; UI-17 14310051 shipped with its own fast-e2e run 39719683140 failed): every deploy, dev or
// production, fully gated or reusing a gate, needs a successful fast-e2e (early browser checks) and verify run of exactly
// the candidate sha. A green ancestor gate never stands in for them, and a full gate's browser shards do not either:
// one rule, no exceptions, and fast-e2e is cheap.
export const RELEASE_RUNS = ['.github/workflows/fast-e2e.yml', '.github/workflows/verify.yml'];
const workflowName = path => path.split('/').pop().replace(/\.ya?ml$/, '');
// The newest attempt of `path` at exactly `sha`; a pull_request run tests a merge tree, so it never counts.
export function latestRun(runs, { sha, path }) {
  const at = r => Date.parse(r.run_started_at || r.created_at) || 0;
  return (runs || []).filter(r => r.path === path && r.event !== 'pull_request' && r.head_sha === sha)
    .reduce((a, r) => !a || at(r) > at(a) || (at(r) === at(a) && r.id > a.id) ? r : a, null);
}
// -> [] when the newest attempt of every release workflow at exactly `sha` completed successfully, else one line each.
// evidence: { sha, runs: { <workflow path>: [run objects from the Actions API] } } as `runs` writes it, or null.
export function runBlockers(evidence, sha) {
  if (!evidence?.runs) return ['no CI run evidence for this commit (the Actions runs could not be read)'];
  if (evidence.sha !== sha) return [`the CI run evidence is for ${String(evidence.sha).slice(0, 8)}, not ${sha.slice(0, 8)}`];
  return RELEASE_RUNS.flatMap(path => {
    const name = workflowName(path), runs = evidence.runs[path] || [], r = latestRun(runs, { sha, path });
    if (!r) {
      const others = [...new Set(runs.filter(o => o.path === path && o.head_sha !== sha).map(o => String(o.head_sha).slice(0, 8)))];
      return [`no ${name} run of ${sha.slice(0, 8)}${others.length ? ` (the runs read are of ${others.join(', ')})` : ''}; push the commit to a branch other than main or dev and let ${name} finish`];
    }
    if (r.status !== 'completed' || r.conclusion !== 'success') return [`${name} run ${r.id}.${r.run_attempt} of ${sha.slice(0, 8)} is ${r.status}/${r.conclusion}, not a completed success: ${r.html_url}`];
    return [];
  });
}
const pending = (evidence, sha) => RELEASE_RUNS.some(path => { const r = latestRun(evidence.runs[path], { sha, path }); return r && r.status !== 'completed'; });

// The Actions API read (GET only): every run of each release workflow at this sha, newest attempt each.
// shortcut: one page of 100 runs per workflow; one commit never has that many.
async function runs(opts) {
  const { sha, out } = opts, repo = process.env.GITHUB_REPOSITORY || 'Rabbit-Hole-App/Rabbit-Hole', token = process.env.GITHUB_TOKEN;
  if (!/^[0-9a-f]{40}$/.test(sha || '') || !out) throw new Error('usage: verify-evidence.mjs runs --sha <40-hex sha> --out <file> [--wait <minutes>]');
  if (!token) throw new Error('GITHUB_TOKEN (actions: read) is not set');
  const read = async () => {
    const evidence = { sha, repo, at: new Date().toISOString(), runs: {} };
    for (const path of RELEASE_RUNS) {
      const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${path.split('/').pop()}/runs?head_sha=${sha}&per_page=100`, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'rabbit-hole-release-runs' }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`GET ${path} runs: ${r.status}`);
      evidence.runs[path] = (await r.json()).workflow_runs.map(({ id, run_attempt, path, head_sha, head_branch, event, status, conclusion, html_url, created_at, run_started_at }) =>
        ({ id, run_attempt, path, head_sha, head_branch, event, status, conclusion, html_url, created_at, run_started_at }));
    }
    return evidence;
  };
  const end = Date.now() + Number(opts.wait || 0) * 60_000;
  let evidence = await read();
  while (pending(evidence, sha) && Date.now() < end) { console.log('a release run of this commit is still running; checking again in 30 s'); await new Promise(r => setTimeout(r, 30_000)); evidence = await read(); }
  writeFileSync(out, JSON.stringify(evidence, null, 1));
  for (const line of runBlockers(evidence, sha)) console.log(`✗ ${line}`);
  for (const path of RELEASE_RUNS) { const r = latestRun(evidence.runs[path], { sha, path }); if (r) console.log(`${workflowName(path)}: run ${r.id}.${r.run_attempt} (${r.event} ${r.head_branch}) ${r.status}/${r.conclusion}`); }
}

function write(opts) {
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
  const evidence = {
    sha: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), locks: lockDigest(ROOT),
    unit: opts.unit === '0' ? 'pass' : `exit ${opts.unit}`, build: opts.build === '0' ? 'pass' : `exit ${opts.build}`,
    run: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}.${process.env.GITHUB_RUN_ATTEMPT ?? 1}` : 'local', node: process.version, at: new Date().toISOString(),
  };
  writeFileSync(opts.out, JSON.stringify(evidence, null, 1));
  console.log(JSON.stringify(evidence));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...rest] = process.argv.slice(2);
  const opts = {}; for (let i = 0; i < rest.length; i += 2) opts[rest[i].replace(/^--/, '')] = rest[i + 1];
  if (cmd === 'write') write(opts);
  else if (cmd === 'runs') await runs(opts).catch(e => { console.error(`✗ ${e.message}`); process.exitCode = 1; });
  else { console.error('usage: verify-evidence.mjs write --unit <code> --build <code> --out <file> | runs --sha <sha> --out <file> [--wait <minutes>]'); process.exitCode = 1; }
}
