// VAR-1 bench (spec section 5; NOT RUN: real provider calls, the lead runs it after the owner's OK, cap US$6). In-process harness adapted from gem-s2/rerun.mjs (itself from
// fallbacks-batch/run.mjs and card-numbers/section-6): generateArtifact + the fast chain, profile google-low, planner jev, sampler off, no pictures. Two arms:
//   before = main 1cffe2ef8 (release 157), after = feat/var-1 bf926057f (derive/op/t, tokens, requestSeed + vary on 15 references).
// Differences from section 6: (1) the plan (plan.json) = the section-6 303 numeric items on both arms + 20 variation runs (ten varied references, the same prompt twice) on the AFTER arm only;
// (2) every run passes input.requestSeed (the route's own seed; the before arm ignores it) so a selected reference with `vary` is drawn; (3) the record adds references, shapeId, tokensFilled,
// requestSeed, tokenFailure (explanation_bad_token events) and the 154 rule flags; (4) BENCH-1: the attempt-0 'columns ... received object' regex keeps its backslashes (the fallbacks-batch
// run.mjs lost them) and --dry-run asserts it matches a sample line and no look-alike.
//   node run.mjs --dry-run                         plan, key NAMES, every import, regex self-test, the offline variation check; NO provider call
//   node run.mjs --out results.jsonl [--cap 5.40] [--limit N] [--only i,j] [--arms before,after]   resumable; stops at the stop line (exit 3); hard job cap US$6.00
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
const { values: a } = parseArgs({ options: { plan: { type: 'string', default: 'C:/s/sprint2-evidence/var-1-bench/plan.json' }, out: { type: 'string', default: 'results.jsonl' }, cap: { type: 'string', default: '5.40' }, limit: { type: 'string' }, only: { type: 'string' }, trees: { type: 'string', default: 'C:/s/var1-bench-trees' }, arms: { type: 'string', default: 'before,after' }, 'dry-run': { type: 'boolean', default: false } } });
const ENV_FILE = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', NAMES = ['GEMINI_API_KEY', 'FIREWORKS_API_KEY', 'TYPESAFE_API_KEY'];
const keys = {};
for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/); if (m && NAMES.includes(m[1])) keys[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2'); }
for (const n of NAMES) if (!keys[n]) { console.error('missing key name', n); process.exit(2); } // names only; a value is never printed
const CAP_MICROS = Math.round(Number(a.cap) * 1e6), PLANNER_EST_MICROS = 200; // TypeSafe jev: about US$0.0002 a card (estimate; not in the ledger)
const ARMS = a.arms.split(',');
const plan = JSON.parse(fs.readFileSync(a.plan, 'utf8'));
const lines = () => (fs.existsSync(a.out) ? fs.readFileSync(a.out, 'utf8').split('\n').filter(Boolean) : []);
const done = new Set(lines().map(l => { const r = JSON.parse(l); return `${r.idx}|${r.arm}`; }));
const costPath = a.out.replace(/[^/\\]*$/, 'cost.txt');
// resume run (Gemini topped up): the stop line counts SETTLED cost only (a failed call counts at its settled cost, 0), earlier runs included; three consecutive Gemini provider_error first attempts stop the run (exit 4)
const PRIOR = fs.existsSync('results.jsonl') ? fs.readFileSync('results.jsonl', 'utf8').split('\n').filter(Boolean).reduce((s, l) => s + (JSON.parse(l).costMicros || 0) + PLANNER_EST_MICROS, 0) : 0;
const spentSoFar = () => PRIOR + lines().reduce((s, l) => s + (JSON.parse(l).costMicros || 0) + PLANNER_EST_MICROS, 0);
let consecutiveGeminiFail = 0;

const trees = {};
for (const arm of ARMS) {
  const u = f => import(pathToFileURL(`${a.trees}/${arm}/packages/control-plane/src/${f}`).href);
  const [art, vis, usage] = await Promise.all([u('learn-artifact.js'), u('explanation-visuals.js'), u('learn-usage.js')]);
  trees[arm] = { generateArtifact: art.generateArtifact, deriveVisualRequirements: vis.deriveVisualRequirements, requirementText: vis.requirementText, withUsage: usage.withUsage, noteUsageIdentity: usage.noteUsageIdentity, mig: f => fs.readFileSync(`${a.trees}/${arm}/packages/control-plane/learn-migrations/${f}`, 'utf8') };
}
const checks = await import('file:///C:/s/sprint2-evidence/card-numbers/section-6b/checks6b.mjs'); // card-errors checks unmodified (old) + the three 154 rules (new)

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
const assertRegex = () => { if (!COLS_OBJECT.test('diagram.columns.0: Invalid input: expected string, received object') || COLS_OBJECT.test('columnsd+: Invalid input: expected string, received object')) { console.error('BENCH-1: the columns-object regex lost its backslashes'); process.exit(2); } console.log('BENCH-1 regex self-test ok'); };

async function runOne(arm, item) {
  const T = trees[arm], { sqlite, LEARN_DB } = ledger(arm);
  const env = T.withUsage({ SMALL_ENV: 'dev', EXPLANATION_MODEL_PROFILE: 'google-low', EXPLANATION_PLANNER: 'jev', EXPLANATION_INTERACTIONS: 'true', ...keys, LEARN_DB, USAGE_PLATFORM_DAY_USD: '1000', AI_MONTHLY_ALLOWANCE_USD: '25' }, { feature: 'learn', now: Math.floor(Date.now() / 1000) });
  T.noteUsageIdentity(env, { userId: 'u-var1', email: 'u-var1@example.test' });
  const visuals = T.deriveVisualRequirements(T.requirementText({ args: item.prompt }));
  const input = { command: 'explanation', args: item.prompt, selection: null, context: null, requestSeed: `bench-${item.idx}-${item.rep ?? 0}`, ...(item.depth !== 'balanced' ? { depth: item.depth } : {}), ...(visuals?.items.length ? { visualRequirements: visuals } : {}) };
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
  const rec = { idx: item.idx, arm, set: item.set, refId: item.refId ?? null, rep: item.rep ?? null, prompt: item.prompt, depth: item.depth, ms, result: delivered ? 'artifact' : (res.result ?? 'error'), delivered,
    errorCode: delivered ? null : (thrown?.code ?? res.reason ?? res.code ?? null), failureMessage: delivered ? null : String(res.error ?? res.message ?? thrown?.message ?? '').slice(0, 300),
    diagramsDropped: res.diagramsDropped ?? null, diagramsSimplified: res.diagramsSimplified ?? null, attempts, authoredBy: res.block?.authoredBy ?? null, plannerKind: trace.plannerKind ?? null,
    references: trace.references ?? null, shapeId: trace.shapeId ?? null, requestSeed: trace.requestSeed ?? null, tokensFilled: trace.tokensFilled ?? null,
    tokenFailure: events.some(e => e.event === 'learn_artifact_invalid' && /explanation_bad_token/.test(e.error ?? '')),
    events: events.filter(e => e.event !== 'explanation_step'), colsErrorAttempt0: events.some(e => e.event === 'learn_artifact_invalid' && e.attempt === 0 && COLS_OBJECT.test(e.error)), anyErrorAttempt0: events.some(e => e.event === 'learn_artifact_invalid' && e.attempt === 0),
    coercedByQ0: events.filter(e => e.event === 'explanation_matrix_coerced').map(e => [e.action, e.columnsCoerced ?? e.reason]), rawGoogle, ledger: rows, costMicros, costMicrosUpper };
  if (delivered) {
    const body = res.block.body, diagrams = parseDiagrams(body);
    const cc = checks.checkCard6b({ body, diagrams }), shape = f => ({ check: f.check, kind: f.kind, detail: String(f.detail).slice(0, 240) });
    Object.assign(rec, { title: res.block.title, body, bodyWithTokens: res.block.bodyWithTokens ?? null, kinds: diagrams.map(d => d.kind), diagrams, flags: cc.old.map(shape), flags154: cc.new.map(shape) });
  }
  const kinds = rec.kinds ?? [], firstEv = events.find(e => e.event === 'learn_artifact_invalid' || (e.event === 'explanation_step' && e.outcome !== 'skipped'));
  Object.assign(rec, { finalKinds: kinds, plannedKindMissing: delivered && Boolean(rec.plannerKind) && !kinds.includes(rec.plannerKind),
    firstAttemptValid: !firstEv ? null : firstEv.event === 'learn_artifact_invalid' ? firstEv.attempt !== 0 : (firstEv.outcome === 'artifact' ? true : null),
    providerCalls: rows.length, stepsRun: attempts.filter(x => x.outcome !== 'skipped').length, movedToNextProvider: attempts.filter(x => x.outcome !== 'skipped').length > 1 });
  return rec;
}

if (a['dry-run']) {
  // No provider call: validates the plan, that both trees import, that the harness helpers (ledger, diagram parser, card checks) work, the BENCH-1 regex, and the offline variation check.
  const bad = plan.items.filter(it => !it.prompt || !['brief', 'balanced', 'detailed'].includes(it.depth) || !Number.isInteger(it.idx));
  const numeric = plan.items.filter(it => !it.arms || it.arms.length === 2), vary = plan.items.filter(it => it.set === 'vary');
  if (bad.length || new Set(plan.items.map(it => it.idx)).size !== plan.items.length || numeric.length !== 303 || vary.length !== 20) { console.error('plan is not 303 numeric items + 20 variation items', plan.items.length, bad.length); process.exit(2); }
  assertRegex();
  for (const arm of ARMS) {
    const T = trees[arm], { sqlite } = ledger(arm);
    sqlite.prepare('SELECT count(*) AS n FROM usage_attempts').get(); sqlite.close();
    for (const it of plan.items) { const v = T.deriveVisualRequirements(T.requirementText({ args: it.prompt })); void v; }
    const src = fs.readFileSync(`${a.trees}/${arm}/packages/control-plane/src/learn-artifact.js`, 'utf8');
    console.log(arm, 'imports ok; generateArtifact', typeof T.generateArtifact, '| requestSeed in the build:', src.includes('requestSeed'), '| tokensFilled in the build:', src.includes('tokensFilled'));
  }
  // offline variation check on the AFTER tree: the same prompt with two seeds draws different varied inputs of the same reference (what the paid variation runs then look for in the cards)
  if (trees.after) {
    const imp = f => import(pathToFileURL(`${a.trees}/after/packages/${f}`).href);
    const { prepareArtifactAuthorRequest } = await imp('control-plane/src/learn-artifact.js');
    const { diagramReferences } = await imp('web/src/tutor-diagrams/reference-library.js');
    const at = (root, path) => path.split('.').reduce((node, key) => node?.[key], root);
    const penv = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
    const quiet = f => { const log = console.log; console.log = () => {}; try { return f(); } finally { console.log = log; } };
    const ids = [...new Set(vary.map(v => v.refId))];
    for (const id of ids) {
      const ref = diagramReferences.find(r => r.id === id), prompt = vary.find(v => v.refId === id).prompt;
      const spec = seed => quiet(() => prepareArtifactAuthorRequest(penv, { command: 'explanation', args: prompt, depth: 'standard', requestSeed: seed })).diagramReferences.find(r => r.id === id)?.spec?.diagram;
      const s1 = spec('bench-1000-1'), s2 = spec('bench-1000-2');
      const changed = Object.keys(ref.vary).filter(p => at(s1, p) !== at(s2, p));
      if (!s1 || !s2 || !changed.length) { console.error(`variation check failed offline for ${id}`); process.exit(2); }
      console.log(`  vary ok ${id}: ${changed.length} of ${Object.keys(ref.vary).length} varied paths differ between two seeds`);
    }
  }
  const runs = numeric.length * ARMS.length + vary.length, PER_RUN_UPPER = 0.0034; // section 6: US$2.07 upper bound over 606 runs = US$0.0034 a run
  console.log(`plan ok: ${numeric.length} numeric items x ${ARMS.length} arms + ${vary.length} variation runs = ${runs} runs; est. US$${(runs * PER_RUN_UPPER).toFixed(2)} (US$${PER_RUN_UPPER} a run, section-6 upper bound; the AFTER arm adds a guidance sentence of about 45 words only on diagram plans) vs stop line US$${a.cap} and hard cap US$6.00; key names present: ${NAMES.join(', ')}; NO provider call made`);
  process.exit(0);
}
const only = a.only ? a.only.split(',').map(Number) : null;
const order = plan.items.filter(it => !only || only.includes(it.idx));
let n = 0;
for (const item of order) {
  if (a.limit && n >= Number(a.limit)) break;
  const pool = item.arms ? ARMS.filter(x => item.arms.includes(x)) : ARMS, k = item.idx % pool.length, arms = [...pool.slice(k), ...pool.slice(0, k)]; // rotate who goes first: provider drift hits every arm alike
  for (const arm of arms) {
    if (done.has(`${item.idx}|${arm}`)) continue;
    if (spentSoFar() >= CAP_MICROS) { console.log(`STOP: running total reached the cap of US$${a.cap}`); process.exit(3); }
    const rec = await runOne(arm, item);
    fs.appendFileSync(a.out, JSON.stringify(rec) + '\n');
    const first = rec.attempts?.[0]; consecutiveGeminiFail = first?.provider === 'google' && first?.outcome === 'provider_error' ? consecutiveGeminiFail + 1 : 0;
    if (consecutiveGeminiFail >= 3) { console.log('STOP: three consecutive Gemini provider_error first attempts (credits or outage): not burning the plan on the fallback'); process.exit(4); }
    const total = spentSoFar();
    fs.writeFileSync(costPath, `running SETTLED total (earlier runs included) US$${(total / 1e6).toFixed(4)} after ${lines().length} runs (settled ledger cost + reservations of unknown-cost calls + US$0.0002 planner estimate per run); stop line US$${a.cap}; arms ${ARMS.join(',')}\n`);
    console.log(`${item.idx} ${arm} ${item.set} ${item.depth} ${rec.delivered ? 'ok' : 'FAIL ' + rec.errorCode} ${rec.ms}ms ${rec.authoredBy?.provider ?? '-'} firstValid=${rec.firstAttemptValid} q0=${JSON.stringify(rec.coercedByQ0.map(c => c[0]))} total=$${(total / 1e6).toFixed(3)}`);
  }
  n++;
}
