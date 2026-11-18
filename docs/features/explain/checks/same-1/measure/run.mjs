// SAME-1 measurement (NOT RUN by the author: real provider calls; the lead runs it, owner cap US$1, stop line US$0.90). In-process harness derived from var-1-bench/run.mjs (generateArtifact + the fast chain,
// planner jev, sampler off, no pictures). Arms (git archive trees under C:/s/same1-measure-trees): before = main 2aeca536d; after = feat/same-1 a1452a98c (planner text); afterb = feat/same-1-validator bcf038ac1
// (planner text + the 2-items-per-side transformation rule). The model profile is a PROPERTY OF THE ITEM (EXPLANATION_MODEL_PROFILE = google-low: Gemini flash-lite, then Fireworks gpt-oss-120b; fireworks-low: Fireworks
// gpt-oss-120b at low effort, then Gemini; see explanation-models.js and the explanation-fast-chain.js header). Context is null: the archive keeps only hasContext, so the parent card's text is not reproduced (B keeps its wrapper in the args).
//   node run.mjs --dry-run                              plan, key NAMES, every import; NO provider call
//   node run.mjs --out results.jsonl [--cap 0.90] [--arms before,after,afterb] [--limit N] [--only i,j]   resumable; stops at the stop line (exit 3)
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
const { values: a } = parseArgs({ options: { plan: { type: 'string', default: 'C:/s/film-evidence/docs/features/explain/checks/same-1/measure/plan.json' }, out: { type: 'string', default: 'results.jsonl' }, cap: { type: 'string', default: '0.90' }, limit: { type: 'string' }, only: { type: 'string' }, trees: { type: 'string', default: 'C:/s/same1-measure-trees' }, arms: { type: 'string', default: 'before,after,afterb' }, 'dry-run': { type: 'boolean', default: false } } });
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
const spentSoFar = () => lines().reduce((s, l) => s + JSON.parse(l).costMicrosUpper, 0);

const trees = {};
for (const arm of ARMS) {
  const u = f => import(pathToFileURL(`${a.trees}/${arm}/packages/control-plane/src/${f}`).href);
  const [art, vis, usage] = await Promise.all([u('learn-artifact.js'), u('explanation-visuals.js'), u('learn-usage.js')]);
  trees[arm] = { generateArtifact: art.generateArtifact, deriveVisualRequirements: vis.deriveVisualRequirements, requirementText: vis.requirementText, withUsage: usage.withUsage, noteUsageIdentity: usage.noteUsageIdentity, mig: f => fs.readFileSync(`${a.trees}/${arm}/packages/control-plane/learn-migrations/${f}`, 'utf8') };
}
function ledger(arm) {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of ['0016-usage-operations.sql', '0022-usage-accounting.sql', '0027-usage-grants.sql']) sqlite.exec(trees[arm].mig(f));
  const turn = () => new Promise(r => setImmediate(r));
  const LEARN_DB = { prepare(text) { let args = []; return { bind(...v) { args = v; return this; }, first: async () => { await turn(); return sqlite.prepare(text).get(...args) || null; }, all: async () => { await turn(); return { results: sqlite.prepare(text).all(...args) }; }, run: async () => { await turn(); return { meta: { changes: sqlite.prepare(text).run(...args).changes } }; }, now: () => ({ meta: { changes: sqlite.prepare(text).run(...args).changes } }) }; },
    async batch(st) { await turn(); sqlite.exec('BEGIN'); try { const out = st.map(s => s.now()); sqlite.exec('COMMIT'); return out; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
  return { sqlite, LEARN_DB };
}
const parseDiagrams = body => [...String(body).matchAll(/```rh-diagram\n([\s\S]*?)```/g)].map(m => { try { const j = JSON.parse(m[1]); return j.diagram ?? j; } catch { return null; } }).filter(Boolean);

const sameDiagram = d => JSON.stringify(d, (k, v) => (k === 'title' || k === 'caption' ? undefined : v));
async function runOne(arm, item) {
  const T = trees[arm], { sqlite, LEARN_DB } = ledger(arm);
  const env = T.withUsage({ SMALL_ENV: 'dev', EXPLANATION_MODEL_PROFILE: item.profile, EXPLANATION_PLANNER: 'jev', EXPLANATION_INTERACTIONS: 'true', ...keys, LEARN_DB, USAGE_PLATFORM_DAY_USD: '1000', AI_MONTHLY_ALLOWANCE_USD: '25' }, { feature: 'learn', now: Math.floor(Date.now() / 1000) });
  T.noteUsageIdentity(env, { userId: 'u-same1', email: 'u-same1@example.test' });
  const visuals = T.deriveVisualRequirements(T.requirementText({ args: item.prompt }));
  const input = { command: 'explanation', args: item.prompt, selection: null, context: null, requestSeed: `same1-${item.idx}`, ...(item.depth !== 'balanced' ? { depth: item.depth } : {}), ...(visuals?.items.length ? { visualRequirements: visuals } : {}) };
  const events = [], keep = new Set(['explanation_step', 'learn_artifact_invalid', 'explanation_planner_failed']);
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
  const diagrams = delivered ? parseDiagrams(res.block.body) : [];
  const invalid = events.filter(e => e.event === 'learn_artifact_invalid');
  return { idx: item.idx, arm, set: item.set, tag: item.tag, rep: item.rep, profile: item.profile, prompt: item.prompt, depth: item.depth, ms, delivered,
    result: delivered ? 'artifact' : (res.result ?? 'error'), honestFailure: !delivered, errorCode: delivered ? null : (thrown?.code ?? res.reason ?? res.code ?? null), failureMessage: delivered ? null : String(res.error ?? res.message ?? thrown?.message ?? '').slice(0, 300),
    plannedKind: trace.plan?.kind ?? null, plannerKind: trace.plannerKind ?? null, kindSource: trace.plan?.kindSource ?? null, references: trace.references ?? null, shapeId: trace.shapeId ?? null,
    deliveredKinds: diagrams.map(d => d.kind), deliveredAsPlanned: delivered && Boolean(trace.plan?.kind) && diagrams.some(d => d.kind === trace.plan.kind), pictureKey: diagrams.length ? sameDiagram(diagrams[0]) : null,
    transformationSizes: diagrams.filter(d => d.kind === 'transformation').map(d => [d.before?.items?.length ?? null, d.after?.items?.length ?? null]),
    repairs: invalid.length, invalidErrors: invalid.map(e => String(e.error ?? '').slice(0, 160)), authoredBy: res.block?.authoredBy ?? null, attempts, ledger: rows, costMicros, costMicrosUpper, title: delivered ? res.block.title : null };
}

if (a['dry-run']) {
  const bad = plan.items.filter(it => !it.prompt || !['google-low', 'fireworks-low'].includes(it.profile) || !['brief', 'balanced', 'detailed'].includes(it.depth) || !Number.isInteger(it.idx));
  if (bad.length || new Set(plan.items.map(it => it.idx)).size !== plan.items.length) { console.error('bad plan', bad.length); process.exit(2); }
  const profiles = [...new Set(plan.items.map(it => it.profile))];
  for (const arm of ARMS) {
    const T = trees[arm], { sqlite } = ledger(arm);
    sqlite.prepare('SELECT count(*) AS n FROM usage_attempts').get(); sqlite.close();
    for (const it of plan.items) { const v = T.deriveVisualRequirements(T.requirementText({ args: it.prompt })); void v; }
    const pl = fs.readFileSync(`${a.trees}/${arm}/packages/control-plane/src/explanation-planner.js`, 'utf8'), sp = fs.readFileSync(`${a.trees}/${arm}/packages/web/src/tutor-diagrams/spec.js`, 'utf8');
    console.log(arm, 'imports ok; generateArtifact', typeof T.generateArtifact, '| planner text change:', pl.includes('Numbers turned into other numbers'), '| 2-items rule:', sp.includes('SAME-1 b'));
  }
  const runs = plan.items.length * ARMS.length, PER_RUN_UPPER = 0.0034; // section 6 / VAR-1 bench: about US$0.0034 a run (upper bound)
  console.log(`plan ok: ${plan.items.length} items (${plan.meta.baseItems} questions x profiles ${profiles.join(', ')}) x ${ARMS.length} arms = ${runs} runs; est. US$${(runs * PER_RUN_UPPER).toFixed(2)} vs stop line US$${a.cap} (owner cap US$1); key names present: ${NAMES.join(', ')}; NO provider call made`);
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
    fs.writeFileSync(costPath, `running total upper bound US$${(total / 1e6).toFixed(4)} after ${lines().length} runs; stop line US$${a.cap}; arms ${ARMS.join(',')}\n`);
    console.log(`${item.idx} ${arm} ${item.set}/${item.tag} ${item.profile} ${rec.delivered ? 'ok' : 'FAIL ' + rec.errorCode} planned=${rec.plannedKind} delivered=${rec.deliveredKinds.join('+') || '-'} repairs=${rec.repairs} total=$${(total / 1e6).toFixed(3)}`);
  }
  n++;
}
