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
  'thumbnails', 'rh-local', 'cross-device', 'filedrop', 'library-folders', 'share-revocation', 'bundle(dist)',
  'bundle(dist-dev)', 'journey J1-J8', 'tutor-slice', 'blank-hooks', 'practice-card', 'canvas-chrome'];

// The two stages the units part runs (run.mjs units), so no shard does: the same commands on the same windows-2022 image
// and tree that shard 1 used to repeat. mergeShards takes their lines from the units record.
export const UNIT_STAGES = ['make test-unit', 'fixture regression'];

// Balanced on the measured stage times of that run (seconds, stack starts and stops included): ~485, ~470, ~520, ~515;
// shard 1's ~485 included the unit stages, which the units part now runs (UNIT_STAGES).
// explore follows comments in shard 1: its phone creator-card row needs a second creator with a live publication, and
// comments-check's published canvas (comments-check.mjs:233, never unpublished) is the one the unsharded gate gives it.
export const SHARDS = [
  ['rh-app', 'comments', 'comments-invite', 'sketch', 'answer-routing', 'rh-dev',
    'sca', 'project-canvases', 'explore', 'bundle(dist)', 'bundle(dist-dev)'],
  ['fork', 'dive', 'handle', 'explore-holes', 'card-select', 'selected-pill', 'naming', 'visibility'],
  ['sidebar', 'card-redesign', 'project-menu', 'creator-profile', 'analytics-ui', 'workspace', 'card-context-menu',
    'repo-browser', 'panel-header', 'slash-sheet', 'equation', 'thumbnails', 'library-folders', 'share-revocation'],
  ['rh-local', 'cross-device', 'filedrop', 'journey J1-J8', 'tutor-slice', 'blank-hooks', 'practice-card', 'canvas-chrome'],
];

// Stages int35.sh runs only when the candidate tree carries their check (and gateVerdict then requires).
export const CONDITIONAL = {
  'project-menu': 'packages/web/e2e/project-menu-check.mjs',
  'library-folders': 'packages/web/e2e/library-folders-check.mjs',
  'share-revocation': 'packages/web/e2e/share-revocation-check.mjs',
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
    else if (line.startsWith('if git cat-file ')) { j = until(i, l => l === 'fi'); stages = [lines[i + 1].trim().split(' ')[2]]; }
    else if (line.startsWith('for beta in ')) { j = until(i, l => l === 'done'); stages = line.match(/^for beta in (.+?); do$/)[1].split(' '); }
    else if (line.startsWith('# #73:')) { j = until(i, l => l.startsWith('echo "rh-local exit')); stages = ['rh-local']; }
    out.push({ text: lines.slice(i, j + 1).join('\n'), stages });
    i = j;
  }
  return out;
}

// The shard script: int35.sh with every other shard's stages removed, and any stack section none of its stages need.
// Exports (LOCAL_CP_VARS after sketch) always stay where they are, so every kept stage sees the environment it had.
export function shardScript(full, n) {
  const want = new Set(SHARDS[n - 1] ?? []);
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

// -> the one gate record from the shard records (in SHARDS order) and the units record (unitsLog, which must hold the
// UNIT_STAGES lines): the first record's head through its tree line, then
// each stage's lines (everything after the previous stage's exit line up to its own) in ORDER, then every shard's
// closing lines and one -DONE line. Throws on an unfinished record, a different tree line, a stage outside its shard,
// a duplicate or a missing stage (a conditional one is missing only when the tree carries its check).
export function mergeShards(logs, inTree = () => true, unitsLog = null) {
  if (logs.length !== SHARDS.length) throw Error(`Expected ${SHARDS.length} shard records, got ${logs.length}`);
  const chunks = new Map(), closing = [];
  let head;
  logs.forEach((log, k) => {
    const lines = log.replace(/\n$/, '').split('\n');
    const tree = lines.findIndex(l => l.startsWith('tree HEAD ')), done = lines.findLastIndex(l => l.trim());
    if (tree < 0 || !/-DONE\r?$/.test(lines[done])) throw Error(`Shard ${k + 1} record is unfinished (no tree line or -DONE line)`);
    if (!head) head = lines.slice(0, tree + 1);
    else if (meaningful(lines.slice(0, tree + 1)) !== meaningful(head)) throw Error(`Shard ${k + 1} record has a different preflight or tree line`);
    let chunk = [];
    for (const line of lines.slice(tree + 1, done)) {
      chunk.push(line);
      const stage = line.match(STAGE_EXIT)?.[1];
      if (!ORDER.includes(stage)) continue;
      if (!SHARDS[k].includes(stage)) throw Error(`Shard ${k + 1} ran ${stage}, which belongs to another shard`);
      if (chunks.has(stage)) throw Error(`Stage ${stage} is duplicated`);
      chunks.set(stage, chunk); chunk = [];
    }
    closing.push(...chunk);
  });
  // The units part's record supplies UNIT_STAGES (it runs them; no shard does).
  if (unitsLog !== null) {
    for (const line of unitsLog.split('\n')) { const s = line.match(STAGE_EXIT)?.[1]; if (UNIT_STAGES.includes(s)) { if (chunks.has(s)) throw Error(`Stage ${s} is duplicated`); chunks.set(s, [line]); } }
  }
  const missing = ORDER.filter(s => !chunks.has(s) && !(CONDITIONAL[s] && !inTree(CONDITIONAL[s])));
  if (missing.length) throw Error(`Stages missing from the shard records: ${missing.join(', ')}`);
  return [...head, ...ORDER.flatMap(s => chunks.get(s) ?? []), ...closing, 'INT35-DONE', ''].join('\n');
}

// Proof only (dispatch input canary_fail_stage): that run-line stage gets a check file that does not exist, so it
// fails twice and the gate must fail. It can only make a stage fail, never pass or skip one.
export function canary(script, stage) {
  if (!stage) return script;
  if (!ORDER.includes(stage)) throw Error(`canary_fail_stage names no gate stage: ${stage}`);
  return script.split('\n').map(l => l.match(/^run stack(?:-app)?\.sh (\S+) /)?.[1] === stage ? l.replace(/ \S+$/, ' r36-canary-missing-check.mjs') : l).join('\n');
}
