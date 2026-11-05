// Sharded complete gate (owner GO 2026-10-13: "cut this 1h without compromising the test"). The prepared int35.sh is
// sliced into shard scripts that each run on a fresh Windows runner with its own preflight-prepared stack; collect.mjs
// merges the shard records back into the one gate.log the candidate's gateVerdict reads, with every stage line in the
// original order. Nothing is dropped from a shard script except other shards' stages and stacks no kept stage uses.
// State that stages share stays inside one shard (README "Sharded gate"): the stack-app.sh trio with its app build,
// the bundle pair with the prod rebuild before it, and the five journey-stack stages with the journey stack.

// int35.sh's stage record order (gate.log of run 38352166115 attempt 2): the merged record keeps exactly this order.
export const ORDER = ['make test-unit', 'fixture regression', 'rh-app', 'comments', 'comments-invite', 'sketch',
  'answer-routing', 'rh-dev', 'sca', 'project-canvases', 'fork', 'dive', 'handle', 'explore', 'explore-holes',
  'card-select', 'selected-pill', 'naming', 'visibility', 'sidebar', 'card-redesign', 'project-menu', 'creator-profile',
  'analytics-ui', 'workspace', 'card-context-menu', 'repo-browser', 'panel-header', 'slash-sheet', 'equation',
  'thumbnails', 'canvas-shell', 'canvas-toolbar', 'rh-local', 'cross-device', 'filedrop', 'library-folders', 'share-revocation',
  'bundle(dist)', 'bundle(dist-dev)', 'journey J1-J8', 'tutor-slice', 'blank-hooks', 'practice-card', 'canvas-chrome'];

// Item 1 (CI and release speed): the stages the gate may take from the exact-SHA fast-e2e run instead of running them -> the name
// fast-e2e's run-part.sh prints for that check (its file without "-check.mjs"). The candidate's scripts/gate-attest.mjs lists the
// same stages and refuses any other tagged, so a stage outside this list can never carry the tag. Never in it: the unit run and
// the fixture regression (paidRefusal, escrow and auth tests), both production-bundle checks, the stack-app, journey and tutor
// stages, share-revocation (access) and library-folders (it shares the `for beta` block with it).
export const TAG = 'attested-by-fast-e2e';
export const ATTESTABLE = {
  sketch: 'explain-back-sketch', 'project-canvases': 'project-canvases', fork: 'canvas-forking', dive: 'dive', handle: 'handle',
  'explore-holes': 'explore-holes', 'card-select': 'card-select', naming: 'naming', visibility: 'visibility', sidebar: 'sidebar',
  'card-redesign': 'card-redesign', 'project-menu': 'project-menu', 'creator-profile': 'creator-profile', 'analytics-ui': 'analytics-ui',
  workspace: 'workspace', 'card-context-menu': 'card-context-menu', 'panel-header': 'panel-header', 'slash-sheet': 'slash-sheet',
  thumbnails: 'card-thumbnails', 'cross-device': 'cross-device',
};

// The two stages the units part runs (run.mjs units), so no shard does: the same commands on the same windows-2022 image
// and tree that shard 1 used to repeat. mergeShards takes their lines from the units record.
export const UNIT_STAGES = ['make test-unit', 'fixture regression'];

// The output of pack.mjs for the measured durations.json (README "Shard packing"): seven shards of 4.4-5.0 predicted
// minutes each. Kept as a literal so a reviewer sees the shards; pack.test.mjs fails if it drifts from the packer.
// explore follows comments in one shard: its phone creator-card row needs a second creator with a live publication, and
// comments-check's published canvas (comments-check.mjs:233, never unpublished) is the one the unsharded gate gives it.
export const SHARDS = [
  ['journey J1-J8', 'tutor-slice', 'blank-hooks', 'practice-card', 'canvas-chrome'],
  ['rh-app', 'comments', 'comments-invite', 'project-canvases', 'explore', 'explore-holes', 'naming', 'repo-browser'],
  ['sketch', 'fork', 'dive', 'handle', 'card-select'],
  ['rh-dev', 'selected-pill', 'analytics-ui', 'card-context-menu', 'slash-sheet', 'library-folders', 'share-revocation'],
  ['answer-routing', 'visibility', 'card-redesign', 'creator-profile', 'panel-header', 'cross-device'],
  ['sidebar', 'project-menu', 'canvas-shell', 'canvas-toolbar', 'bundle(dist)', 'bundle(dist-dev)'],
  ['sca', 'workspace', 'equation', 'thumbnails', 'rh-local', 'filedrop'],
];

// The parts of a run, as the workflow matrix (gate-sharded.yml) lists them and collect.mjs judges them; shards.test.mjs
// fails when the matrix lists any other, so a passing extra entry cannot go unjudged.
export const partsOf = (shards = SHARDS) => ['units', 'checkpoints', ...shards.map((_, k) => `shard-${k + 1}`)];
export const PARTS = partsOf();

// This run's shard layout: GATE_LAYOUT (the preflight job's repack around the stages fast-e2e attested, attest.mjs) or SHARDS.
// Every part of the run and the collect job read the same value, so they cannot disagree about the shards.
export function shardsOf(env = process.env) {
  if (!env.GATE_LAYOUT) return SHARDS;
  const layout = JSON.parse(env.GATE_LAYOUT), flat = layout.flat();
  if (!Array.isArray(layout) || !layout.length || layout.some(s => !Array.isArray(s) || !s.length) || flat.some(s => !ORDER.includes(s) || UNIT_STAGES.includes(s)) || new Set(flat).size !== flat.length)
    throw Error('GATE_LAYOUT is not a layout of the gate\'s browser stages');
  return layout;
}

// Stages int35.sh runs only when the candidate tree carries their check (and gateVerdict then requires).
export const CONDITIONAL = {
  'project-menu': 'packages/web/e2e/project-menu-check.mjs',
  'library-folders': 'packages/web/e2e/library-folders-check.mjs',
  'share-revocation': 'packages/web/e2e/share-revocation-check.mjs',
  'canvas-shell': 'packages/web/e2e/canvas-shell-check.mjs',
  'canvas-toolbar': 'packages/web/e2e/canvas-toolbar-check.mjs',
};

// The script's sections, in order; null = one block per stage, else the section's stages run as one unit.
const SECTIONS = [
  ['memcheck unit\n', ['make test-unit', 'fixture regression']],
  ['bash $F/stack-app.sh dev', null],
  ['bash $F/stack.sh dev', null],
  ['bash $F/stack.sh prod', ['bundle(dist)', 'bundle(dist-dev)']],
  ['# Journeys + tutor slice', ['journey J1-J8', 'tutor-slice', 'blank-hooks', 'practice-card', 'canvas-chrome']],
];

function blocks(text) {
  const lines = text.split('\n'), out = [];
  const until = (i, stop) => { let j = i; while (j < lines.length && !stop(lines[j])) j++; if (j === lines.length) throw Error('Original gate block boundaries changed'); return j; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]; let j = i, stages = [];
    if (/^run stack(-app)?\.sh /.test(line)) stages = [line.split(' ')[2]];
    else if (line.startsWith('if git cat-file ')) { j = until(i, l => l === 'fi'); stages = [lines.slice(i + 1, j).join('\n').match(/^\s*(?:run \S+|memcheck) (\S+)/m)?.[1]]; if (!stages[0]) throw Error('Original gate block boundaries changed'); }
    else if (line.startsWith('for beta in ')) { j = until(i, l => l === 'done'); stages = line.match(/^for beta in (.+?); do$/)[1].split(' '); }
    else if (line.startsWith('# #73:')) { j = until(i, l => l.startsWith('echo "rh-local exit')); stages = ['rh-local']; }
    out.push({ text: lines.slice(i, j + 1).join('\n'), stages });
    i = j;
  }
  return out;
}

// The shard script: int35.sh with every other shard's stages removed, and any stack section none of its stages need.
// Exports (LOCAL_CP_VARS after sketch) always stay where they are, so every kept stage sees the environment it had.
export function shardScript(full, n, shards = SHARDS) {
  const want = new Set(shards[n - 1] ?? []);
  if (!want.size) throw Error(`Unknown gate shard ${n}`);
  const at = SECTIONS.map(([marker]) => full.indexOf(marker)), end = full.lastIndexOf('check_tree\n');
  if (at.some((i, k) => i < 0 || (k && i <= at[k - 1])) || end <= at.at(-1)) throw Error('Original gate section boundaries changed');
  const kept = SECTIONS.map(([, stages], k) => {
    const text = full.slice(at[k], at[k + 1] ?? end);
    const parts = stages ? [{ text, stages }] : blocks(text);
    let any = false;
    const body = parts.filter(({ stages: s }) => {
      const mine = s.filter(x => want.has(x)).length;
      if (mine && mine !== s.length) throw Error(`Shard ${n} splits the unit ${s.join(', ')}`);
      any ||= mine > 0;
      return !s.length || mine;
    }).map(p => p.text).join('\n');
    return { any, text: any ? body : text.split('\n').filter(l => l.startsWith('export ')).map(l => `${l}\n`).join('') };
  });
  // The app stack is stopped by the next stack.sh start; a shard keeping the trio keeps a stack.sh stage after it.
  if (kept[1].any && !kept[2].any) throw Error(`Shard ${n} keeps the stack-app.sh stages without a stack.sh stage after them`);
  return full.slice(0, at[0]) + kept.map(k => k.text).join('') + full.slice(end);
}

const STAGE_EXIT = /^([^:]+?) exit (\d+)\b/;
const meaningful = lines => lines.filter(l => !l.startsWith('warning: ')).join('\n');

// -> the stages a record (one part's, or the merged one) shows as rerun after a recognized transient: the
// `<stage>: retried (<id>) - first attempt diagnostics in ...` lines int35.sh prints after the rerun.
export const retriedStages = text => [...text.matchAll(/^([^:\r\n]+): retried \(([^)\r\n]*)\)/gm)].map(m => ({ stage: m[1], reason: m[2] }));

// -> the one gate record from the shard records (in SHARDS order) and the units record (unitsLog, which must hold the
// UNIT_STAGES lines): the first record's head through its tree line, then
// each stage's lines (everything after the previous stage's exit line up to its own) in ORDER, then every shard's
// closing lines and one -DONE line. Throws on an unfinished record, a different tree line, a stage outside its shard,
// a duplicate or a missing stage (a conditional one is missing only when the tree carries its check).
// A failed-only rerun mixes attempts of one run, and each part's preflight line names the grant of the attempt it ran in
// (r36-windows-<run id>-<attempt>). So the parts' heads (units included) are compared with only that attempt number set
// aside, never the run id, and grants ({ units, 'shard-1', ... }; collect.mjs passes each part's) is the exact grant
// each record must carry.
const GRANT = /; grant ([^;\r\n]+);/, ATTEMPT = /(; grant r36-windows-\d+-)\d+;/;
const headOf = (name, lines, want) => {
  const text = meaningful(lines), grant = text.match(GRANT)?.[1];
  if (want !== undefined && grant !== want) throw Error(`${name} record has grant ${grant}, expected ${want}`);
  return text.replace(ATTEMPT, '$1<attempt>;');
};
// opts.shards: this run's layout. opts.attest: { run, sha, stages: { <stage>: "N/N checks passed" } }, the stages taken from the
// exact-SHA fast-e2e run (attest.mjs) instead of run: each gets its tripwire line and an exit line carrying the tag the
// candidate's gateVerdict checks, no shard may also have run it, and no stage outside ATTESTABLE can be named.
export function mergeShards(logs, inTree = () => true, unitsLog = null, grants = {}, { shards = SHARDS, attest = null } = {}) {
  for (const [stage, count] of Object.entries(attest?.stages ?? {})) {
    if (!(stage in ATTESTABLE)) throw Error(`Stage ${stage} cannot be attested by fast-e2e; it always runs in the gate`);
    if (!/^[0-9a-f]{40}$/.test(attest.sha || '') || !/^\d+$/.test(String(attest.run))) throw Error('The attestation needs a numeric fast-e2e run and a full commit sha');
    if (!/^(\d+)\/\1 checks passed$/.test(count) || /^0\//.test(count)) throw Error(`Stage ${stage} is attested without an N/N result: ${count}`);
  }
  if (logs.length !== shards.length) throw Error(`Expected ${shards.length} shard records, got ${logs.length}`);
  const chunks = new Map(), closing = [];
  let head, first;
  logs.forEach((log, k) => {
    const lines = log.replace(/\n$/, '').split('\n');
    const tree = lines.findIndex(l => l.startsWith('tree HEAD ')), done = lines.findLastIndex(l => l.trim());
    if (tree < 0 || !/-DONE\r?$/.test(lines[done])) throw Error(`Shard ${k + 1} record is unfinished (no tree line or -DONE line)`);
    const mine = headOf(`Shard ${k + 1}`, lines.slice(0, tree + 1), grants[`shard-${k + 1}`]);
    if (!head) { head = lines.slice(0, tree + 1); first = mine; }
    else if (mine !== first) throw Error(`Shard ${k + 1} record has a different preflight or tree line`);
    let chunk = [];
    for (const line of lines.slice(tree + 1, done)) {
      chunk.push(line);
      const stage = line.match(STAGE_EXIT)?.[1];
      if (!ORDER.includes(stage)) continue;
      if (!shards[k].includes(stage)) throw Error(`Shard ${k + 1} ran ${stage}, which belongs to another shard`);
      if (chunks.has(stage)) throw Error(`Stage ${stage} is duplicated`);
      chunks.set(stage, chunk); chunk = [];
    }
    closing.push(...chunk);
  });
  // The units part's record supplies UNIT_STAGES (it runs them; no shard does).
  if (unitsLog !== null) {
    const lines = unitsLog.replace(/\n$/, '').split('\n'), tree = lines.findIndex(l => l.startsWith('tree HEAD '));
    if (headOf('Units', lines.slice(0, tree + 1), grants.units) !== first) throw Error('Units record has a different preflight or tree line');
    for (const line of lines) { const s = line.match(STAGE_EXIT)?.[1]; if (UNIT_STAGES.includes(s)) { if (chunks.has(s)) throw Error(`Stage ${s} is duplicated`); chunks.set(s, [line]); } }
  }
  for (const [stage, count] of Object.entries(attest?.stages ?? {})) {
    if (chunks.has(stage)) throw Error(`Stage ${stage} both ran and was attested`);
    chunks.set(stage, [`${stage} provider-tripwire hits: 0`, `${stage} exit 0  ${count}  ${TAG} run=${attest.run} sha=${attest.sha}`]);
  }
  const missing = ORDER.filter(s => !chunks.has(s) && !(CONDITIONAL[s] && !inTree(CONDITIONAL[s])));
  if (missing.length) throw Error(`Stages missing from the shard records: ${missing.join(', ')}`);
  const taken = Object.keys(attest?.stages ?? {}).length;
  const paths = taken ? [`gate paths: ${chunks.size - taken} stages ran in the gate, ${taken} attested by fast-e2e run ${attest.run} (${ORDER.filter(s => s in attest.stages).join(', ')})`] : [];
  return [...head, ...ORDER.flatMap(s => chunks.get(s) ?? []), ...closing, ...paths, 'INT35-DONE', ''].join('\n');
}

// Proof only (dispatch input canary_fail_stage): that run-line stage gets a check file that does not exist, so it
// fails (its stack is alive, so it is not retried) and the gate must fail. It can only make a stage fail, never pass or
// skip one. It matches unindented `run stack...` lines only: a guarded or block stage (see README) is left unchanged.
export function canary(script, stage) {
  if (!stage) return script;
  if (!ORDER.includes(stage)) throw Error(`canary_fail_stage names no gate stage: ${stage}`);
  return script.split('\n').map(l => l.match(/^run stack(?:-app)?\.sh (\S+) /)?.[1] === stage ? l.replace(/ \S+$/, ' r36-canary-missing-check.mjs') : l).join('\n');
}
