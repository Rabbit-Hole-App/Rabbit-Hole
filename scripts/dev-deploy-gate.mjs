// The dev workflow's gate step (.github/workflows/deploy-dev.yml): turns the pushed commit's gates note into the
// dev-deploy.mjs arguments and runs it.
//   node scripts/dev-deploy-gate.mjs --sha <commit> --gate <its gates note> --dev-deploys <refs/notes/dev-deploys ref>
// The note is either a full gate record of the commit's tree, or (owner 2026-10-09: reuse a gate for script-only
// changes) a first line "reuse <G sha>" and, when tests changed, the rerun record of the commit's own tree. A reuse is
// refused unless G has its own gates note and a green dev deploy (gates pass, smoke pass, in refs/notes/dev-deploys);
// G's recorded build goes into the dev-deploy record so dev-deploy.mjs checks the new build is byte-identical to it.
// Everything else - G an ancestor, every changed path reusable, the rerun covering what failed - is dev-deploy.mjs's.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function parseGatesNote(text) {
  const m = text.match(/^reuse ([0-9a-f]{40})[ \t]*\r?(\n|$)/);
  if (!m) return { full: text };
  const rest = text.slice(m[0].length);
  return { reuse: m[1], rerun: rest.trim() ? rest : null };
}

// G's own green dev deploy: a full gate and a passing smoke (a reused one never counts as G).
export const greenDev = (text, sha) => text.split(/\r?\n/).filter(Boolean)
  .map(l => { try { return JSON.parse(l); } catch { return null; } })
  .findLast(r => r?.sha === sha && r.gates === 'pass' && r.smoke === 'pass') ?? null;

// -> { full: true } | { reuse, rerun, seed } (seed: G's green dev record line) | { refuse }.
export function gatePlan({ note, gNote, gDev }) {
  const n = parseGatesNote(note);
  if (n.full) return { full: true };
  if (!gNote) return { refuse: `reuse ${n.reuse.slice(0, 8)}: it has no gates note of its own` };
  const seed = gDev && greenDev(gDev, n.reuse);
  if (!seed) return { refuse: `reuse ${n.reuse.slice(0, 8)}: it has no green dev deploy (gates pass, smoke pass)` };
  return { reuse: n.reuse, rerun: n.rerun, seed };
}

function main() {
  const arg = k => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const root = fileURLToPath(new URL('..', import.meta.url));
  const git = (...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; } };
  const sha = arg('sha'), note = readFileSync(arg('gate'), 'utf8'), devRef = arg('dev-deploys');
  const reuse = parseGatesNote(note).reuse, gNote = reuse && git('notes', '--ref=gates', 'show', reuse);
  const plan = gatePlan({ note, gNote, gDev: reuse && git('notes', `--ref=${devRef}`, 'show', reuse) });
  if (plan.refuse) { console.error(`✗ ${plan.refuse}: nothing deployed`); process.exitCode = 1; return; }
  const file = (name, text) => { const p = join(tmpdir(), `dev-deploy-gate-${name}.log`); writeFileSync(p, text); return p; };
  let args = ['--gate', arg('gate')];
  if (plan.reuse) {
    args = ['--reuse', plan.reuse, '--gate', file('g', gNote), ...(plan.rerun ? ['--rerun', sha, file('rerun', plan.rerun)] : [])];
    appendFileSync(join(git('rev-parse', '--path-format=absolute', '--git-common-dir').trim(), 'rabbit-hole-dev-deploys.jsonl'), `${JSON.stringify(plan.seed)}\n`);
  }
  console.log(plan.reuse ? `✓ gates note: reuse of ${plan.reuse.slice(0, 8)} (green dev deploy ${plan.seed.version}), ${plan.rerun ? 'with' : 'without'} a rerun` : '✓ gates note: a full gate record');
  args = ['--sha', sha, ...args, '--branch', 'rabbit-hole/dev'];
  process.exitCode = spawnSync(process.execPath, [join(root, 'scripts/dev-deploy.mjs'), ...args], { cwd: root, stdio: 'inherit' }).status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
