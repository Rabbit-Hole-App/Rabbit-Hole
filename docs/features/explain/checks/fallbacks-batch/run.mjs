// FALLBACKS BATCH bench (NOT RUN by the author: real provider calls, the lead runs it). Derived from ../card-numbers/section-6/run.mjs and ../gem-s1/rerun.mjs: same in-process harness (generateArtifact + the fast chain,
// profile google-low, planner jev, sampler off, no pictures), only the plan, the trees and the record fields change.
// BEFORE = main 9531b382f (release-154 tip), AFTER = feat/fallbacks-batch (SIMP-1 + GEM-S1). Trees come from git archive (see README.md).
//   node run.mjs --dry-run                        validates the plan, the key NAMES and every import; no provider call
//   node run.mjs --plan plan.json --out results.jsonl [--cap 0.60] [--limit N] [--only i,j] [--trees C:/s/fb-trees]
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
const { values: a } = parseArgs({ options: { plan: { type: 'string', default: 'plan.json' }, out: { type: 'string', default: 'results.jsonl' }, cap: { type: 'string', default: '0.60' }, limit: { type: 'string' }, only: { type: 'string' }, trees: { type: 'string', default: 'C:/s/fb-trees' }, 'dry-run': { type: 'boolean', default: false } } });
const ENV_FILE = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', NAMES = ['GEMINI_API_KEY', 'FIREWORKS_API_KEY', 'TYPESAFE_API_KEY'];
const keys = {};
for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/); if (m && NAMES.includes(m[1])) keys[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2'); }
for (const n of NAMES) if (!keys[n]) { console.error('missing key name', n); process.exit(2); } // names only; a value is never printed
const CAP_MICROS = Math.round(Number(a.cap) * 1e6), PLANNER_EST_MICROS = 200; // TypeSafe jev: $0.042/M input tokens, ~3-5k tokens a card = ~US$0.0002 (estimate; not in the ledger)
const plan = JSON.parse(fs.readFileSync(a.plan, 'utf8'));
const lines = () => (fs.existsSync(a.out) ? fs.readFileSync(a.out, 'utf8').split('\n').filter(Boolean) : []);
const done = new Set(lines().map(l => { const r = JSON.parse(l); return `${r.idx}|${r.arm}`; }));
const costPath = a.out.replace(/[^/\\]*$/, 'cost.txt');
const spentSoFar = () => lines().reduce((s, l) => s + JSON.parse(l).costMicrosUpper, 0);

const trees = {};
for (const arm of ['before', 'after']) {
  const u = f => import(pathToFileURL(`${a.trees}/${arm}/packages/control-plane/src/${f}`).href);
  const [art, vis, usage] = await Promise.all([u('learn-artifact.js'), u('explanation-visuals.js'), u('learn-usage.js')]);
  trees[arm] = { generateArtifact: art.generateArtifact, deriveVisualRequirements: vis.deriveVisualRequirements, requirementText: vis.requirementText, withUsage: usage.withUsage, noteUsageIdentity: usage.noteUsageIdentity, mig: f => fs.readFileSync(`${a.trees}/${arm}/packages/control-plane/learn-migrations/${f}`, 'utf8') };
}
const checks = await import('file:///C:/s/sprint2-evidence/card-errors/checks.mjs');

function ledger(arm) {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of ['0016-usage-operations.sql', '0022-usage-accounting.sql', '0027-usage-grants.sql']) sqlite.exec(trees[arm].mig(f));
  const turn = () => new Promise(r => setImmediate(r));
  const LEARN_DB = { prepare(text) { let args = []; return { bind(...v) { args = v; return this; }, first: async () => { await turn(); return sqlite.prepare(text).get(...args) || null; }, all: async () => { await turn(); return { results: sqlite.prepare(text).all(...args) }; }, run: async () => { await turn(); return { meta: { changes: sqlite.prepare(text).run(...args).changes } }; }, now: () => ({ meta: { changes: sqlite.prepare(text).run(...args).changes } }) }; },
    async batch(st) { await turn(); sqlite.exec('BEGIN'); try { const out = st.map(s => s.now()); sqlite.exec('COMMIT'); return out; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
  return { sqlite, LEARN_DB };
}
const parseDiagrams = body => [...String(body).matchAll(/```rh-diagram\n([\s\S]*?)```/g)].map(m => { try { const j = JSON.parse(m[1]); return j.diagram ?? j; } catch { return null; } }).filter(Boolean);

async function runOne(arm, item) {
  const T = trees[arm], { sqlite, LEARN_DB } = ledger(arm);
  const env = T.withUsage({ SMALL_ENV: 'dev', EXPLANATION_MODEL_PROFILE: 'google-low', EXPLANATION_PLANNER: 'jev', EXPLANATION_INTERACTIONS: 'true', ...keys, LEARN_DB, USAGE_PLATFORM_DAY_USD: '1000', AI_MONTHLY_ALLOWANCE_USD: '25' }, { feature: 'learn', now: Math.floor(Date.now() / 1000) });
  T.noteUsageIdentity(env, { userId: 'u-sec6', email: 'u-sec6@example.test' });
  const visuals = T.deriveVisualRequirements(T.requirementText({ args: item.prompt }));
  const input = { command: 'explanation', args: item.prompt, selection: null, context: null, ...(item.depth !== 'balanced' ? { depth: item.depth } : {}), ...(visuals?.items.length ? { visualRequirements: visuals } : {}) };
  const events = [], keep = new Set(['explanation_step', 'learn_artifact_invalid', 'explanation_planner_failed', 'explanation_matrix_coerced']);
  const { log, warn, error } = console;
  const grab = (...x) => { for (const s of x) if (typeof s === 'string' && s.startsWith('{')) { try { const j = JSON.parse(s); if (keep.has(j.event)) events.push(j); } catch { /* not ours */ } } };
  console.log = grab; console.warn = () => {}; console.error = () => {};
  const trace = {}, t0 = performance.now();
  let out = null, thrown = null;
  try { out = await T.generateArtifact(env, input, { trace }); } catch (e) { thrown = e; }
  const ms = Math.round(performance.now() - t0);
  Object.assign(console, { log, warn, error });
  const rows = sqlite.prepare('SELECT kind, provider, model, cost_state, cost_micros, reserved_micros, input_tokens, output_tokens FROM usage_attempts ORDER BY rowid').all().map(r => ({ ...r }));
  sqlite.close();
  const costMicros = rows.reduce((s, r) => s + (r.cost_state === 'settled' ? r.cost_micros || 0 : 0), 0);
  const costMicrosUpper = rows.reduce((s, r) => s + (r.cost_state === 'settled' ? r.cost_micros || 0 : r.reserved_micros || r.cost_micros || 0), 0) + PLANNER_EST_MICROS;
  const res = out ?? {}, attempts = res.attempts ?? thrown?.attempts ?? [];
  const delivered = res.result === 'artifact';
  const rec = { idx: item.idx, arm, set: item.set, tags: item.tags ?? null, cell: item.cell ?? null, rep: item.rep ?? null, boxId: item.boxId ?? null, prompt: item.prompt, depth: item.depth, ms, result: delivered ? 'artifact' : (res.result ?? 'error'), delivered,
    errorCode: delivered ? null : (thrown?.code ?? res.reason ?? res.code ?? null), numbersFailure: !delivered && (attempts.some(x => x.outcome === 'arithmetic') || /explanation_bad_numbers/.test(String(res.error ?? thrown?.message ?? ''))), failureMessage: delivered ? null : String(res.error ?? res.message ?? thrown?.message ?? '').slice(0, 300),
    diagramsDropped: res.diagramsDropped ?? null, diagramsSimplified: res.diagramsSimplified ?? null, visualFallback: res.block?.visualFallback ?? null,
    attempts, authoredBy: res.block?.authoredBy ?? null, repairedTop: res.repaired ?? null, plannerKind: trace.plannerKind ?? null, plannerOk: trace.plan?.planner === 'jev',
    events: events.filter(e => e.event !== 'explanation_step'), colsErrorAttempt0: events.some(e => e.event === 'learn_artifact_invalid' && e.attempt === 0 && /columns.d+: Invalid input: expected string, received object/.test(e.error)) /* the gem-s1 rerun's regex lost its backslashes */, anyErrorAttempt0: events.some(e => e.event === 'learn_artifact_invalid' && e.attempt === 0), coercedByQ0: events.filter(e => e.event === 'explanation_matrix_coerced').map(e => [e.action, e.columnsCoerced ?? e.reason]), ledger: rows, costMicros, costMicrosUpper };
  if (delivered) {
    const body = res.block.body, diagrams = parseDiagrams(body);
    const flags = checks.checkCard({ body, diagrams });
    Object.assign(rec, { title: res.block.title, body, kinds: diagrams.map(d => d.kind), numericKinds: [...new Set(diagrams.filter(checks.carriesNumbers).map(d => d.kind))], hasNumeric: diagrams.some(checks.carriesNumbers), flags: flags.map(f => ({ check: f.check, kind: f.kind, detail: String(f.detail).slice(0, 240) })), examined: flags.examined ?? [] });
  }
  // Fallbacks-batch fields. A MISMATCHED FLOW = planned a kind that is not a flow (token-links, heatmap, matrix, transformation, tree ...) but the card was delivered with a flow/chain diagram and none of the planned kind.
  const PLANNED_NOT_FLOW = new Set(['token-links', 'heatmap', 'matrix', 'transformation', 'tree']), kinds = rec.kinds ?? [];
  const firstEv = events.find(e => e.event === 'learn_artifact_invalid' || (e.event === 'explanation_step' && e.outcome !== 'skipped'));
  const failureText = [rec.failureMessage, ...attempts.flatMap(x => x.issues ?? [])].join(' ');
  Object.assign(rec, { finalKinds: kinds, plannedKind: rec.plannerKind, mismatchedFlow: delivered && PLANNED_NOT_FLOW.has(rec.plannerKind) && kinds.some(k => k === 'flow' || k === 'chain') && !kinds.includes(rec.plannerKind),
    plannedKindMissing: delivered && Boolean(rec.plannerKind) && !kinds.includes(rec.plannerKind), endedOnFailureLine: !delivered && /explanation_missing_visual/.test(failureText),
    firstAttemptValid: !firstEv ? null : firstEv.event === 'learn_artifact_invalid' ? firstEv.attempt !== 0 : (['artifact'].includes(firstEv.outcome) ? true : null), attempt0Invalid: events.filter(e => e.event === 'learn_artifact_invalid' && e.attempt === 0).length,
    providerCalls: rows.length, stepsRun: attempts.filter(x => x.outcome !== 'skipped').length, movedToNextProvider: attempts.filter(x => x.outcome !== 'skipped').length > 1 });
  return rec;
}

if (a['dry-run']) {
  // No provider call: validates the plan shape, that both trees import, that the chain's pure planner-side helpers run, and that the harness helpers (ledger, diagram parser, card checks) work.
  const bad = plan.items.filter(it => !it.prompt || !['brief', 'balanced', 'detailed'].includes(it.depth) || !Number.isInteger(it.idx));
  if (bad.length || new Set(plan.items.map(it => it.idx)).size !== plan.items.length) { console.error('bad plan items', bad.length); process.exit(2); }
  for (const arm of ['before', 'after']) {
    const T = trees[arm], { sqlite } = ledger(arm);
    sqlite.prepare('SELECT count(*) AS n FROM usage_attempts').get(); sqlite.close();
    for (const it of plan.items) { const v = T.deriveVisualRequirements(T.requirementText({ args: it.prompt })); void v; }
    const src = fs.readFileSync(`${a.trees}/${arm}/packages/control-plane/src/learn-primitives.js`, 'utf8'); // which tree is which: SIMP-1 adds SIMPLIFIABLE, GEM-S1 adds column?.name
    console.log(arm, 'imports ok; generateArtifact', typeof T.generateArtifact, '| SIMP-1 marker', src.includes('const SIMPLIFIABLE'), '| GEM-S1 marker', src.includes('column?.name'), '| matrix coercion (columnText)', src.includes('const columnText'));
  }
  const cells = new Set(plan.items.map(it => it.cell)), perArm = plan.items.length;
  console.log(`plan ok: ${plan.items.length} items, ${cells.size} cells, ${perArm * 2} runs (est. US$${(perArm * 2 * 0.005).toFixed(2)} at about US$0.005 a run; cap US$${a.cap}); key names present: ${NAMES.join(', ')}; NO provider call made`);
  process.exit(0);
}
const only = a.only ? a.only.split(',').map(Number) : null;
const order = plan.items.filter(it => !only || only.includes(it.idx));
let n = 0;
for (const item of order) {
  if (a.limit && n >= Number(a.limit)) break;
  const arms = item.idx % 2 ? ['after', 'before'] : ['before', 'after']; // alternate who goes first: provider drift hits both arms alike
  for (const arm of arms) {
    if (done.has(`${item.idx}|${arm}`)) continue;
    if (spentSoFar() >= CAP_MICROS) { console.log(`STOP: running total reached the cap of US$${a.cap}`); process.exit(3); }
    const rec = await runOne(arm, item);
    fs.appendFileSync(a.out, JSON.stringify(rec) + '\n');
    const total = spentSoFar();
    fs.writeFileSync(costPath, `running total upper bound US$${(total / 1e6).toFixed(4)} after ${lines().length} runs (settled ledger cost + reservations of unknown-cost calls + US$0.0002 planner estimate per run); stop line US$${a.cap}; hard job cap US$4.00\n`);
    console.log(`${item.idx} ${arm} ${item.depth} ${rec.delivered ? 'ok' : 'FAIL ' + rec.errorCode} ${rec.ms}ms ${rec.authoredBy?.provider ?? '-'} flags=${rec.flags?.length ?? '-'} total=$${(total / 1e6).toFixed(3)}`);
  }
  n++;
}
