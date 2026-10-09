// The verify workflow's evidence (.github/workflows/verify.yml): what was built and tested, by which run, from which
// exact commit, tree and locked dependencies. The dev deploy refuses a commit without a passing one (dev-deploy.mjs).
//   node scripts/verify-evidence.mjs write --unit <exit code> --out <file>
//   node scripts/verify-evidence.mjs write --unit <exit code> --build <exit code> --out <file>
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
  if (cmd === 'write') write(opts); else { console.error('usage: verify-evidence.mjs write --unit <code> --build <code> --out <file>'); process.exitCode = 1; }
}
