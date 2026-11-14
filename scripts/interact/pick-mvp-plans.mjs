// Writes packages/web/src/interact-toss-mvp-plans.js, the plans the dev-only pin family `toss-mvp` answers with (owner brief 11 section 5; interact-design-pin.js). Hand-run tooling, dev only.
//   node scripts/interact/pick-mvp-plans.mjs --stand-in                 stand-in data: extractBrief -> expandBrief of the three pinned toss plans (until the bench has passing plans)
//   node scripts/interact/pick-mvp-plans.mjs [--jsonl <file>] [--out <file>]   the BEST passing expanded plan per depth from the design bench rows (default docs/features/interact/benchmarks/bench-design-mvp.jsonl)
// A bench row: { model, depth, result: 'pass', expandedPlanPath (a JSON file holding the expanded ScenePlan, path relative to the repo root), msTotal, ts }. Best = the pass with the smallest msTotal, among the
// gemini-3.5-flash-lite passes of that depth; when Flash Lite has none, the claude-sonnet-5-5 passes. A depth with no pass at all is left out of the data file (the pin then answers null for it: the real design runs)
// and named in the output.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODELS = Object.freeze(['gemini-3.5-flash-lite', 'claude-sonnet-5-5']);
const DEPTHS = ['brief', 'balanced', 'detailed'];

// -> { picked: { depth: { model, ts, plan } }, missing: [depth] }. `readPlan(path)` returns the plan object of a row.
export function pickPlans(rows, readPlan) {
  const picked = {}, missing = [];
  for (const depth of DEPTHS) {
    for (const model of MODELS) {
      const passes = rows.filter(r => r.depth === depth && r.model === model && r.result === 'pass' && r.expandedPlanPath).sort((a, b) => (a.msTotal ?? Infinity) - (b.msTotal ?? Infinity) || String(a.ts).localeCompare(String(b.ts)));
      if (passes.length) { picked[depth] = { model, ts: passes[0].ts, msFill: passes[0].msFill ?? null, plan: readPlan(passes[0].expandedPlanPath) }; break; }
    }
    if (!picked[depth]) missing.push(depth);
  }
  return { picked, missing };
}

export const dataFileText = (picked, note) => `// The plans the dev-only pin family \`toss-mvp\` answers with (INTERACT_DESIGN_FIXTURE=toss-mvp pins by the job's Depth; interact-design-pin.js). DATA ONLY, written by scripts/interact/pick-mvp-plans.mjs: ${note}
// A depth with no plan here is not pinned (the real design runs for it). Each plan is a ScenePlan expanded from a plan brief (interact-plan-brief.js expandBrief); the pin binds it to the catalogue the job was offered.
${Object.entries(picked).map(([depth, p]) => `// ${depth}: ${p.source}`).join('\n')}
export const TOSS_MVP_PLANS = Object.freeze(${JSON.stringify(Object.fromEntries(Object.entries(picked).map(([depth, p]) => [depth, p.plan])), null, 1)});
// Where each plan came from, for the ledger's designModel / designKind / msFill columns (interact-ledger.js, jobs pinned to toss-mvp-<depth>): the model of the bench row, its fill time in ms, and the attempt's timestamp.
export const TOSS_MVP_META = Object.freeze(${JSON.stringify(Object.fromEntries(Object.entries(picked).map(([depth, p]) => [depth, p.meta])), null, 1)});
`;

async function main(argv) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), get = flag => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const out = get('--out') ?? join(root, 'packages/web/src/interact-toss-mvp-plans.js');
  let picked = {}, note;
  if (argv.includes('--stand-in')) {
    const { interactFixtures } = await import('../../packages/web/src/interact-plan-fixtures.js'), { expandBrief, extractBrief } = await import('../../packages/web/src/interact-plan-brief.js');
    const { referencePlans, referenceCapabilities } = await interactFixtures();
    for (const [depth, name] of [['brief', 'tossOverview'], ['balanced', 'tossStandard'], ['detailed', 'tossDeep']]) {
      picked[depth] = { source: `stand-in: extractBrief -> expandBrief of the pinned ${name}`, meta: { designModel: 'stand-in', msFill: null, jobTs: null }, plan: expandBrief(extractBrief(referencePlans[name]), depth, { catalogueHash: referenceCapabilities.catalogueHash }) };
    }
    note = 'the stand-in data (extractBrief -> expandBrief of the three pinned toss plans).';
  } else {
    const jsonl = get('--jsonl') ?? join(root, 'docs/features/interact/benchmarks/bench-design-mvp.jsonl');
    const rows = readFileSync(jsonl, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
    const { picked: best, missing } = pickPlans(rows, path => JSON.parse(readFileSync(resolve(root, path), 'utf8')));
    for (const [depth, p] of Object.entries(best)) { picked[depth] = { source: `${p.model} attempt ${p.ts}`, meta: { designModel: p.model, msFill: p.msFill, jobTs: p.ts }, plan: p.plan }; console.log(`${depth}: ${p.model} attempt ${p.ts}`); }
    for (const depth of missing) console.log(`${depth}: NO passing plan in ${jsonl}; left out of the data file`);
    note = `the best passing plan per depth from ${jsonl.replace(root, '').replace(/\\/g, '/')}.`;
  }
  writeFileSync(out, dataFileText(picked, note));
  console.log(`wrote ${out}: ${Object.keys(picked).join(', ') || 'no depth'}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
