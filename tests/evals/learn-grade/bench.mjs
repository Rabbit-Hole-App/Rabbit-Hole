#!/usr/bin/env node
// tests/evals/learn-grade/bench.mjs
// Jev vs today's Opus grader on a labeled set, against a dev clone
// (docs/features/jev-grading.md). Prints what it decided before it runs;
// a holdout run prints and saves aggregates only.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { THRESHOLDS, VERDICT_LOGIC_VERSION, GRADER_PROTOCOL_VERSION, GRADER_PROTOCOL_FINGERPRINT, VERDICT_LOGIC_FINGERPRINT, JEV_MODEL, JEV_URL, verdictFrom } from '../../../packages/control-plane/src/learn-grade-jev.js';
import { challengePrompt } from '../../../packages/web/src/learn-grade-prompts.js';
import { rate, wilson, percentile, prf, bestThreshold, calibration, brier, goldVerdict, verdictAccuracy, confusion } from './metrics.mjs';
import { validateSet } from './set-rules.mjs';

const HERE = new URL('.', import.meta.url);
const path = relative => new URL(relative, HERE).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, token, index, all) => (token.startsWith('--') ? [...pairs, [token.slice(2), all[index + 1]?.startsWith('--') || all[index + 1] === undefined ? 'true' : all[index + 1]]] : pairs), []));
const fail = (code, message) => { console.log(message); process.exit(code); };

const base = (args.base || '').replace(/\/$/, '');
const allowLocal = process.env.LEARN_BENCH_ALLOW_LOCAL === '1' && /^http:\/\/127\.0\.0\.1:\d+$/.test(base);
if (!/^https:\/\/small-cp-dev-[a-z0-9-]+\.zeroshothq\.workers\.dev$/.test(base) && !allowLocal) fail(1, `refusing ${base || '(no --base)'}: not a small-cp-dev-<name> clone`);
if (!args.app) fail(1, 'usage: bench.mjs --base <clone url> --app <app name> [--set benchmark-v1 | --holdout <path>]');
const envFile = args['env-file'] || path('../../../../small-deploy/.env');
const secrets = Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).map(line => line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^"|"$/g, '').trim()]));
if (!secrets.SMALL_TEST_BYPASS || !secrets.LEARN_BENCH_SECRET) fail(1, `missing SMALL_TEST_BYPASS or LEARN_BENCH_SECRET in ${envFile}`);
const resultsDir = args['results-dir'] || path('./results');
// The self-test may shrink these; a real run against a clone never can.
const minPerMode = allowLocal ? Number(args['min-per-mode'] || 30) : 30;
const pendingWait = allowLocal ? Number(args['pending-wait-ms'] || 1000) : 1000;

// --- the set ---
const holdout = !!args.holdout;
if (holdout && !allowLocal) {
  if (args['results-dir']) fail(1, 'refusing --results-dir with --holdout: the burn check must read the committed results');
  if (args['holdout-hash-file']) fail(1, 'refusing --holdout-hash-file with --holdout: a real run always checks the committed HOLDOUT.sha256');
  const dirty = spawnSync('git', ['status', '--porcelain', '--', path('../../../packages/control-plane/src/learn-grade-jev.js')], { encoding: 'utf8' }).stdout.trim();
  if (dirty) fail(1, 'commit learn-grade-jev.js before a holdout run: switch conditions use the committed grader configuration');
}
const setFile = holdout ? args.holdout : args['set-file'] || path('./benchmark-v1.json');
const raw = readFileSync(setFile);
const setName = holdout ? 'benchmark-v1-holdout' : 'benchmark-v1';
const holdoutSha = createHash('sha256').update(raw).digest('hex');
if (holdout) {
  const hashFile = args['holdout-hash-file'] || path('./HOLDOUT.sha256');
  if (!existsSync(hashFile)) fail(2, `no ${hashFile}: commit the holdout's hash before running it`);
  if (readFileSync(hashFile, 'utf8').trim() !== holdoutSha) fail(2, `${setFile} does not match HOLDOUT.sha256`);
}
const set = JSON.parse(raw.toString('utf8'));
const problems = validateSet(set, { minPerMode });
if (problems.length) fail(1, `set problems:\n- ${problems.join('\n- ')}`);
const challenges = new Map(set.challenges.map(challenge => [challenge.id, challenge]));
const perMode = mode => set.cases.filter(item => challenges.get(item.challenge).mode === mode).length;

// --- burn check: compare with the earliest viewed run of this holdout ---
const versions = { grader_protocol_version: GRADER_PROTOCOL_VERSION, grader_protocol_fingerprint: GRADER_PROTOCOL_FINGERPRINT, thresholds: { ...THRESHOLDS }, verdict_logic_version: VERDICT_LOGIC_VERSION, verdict_logic_fingerprint: VERDICT_LOGIC_FINGERPRINT, model_route: `${JEV_URL} ${JEV_MODEL}`, holdout_sha256: holdout ? holdoutSha : null };
const setDir = join(resultsDir, setName);
mkdirSync(setDir, { recursive: true });
if (holdout) {
  const earlier = readdirSync(setDir).filter(name => name.endsWith('.json')).sort();
  if (earlier.length) {
    const first = JSON.parse(readFileSync(join(setDir, earlier[0]), 'utf8'));
    for (const field of ['grader_protocol_version', 'grader_protocol_fingerprint', 'thresholds', 'verdict_logic_version', 'verdict_logic_fingerprint', 'model_route', 'holdout_sha256']) {
      if (JSON.stringify(first[field]) !== JSON.stringify(versions[field])) fail(2, `holdout burned by ${field}: write benchmark-v2-holdout`);
    }
  }
}

// --- the run name: never reuse one ---
const today = new Date().toISOString().slice(0, 10);
const taken = name => readdirSync(resultsDir, { withFileTypes: true }).some(entry => entry.isDirectory() && existsSync(join(resultsDir, entry.name, `${name}.json`)));
let runName = null;
for (const letter of 'abcdefghijklmnopqrstuvwxyz') { const name = `${setName}-${today}-${letter}`; if (!taken(name)) { runName = name; break; } }
if (!runName) fail(1, `no free run name for ${setName} today`);
for (const item of set.cases) if (!/^[A-Za-z0-9:_-]{8,120}$/.test(`${runName}:${item.id}`)) fail(1, `attempt id ${runName}:${item.id} breaks the route pattern`);

console.log(`✓ target: ${base} · app ${args.app} · set ${setName} · run ${runName} · ${set.cases.length} cases (${perMode('challenge')} challenge / ${perMode('explain_back')} explain_back) · ~${set.cases.length} Opus calls`);

// --- session ---
const session = await (await fetch(`${base}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'jev-bench' }, body: JSON.stringify({ email: args.email || 'yudhisteer.chin@gmail.com', secret: secrets.SMALL_TEST_BYPASS }) })).json().catch(() => ({}));
if (!session.session) fail(1, 'no test session from /test/session');
const headers = { 'Content-Type': 'application/json', 'User-Agent': 'jev-bench', Cookie: `small_session=${session.session}` };

async function gradeJev(item) {
  const challenge = challenges.get(item.challenge);
  const body = { app: args.app, attempt_id: `${runName}:${item.id}`, set: setName, bench_run: runName, block_id: null, board: null, mode: challenge.mode, prompt: challenge.prompt, expects: challenge.expects, answer: item.answer };
  for (let send = 0; send <= 5; send += 1) {
    const response = await fetch(`${base}/api/learn/grade/bench`, { method: 'POST', headers: { ...headers, 'X-Learn-Bench-Secret': secrets.LEARN_BENCH_SECRET }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (response.status === 503) fail(1, `503: ${data.error} (set VERCEL_TYPESAFE_API_KEY on the clone)`);
    if (response.status === 404 && data.error === 'Not found') fail(1, '404 from the bench route: set LEARN_BENCH_SECRET on the clone');
    if (response.status === 403 && data.error === 'Bench secret required') fail(1, `403 from the bench route: set LEARN_BENCH_SECRET in ${envFile} to match the clone`);
    if (response.status === 403 || response.status === 404) fail(1, `${response.status} from the bench route: ${data.error || 'request refused'}`);
    if (response.status === 401) fail(1, `401 from the bench route: ${data.error || 'sign-in problem'} - get a fresh test session`);
    if (response.status === 400) fail(1, `400 from the bench route: ${data.error || 'bad request'}`);
    if (response.status === 202) { await new Promise(resolve => setTimeout(resolve, pendingWait)); continue; }
    if (response.status === 409) return { error: 'incomplete' };
    if (response.status !== 200) return { error: 'failed', message: data.error || `HTTP ${response.status}` };
    if (data.grader_protocol_version !== GRADER_PROTOCOL_VERSION) fail(1, `clone runs grader protocol ${data.grader_protocol_version}, local is ${GRADER_PROTOCOL_VERSION}: redeploy the clone`);
    const probabilities = { ideas: data.jev.ideas.map(idea => idea.p), misconception: data.jev.misconception, non_attempt: data.jev.non_attempt };
    return { ...probabilities, verdict: verdictFrom(probabilities), ms: data.ms, generation_id: data.generation_id, cost: data.cost ?? null, input_tokens: data.input_tokens ?? null, retries: data.retries ?? null };
  }
  return { error: 'pending' };
}

async function gradeOpus(item) {
  const challenge = challenges.get(item.challenge);
  const started = Date.now();
  try {
    const response = await fetch(`${base}/api/learn/ask`, { method: 'POST', headers, body: JSON.stringify({ scope: { app: args.app }, message: challengePrompt({ mode: challenge.mode, prompt: challenge.prompt, expects: challenge.expects }, item.answer) }) });
    const text = await response.text();
    const streamed = text.split('\n\n').filter(event => /^event: chunk$/m.test(event)).map(event => JSON.parse(event.match(/^data: (.+)$/m)[1]).text).join('');
    const verdict = (streamed.match(/VERDICT:\s*(good|partial)/i)?.[1] || '').toLowerCase() || null;
    return { verdict, ms: Date.now() - started, error: verdict ? null : 'unparsed' };
  } catch (error) {
    return { verdict: null, ms: Date.now() - started, error: error.message };
  }
}

const results = [];
for (const item of set.cases) {
  const [jev, opus] = await Promise.all([gradeJev(item), gradeOpus(item)]);
  results.push({ ...item, mode: challenges.get(item.challenge).mode, jev, opus });
}

// --- Jev price: the gateway reported $0 cost at the Gate D probe, so cost is
// computed from each generation's input tokens × the published price. Fetched
// after the run: an early exit mid-run must not leave this socket open ---
const gatewayBase = allowLocal ? base : 'https://ai-gateway.vercel.sh';
const jevPricing = await fetch(`${gatewayBase}/v1/models`).then(response => response.json()).then(models => models.data.find(model => model.id === JEV_MODEL)?.pricing).catch(() => null);
const jevPrice = Number(jevPricing?.output) === 0 ? Number(jevPricing?.input) : NaN;
const costMethod = Number.isFinite(jevPrice) ? `input tokens × $${jevPricing.input}/token published at ${gatewayBase}/v1/models (output $0)` : `not computed: no input-only price for ${JEV_MODEL} at ${gatewayBase}/v1/models`;
console.log(`${Number.isFinite(jevPrice) ? '✓' : '✗'} jev cost method: ${costMethod}`);

// --- measures ---
const jevPick = item => item.jev.error ? 'error' : item.jev.verdict;
const opusPick = item => item.opus.verdict || 'error';
const byMode = mode => results.filter(item => item.mode === mode);
const accuracy = (cases, pick) => ({ ...verdictAccuracy(cases, pick), confusion: confusion(cases, pick) });
const ideaItems = results.filter(item => !item.jev.error).flatMap(item => item.gold.ideas.map((gold, index) => ({ p: item.jev.ideas[index], gold })));
const jevMs = results.filter(item => !item.jev.error).map(item => item.jev.ms);
const meanOf = values => ({ mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, n: values.length });
const errors = kind =>results.filter(item => item.jev.error === kind).length;
const summary = {
  run: runName, date: today, set: setName, app: args.app, ...versions,
  n: { total: results.length, challenge: byMode('challenge').length, explain_back: byMode('explain_back').length },
  accuracy: {
    jev: { overall: accuracy(results, jevPick), challenge: accuracy(byMode('challenge'), jevPick), explain_back: accuracy(byMode('explain_back'), jevPick) },
    opus: { overall: accuracy(results, opusPick), challenge: accuracy(byMode('challenge'), opusPick), explain_back: accuracy(byMode('explain_back'), opusPick) },
  },
  per_idea: { at_0_5: prf(ideaItems, 0.5), at_yes: prf(ideaItems, THRESHOLDS.yes), ...(holdout ? {} : { best: bestThreshold(ideaItems) }) },
  calibration: calibration(ideaItems),
  brier: brier(ideaItems),
  injection_good: rate(results.filter(item => item.pattern === 'injection' && jevPick(item) === 'good').length, results.filter(item => item.pattern === 'injection').length),
  jev_ms: { p50: percentile(jevMs, 0.5), p95: percentile(jevMs, 0.95), n: jevMs.length, excluded: results.filter(item => item.jev.error).length },
  per_idea_items: { n: ideaItems.length, excluded_cases: results.filter(item => item.jev.error).length },
  jev_cost_per_grade: {
    computed: meanOf(results.filter(item => Number.isInteger(item.jev.input_tokens)).map(item => item.jev.input_tokens * jevPrice).filter(Number.isFinite)),
    method: costMethod,
    gateway_reported: meanOf(results.map(item => item.jev.cost).filter(Number.isFinite)),
  },
  opus_ms: { p50: percentile(results.map(item => item.opus.ms), 0.5), p95: percentile(results.map(item => item.opus.ms), 0.95), n: results.length },
  jev_errors: { pending: errors('pending'), incomplete: errors('incomplete'), failed: errors('failed'), timeouts: results.filter(item => /^Jev timed out/.test(item.jev.message || '')).length },
  // Observational: Opus's verdict stood alone wherever Jev returned nothing. Errors still count as wrong above.
  fallback: rate(results.filter(item => item.jev.error).length, results.length),
  jev_429_retries: results.filter(item => item.jev.retries > 0).length,
};

// --- print ---
const show = value => `${value.k} / ${value.n} (${value.pct ?? '-'}%)${value.wilson ? ` [${(value.wilson.low * 100).toFixed(1)}-${(value.wilson.high * 100).toFixed(1)}]` : ''}`;
for (const mode of ['overall', 'challenge', 'explain_back']) console.log(`accuracy ${mode}: jev ${show(summary.accuracy.jev[mode])} · opus ${show(summary.accuracy.opus[mode])}`);
const bothModes = summary.n.challenge >= 30 && summary.n.explain_back >= 30;
for (const mode of ['challenge', 'explain_back']) {
  const jev = summary.accuracy.jev[mode];
  const opus = summary.accuracy.opus[mode];
  const gap = jev.pct != null && opus.pct != null ? (jev.pct - opus.pct).toFixed(1) : '-';
  console.log(`jev - opus ${mode}: ${gap} points (jev ${jev.k} / ${jev.n}, opus ${opus.k} / ${opus.n}) · 3-point rule ${bothModes ? (jev.pct >= opus.pct - 3 ? 'met' : 'missed') : 'not evaluated (a mode has N < 30)'}`);
}
const pr = r => `P ${r.precision?.toFixed(3) ?? '-'} R ${r.recall?.toFixed(3) ?? '-'} F1 ${r.f1?.toFixed(3) ?? '-'} (tp ${r.tp} fp ${r.fp} fn ${r.fn})`;
console.log(`per-idea items ${summary.per_idea_items.n} (${summary.per_idea_items.excluded_cases} cases with a Jev error excluded)`);
console.log(`per-idea @0.5 ${pr(summary.per_idea.at_0_5)}`);
console.log(`per-idea @${THRESHOLDS.yes} ${pr(summary.per_idea.at_yes)}`);
if (!holdout && summary.per_idea.best) console.log(`best threshold ${summary.per_idea.best.threshold} ${pr(summary.per_idea.best)} - in-sample (${setName})`);
for (const bucket of summary.calibration) console.log(`calibration ${bucket.low.toFixed(1)}-${bucket.high.toFixed(1)}: n ${bucket.n} · mean p ${bucket.meanP?.toFixed(3) ?? '-'} · observed ${bucket.observed?.toFixed(3) ?? '-'}`);
console.log(`brier ${summary.brier?.toFixed(4)} · injection graded good ${summary.injection_good.k} / ${summary.injection_good.n}`);
console.log(`jev ms p50 ${summary.jev_ms.p50} p95 ${summary.jev_ms.p95} (n ${summary.jev_ms.n}; ${summary.jev_ms.excluded} Jev errors excluded) · opus ms p50 ${summary.opus_ms.p50} p95 ${summary.opus_ms.p95} (n ${summary.opus_ms.n})`);
const cost = summary.jev_cost_per_grade;
console.log(`jev cost per grade $${cost.computed.mean ?? '-'} computed (n ${cost.computed.n}; ${cost.method}) · gateway reported $${cost.gateway_reported.mean ?? '-'} (n ${cost.gateway_reported.n}) · opus cost not measured (no usage in the /api/learn/ask stream)`);
console.log(`jev errors: pending ${summary.jev_errors.pending} · incomplete ${summary.jev_errors.incomplete} · failed ${summary.jev_errors.failed} (timeouts ${summary.jev_errors.timeouts}) · 429/529 retries ${summary.jev_429_retries} · fallback to Opus alone ${show(summary.fallback)}`);

if (holdout) {
  const modes = ['challenge', 'explain_back'];
  const enough = modes.every(mode => summary.n[mode] >= 30);
  const checks = [
    ['each mode N >= 30', enough],
    ...modes.map(mode => [`${mode} accuracy >= 90%`, enough && summary.accuracy.jev[mode].pct >= 90]),
    ...modes.map(mode => [`${mode} no more than 3 points below Opus`, enough && summary.accuracy.jev[mode].pct >= summary.accuracy.opus[mode].pct - 3]),
    ['per-idea F1 at THRESHOLDS.yes >= 0.85', (summary.per_idea.at_yes.f1 ?? 0) >= 0.85],
    ['no injection case graded good', summary.injection_good.k === 0],
    ['jev p95 < 400 ms', summary.jev_ms.p95 != null && summary.jev_ms.p95 < 400],
  ];
  for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(`holdout conditions: ${checks.every(([, passed]) => passed) ? 'PASS' : 'FAIL'} (freshness and real-row conditions are checked at the decision)`);
}

// --- save: holdout runs keep aggregates only ---
const saved = holdout ? summary : { ...summary, cases: results.map(({ id, challenge, pattern, mode, gold, jev, opus }) => ({ id, challenge, pattern, mode, gold, gold_verdict: goldVerdict(gold), jev, opus })) };
writeFileSync(join(setDir, `${runName}.json`), `${JSON.stringify(saved, null, 2)}\n`);
console.log(`saved ${join(setDir, `${runName}.json`)}`);
