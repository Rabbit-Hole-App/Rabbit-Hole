// The gate's dispatch preflight (gate-sharded.yml job preflight; owner 2026-10-14: no full Windows gate until verify and
// fast-e2e have both passed on the exact finished candidate). Before any Windows runner starts, APP_SHA must be a commit of
// this repository whose tree is APP_TREE, with a successful verify.yml push run and a successful fast-e2e.yml push or
// dispatch run on that exact commit. Fails closed in one line naming what is missing; collect still re-checks verify.
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

const HEX40 = /^[0-9a-f]{40}$/;
const NEEDED = [['verify.yml', ['push']], ['fast-e2e.yml', ['push', 'workflow_dispatch']]];
// api(path) is the parsed answer of GET path, or null for a 404. Returns what is missing, empty when the gate may start.
export function missing({ repo, sha, tree, api }) {
  if (!HEX40.test(sha ?? '') || !HEX40.test(tree ?? '')) return [`app_sha and app_tree must be full lowercase 40-hex ids (got '${sha}' and '${tree}')`];
  const out = [], commit = api(`repos/${repo}/git/commits/${sha}`);
  if (!commit) out.push(`commit ${sha} is not in ${repo}`);
  else if (commit.tree?.sha !== tree) out.push(`commit ${sha} has tree ${commit.tree?.sha}, not app_tree ${tree}`);
  for (const [wf, events] of NEEDED) {
    const runs = api(`repos/${repo}/actions/workflows/${wf}/runs?head_sha=${sha}&status=success&per_page=100`)?.workflow_runs ?? [];
    if (!runs.some(r => r.head_sha === sha && r.status === 'completed' && r.conclusion === 'success' && events.includes(r.event)))
      out.push(`no successful ${wf} ${events.join(' or ')} run for ${sha}`);
  }
  return out;
}

if (process.argv[1] && basename(process.argv[1]) === 'dispatch-preflight.mjs') {
  const { GITHUB_REPOSITORY: repo, APP_SHA: sha, APP_TREE: tree } = process.env;
  const api = path => {
    try { return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 })); }
    catch (e) { if (/HTTP 404/.test(e.stderr ?? '')) return null; throw e; }
  };
  let m;
  try { m = missing({ repo, sha, tree, api }); } catch (e) { m = [`GitHub API error: ${String(e.stderr || e.message).trim().split('\n').pop()}`]; }
  if (m.length) {
    console.log(`::error title=Gate preflight::refused: ${m.join('; ')}. Push the candidate and let verify and fast-e2e pass on it first.`);
    process.exit(1);
  }
  console.log(`gate preflight: ${sha} (tree ${tree}) is in ${repo}; verify.yml and fast-e2e.yml passed on it`);
}
