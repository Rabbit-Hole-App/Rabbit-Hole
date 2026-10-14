// verify.yml's first decision (owner, 2026-10-14: the same commit was verified again on each branch it was pushed to):
// reuse a passing verify run of exactly this commit instead of installing and building it again. The note's evidence
// must pass checkEvidence (exact sha, tree, lockfiles, unit and build passed), and the run it names must be this
// repository's verify.yml, at this sha, completed successfully. Anything missing, invalid or unconfirmed: verify runs.
// A reuse writes no new note; the original evidence stays the record.
//   node scripts/verify-reuse.mjs   (in GitHub Actions: GITHUB_SHA, GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY)
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkEvidence, lockDigest } from './verify-evidence.mjs';

export const VERIFY_PATH = '.github/workflows/verify.yml';

// -> { reuse: true, url, run } | { reuse: false, why }. runInfo: the API's run attempt object, or null if it could not be read.
export function reuseDecision({ note, sha, tree, locks, repo, runInfo }) {
  if (!note) return { reuse: false, why: 'no verify note for this commit' };
  let evidence; try { evidence = JSON.parse(note); } catch { return { reuse: false, why: 'the verify note is not valid evidence' }; }
  const bad = checkEvidence(evidence, { sha, tree, locks });
  if (bad) return { reuse: false, why: bad };
  const [id, attempt] = evidence.run.split('.');
  if (!runInfo) return { reuse: false, why: `run ${evidence.run} could not be confirmed` };
  if (runInfo.repository?.full_name !== repo) return { reuse: false, why: `run ${evidence.run} is not in ${repo}` };
  if (runInfo.path !== VERIFY_PATH) return { reuse: false, why: `run ${evidence.run} is ${runInfo.path || 'an unknown workflow'}, not ${VERIFY_PATH}` };
  if (String(runInfo.id) !== id || String(runInfo.run_attempt) !== attempt) return { reuse: false, why: `the API answered for another run or attempt than ${evidence.run}` };
  if (runInfo.head_sha !== sha) return { reuse: false, why: `run ${evidence.run} verified ${String(runInfo.head_sha).slice(0, 8)}, not ${sha.slice(0, 8)}` };
  if (runInfo.status !== 'completed' || runInfo.conclusion !== 'success') return { reuse: false, why: `run ${evidence.run} is ${runInfo.status}/${runInfo.conclusion}, not a completed success` };
  return { reuse: true, run: evidence.run, url: runInfo.html_url };
}

async function main() {
  const { GITHUB_SHA: sha, GITHUB_REPOSITORY: repo, GITHUB_TOKEN: token, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: summary } = process.env;
  const root = fileURLToPath(new URL('..', import.meta.url));
  const git = (...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
  let d;
  try {
    git('fetch', '-q', 'origin', '+refs/notes/verify:refs/notes/verify');
    const note = git('notes', '--ref=verify', 'show', sha);
    let runInfo = null;
    const run = (() => { try { return JSON.parse(note).run; } catch { return ''; } })();
    if (/^\d+\.\d+$/.test(run || '') && token) {
      const [id, attempt] = run.split('.');
      const r = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${id}/attempts/${attempt}`, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'rabbit-hole-verify-reuse' }, signal: AbortSignal.timeout(15000) });
      if (r.ok) runInfo = await r.json();
    }
    d = reuseDecision({ note, sha, tree: git('rev-parse', `${sha}^{tree}`), locks: lockDigest(root), repo, runInfo });
  } catch (e) { d = { reuse: false, why: `the reuse check failed (${e.message})` }; }
  const line = d.reuse
    ? `Verification reused: run [${d.run}](${d.url}) already passed unit suites and both page builds for exactly ${sha.slice(0, 8)} (same tree and lockfiles). No new note is written; that run's evidence stays the record.`
    : `Verification runs here: ${d.why}.`;
  console.log(line);
  if (out) appendFileSync(out, `reuse=${d.reuse}\n`);
  if (summary) appendFileSync(summary, `${line}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
