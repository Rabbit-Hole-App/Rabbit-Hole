// GEM-S2 rerun (NOT RUN by the author: real provider calls, the lead runs it). Adapted from ../fallbacks-batch/run.mjs: same in-process harness (generateArtifact + the fast chain, profile google-low,
// planner jev, sampler off, no pictures). Differences:
//  (1) three arms in one harness: before = main 9531b382f, batch = feat/fallbacks-batch 5d13f435f, after = batch merged with feat/gem-s2 (45b620fee; its src is identical to batch: GEM-S2 changed no source);
//  (2) only the 12 GEM-S1 items per arm: cells 1,2,3,6 of ../fallbacks-batch/plan.json x 3 reps;
//  (3) the RAW first answer of every Gemini call is recorded (rawGoogle[0] = attempt 0): the saved bench kept only the error text, never the spec, so report.mjs can now show the real shape and replay it through each tree's Q0;
//  (4) the attempt-0 "columns ... received object" regex is fixed: ../fallbacks-batch/run.mjs had lost its backslashes, so its colsErrorAttempt0 was always false (real: 11/12 before, 8/12 after, from the events).
//   node rerun.mjs --dry-run                         plan, key NAMES, every import; no provider call
//   node rerun.mjs --out results.jsonl [--arms before,batch,after] [--cap 0.40] [--limit N] [--only i,j] [--trees C:/s/gem-s2-trees]
//   node report.mjs                                  writes REPORT.md and counts.json (and replays the raw attempt-0 specs through each arm's Q0)
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
const { values: a } = parseArgs({ options: { plan: { type: 'string', default: 'C:/s/sprint2-evidence/fallbacks-batch/plan.json' }, out: { type: 'string', default: 'results.jsonl' }, cap: { type: 'string', default: '0.40' }, limit: { type: 'string' }, only: { type: 'string' }, trees: { type: 'string', default: 'C:/s/gem-s2-trees' }, arms: { type: 'string', default: 'before,batch,after' }, 'dry-run': { type: 'boolean', default: false } } });
const ENV_FILE = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', NAMES = ['GEMINI_API_KEY', 'FIREWORKS_API_KEY', 'TYPESAFE_API_KEY'];
const keys = {};
for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/); if (m && NAMES.includes(m[1])) keys[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2'); }
for (const n of NAMES) if (!keys[n]) { console.error('missing key name', n); process.exit(2); } // names only; a value is never printed
const CAP_MICROS = Math.round(Number(a.cap) * 1e6), PLANNER_EST_MICROS = 200; // TypeSafe jev: about US$0.0002 a card (estimate; not in the ledger)
const ARMS = a.arms.split(',');
const plan = JSON.parse(fs.readFileSync(a.plan, 'utf8'));
plan.items = plan.items.filter(it => [1, 2, 3, 6].includes(it.cell)); // decoder balanced, decoder detailed, forward diffusion balanced, gini split balanced; 3 reps = 12 items
const lines = () => (fs.existsSync(a.out) ? fs.readFileSync(a.out, 'utf8').split('\n').filter(Boolean) : []);
const done = new Set(lines().map(l => { const r = JSON.parse(l); return `${r.idx}|${r.arm}`; }));
const costPath = a.out.replace(/[^/\\]*$/, 'cost.txt');
const spentSoFar = () => lines().reduce((s, l) => s + JSON.parse(l).costMicrosUpper, 0);

const trees = {};
for (const arm of ARMS) {
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
const COLS_OBJECT = /columns\.\d+: Invalid input: expected string, received object/;

async function runOne(arm, item) {
  const T = trees[arm], { sqlite, LEARN_DB } = ledger(arm);
  const env = T.withUsage({ SMALL_ENV: 'dev', EXPLANATION_MODEL_PROFILE: 'google-low', EXPLANATION_PLANNER: 'jev', EXPLANATION_INTERACTIONS: 'true', ...keys, LEARN_DB, USAGE_PLATFORM_DAY_USD: '1000', AI_MONTHLY_ALLOWANCE_USD: '25' }, { feature: 'learn', now: Math.floor(Date.now() / 1000) });
  T.noteUsageIdentity(env, { userId: 'u-gem-s2', email: 'u-gem-s2@example.test' });
  const visuals = T.deriveVisualRequirements(T.requirementText({ args: item.prompt }));
  const input = { command: 'explanation', args: item.prompt, selection: null, context: null, ...(item.depth !== 'balanced' ? { depth: item.depth } : {}), ...(visuals?.items.length ? { visualRequirements: visuals } : {}) };
  const events = [], keep = new Set(['explanation_step', 'learn_artifact_invalid', 'explanation_planner_failed', 'explanation_matrix_coerced']);
  const { log, warn, error } = console, realFetch = globalThis.fetch, rawGoogle = [];
  const grab = (...x) => { for (const s of x) if (typeof s === 'string' && s.startsWith('{')) { try { const j = JSON.parse(s); if (keep.has(j.event)) events.push(j); } catch { /* not ours */ } } };
  // Record what Gemini answered, never the request (it carries the key). The SSE stream is reduced to its text: delta.content plus tool-call arguments; a non-stream answer is its message.
  const reduce = t => { let s = ''; for (const l of t.split('\n')) if (l.startsWith('data:') && !l.includes('[DONE]')) { try { const c = JSON.parse(l.slice(5)).choices?.[0]; s += (c?.delta?.content ?? c?.message?.content ?? '') + (c?.delta?.tool_calls ?? c?.message?.tool_calls ?? []).map(x => x.function?.arguments ?? '').join(''); } catch { /* a partial line */ } } return s || t.slice(0, 30000); };
  const pending = [];
  globalThis.fetch = async (url, init) => { const res = await realFetch(url, init); if (String(url).includes('generativelanguage.googleapis.com')) { const slot = rawGoogle.push('') - 1; pending.push(res.clone().text().then(t => { rawGoogle[slot] = reduce(t); }).catch(() => {})); } return res; };
  console.log = grab; console.warn = () => {}; console.error = () => {};
  const trace = {}, t0 = performance.now();
  let out = null, thrown = null;
  try { out = await T.generateArtifact(env, input, { trace }); } catch (e) { thrown = e; }
  const ms = Math.round(performance.now() - t0);
  Object.assign(console, { log, warn, error }); globalThis.fetch = realFetch;
  await Promise.all(pending);
  const rows = sqlite.prepare('SELECT kind, provider, model, cost_state, cost_micros, reserved_micros, input_tokens, output_tokens FROM usage_attempts ORDER BY rowid').all().map(r => ({ ...r }));
  sqlite.close();
  const costMicros = rows.reduce((s, r) => s + (r.cost_state === 'settled' ? r.cost_micros || 0 : 0), 0);
  const costMicrosUpper = rows.reduce((s, r) => s + (r.cost_state === 'settled' ? r.cost_micros || 0 : r.reserved_micros || r.cost_micros || 0), 0) + PLANNER_EST_MICROS;
  const res = out ?? {}, attempts = res.attempts ?? thrown?.attempts ?? [];
  const delivered = res.result === 'artifact';
  const rec = { idx: item.idx, arm, cell: item.cell, rep: item.rep, prompt: item.prompt, depth: item.depth, ms, result: delivered ? 'artifact' : (res.result ?? 'error'), delivered,
    errorCode: delivered ? null : (thrown?.code ?? res.reason ?? res.code ?? null), failureMessage: delivered ? null : String(res.error ?? res.message ?? thrown?.message ?? '').slice(0, 300),
    diagramsDropped: res.diagramsDropped ?? null, diagramsSimplified: res.diagramsSimplified ?? null, attempts, authoredBy: res.block?.authoredBy ?? null, plannerKind: trace.plannerKind ?? null,
    events: events.filter(e => e.event !== 'explanation_step'), colsErrorAttempt0: events.some(e => e.event === 'learn_artifact_invalid' && e.attempt === 0 && COLS_OBJECT.test(e.error)), anyErrorAttempt0: events.some(e => e.event === 'learn_artifact_invalid' && e.attempt === 0),
    coercedByQ0: events.filter(e => e.event === 'explanation_matrix_coerced').map(e => [e.action, e.columnsCoerced ?? e.reason]), rawGoogle, ledger: rows, costMicros, costMicrosUpper };
  if (delivered) {
    const body = res.block.body, diagrams = parseDiagrams(body);
    const flags = checks.checkCard({ body, diagrams });
    Object.assign(rec, { title: res.block.title, body, kinds: diagrams.map(d => d.kind), flags: flags.map(f => ({ check: f.check, kind: f.kind, detail: String(f.detail).slice(0, 240) })) });
  }
  const kinds = rec.kinds ?? [], firstEv = events.find(e => e.event === 'learn_artifact_invalid' || (e.event === 'explanation_step' && e.outcome !== 'skipped'));
  Object.assign(rec, { finalKinds: kinds, plannedKindMissing: delivered && Boolean(rec.plannerKind) && !kinds.includes(rec.plannerKind),
    firstAttemptValid: !firstEv ? null : firstEv.event === 'learn_artifact_invalid' ? firstEv.attempt !== 0 : (firstEv.outcome === 'artifact' ? true : null),
    providerCalls: rows.length, stepsRun: attempts.filter(x => x.outcome !== 'skipped').length, movedToNextProvider: attempts.filter(x => x.outcome !== 'skipped').length > 1 });
  return rec;
}

if (a['dry-run']) {
  // No provider call: validates the plan, that every tree imports, that the harness helpers (ledger, diagram parser, card checks) work, and which tree is which.
  const bad = plan.items.filter(it => !it.prompt || !['brief', 'balanced', 'detailed'].includes(it.depth) || !Number.isInteger(it.idx));
  const cells = new Set(plan.items.map(it => it.cell));
  if (bad.length || new Set(plan.items.map(it => it.idx)).size !== plan.items.length || plan.items.length !== 12 || [...cells].sort().join() !== '1,2,3,6') { console.error('plan is not the 12-item GEM-S1 set', plan.items.length, [...cells], bad.length); process.exit(2); }
  for (const arm of ARMS) {
    const T = trees[arm], { sqlite } = ledger(arm);
    sqlite.prepare('SELECT count(*) AS n FROM usage_attempts').get(); sqlite.close();
    for (const it of plan.items) { const v = T.deriveVisualRequirements(T.requirementText({ args: it.prompt })); void v; }
    const src = fs.readFileSync(`${a.trees}/${arm}/packages/control-plane/src/learn-primitives.js`, 'utf8');
    console.log(arm, 'imports ok; generateArtifact', typeof T.generateArtifact, '| SIMP-1 marker', src.includes('const SIMPLIFIABLE'), '| GEM-S1 marker', src.includes('column?.name'), '| matrix coercion (columnText)', src.includes('const columnText'));
  }
  console.log(`plan ok: ${plan.items.length} items, ${cells.size} cells, ${plan.items.length * ARMS.length} runs on arms ${ARMS.join(',')} (est. US$${(plan.items.length * ARMS.length * 0.005).toFixed(2)} at about US$0.005 a run; cap US$${a.cap}); key names present: ${NAMES.join(', ')}; NO provider call made`);
  process.exit(0);
}
const only = a.only ? a.only.split(',').map(Number) : null;
const order = plan.items.filter(it => !only || only.includes(it.idx));
let n = 0;
for (const item of order) {
  if (a.limit && n >= Number(a.limit)) break;
  const k = item.idx % ARMS.length, arms = [...ARMS.slice(k), ...ARMS.slice(0, k)]; // rotate who goes first: provider drift hits every arm alike
  for (const arm of arms) {
    if (done.has(`${item.idx}|${arm}`)) continue;
    if (spentSoFar() >= CAP_MICROS) { console.log(`STOP: running total reached the cap of US$${a.cap}`); process.exit(3); }
    const rec = await runOne(arm, item);
    fs.appendFileSync(a.out, JSON.stringify(rec) + '\n');
    const total = spentSoFar();
    fs.writeFileSync(costPath, `running total upper bound US$${(total / 1e6).toFixed(4)} after ${lines().length} runs (settled ledger cost + reservations of unknown-cost calls + US$0.0002 planner estimate per run); stop line US$${a.cap}; arms ${ARMS.join(',')}\n`);
    console.log(`${item.idx} ${arm} c${item.cell} ${item.depth} ${rec.delivered ? 'ok' : 'FAIL ' + rec.errorCode} ${rec.ms}ms ${rec.authoredBy?.provider ?? '-'} firstValid=${rec.firstAttemptValid} q0=${JSON.stringify(rec.coercedByQ0.map(c => c[0]))} total=$${(total / 1e6).toFixed(3)}`);
  }
  n++;
}
