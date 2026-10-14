// Assigns the gate's browser stages to K shards by measured median minutes (durations.json), longest unit first onto
// the shard it leaves cheapest. A shard also pays for every stack section it starts, so a shard that already runs a
// stack is the cheaper home for the next stage on that stack.
import { ORDER, UNIT_STAGES } from './shards.mjs';

// Minutes. All from README "Speed baseline" (median of three green runs of gate-sharded.yml, per-part table) unless noted.
export const C = {
  stage: 0.08,   // per stage, outside the check process: "Not in a check duration" (4.6 s median gap, 99 gaps)
  start: 0.19,   // one stack start, app worker start to first check: Stack starts column (shard-2 0.19, shard-3 0.20, shard-4 0.38 / 2, shard-1 0.50 / 3)
  stop: 0.19,    // one stack stop plus script prelude: Builds + stops of a one-stack part (shard-2 0.39, shard-3 0.39) less its two vite builds
  build: 0.20,   // the two vite builds of one flavor, about 6 s each ("Builds + stops" note)
  journey: 0.49, // jstack.sh's extra setup: shard-4 Builds + stops 1.27 less its dev stack 0.39 less the journey stack's own stop and build (0.19 + 0.20)
  fixed: 3.15,   // per part, before its first stage: Setup 1.77 (median of the four shards) + Preflight 1.38 (median of the four)
};

const TRIO = ['rh-app', 'comments', 'comments-invite'];
const BUNDLES = ['bundle(dist)', 'bundle(dist-dev)'];
const JOURNEYS = ['journey J1-J8', 'tutor-slice', 'blank-hooks', 'practice-card', 'canvas-chrome'];
// Stages that must share a shard, in ORDER order. TRIO + explore: the trio needs a stack.sh stage after it and explore
// needs comments' published canvas. BUNDLES: both check the one prod rebuild before them. JOURNEYS: one journey stack.
// library-folders + share-revocation: int35.sh runs them in one `for beta` block (shardScript refuses to split a block).
export const UNITS = [[...TRIO, 'explore'], BUNDLES, JOURNEYS, ['library-folders', 'share-revocation']];

const section = s => TRIO.includes(s) ? 'app' : BUNDLES.includes(s) ? 'prod' : JOURNEYS.includes(s) ? 'journey' : 'dev';

// -> minutes of a shard's own work (its stages, the stacks it starts, the prod build); add C.fixed for its wall time.
// The preflight builds the dev flavor and build-once.sh reuses it, so only the prod stack builds, and a journey stack
// after it has to build dev again.
// ponytail: a stage with no measurement counts 0.5 min; rerun the timing task to measure it.
export function cost(stages, d) {
  const sections = new Set(stages.map(section));
  return stages.reduce((a, s) => a + (d[s] ?? 0.5) + C.stage, 0)
    + sections.size * (C.stop + C.start) + (sections.has('journey') ? C.journey : 0)
    + (sections.has('prod') ? C.build * (1 + sections.has('journey')) : 0);
}

export function pack(d, k) {
  const browser = ORDER.filter(s => !UNIT_STAGES.includes(s));
  const grouped = new Set(UNITS.flat());
  const units = [...UNITS, ...browser.filter(s => !grouped.has(s)).map(s => [s])];
  units.sort((a, b) => cost(b, d) - cost(a, d) || ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));
  const shards = Array.from({ length: k }, () => []);
  for (const u of units) {
    const i = shards.map((sh, j) => [cost([...sh, ...u], d), j]).sort((a, b) => a[0] - b[0] || a[1] - b[1])[0][1];
    shards[i].push(...u);
  }
  return shards.map(sh => sh.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)));
}

// -> [{ k, wall, runner }] for each K: predicted wall of the slowest shard, and the runner minutes the K shards use.
export const kTable = (d, ks = [4, 5, 6, 7]) => ks.map(k => {
  const costs = pack(d, k).map(sh => C.fixed + cost(sh, d));
  return { k, wall: Math.max(...costs), runner: costs.reduce((a, b) => a + b) };
});

// The smallest K whose predicted wall is within 0.5 min of the best: fewer shards use fewer runner minutes.
export function chooseK(d) {
  const table = kTable(d), best = Math.min(...table.map(r => r.wall));
  return table.find(r => r.wall <= best + 0.5).k;
}
