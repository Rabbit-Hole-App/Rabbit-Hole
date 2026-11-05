// Item 1 (CI and release speed, owner 2026-11-05): "the gate runs nothing already green". A gate stage is taken from the
// exact-SHA fast-e2e run instead of being run only when that run's fast.log shows the check's own result line
// (`<check> exit 0  N/N checks passed  (Ns)`, scripts/ci/run-part.sh) and the part that ran it read provider tripwire 0
// (tripwire.log, fast-e2e.yml). The run's green conclusion alone never counts: fast-e2e selects by diff, so a green run may
// not have run the check. Every doubt means the stage runs: no artifact, an expired one, a restarted stack, a repeated or
// failed line, no tripwire file. Used by the preflight job (it chooses) and the collect job (it re-checks the run).
import { ATTESTABLE } from './shards.mjs';

const PASS = /^(\S+) exit 0  (\d+)\/(\d+) checks passed  \(\d+s\)\s*$/;
const ANY = /^(\S+?)(?: run \d+\/\d+)? exit \d+\b/;
const RESTART = /: exit \d+ and the stack died under it/;

// -> Map<check name, "N/N checks passed"> for the checks one fast-e2e part passed cleanly; empty when the part is not clean.
export function readPart({ fastLog = '', tripwireLog = null } = {}) {
  const passes = new Map(), bad = new Set();
  if (!/^provider-tripwire hits: 0\s*$/m.test(tripwireLog ?? '') || RESTART.test(fastLog)) return passes;
  for (const line of fastLog.split(/\r?\n/)) {
    const pass = line.match(PASS), name = line.match(ANY)?.[1];
    if (!name) continue;
    if (pass && pass[2] === pass[3] && Number(pass[2]) > 0 && !passes.has(pass[1])) passes.set(pass[1], `${pass[2]}/${pass[3]} checks passed`);
    else bad.add(name);
  }
  for (const name of bad) passes.delete(name);
  return passes;
}

// -> { <stage>: "N/N checks passed" } over the parts of one run. A check named by two parts is not attested.
export function attestedStages(parts) {
  const seen = new Map(), twice = new Set();
  for (const part of parts) for (const [name, count] of readPart(part)) { if (seen.has(name)) twice.add(name); seen.set(name, count); }
  return Object.fromEntries(Object.entries(ATTESTABLE).filter(([, name]) => seen.has(name) && !twice.has(name)).map(([stage, name]) => [stage, seen.get(name)]));
}

// The run itself must be this commit's completed success; anything else throws.
export function checkRun(run, sha) {
  if (!run || run.head_sha !== sha) throw Error(`fast-e2e run ${run?.id} is not a run of ${sha}`);
  if (run.status !== 'completed' || run.conclusion !== 'success') throw Error(`fast-e2e run ${run.id} is ${run.status}/${run.conclusion}, not a completed success`);
  if (run.event === 'pull_request') throw Error(`fast-e2e run ${run.id} tested a merge tree`);
}

// api(path) -> parsed answer or null (404); download(runId, artifactName) -> { fastLog, tripwireLog } or null.
// -> { run, sha, stages } ({} stages: nothing attested, every stage runs), and why when it is empty.
export function attestation({ repo, sha, api, download }) {
  const runs = (api(`repos/${repo}/actions/workflows/fast-e2e.yml/runs?head_sha=${sha}&status=success&per_page=100`)?.workflow_runs ?? [])
    .filter(r => r.head_sha === sha && r.status === 'completed' && r.conclusion === 'success' && r.event !== 'pull_request');
  const at = r => Date.parse(r.run_started_at || r.created_at) || 0;
  const run = runs.reduce((a, r) => !a || at(r) > at(a) || (at(r) === at(a) && r.id > a.id) ? r : a, null);
  if (!run) return { run: null, sha, stages: {}, why: 'no green fast-e2e run of this commit' };
  checkRun(run, sha);
  const named = (api(`repos/${repo}/actions/runs/${run.id}/artifacts?per_page=100`)?.artifacts ?? []).filter(a => !a.expired);
  // The newest attempt of each part: a failed-only rerun uploads the rerun part under a higher attempt.
  const newest = new Map();
  for (const a of named) {
    const m = a.name.match(`^fast-e2e-${sha}-(\\d+)-(\\d+)$`);
    if (m && (!newest.has(m[1]) || Number(m[2]) > newest.get(m[1]).attempt)) newest.set(m[1], { name: a.name, attempt: Number(m[2]) });
  }
  const parts = [...newest.values()].map(a => download(run.id, a.name)).filter(Boolean);
  const stages = attestedStages(parts);
  return { run: run.id, sha, stages, why: Object.keys(stages).length ? null : `fast-e2e run ${run.id} left no clean result line for a gate stage` };
}

// Drift guard: the harness list (shards.mjs ATTESTABLE: stage -> fast-e2e check name) against the candidate's own
// scripts/gate-attest.mjs ATTESTABLE (stage -> check file). -> a one-line difference, or null when they are the same list.
export function attestableDiff(appList, ours = ATTESTABLE) {
  const theirs = Object.fromEntries(Object.entries(appList ?? {}).map(([stage, file]) => [stage, String(file).replace(/-check\.mjs$/, '')]));
  const diff = [...new Set([...Object.keys(ours), ...Object.keys(theirs)])].filter(s => ours[s] !== theirs[s]).sort();
  return diff.length ? `the harness and the candidate list different attestable stages: ${diff.join(', ')}` : null;
}
