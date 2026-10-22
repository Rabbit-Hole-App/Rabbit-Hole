// EXP-T11 independent semantic review of the accepted-spec bank (packages/web/src/visual-components/examples/bank.json).
// For each record that only lacks its semantic check: compile the immutable spec, render it in the states the product job
// captures (reviewStates below), and send the actual PNGs to the /explain image reviewer (explain-review.js,
// claude-opus-5-5), which did not author the spec. Records ineligible for any other reason (held-out lineage, private, stale) are not reviewed.
// Writes <out>/<runId>/<recordId>/{<capture>.png, review.json} and <out>/<runId>/summary.json; never edits bank.json
// (apply the verdicts by hand, in a reviewed commit).
//   node bank-review.mjs <runId> --cap-usd <n> [--out C:/s/spec/explain/renders/t11-bank-review] [--only id,id]
// Paid: plan the row in spend.md first. Every call is recorded (requested/served model, tokens, cost, latency).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HERE, sha256 } from './cases.mjs';

const web = name => import(`../../packages/web/src/visual-components/${name}`);

// The states a record is reviewed in: the product job's capture manifest (explain-flow.mjs productionManifest), so a
// record is reviewed on every part, step, experiment value and combined state, deduplicated by frame, and a record one
// review cannot cover is refused (over_budget), never sampled (EXP-12).
export async function reviewStates(scene) {
  const { productionManifest } = await import('./explain-flow.mjs');
  return (await productionManifest(scene)).entries;
}

// deps: { entries (loadBank output), compile, facts, capture(scene, states) -> { captures }, review(input) -> result, ledger }
export async function reviewBank({ entries, compile, facts, capture, review, hash, only = null, save = () => {} }) {
  const rows = [];
  for (const { record, spec, reasons } of entries) {
    const others = reasons.filter(reason => reason !== 'semantic check unrun');
    if (only && !only.includes(record.id)) continue;
    if (others.length) { rows.push({ id: record.id, reviewed: false, why: others }); continue; }
    const scene = compile(spec).scene;
    const compiledHash = await hash(scene);
    let states;
    try { states = await reviewStates(scene); }
    catch (error) { if (error.code !== 'over_budget') throw error; rows.push({ id: record.id, reviewed: false, why: [error.message] }); continue; }
    const { captures } = await capture(scene, states);
    for (const c of captures) save(record.id, `${c.id}.png`, c.png);
    const started = Date.now();
    const request = `${spec.title} (${record.intent})`;
    let result;
    try { result = await review({ request, compiledHash, facts: facts(spec), captures: captures.map(c => ({ ...c, compiledHash })) }); }
    catch (error) { result = { error: `${error.code || ''} ${error.message}`.trim() }; }
    const row = { id: record.id, reviewed: !result.error, request, compiledHash, specHash: record.specHash, componentVersions: record.componentVersions, ms: Date.now() - started,
      captures: captures.map(c => ({ id: c.id, sha256: sha256(Buffer.from(c.png)) })),
      semantic: result.error ? 'unrun' : result.captures.every(c => c.semantic === 'pass') ? 'pass' : 'fail',
      visual: result.error ? 'unrun' : result.captures.every(c => c.visual === 'pass') ? 'pass' : 'fail',
      error: result.error || null, verdicts: result.captures?.map(c => ({ capture: c.captureId, semantic: c.semantic, visual: c.visual, findings: c.findings })) ?? null, calls: result.calls ?? null };
    save(record.id, 'review.json', JSON.stringify(row, null, 2));
    rows.push(row);
  }
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
  const cap = Number(flag('--cap-usd')), outRoot = flag('--out', 'C:/s/spec/explain/renders/t11-bank-review'), only = flag('--only')?.split(',') ?? null;
  const [runId] = args;
  if (!runId || !(cap > 0)) { console.error('usage: node bank-review.mjs <runId> --cap-usd <n> [--out dir] [--only ids]'); process.exit(1); }
  const out = join(outRoot, runId);
  if (existsSync(out)) throw new Error(`${out} exists`);
  const { anthropicTransport, readKeys, recordingModel } = await import('./baseline.mjs');
  const { callExplainRole } = await import('../../packages/control-plane/src/explain-policy.js');
  const { MODEL_PRICES } = await import('../../packages/control-plane/src/learn-models.js');
  const { reviewCaptures } = await import('../../packages/control-plane/src/explain-review.js');
  const { compiledHash } = await import('../../packages/control-plane/src/explain-render.js');
  const { specFacts } = await import('../../packages/control-plane/src/explain-author.js');
  const { captureScene } = await import('../../packages/web/e2e/viz-benchmark-capture.mjs');
  const { loadBank } = await web('bank.js');
  const { compileVisual } = await web('compile.js');
  const { EXAMPLES } = await web('examples/index.js');
  const bank = (await import('../../packages/web/src/visual-components/examples/bank.json', { with: { type: 'json' } })).default;
  const dist = join(HERE, '..', '..', 'packages', 'web', 'dist-render');
  const env = { SMALL_ENV: 'test' };
  const { callModel, ledger } = recordingModel(anthropicTransport(readKeys(['ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID'])), { capUsd: cap, prices: MODEL_PRICES });
  mkdirSync(out, { recursive: true });
  const rows = await reviewBank({ entries: loadBank(bank, EXAMPLES), compile: compileVisual, facts: specFacts, hash: compiledHash, only,
    capture: (scene, states) => captureScene(scene, states, { dist }),
    review: input => reviewCaptures(input, { callRole: (role, request) => callExplainRole(env, role, request, { callModel }) }),
    save: (id, name, value) => { mkdirSync(join(out, id), { recursive: true }); writeFileSync(join(out, id, name), value); } });
  const summary = { runId, at: new Date().toISOString(), reviewer: 'explain-review.js REVIEW_SYSTEM on claude-opus-5-5 (did not author the specs)', rows,
    calls: ledger.calls.map(({ request, ...c }) => c), spentUsd: +ledger.spentUsd.toFixed(6), unknownCost: ledger.unknownCost };
  writeFileSync(join(out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ out, spentUsd: summary.spentUsd, rows: rows.map(r => ({ id: r.id, reviewed: r.reviewed, semantic: r.semantic, visual: r.visual, why: r.why, error: r.error })) }, null, 2));
}
