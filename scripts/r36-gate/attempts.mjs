// For one workflow run and one candidate: each required part's newest attempt that actually ran. A part's newest
// attempt decides it - an older pass never stands in for a newer failure or cancellation, and a failed-only rerun
// (which leaves the passed parts at their own attempt) can pass.
import { execFileSync } from 'node:child_process';
export function pickAttempts(jobs, parts) {
  const attempts = {}, errors = [];
  for (const part of parts) {
    const mine = jobs.filter(j => j.part === part).sort((a, b) => b.runAttempt - a.runAttempt);
    if (!mine.length) { errors.push(`${part}: no job`); continue; }
    attempts[part] = mine[0].runAttempt;
    if (mine[0].conclusion !== 'success') errors.push(`${part}: newest attempt ${mine[0].runAttempt} ${mine[0].conclusion}`);
  }
  return { attempts, errors };
}
// The matrix jobs of /actions/runs/{id}/attempts/{n}/jobs; a job carried over from an earlier attempt keeps its own run_attempt.
export const jobsOf = ({ jobs }) => jobs.map(j => ({ part: j.name.match(/^run \((.+)\)$/)?.[1], runAttempt: j.run_attempt, conclusion: j.conclusion })).filter(j => j.part);
// ponytail: one page (100) holds the nine matrix jobs; paginate if the matrix ever outgrows it. A hung gh is cut at 60 s.
export function runJobs(exec = execFileSync, env = process.env) {
  const { GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: id, GITHUB_RUN_ATTEMPT: n } = env;
  return jobsOf(JSON.parse(exec('gh', ['api', `repos/${repo}/actions/runs/${id}/attempts/${n}/jobs?per_page=100`], { encoding: 'utf8', timeout: 60000 })));
}
