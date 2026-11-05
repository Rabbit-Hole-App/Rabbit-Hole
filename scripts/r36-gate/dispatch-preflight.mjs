// The gate's dispatch preflight (gate-sharded.yml job preflight; owner 2026-10-14: no full Windows gate until verify and
// fast-e2e have both passed on the exact finished candidate). Before any Windows runner starts, APP_SHA must be a commit of
// this repository whose tree is APP_TREE, with a successful verify.yml push run and a successful fast-e2e.yml push or
// dispatch run on that exact commit. Fails closed in one line naming what is missing; collect still re-checks verify.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { attestation } from './attest.mjs';
import { layoutFor } from './pack.mjs';
import { SHARDS, partsOf } from './shards.mjs';

const HEX40 = /^[0-9a-f]{40}$/;
const NEEDED = [['verify.yml', ['push']], ['fast-e2e.yml', ['push', 'workflow_dispatch']]];
// api(path) is the parsed answer of GET path, or null for a 404. Returns what is missing, empty when the gate may start.
// Item 1: what this run may take from the exact-SHA fast-e2e run instead of running it (attest.mjs), and the shard layout and
// parts that leave. Never throws: any doubt (no artifact, an expired one, an API error) is an empty attestation, so every stage
// runs and the layout is the committed SHARDS. -> { attest: { run, sha, stages }, layout, parts, why }.
export function plan({ repo, sha, api, download, durations }) {
  let a;
  try { a = attestation({ repo, sha, api, download }); } catch (e) { a = { run: null, sha, stages: {}, why: `attestation failed: ${String(e.message).split('\n')[0]}` }; }
  const skip = Object.keys(a.stages), layout = (skip.length && layoutFor(durations, skip)) || SHARDS;
  return { attest: skip.length ? { run: a.run, sha: a.sha, stages: a.stages } : null, layout, parts: partsOf(layout), why: a.why };
}

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
  // Fast-e2e's per-part artifacts: fast.log (the result lines) and tripwire.log, read from the downloaded artifact.
  const download = (runId, name) => {
    const dir = mkdtempSync(join(tmpdir(), 'fast-e2e-'));
    try { execFileSync('gh', ['run', 'download', String(runId), '-R', repo, '-n', name, '-D', dir], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 }); } catch { return null; }
    const find = f => { const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : e.name === f ? [join(d, f)] : []); return walk(dir).sort((x, y) => x.length - y.length)[0]; };
    const read = f => { const p = find(f); return p && existsSync(p) ? readFileSync(p, 'utf8') : null; };
    return { fastLog: read('fast.log') ?? '', tripwireLog: read('tripwire.log') };
  };
  const durations = JSON.parse(readFileSync(new URL('./durations.json', import.meta.url), 'utf8'));
  const p = plan({ repo, sha, api, download, durations }), n = Object.keys(p.attest?.stages ?? {}).length;
  console.log(n ? `gate preflight: ${n} stages attested by fast-e2e run ${p.attest.run} (${Object.keys(p.attest.stages).join(', ')}); ${p.layout.length} shards` : `gate preflight: no stage attested (${p.why}); every stage runs in ${p.layout.length} shards`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `attest=${JSON.stringify(p.attest)}\nlayout=${JSON.stringify(p.layout)}\nparts=${JSON.stringify(p.parts)}\n`);
}
