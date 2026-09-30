#!/usr/bin/env node
// tests/evals/learn-grade/transport-ab.mjs
// Transport-only A/B on benchmark-v1 (docs/features/jev-grading.md): every
// case is graded through the Vercel AI Gateway and through direct TypeSafe by
// the same Worker grader, paired, alternating which arm goes first. No Opus.
// The holdout and any other set are refused.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { THRESHOLDS, GRADER_PROTOCOL_VERSION, JEV_TRANSPORTS, verdictFrom } from '../../../packages/control-plane/src/learn-grade-jev.js';
import { rate, percentile, prf, goldVerdict, verdictAccuracy } from './metrics.mjs';
import { validateSet } from './set-rules.mjs';

// TypeSafe's published Jev price per input token (docs.typesafe.ai/models,
// read 2026-09-28); output tokens are free. The direct API reports no cost.
const PRICE_PER_INPUT_TOKEN = 0.000000042;
const ARMS = ['gateway', 'direct'];

const HERE = new URL('.', import.meta.url);
const path = relative => new URL(relative, HERE).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, token, index, all) => (token.startsWith('--') ? [...pairs, [token.slice(2), all[index + 1]?.startsWith('--') || all[index + 1] === undefined ? 'true' : all[index + 1]]] : pairs), []));
const fail = (code, message) => { console.log(message); process.exit(code); };

const base = (args.base || '').replace(/\/$/, '');
const allowLocal = process.env.LEARN_BENCH_ALLOW_LOCAL === '1' && /^http:\/\/127\.0\.0\.1:\d+$/.test(base);
if (!/^https:\/\/small-cp-dev-[a-z0-9-]+\.zeroshothq\.workers\.dev$/.test(base) && !allowLocal) fail(1, `refusing ${base || '(no --base)'}: not a small-cp-dev-<name> clone`);
if (!args.app) fail(1, 'usage: transport-ab.mjs --base <clone url> --app <app name>');
if (args.holdout || (args['set-file'] && !allowLocal)) fail(1, 'refusing: the transport A/B runs on benchmark-v1 only');
const envFile = args['env-file'] || path('../../../../small-deploy/.env');
const secrets = Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).map(line => line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^"|"$/g, '').trim()]));
if (!secrets.SMALL_TEST_BYPASS || !secrets.LEARN_BENCH_SECRET) fail(1, `missing SMALL_TEST_BYPASS or LEARN_BENCH_SECRET in ${envFile}`);
const resultsDir = join(args['results-dir'] || path('./results'), 'transport-ab');
const minPerMode = allowLocal ? Number(args['min-per-mode'] || 30) : 30;

const set = JSON.parse(readFileSync(args['set-file'] || path('./benchmark-v1.json'), 'utf8'));
const problems = validateSet(set, { minPerMode });
if (problems.length) fail(1, `set problems:\n- ${problems.join('\n- ')}`);
const challenges = new Map(set.challenges.map(challenge => [challenge.id, challenge]));

mkdirSync(resultsDir, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const runName = [...'abcdefghijklmnopqrstuvwxyz'].map(letter => `transport-ab-${today}-${letter}`).find(name => !existsSync(join(resultsDir, `${name}.json`)));
if (!runName) fail(1, 'no free run name today');
console.log(`✓ target: ${base} · app ${args.app} · set benchmark-v1 · run ${runName} · ${set.cases.length} cases × ${ARMS.length} transports = ${set.cases.length * ARMS.length} Jev calls · no Opus`);
console.log(`✓ arms: ${ARMS.map(arm => `${arm} ${JEV_TRANSPORTS[arm].url} model ${JEV_TRANSPORTS[arm].model}`).join(' · ')}`);

const session = await (await fetch(`${base}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'jev-bench' }, body: JSON.stringify({ email: args.email || 'yudhisteer.chin@gmail.com', secret: secrets.SMALL_TEST_BYPASS }) })).json().catch(() => ({}));
if (!session.session) fail(1, 'no test session from /test/session');
const headers = { 'Content-Type': 'application/json', 'User-Agent': 'jev-bench', Cookie: `small_session=${session.session}`, 'X-Learn-Bench-Secret': secrets.LEARN_BENCH_SECRET };

// Mid-run stops unwind instead of calling process.exit(): exiting with a
// pooled socket open crashes Node on Windows (libuv UV_HANDLE_CLOSING).
class Stop extends Error {}
const stop = message => { throw new Stop(message); };

async function grade(item, transport) {
  const challenge = challenges.get(item.challenge);
  const body = { app: args.app, attempt_id: `${runName}:${transport}:${item.id}`, set: 'benchmark-v1', bench_run: runName, transport, block_id: null, board: null, mode: challenge.mode, prompt: challenge.prompt, expects: challenge.expects, answer: item.answer };
  const at = new Date().toISOString();
  const response = await fetch(`${base}/api/learn/grade/bench`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if ([400, 401, 403, 404, 503].includes(response.status)) stop(`${transport}: ${response.status} from the bench route: ${data.error || 'refused'}`);
  if (response.status !== 200) return { transport, at, error: data.status || `HTTP ${response.status}`, message: data.error || null, error_code: data.error_code ?? null, error_status: data.error_status ?? null };
  if (data.grader_protocol_version !== GRADER_PROTOCOL_VERSION) stop(`clone runs grader protocol ${data.grader_protocol_version}, local is ${GRADER_PROTOCOL_VERSION}: redeploy the clone`);
  if (data.transport !== transport) stop(`asked for ${transport}, the clone answered ${data.transport}: redeploy the clone`);
  const probabilities = { ideas: data.jev.ideas.map(idea => idea.p), misconception: data.jev.misconception, non_attempt: data.jev.non_attempt };
  return { transport, at, ...probabilities, verdict: verdictFrom(probabilities), ms: data.ms, model: data.model, input_tokens: data.input_tokens ?? null, cost_reported: data.cost ?? null, retries: data.retries ?? null };
}

const results = [];
try {
  for (const [index, item] of set.cases.entries()) {
    const order = index % 2 ? [...ARMS].reverse() : ARMS;
    const graded = {};
    for (const arm of order) graded[arm] = await grade(item, arm);
    results.push({ id: item.id, challenge: item.challenge, pattern: item.pattern, mode: challenges.get(item.challenge).mode, gold: item.gold, gold_verdict: goldVerdict(item.gold), first: order[0], ...graded });
  }
} catch (error) {
  if (!(error instanceof Stop)) throw error;
  console.log(error.message);
  process.exitCode = 1;
}

if (!process.exitCode) report();

function report() {

  // --- measures, per arm; a Jev error counts as a wrong verdict ---
  const mean = values => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
  function measure(arm) {
    const returned = results.filter(item => !item[arm].error);
    const ms = returned.map(item => item[arm].ms);
    const ideaItems = returned.flatMap(item => item.gold.ideas.map((gold, index) => ({ p: item[arm].ideas[index], gold })));
    const pick = item => (item[arm].error ? 'error' : item[arm].verdict);
    const injection = results.filter(item => item.pattern === 'injection');
    return {
      completed: rate(returned.length, results.length),
      timeouts: results.filter(item => /^Jev timed out/.test(item[arm].message || '')).length,
      other_errors: results.filter(item => item[arm].error && !/^Jev timed out/.test(item[arm].message || '')).length,
      ms: { p50: percentile(ms, 0.5), p90: percentile(ms, 0.9), p95: percentile(ms, 0.95), max: ms.length ? Math.max(...ms) : null, n: ms.length },
      accuracy: verdictAccuracy(results, pick),
      per_idea_at_yes: prf(ideaItems, THRESHOLDS.yes),
      injection_good: rate(injection.filter(item => pick(item) === 'good').length, injection.length),
      cost_computed: { mean: mean(returned.map(item => item[arm].input_tokens).filter(Number.isInteger).map(tokens => tokens * PRICE_PER_INPUT_TOKEN)), method: `input tokens × $${PRICE_PER_INPUT_TOKEN}/token (TypeSafe published price)` },
      cost_reported: { mean: mean(returned.map(item => item[arm].cost_reported).filter(Number.isFinite)), n: returned.filter(item => Number.isFinite(item[arm].cost_reported)).length },
      models: [...new Set(returned.map(item => item[arm].model))],
      retries_429: results.filter(item => item[arm].retries > 0).length,
      error_statuses: [...new Set(results.filter(item => item[arm].error).map(item => `${item[arm].error_code ?? '-'} ${item[arm].error_status ?? '-'}`))],
    };
  }
  const both = item => !item.gateway.error && !item.direct.error;
  const summary = {
    run: runName, date: today, set: 'benchmark-v1', app: args.app, base, grader_protocol_version: GRADER_PROTOCOL_VERSION, thresholds: { ...THRESHOLDS },
    arms: Object.fromEntries(ARMS.map(arm => [arm, { url: JEV_TRANSPORTS[arm].url, requested_model: JEV_TRANSPORTS[arm].model, ...measure(arm) }])),
    paired: {
      both_returned: results.filter(both).length,
      only_gateway: results.filter(item => !item.gateway.error && item.direct.error).length,
      only_direct: results.filter(item => item.gateway.error && !item.direct.error).length,
      neither: results.filter(item => item.gateway.error && item.direct.error).length,
      verdict_disagreements: results.filter(item => both(item) && item.gateway.verdict !== item.direct.verdict).map(item => item.id),
    },
  };

  // --- print ---
  const pr = r => `P ${r.precision?.toFixed(3) ?? '-'} R ${r.recall?.toFixed(3) ?? '-'} F1 ${r.f1?.toFixed(3) ?? '-'}`;
  for (const arm of ARMS) {
    const m = summary.arms[arm];
    console.log(`${arm}: completed ${m.completed.k} / ${m.completed.n} · timeouts ${m.timeouts} · other errors ${m.other_errors} · 429 retries ${m.retries_429} · ms p50 ${m.ms.p50} p90 ${m.ms.p90} p95 ${m.ms.p95} max ${m.ms.max} · accuracy ${m.accuracy.k} / ${m.accuracy.n} (${m.accuracy.pct}%) · per-idea @${THRESHOLDS.yes} ${pr(m.per_idea_at_yes)} · injection good ${m.injection_good.k} / ${m.injection_good.n} · cost $${m.cost_computed.mean ?? '-'} computed, $${m.cost_reported.mean ?? '-'} reported (n ${m.cost_reported.n}) · models ${m.models.join(', ') || '-'}`);
  }
  const p = summary.paired;
  console.log(`paired: both ${p.both_returned} · only gateway ${p.only_gateway} · only direct ${p.only_direct} · neither ${p.neither} · verdict disagreements ${p.verdict_disagreements.length}${p.verdict_disagreements.length ? ` (${p.verdict_disagreements.join(', ')})` : ''}`);

  writeFileSync(join(resultsDir, `${runName}.json`), `${JSON.stringify({ ...summary, cases: results }, null, 2)}\n`);
  console.log(`saved ${join(resultsDir, `${runName}.json`)}`);
}
