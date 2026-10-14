// The same-sha canonical verify.yml run must have succeeded (the protection each run job used to wait for).
import { execFileSync } from 'node:child_process';
export function verifyVerdict(runs, sha) {
  const mine = runs.filter(r => r.headSha === sha);
  if (!mine.length) return `no verify.yml run for ${sha}`;
  const newest = mine[0];
  if (newest.status !== 'completed') return `verify.yml for ${sha} not completed (${newest.status})`;
  return newest.conclusion === 'success' ? null : `verify.yml for ${sha} concluded ${newest.conclusion}`;
}
export function verifyRuns(sha) {
  return JSON.parse(execFileSync('gh', ['run', 'list', '--repo', process.env.GITHUB_REPOSITORY, '--workflow', 'verify.yml', '--commit', sha, '--limit', '20', '--json', 'databaseId,status,conclusion,headSha'], { encoding: 'utf8' }));
}
