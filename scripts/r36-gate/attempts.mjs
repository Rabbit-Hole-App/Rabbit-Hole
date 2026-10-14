// For one workflow run and one candidate: each required part's newest attempt that actually ran. A part's newest
// attempt decides it - an older pass never stands in for a newer failure or cancellation, and a failed-only rerun
// (which leaves the passed parts at their own attempt) can pass. Any other run (<x>) job (matrix drift) must also have
// a successful newest attempt, so a part collect does not read can still not hide a failure.
import { execFileSync } from 'node:child_process';
export function pickAttempts(jobs, parts) {
  const attempts = {}, errors = [];
  const newest = part => jobs.filter(j => j.part === part).sort((a, b) => b.runAttempt - a.runAttempt)[0];
  const judge = (part, job) => { if (job.conclusion !== 'success') errors.push(`${part}: newest attempt ${job.runAttempt} ${job.conclusion}`); };
  for (const part of parts) {
    const job = newest(part);
    if (!job) { errors.push(`${part}: no job`); continue; }
    attempts[part] = job.runAttempt;
    judge(part, job);
  }
  for (const part of new Set(jobs.map(j => j.part))) if (!parts.includes(part)) judge(part, newest(part));
  return { attempts, errors };
}
// The matrix jobs of a run's job listing; a job carried over from an earlier attempt keeps its own run_attempt.
export const jobsOf = jobs => jobs.map(j => ({ part: j.name.match(/^run \((.+)\)$/)?.[1], runAttempt: j.run_attempt, conclusion: j.conclusion })).filter(j => j.part);
// Every attempt's jobs of the run (filter=all), page by page; fewer jobs than the listing's total_count is an error,
// never a partial judgement. Each gh call is cut at 60 s so a hung gh cannot hold the collect job.
export function runJobs(exec = execFileSync, env = process.env) {
  const { GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: id } = env, seen = [];
  let total = 0;
  for (let page = 1; ; page++) {
    const body = JSON.parse(exec('gh', ['api', `repos/${repo}/actions/runs/${id}/jobs?filter=all&per_page=100&page=${page}`], { encoding: 'utf8', timeout: 60000 }));
    if (!Number.isInteger(body.total_count)) throw Error('jobs listing has no total_count');
    total = body.total_count; seen.push(...body.jobs);
    if (!body.jobs.length || seen.length >= total) break;
  }
  if (seen.length < total) throw Error(`jobs listing incomplete: saw ${seen.length} of ${total}`);
  return jobsOf(seen);
}
