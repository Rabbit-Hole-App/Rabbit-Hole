#!/usr/bin/env node
// scripts/interact/bench-blueprint.mjs (Brief 38, MVP 1): the whole run. The question "what changes a pendulum swing" at depth Deep (= detailed in the code) through Gemini 4 Hydrogen at four reasoning levels, in two arms:
//   plain   5 runs at each level, nothing varies: one blueprint call, the checker, one correction call where it finds problems
//   seeded  one quantities call per level (spec 7.8), dice with seeds 1 to 5 over the model's own control quantities (spec 8), one blueprint call per pick, the same checker (plus: relationship and quantities unchanged), one correction
// Every answer is saved EXACTLY as returned (the raw message text, even when it does not parse) under docs/features/interact/benchmarks/blueprint-mvp1/. Nothing is edited by hand or by code.
//   node scripts/interact/bench-blueprint.mjs --probe        one request at xhigh: the joined system text, the question and the real provider schema (spec 7.9); then stop
//   node scripts/interact/bench-blueprint.mjs [--cap-usd 20] [--concurrency 4] [--levels xhigh,high,medium,low]     the run; resumable (a finished call is skipped), a new call is not started once the cap is reached
// Hydrogen is a bench role of this script only: provider google, model gemini-4-hydrogen, the repo's Google endpoint (explanation-fast-chain.js CHAIN_ENDPOINTS), the request the openai-compatible adapter sends (strict
// json_schema, oneOf as anyOf, array and numeric bounds dropped by withoutBounds, enforced by the checker), reasoning_effort per level, 48,000 output tokens, 300 s, no temperature. GEMINI_API_KEY is read by name from
// small-deploy/.env and never printed. Cost is computed here: $1.50 per million input tokens, $7.50 per million output tokens, thinking counted as output. pricing-registry.js and every production setting are untouched.
import { parseArgs } from 'node:util';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { providerSchema, quantitiesProviderSchema } from '../../packages/web/src/interact-blueprint.js';
import { checkBlueprint } from '../../packages/web/src/interact-blueprint-check.js';
import { seededRandom } from '../../packages/web/src/tutor-diagrams/random.js';
import { blueprintPrompt, blueprintMessage, correctionMessage, quantitiesMessage, quantitiesPrompt, seededMessage } from '../../packages/control-plane/src/agents/interactive-blueprint/index.js';
import { exclusiveOneOfToAnyOf } from '../../packages/control-plane/src/interact-model-adapters.js';
import { CHAIN_ENDPOINTS, withoutBounds } from '../../packages/control-plane/src/explanation-fast-chain.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUT = join(REPO, 'docs/features/interact/benchmarks/blueprint-mvp1');
export const QUESTION = 'what changes a pendulum swing', DEPTH = 'detailed', LEVELS = ['xhigh', 'high', 'medium', 'low'], RUNS = 5;
export const HYDROGEN = Object.freeze({ provider: 'google', model: 'gemini-4-hydrogen', credentialRef: 'GEMINI_API_KEY', url: CHAIN_ENDPOINTS.google.url, maxOutputTokens: 48000, deadlineMs: 300000, usdPerMillionInput: 1.5, usdPerMillionOutput: 7.5 });
const ENV_FILE = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env';

// the key by name; the value is held in memory and never printed
const apiKey = () => { const line = readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).find(l => l.startsWith(`${HYDROGEN.credentialRef}=`)); const key = line?.slice(HYDROGEN.credentialRef.length + 1).trim().replace(/^["']|["']$/g, ''); if (!key) throw new Error(`${HYDROGEN.credentialRef} is not in the credentials file`); return key; };
const sleep = ms => new Promise(done => setTimeout(done, ms));
const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
const rel = path => path.replace(REPO.replace(/\\/g, '/') + '/', '').replace(/\\/g, '/');

// ---- the provider call --------------------------------------------------------------------------------------------------------------------------------------------------------------------
// -> { ok, status, text (the message content exactly as returned), finish, usage: { input, thinking, output, raw }, costUsd, seconds, served, error? }. One call = one model answer; a 429 or 5xx is retried twice (it produced no answer).
export async function hydrogenCall({ system, user, schema, level, key = apiKey(), fetchFn = fetch }) {
  const sent = exclusiveOneOfToAnyOf(withoutBounds(schema)), body = { model: HYDROGEN.model, stream: false, max_tokens: HYDROGEN.maxOutputTokens, reasoning_effort: level, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], response_format: { type: 'json_schema', json_schema: { name: 'return_result', strict: true, schema: sent } } };
  const started = performance.now();
  for (let attempt = 0; ; attempt++) {
    let response, raw;
    try { response = await fetchFn(HYDROGEN.url, { method: 'POST', signal: AbortSignal.timeout(HYDROGEN.deadlineMs), headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'rabbit-hole-blueprint-bench/1' }, body: JSON.stringify(body) }); raw = await response.text(); }
    catch (error) { return { ok: false, status: 0, text: null, error: `no answer: ${error.name}: ${error.message}`, seconds: (performance.now() - started) / 1000, costUsd: 0 }; }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) { await sleep(5000 * (attempt + 1)); continue; }
    const seconds = Math.round((performance.now() - started)) / 1000;
    if (!response.ok) return { ok: false, status: response.status, text: null, error: raw.slice(0, 1500), seconds, costUsd: 0 };
    const json = JSON.parse(raw), choice = json.choices?.[0], u = json.usage ?? {};
    const input = u.prompt_tokens ?? 0, completion = u.completion_tokens ?? 0, billedOut = Math.max(completion, (u.total_tokens ?? 0) - input), thinking = u.completion_tokens_details?.reasoning_tokens ?? Math.max(0, billedOut - completion);
    return { ok: true, status: 200, text: typeof choice?.message?.content === 'string' ? choice.message.content : '', finish: choice?.finish_reason ?? null, refusal: choice?.message?.refusal ?? null, served: json.model ?? null, seconds,
      usage: { input, thinking, output: billedOut - thinking, billedOutput: billedOut, raw: u }, costUsd: (input * HYDROGEN.usdPerMillionInput + billedOut * HYDROGEN.usdPerMillionOutput) / 1e6 };
  }
}

// Spec 7.9: if strict mode refuses the form of the schema, it may be re-expressed without changing which blueprints it accepts: a pair written as a two-item list, anyOf, an optional field as a nullable one. This is the
// re-expression used on a refusal, once: a tuple (zod's `items: [a, b]` with additionalItems false) becomes a two-item list whose items may be either (the checker still tests each position's kind).
export function pairsAsLists(node) {
  if (Array.isArray(node)) return node.map(pairsAsLists);
  if (!node || typeof node !== 'object') return node;
  const out = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, pairsAsLists(v)]));
  if (Array.isArray(out.items)) { out.items = { anyOf: out.items }; delete out.additionalItems; }
  return out;
}

// The schema the run sends: the real provider schema with its pairs written as two-item lists, the form strict mode accepted in the probe (the real form was refused: "items must be a boolean or an object").
export const sentSchema = () => pairsAsLists(providerSchema());

// ---- the dice (spec 8) --------------------------------------------------------------------------------------------------------------------------------------------------------------------
// n = the quantities the model marked "control": k is drawn evenly from 1 to min(3, n), then k of the n evenly, both from seededRandom(seed). A pick equal to an earlier seed's pick at the same level is rolled again, up to 20 times.
export function rollDice(controlIds, seeds, taken = []) {
  const n = controlIds.length, out = {};
  if (n === 0) return out;
  for (const seed of seeds) {
    const random = seededRandom(seed);
    let pick, rerolls = 0, repeat = false;
    for (;; rerolls++) {
      const k = 1 + Math.floor(random() * Math.min(3, n)), pool = [...controlIds];
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      pick = controlIds.filter(id => pool.slice(0, k).includes(id));
      if (![...taken, ...Object.values(out).map(entry => entry.ids)].some(other => other.join() === pick.join())) break;
      if (rerolls === 20) { repeat = true; break; }
    }
    out[seed] = { ids: pick, k: pick.length, rerolls, repeat };
  }
  return out;
}
export const settle = (given, ids) => ({ relationship: given.relationship, quantities: given.quantities.map(entry => (entry.role === 'control' && !ids.includes(entry.id) ? { ...entry, role: 'fixed' } : entry)) });

// ---- files and the run ------------------------------------------------------------------------------------------------------------------------------------------------------------------
const tryParse = text => { try { return { ok: true, value: JSON.parse(text) }; } catch (error) { return { ok: false, error: error.message }; } };
const readRaw = path => (existsSync(path) ? readFileSync(path, 'utf8') : null);
const rowsFile = () => join(OUT, 'rows.jsonl');
const spentBefore = () => (existsSync(rowsFile()) ? readFileSync(rowsFile(), 'utf8').split('\n').filter(Boolean).reduce((sum, line) => sum + (JSON.parse(line).costUsd ?? 0), 0) : 0);

export async function run({ capUsd = 20, concurrency = 4, levels = LEVELS, say = console.log } = {}) {
  const state = { spent: spentBefore(), skippedForCap: 0, calls: 0, stopped: false };
  const key = apiKey();
  const record = row => { appendFileSync(rowsFile(), `${JSON.stringify({ ts: new Date().toISOString(), ...row })}\n`); };
  // one model call: saves the raw answer and a row as soon as it returns; null when the cap stops it
  async function call({ arm, level, run: runId, kind, system, user, schema, file }) {
    if (state.spent >= capUsd) { state.skippedForCap++; state.stopped = true; return null; }
    state.calls++;
    const result = await hydrogenCall({ system, user, schema, level, key });
    state.spent += result.costUsd ?? 0;
    if (result.ok) write(file, result.text);
    else write(file.replace(/\.json$/, '.error.txt'), `HTTP ${result.status}\n${result.error ?? ''}\n`);
    record({ arm, level, run: runId, kind, seconds: result.seconds, status: result.status, finish: result.finish ?? null, tokens: result.usage ? { input: result.usage.input, thinking: result.usage.thinking, output: result.usage.output } : null, costUsd: result.costUsd, served: result.served ?? null, file: rel(file), ...(result.ok ? {} : { error: String(result.error).slice(0, 300) }), ...(result.refusal ? { refusal: result.refusal } : {}) });
    say(`${arm} ${level} ${runId} ${kind}: ${result.ok ? `${result.seconds}s, ${result.usage.input}+${result.usage.billedOutput} tokens, $${result.costUsd.toFixed(3)}` : `FAILED ${result.status} ${String(result.error).slice(0, 120)}`} (spent $${state.spent.toFixed(2)})`);
    return result;
  }
  const checkOf = async (text, seeded, name) => {
    const parsed = tryParse(text), result = parsed.ok ? await checkBlueprint(parsed.value, { seeded, light: true }) : { ok: false, failed: 1, problems: [{ check: 1, path: '', message: `The answer is not valid JSON (${parsed.error}).` }], measured: null };
    write(join(OUT, 'checks', `${name}.json`), `${JSON.stringify({ parsed: parsed.ok, ...result }, null, 2)}\n`);
    return result;
  };
  // one blueprint run: first answer, check, one correction where problems, check again. Finished files are skipped.
  async function blueprintRun({ arm, level, runId, system, first, seeded, schema }) {
    const base = `${arm}-${level}-${runId}`, firstFile = join(OUT, 'blueprints', `${base}.first.json`), fixedFile = join(OUT, 'blueprints', `${base}.corrected.json`);
    let text = readRaw(firstFile);
    if (text === null) { const result = await call({ arm, level, run: runId, kind: 'blueprint', system, user: first, schema, file: firstFile }); if (!result?.ok) return; text = result.text; }
    const checked = existsSync(join(OUT, 'checks', `${base}.first.json`)) ? JSON.parse(readFileSync(join(OUT, 'checks', `${base}.first.json`), 'utf8')) : await checkOf(text, seeded, `${base}.first`);
    if (checked.ok) return;
    let again = readRaw(fixedFile);
    if (again === null) {
      const user = correctionMessage(first, text, checked.problems.map(problem => problem.message));
      if (!existsSync(join(OUT, 'prompts', 'user-correction-example.txt'))) write(join(OUT, 'prompts', 'user-correction-example.txt'), user);
      const result = await call({ arm, level, run: runId, kind: 'correction', system, user, schema, file: fixedFile }); if (!result?.ok) return; again = result.text;
    }
    if (!existsSync(join(OUT, 'checks', `${base}.corrected.json`))) await checkOf(again, seeded, `${base}.corrected`);
  }
  const pool = async (jobs, limit) => { let next = 0; await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, async () => { while (next < jobs.length) await jobs[next++](); })); };

  mkdirSync(join(OUT, 'prompts'), { recursive: true });
  const SYSTEM = blueprintPrompt(DEPTH), QSYSTEM = quantitiesPrompt(DEPTH), USER = blueprintMessage(QUESTION, DEPTH), SCHEMA = sentSchema();
  write(join(OUT, 'prompts', 'system-blueprint.txt'), SYSTEM); write(join(OUT, 'prompts', 'system-quantities.txt'), QSYSTEM); write(join(OUT, 'prompts', 'user-blueprint.txt'), USER); write(join(OUT, 'prompts', 'user-quantities.txt'), quantitiesMessage(QUESTION, DEPTH));
  write(join(OUT, 'prompts', 'response-schema-blueprint.json'), `${JSON.stringify(SCHEMA, null, 2)}\n`); write(join(OUT, 'prompts', 'response-schema-quantities.json'), `${JSON.stringify(quantitiesProviderSchema(), null, 2)}\n`);
  say(`resuming with $${state.spent.toFixed(2)} already spent; cap $${capUsd}`);

  // plain arm first, so a cap that is reached cuts the seeded arm and not this one
  await pool(levels.flatMap(level => Array.from({ length: RUNS }, (_, k) => () => blueprintRun({ arm: 'plain', level, runId: k + 1, system: SYSTEM, first: USER, seeded: null, schema: SCHEMA }))), concurrency);

  // seeded arm: the quantities call per level, the dice, then one blueprint call per pick
  const draws = existsSync(join(OUT, 'draws.json')) ? JSON.parse(readFileSync(join(OUT, 'draws.json'), 'utf8')) : {}, given = {};
  await pool(levels.map(level => async () => {
    const file = join(OUT, 'quantities', `${level}.json`); let text = readRaw(file);
    if (text === null) { const result = await call({ arm: 'seeded', level, run: 'quantities', kind: 'quantities', system: QSYSTEM, user: quantitiesMessage(QUESTION, DEPTH), schema: quantitiesProviderSchema(), file }); if (!result?.ok) return; text = result.text; }
    const parsed = tryParse(text);
    if (parsed.ok && Array.isArray(parsed.value?.quantities) && parsed.value.relationship) given[level] = parsed.value; else draws[level] ??= { skipped: 'the quantities answer did not parse' };
  }), concurrency);
  for (const level of levels) {
    if (!given[level] || draws[level]?.picks) continue;
    const ids = given[level].quantities.filter(entry => entry.role === 'control').map(entry => entry.id);
    draws[level] = { controlQuantities: ids, n: ids.length, picks: rollDice(ids, [1, 2, 3, 4, 5]) };
    if (!ids.length) draws[level].skipped = 'the model marked no quantity as a control';
  }
  write(join(OUT, 'draws.json'), `${JSON.stringify(draws, null, 2)}\n`);
  const jobs = [];
  for (const level of levels) for (const [seed, pick] of Object.entries(draws[level]?.picks ?? {})) jobs.push(() => {
    const settled = settle(given[level] ?? JSON.parse(readFileSync(join(OUT, 'quantities', `${level}.json`), 'utf8')), pick.ids), first = seededMessage(QUESTION, DEPTH, settled);
    if (!existsSync(join(OUT, 'prompts', 'user-seeded-example.txt'))) write(join(OUT, 'prompts', 'user-seeded-example.txt'), first);
    return blueprintRun({ arm: 'seeded', level, runId: Number(seed), system: SYSTEM, first, seeded: settled, schema: SCHEMA });
  });
  await pool(jobs, concurrency);
  say(`done: ${state.calls} calls, $${state.spent.toFixed(2)} spent${state.stopped ? `; the cap stopped ${state.skippedForCap} calls (run again to resume only if the cap is raised)` : ''}`);
  return state;
}

// ---- the probe (spec 7.9): the real thing at xhigh ----------------------------------------------------------------------------------------------------------------------------------------
export async function probe({ say = console.log } = {}) {
  mkdirSync(join(OUT, 'prompts'), { recursive: true });
  const system = blueprintPrompt(DEPTH), user = blueprintMessage(QUESTION, DEPTH), key = apiKey();
  write(join(OUT, 'prompts', 'system-blueprint.txt'), system); write(join(OUT, 'prompts', 'user-blueprint.txt'), user);
  const attempts = [['the real provider schema', providerSchema()], ['pairs as two-item lists', pairsAsLists(providerSchema())]], log = [];
  for (const [name, schema] of attempts) {
    const result = await hydrogenCall({ system, user, schema, level: 'xhigh', key });
    const verdict = { schema: name, bytes: JSON.stringify(exclusiveOneOfToAnyOf(withoutBounds(schema))).length, ok: result.ok, status: result.status, seconds: result.seconds, finish: result.finish ?? null, served: result.served ?? null, usage: result.usage?.raw ?? null, tokens: result.usage ? { input: result.usage.input, thinking: result.usage.thinking, output: result.usage.output } : null, costUsd: result.costUsd, parsed: result.ok ? tryParse(result.text).ok : null, error: result.ok ? null : result.error, parameters: { url: HYDROGEN.url, model: HYDROGEN.model, reasoning_effort: 'xhigh', max_tokens: HYDROGEN.maxOutputTokens, response_format: 'json_schema, strict true' } };
    log.push(verdict); say(JSON.stringify(verdict, null, 2));
    if (result.ok) { write(join(OUT, 'prompts', 'probe-answer.json'), result.text); write(join(OUT, 'prompts', 'probe.json'), `${JSON.stringify({ accepted: name, attempts: log }, null, 2)}\n`); appendFileSync(rowsFile(), `${JSON.stringify({ ts: new Date().toISOString(), arm: 'probe', level: 'xhigh', run: 0, kind: 'probe', seconds: result.seconds, status: 200, finish: result.finish, tokens: verdict.tokens, costUsd: result.costUsd, file: 'blueprint-mvp1/prompts/probe-answer.json' })}\n`); return { accepted: true, attempt: name, log }; }
    if (result.status !== 400) break; // only a refusal of the schema's form is re-expressed; anything else stops here
  }
  write(join(OUT, 'prompts', 'probe.json'), `${JSON.stringify({ accepted: null, attempts: log }, null, 2)}\n`);
  return { accepted: false, log };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: a } = parseArgs({ options: { probe: { type: 'boolean' }, 'cap-usd': { type: 'string', default: '20' }, concurrency: { type: 'string', default: '4' }, levels: { type: 'string', default: LEVELS.join(',') } } });
  if (a.probe) { const result = await probe(); process.exitCode = result.accepted ? 0 : 2; }
  else { const state = await run({ capUsd: Number(a['cap-usd']), concurrency: Number(a.concurrency), levels: a.levels.split(',') }); process.exitCode = state.stopped ? 3 : 0; }
}
