// Item 1 (CI and release speed, owner 2026-11-05): the gate runs nothing already green. A gate stage counts as run when
// the exact-SHA fast-e2e run printed that check's own result line (`exit 0  N/N checks passed`, scripts/ci/run-part.sh)
// and its part's provider tripwire read 0; the green conclusion of the run alone never counts, because fast-e2e selects
// by diff. The sharded gate (harness scripts/r36-gate/attest.mjs) then writes that stage's exit line with the tag below
// instead of running it. This file is the deploy side's independent check of such a record: dev-deploy.mjs gateVerdict,
// dev-deploy-gate.mjs and prod-release.mjs prepare all read it. Only the stages listed here can carry the tag. Every
// other stage always runs: the unit run (paidRefusal, escrow and auth tests), the fixture regression, both production-
// bundle checks, the stack-app, journey and tutor stages, share-revocation and library-folders.
export const TAG = 'attested-by-fast-e2e';
export const FAST = '.github/workflows/fast-e2e.yml';

// Gate stage -> the check file fast-e2e runs for it (same file, same arguments, same env: templates/int35.sh run lines against
// scripts/ci/run-part.sh FORK_ENV). share-revocation (an access check) and library-folders (it shares int35.sh's `for beta`
// block with it) stay in the gate on purpose.
export const ATTESTABLE = {
  sketch: 'explain-back-sketch-check.mjs', 'project-canvases': 'project-canvases-check.mjs', fork: 'canvas-forking-check.mjs',
  dive: 'dive-check.mjs', handle: 'handle-check.mjs', 'explore-holes': 'explore-holes-check.mjs', 'card-select': 'card-select-check.mjs',
  naming: 'naming-check.mjs', visibility: 'visibility-check.mjs', sidebar: 'sidebar-check.mjs', 'card-redesign': 'card-redesign-check.mjs',
  'project-menu': 'project-menu-check.mjs', 'creator-profile': 'creator-profile-check.mjs', 'analytics-ui': 'analytics-ui-check.mjs',
  workspace: 'workspace-check.mjs', 'card-context-menu': 'card-context-menu-check.mjs', 'panel-header': 'panel-header-check.mjs',
  'slash-sheet': 'slash-sheet-check.mjs', thumbnails: 'card-thumbnails-check.mjs', 'cross-device': 'cross-device-check.mjs',
};

const SHA = /^[0-9a-f]{40}$/;
// -> { run, sha } for an attested exit-line tail, { error } for a tag that is not well formed, null when the stage ran.
export function attestation(tail = '') {
  if (!tail.includes(TAG)) return null;
  const m = tail.match(new RegExp(`${TAG} run=(\\d+) sha=([0-9a-f]{40})\\s*$`));
  return m ? { run: m[1], sha: m[2] } : { error: 'malformed attestation (want "attested-by-fast-e2e run=<id> sha=<40-hex>")' };
}

// -> the reason an exit line's attestation is unacceptable, or null. gatedSha: the commit the record is judged for.
export function attestGaps(stage, tail, gatedSha) {
  const a = attestation(tail);
  if (!a) return null;
  if (!(stage in ATTESTABLE)) return `${stage}: cannot be attested by fast-e2e; it always runs in the gate`;
  if (a.error) return `${stage}: ${a.error}`;
  if (!SHA.test(gatedSha || '')) return `${stage}: an attested stage needs the gated commit to be checked against`;
  if (a.sha !== gatedSha) return `${stage}: attested for ${a.sha.slice(0, 8)}, not the gated commit ${gatedSha.slice(0, 8)}`;
  return null;
}

// -> [{ stage, run, sha }] for every stage whose last exit line carries a well-formed tag.
export function attestedStages(text) {
  const last = new Map();
  for (const l of text.split(/\r?\n/)) { const m = l.match(/^([^:]+?) exit (\d+)\b(.*)$/); if (m) last.set(m[1], m[3]); }
  return [...last].flatMap(([stage, tail]) => { const a = attestation(tail); return a && !a.error ? [{ stage, ...a }] : []; });
}

// -> blocker lines: each attested run must be a completed success of fast-e2e at exactly `sha` (runs: the Actions run objects of
// FAST from verify-evidence.mjs `runs`; a pull_request run tests a merge tree, so it never counts).
export function attestedRunBlockers(stages, runs, sha) {
  return [...new Set(stages.map(s => s.run))].flatMap(id => {
    const r = (runs || []).find(x => String(x.id) === id && x.head_sha === sha && x.event !== 'pull_request' && (x.path ?? FAST) === FAST);
    if (!r) return [`attested run ${id}: no fast-e2e run of ${sha.slice(0, 8)} has that id`];
    return r.status === 'completed' && r.conclusion === 'success' ? [] : [`attested run ${id} is ${r.status}/${r.conclusion}, not a completed success`];
  });
}
