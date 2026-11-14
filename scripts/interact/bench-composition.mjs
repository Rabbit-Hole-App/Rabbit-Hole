// Brief 23: can a model write the scene composition? One call per prompt (no correction) per model, stepper mechanism, scored against the nine hand-drawn references.
//   node scripts/interact/bench-composition.mjs [--models a,b] [--n N] [--extra] [--concurrency 2] [--cap-usd 25] [--cap-model-usd 8] [--resume] [--scripted] [--report] [--dir <save dir>]
// Models: claude-opus-5-5 (effort high), gpt-6.1-sol (reasoning high), claude-sonnet-5-5, gemini-3.5-flash-lite. Prompt set A: the 44 bench-coverage rows both classifiers put in stepper-states (depths round robin
// in file order); set B: the three reference subjects at all three depths (9); the answer key (the nine composition.json references) is never in the model input (only the part and control KIND names are).
// Saved per call BEFORE scoring: docs/features/interact/benchmarks/bench-composition/<model>/<promptId>-<depth>.json. --report rebuilds bench-composition.jsonl and .md from those files.
// Keys are read BY NAME from small-deploy/.env (ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY) and never printed or written.
import { parseArgs } from 'node:util';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { priceUsage } from '../../packages/control-plane/src/pricing-registry.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REFS = join(REPO, 'docs/features/interact/references'), GUIDE = join(REPO, 'docs/features/interact/scene-composition-guide.md'), SCORECARD = join(REPO, 'docs/features/interact/scene-composition-scorecard.md');
export const COVERAGE = join(REPO, 'docs/features/interact/benchmarks/bench-coverage.jsonl'), BENCH_DIR = join(REPO, 'docs/features/interact/benchmarks'), SAVE_DIR = join(BENCH_DIR, 'bench-composition');
const ENV_FILE = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env';
const UA = 'rabbit-hole-owner-bench/1';

export const MODELS = Object.freeze([
  { id: 'claude-opus-5-5', provider: 'anthropic', effort: 'high' },
  { id: 'gpt-6.1-sol', provider: 'openai', reasoning: 'high' },
  { id: 'claude-sonnet-5-5', provider: 'anthropic' },
  { id: 'gemini-3.5-flash-lite', provider: 'google' },
]);
export const DEPTHS = Object.freeze(['brief', 'balanced', 'detailed']);
const REF_PREFIX = { brief: 'overview', balanced: 'standard', detailed: 'deep' };
export const SUBJECTS = Object.freeze([{ id: 'merge-sort', request: 'how does merge sort work?' }, { id: 'tcp-handshake', request: 'how does the TCP handshake work?' }, { id: 'mitosis', request: 'what happens during mitosis?' }]);
export const WATER = Object.freeze({ id: 'x-water-cycle', set: 'X', request: 'how does the water cycle work?', depth: 'balanced' });
const STEPPER_CRITERION = 'A process shown as a sequence of discrete states or steps that the learner advances one at a time (an algorithm, a protocol, a cycle).'; // scripts/interact/bench-coverage.mjs: no stepper family module on this branch

// ---- the answer key and what may be derived from it (kind names only) ----
export const refFile = (subject, depth) => join(REFS, `${REF_PREFIX[depth]}-stepper-${subject}.composition.json`);
export const loadReference = (subject, depth) => JSON.parse(readFileSync(refFile(subject, depth), 'utf8'));
export function loadReferences() { return readdirSync(REFS).filter(f => f.endsWith('.composition.json')).map(f => JSON.parse(readFileSync(join(REFS, f), 'utf8'))); }
export function partsSpec(refs = loadReferences()) {
  const parts = {}, controls = new Set();
  for (const r of refs) { for (const p of r.parts) { parts[p.kind] ??= new Set(); Object.keys(p.bind ?? {}).forEach(k => parts[p.kind].add(k)); } r.controls.forEach(c => controls.add(c.kind)); }
  return { parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, [...v].sort()])), controls: [...controls].sort() };
}
export function partsBlock(spec = partsSpec()) {
  return ['## PARTS (the tested renderer parts and controls; use only these kinds)', ...Object.entries(spec.parts).map(([kind, binds]) => `- part \`${kind}\`: bind keys ${binds.map(b => `\`${b}\``).join(', ')}`), `- control kinds: ${spec.controls.map(c => `\`${c}\``).join(', ')}`].join('\n');
}
export const LIMITS = ['## LIMITS', '- states <= 12 per variant; regions <= 16 per variant; each region is { id, label, values | phases | actors } with no geometry.', '- every sentence <= 24 words; story <= 60 words; the whole reply <= 6000 tokens.',
  '- every bind is a path into variant.*, inputs.* (a control id), state.* or previous.*; aha.stateId names one of the states; exactly one index control bound to variant.states and at most one parameter control besides reset.'].join('\n');
export function systemFor(guide = readFileSync(GUIDE, 'utf8'), spec = partsSpec()) {
  return [guide, '', partsBlock(spec), '', `## The family (stepper-states)\n${STEPPER_CRITERION}`, '', LIMITS, '', 'Reply with the composition only, in the shape of the tool/schema: story, aha, layout, parts, controls, data.variants[].'].join('\n');
}

// ---- the prompts ----
export function promptList(rows) {
  const a = rows.filter(r => r.jevTop === 'stepper-states' && r.sonnetChoice === 'stepper-states').map((r, i) => ({ id: `a${String(i + 1).padStart(2, '0')}`, set: 'A', request: r.prompt, depth: DEPTHS[i % 3], source: `${r.set}/${r.id}` }));
  const b = SUBJECTS.flatMap(s => DEPTHS.map(depth => ({ id: `b-${s.id}`, set: 'B', request: s.request, depth, subject: s.id })));
  return [...a, ...b];
}
export const loadPrompts = () => promptList(readFileSync(COVERAGE, 'utf8').trim().split('\n').map(l => JSON.parse(l)));

// ---- the schema (the reference files' top-level shape; permissive where the references vary) ----
const str = { type: 'string' }, strs = { type: 'array', items: str };
export function compositionSchema(spec = partsSpec()) {
  const bind = { type: 'object', properties: Object.fromEntries([...new Set(Object.values(spec.parts).flat())].map(k => [k, str])) };
  const region = { type: 'object', properties: { id: str, label: str, kind: str, values: strs, phases: strs, actors: strs }, required: ['id', 'label'] };
  const state = { type: 'object', properties: { id: str, label: str, short: str, sentence: str, why: str, active: strs, calloutRegion: str, readouts: { type: 'array', items: { type: 'object', properties: { id: str, label: str, value: str }, required: ['id', 'label', 'value'] } } }, required: ['id', 'label', 'sentence'] };
  return { type: 'object', properties: {
    story: str, aha: { type: 'object', properties: { stateId: str, observation: str }, required: ['stateId', 'observation'] }, layout: { type: 'object', properties: { preset: str, width: { type: 'number' } }, required: ['preset', 'width'] },
    parts: { type: 'array', items: { type: 'object', properties: { id: str, kind: { type: 'string', enum: Object.keys(spec.parts) }, presentation: str, bind }, required: ['id', 'kind', 'bind'] } },
    controls: { type: 'array', items: { type: 'object', properties: { id: str, kind: { type: 'string', enum: spec.controls }, presentation: str, items: str, default: { type: 'number' }, label: str, options: strs }, required: ['id', 'kind'] } },
    data: { type: 'object', properties: { variants: { type: 'array', items: { type: 'object', properties: { label: str, regions: { type: 'array', items: region }, links: { type: 'array', items: { type: 'object', properties: { from: str, to: str, label: str }, required: ['from', 'to'] } }, states: { type: 'array', items: state } }, required: ['regions', 'states'] } } }, required: ['variants'] },
  }, required: ['story', 'aha', 'layout', 'parts', 'controls', 'data'] };
}

// ---- scoring A, B, D (code only) ----
const variantOf = c => c?.data?.variants?.[0] ?? null;
export function scoreA(c, spec = partsSpec()) {
  const problems = [];
  if (!c || typeof c !== 'object') return { ok: false, problems: ['does not parse to an object'] };
  for (const k of ['story', 'aha', 'layout', 'parts', 'controls', 'data']) if (c[k] === undefined) problems.push(`missing ${k}`);
  if (!Array.isArray(c.parts) || !Array.isArray(c.controls) || !Array.isArray(c.data?.variants) || !c.data.variants.length) problems.push('parts, controls and data.variants must be non-empty lists');
  else {
    for (const p of c.parts) if (!(p?.kind in spec.parts)) problems.push(`part kind "${p?.kind}" is not a tested part`);
    for (const k of c.controls) if (!spec.controls.includes(k?.kind)) problems.push(`control kind "${k?.kind}" is not a tested control`);
    const idx = c.controls.filter(k => k?.kind === 'index'), params = c.controls.filter(k => k && !['index', 'reset'].includes(k.kind));
    if (idx.length !== 1 || idx[0]?.items !== 'variant.states') problems.push(`exactly one index control bound to variant.states is required (found ${idx.length}${idx.length === 1 ? `, bound to ${idx[0].items}` : ''})`);
    if (params.length > 1) problems.push(`at most one parameter control besides reset (found ${params.length})`);
  }
  return { ok: problems.length === 0, problems };
}
export function scoreB(c) {
  const problems = [], v = variantOf(c);
  if (!v || !Array.isArray(c.parts) || !Array.isArray(c.controls)) return { ok: false, problems: ['no composition data to resolve binds against'] };
  const stateKeys = new Set((v.states ?? []).flatMap(s => Object.keys(s ?? {}))), inputIds = new Set(c.controls.map(k => k?.id));
  const resolves = path => {
    const [root, key] = String(path).split('.');
    if (root === 'variant') return v[key] !== undefined;
    if (root === 'state' || root === 'previous') return stateKeys.has(key);
    if (root === 'inputs') return inputIds.has(key);
    return false;
  };
  for (const p of c.parts) for (const [k, path] of Object.entries(p?.bind ?? {})) if (!resolves(path)) problems.push(`part ${p.id} bind ${k}: "${path}" does not resolve`);
  for (const k of c.controls) if (k?.items !== undefined && !resolves(k.items)) problems.push(`control ${k.id} items: "${k.items}" does not resolve`);
  if (!(v.states ?? []).some(s => s?.id === c.aha?.stateId)) problems.push(`aha.stateId "${c.aha?.stateId}" names no state`);
  return { ok: problems.length === 0, problems };
}
const multiset = xs => [...xs].sort().join(',');
export function scoreD(c, ref) {
  const v = variantOf(c), rv = variantOf(ref);
  if (!v || !rv) return { partsKinds: false, controlKinds: false, stateCount: false, storyNamesRegions: false, ahaIndex: false };
  const story = String(c.story ?? '').toLowerCase(), indexOf = (comp, vv) => (vv.states ?? []).findIndex(s => s?.id === comp.aha?.stateId);
  return {
    partsKinds: multiset((c.parts ?? []).map(p => p?.kind)) === multiset(ref.parts.map(p => p.kind)),
    controlKinds: multiset((c.controls ?? []).map(k => k?.kind)) === multiset(ref.controls.map(k => k.kind)),
    stateCount: Math.abs((v.states ?? []).length - rv.states.length) <= 1,
    storyNamesRegions: rv.regions.every(r => story.includes(String(r.label).toLowerCase())),
    ahaIndex: indexOf(c, v) >= 0 && indexOf(c, v) === indexOf(ref, rv),
  };
}

// ---- scoring C: the scorecard, Sonnet, lines 1,2,3,4,6,7,8 (5, 9, 10 need a render: Unknown) ----
export const CARD_LINES = Object.freeze([1, 2, 3, 4, 6, 7, 8]), UNKNOWN_LINES = Object.freeze([5, 9, 10]);
export function scorecardRows(text = readFileSync(SCORECARD, 'utf8')) {
  return Object.fromEntries(text.split(/\r?\n/).map(l => /^\| (\d+) \| (.+?) \| (.+?) \|$/.exec(l)).filter(Boolean).map(m => [Number(m[1]), `${m[2]} Evidence for Yes: ${m[3]}`]));
}
const cardTool = { name: 'scorecard', description: 'Answer each check Yes or No with one sentence.', input_schema: { type: 'object', properties: Object.fromEntries(CARD_LINES.map(n => [`l${n}`, { type: 'object', properties: { answer: { type: 'string', enum: ['Yes', 'No'] }, reason: str }, required: ['answer', 'reason'] }])), required: CARD_LINES.map(n => `l${n}`) } };
export const cardSystem = rows => ['You review a model-composed stepper scene against a rubric. You see only the composition data (no render). For each check answer Yes or No after inspecting the data, with one sentence. Call the scorecard tool once.', '', ...CARD_LINES.map(n => `${n}. ${rows[n]}`)].join('\n');

// ---- transports (one call each; no correction) ----
export const readEnv = (file = ENV_FILE) => Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map(l => /^\s*(ANTHROPIC_API_KEY|ANTHROPIC_WORKSPACE_ID|GEMINI_API_KEY|OPENAI_API_KEY)\s*=\s*(.*)$/.exec(l)).filter(Boolean).map(m => [m[1], m[2].trim().replace(/^["']|["']$/g, '')]));
const anthropicHeaders = env => ({ 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json', 'User-Agent': UA, ...(env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID } : {}) });
async function post(url, headers, body, timeoutMs) {
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const text = await r.text();
  if (!r.ok) { const e = new Error(`${new URL(url).host} http ${r.status}: ${text.slice(0, 400)}`); e.status = r.status; throw e; }
  return JSON.parse(text);
}
export const usdOf = (provider, model, quantities) => { const p = priceUsage({ provider, model, quantities }); return p ? p.micros / 1e6 : null; };
export async function composeCall(model, { system, request, depth, schema, env }) {
  const user = JSON.stringify({ request, depth }), started = Date.now();
  if (model.provider === 'anthropic') {
    const tool = { name: 'return_composition', description: 'Return the scene composition.', input_schema: schema };
    const j = await post('https://api.anthropic.com/v1/messages', anthropicHeaders(env), { model: model.id, max_tokens: 16000, system: `${system}\n\nAnswer by calling the return_composition tool once.`, tools: [tool], tool_choice: { type: 'auto' }, messages: [{ role: 'user', content: user }], ...(model.effort ? { output_config: { effort: model.effort } } : {}) }, 600000);
    const out = j.content?.find(b => b.type === 'tool_use')?.input ?? null;
    return { ms: Date.now() - started, raw: JSON.stringify(out ?? j.content ?? null), composition: out, usage: { input: j.usage?.input_tokens ?? 0, output: j.usage?.output_tokens ?? 0 }, usd: usdOf('anthropic', model.id, { input: j.usage?.input_tokens ?? 0, output: j.usage?.output_tokens ?? 0 }), stop: j.stop_reason };
  }
  const url = model.provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', key = model.provider === 'openai' ? env.OPENAI_API_KEY : env.GEMINI_API_KEY;
  const j = await post(url, { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': UA }, { model: model.id, ...(model.provider === 'openai' ? { max_completion_tokens: 24000, reasoning_effort: model.reasoning } : { max_tokens: 8000 }),
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }], response_format: { type: 'json_schema', json_schema: { name: 'composition', strict: false, schema } } }, 600000);
  const text = j.choices?.[0]?.message?.content ?? '', u = j.usage ?? {}, cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  let composition = null; try { composition = JSON.parse(text); } catch { /* scored as a parse failure */ }
  const q = model.provider === 'openai' ? { input: (u.prompt_tokens ?? 0) - cached, output: u.completion_tokens ?? 0, cache_read: cached } : { input: u.prompt_tokens ?? 0, output: u.completion_tokens ?? 0 };
  return { ms: Date.now() - started, raw: text, composition, usage: { input: u.prompt_tokens ?? 0, output: u.completion_tokens ?? 0 }, usd: usdOf(model.provider, model.id, q), stop: j.choices?.[0]?.finish_reason };
}
export async function scorecardCall(composition, depth, { env, rows }) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const j = await post('https://api.anthropic.com/v1/messages', anthropicHeaders(env), { model: 'claude-sonnet-5-5', max_tokens: 1500, thinking: { type: 'between_tools' }, system: cardSystem(rows), tools: [cardTool], messages: [{ role: 'user', content: JSON.stringify({ depth, composition }) }] }, 180000); // Sonnet 5.5 refuses a forced tool_choice: the tool is asked for in the system text
      const out = j.content?.find(b => b.type === 'tool_use')?.input;
      if (!CARD_LINES.every(n => ['Yes', 'No'].includes(out?.[`l${n}`]?.answer))) throw new Error('scorecard reply incomplete');
      return { lines: Object.fromEntries([...CARD_LINES.map(n => [n, out[`l${n}`]]), ...UNKNOWN_LINES.map(n => [n, { answer: 'Unknown', reason: 'needs a render' }])]), usd: usdOf('anthropic', 'claude-sonnet-5-5', { input: j.usage?.input_tokens ?? 0, output: j.usage?.output_tokens ?? 0 }) };
    } catch (error) { if (attempt) return { lines: null, error: String(error.message).slice(0, 300), usd: 0 }; }
  }
}

// ---- the saved call files and the rows ----
export const callFile = (dir, model, p) => join(dir, model, `${p.id}-${p.depth}.json`);
const readJson = f => JSON.parse(readFileSync(f, 'utf8'));
export function scoreRow(saved, spec = partsSpec()) {
  const c = saved.composition, ref = saved.set === 'B' ? loadReference(saved.subject, saved.depth) : null;
  return { model: saved.model, promptId: saved.promptId, set: saved.set, depth: saved.depth, request: saved.request, ms: saved.ms, usd: saved.usd, inputTokens: saved.usage?.input ?? null, outputTokens: saved.usage?.output ?? null, error: saved.error ?? null,
    A: scoreA(c, spec), B: scoreB(c), C: saved.scores?.C ?? null, D: ref ? scoreD(c, ref) : null, cardUsd: saved.scores?.cardUsd ?? 0 };
}
export const yesCount = row => (row.C?.lines ? CARD_LINES.filter(n => row.C.lines[n]?.answer === 'Yes').length : null);
export const median = xs => { const s = xs.filter(x => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
export function summarize(rows) {
  const main = rows.filter(r => r.set !== 'X'), pct = (n, d) => (d ? Math.round((100 * n) / d) : null), yes = main.map(yesCount).filter(n => n !== null);
  return { reached: main.length, schemaPct: pct(main.filter(r => r.A.ok).length, main.length), bindsPct: pct(main.filter(r => r.B.ok).length, main.length), meanYes: yes.length ? Math.round((10 * yes.reduce((a, b) => a + b, 0)) / yes.length) / 10 : null,
    medianMs: median(main.map(r => r.ms)), usd: Math.round(1e4 * rows.reduce((a, r) => a + (r.usd ?? 0), 0)) / 1e4, cardUsd: Math.round(1e4 * rows.reduce((a, r) => a + (r.cardUsd ?? 0), 0)) / 1e4, errors: main.filter(r => r.error).length };
}
export function reportMarkdown(rows, { saveDir = SAVE_DIR, models = MODELS.map(m => m.id), spec = partsSpec() } = {}) {
  const tick = b => (b ? '✓' : '✗'), out = ['# bench-composition: can a model write the stepper scene composition?', '', 'One call per prompt, no correction. Set A: 44 stepper prompts (depths round robin 15/15/14); set B: the three reference subjects at three depths (9). A, B, D are code; C is claude-sonnet-5-5 on rubric lines 1, 2, 3, 4, 6, 7, 8 (lines 5, 9, 10 need a render: Unknown). Prompt 54 (water cycle) is outside the 53.', ''];
  for (const model of models) {
    const mine = rows.filter(r => r.model === model);
    if (!mine.length) { out.push(`## ${model}`, '', 'not run.', ''); continue; }
    const s = summarize(mine);
    out.push(`## ${model}`, '', '| calls reached of 53 | schema % | binds % | mean Yes of 7 | median ms | composer USD | scorecard USD | errors |', '|---|---|---|---|---|---|---|---|', `| ${s.reached} | ${s.schemaPct ?? '-'} | ${s.bindsPct ?? '-'} | ${s.meanYes ?? '-'} | ${s.medianMs ?? '-'} | ${s.usd} | ${s.cardUsd} | ${s.errors} |`, '',
      '| reference row | parts kinds | control kinds | state count ±1 | story names regions | aha index |', '|---|---|---|---|---|---|');
    for (const r of mine.filter(r => r.set === 'B')) out.push(`| ${r.promptId.replace('b-', '')} ${r.depth} | ${r.D ? [r.D.partsKinds, r.D.controlKinds, r.D.stateCount, r.D.storyNamesRegions, r.D.ahaIndex].map(tick).join(' | ') : '- | - | - | - | -'} |`);
    out.push('');
  }
  out.push('## "how does the water cycle work?" at balanced, each model, in full', '');
  for (const model of models) {
    const f = join(saveDir, model, `${WATER.id}-${WATER.depth}.json`);
    out.push(`### ${model}`, '');
    if (!existsSync(f)) { out.push('not run.', ''); continue; }
    const saved = readJson(f), row = scoreRow(saved, spec);
    out.push(`A ${row.A.ok ? 'pass' : `fail (${row.A.problems.join('; ')})`}; B ${row.B.ok ? 'pass' : `fail (${row.B.problems.join('; ')})`}; Yes ${yesCount(row) ?? '-'} of 7; ${saved.ms} ms; US$${saved.usd}`, '', '```json', JSON.stringify(saved.composition, null, 1), '```', '');
  }
  return out.join('\n');
}
export function loadRows(saveDir = SAVE_DIR, models = MODELS.map(m => m.id), spec = partsSpec()) {
  const rows = [];
  for (const m of models) { const d = join(saveDir, m); if (!existsSync(d)) continue; for (const f of readdirSync(d).filter(x => x.endsWith('.json')).sort()) rows.push(scoreRow(readJson(join(d, f)), spec)); }
  return rows;
}
export function writeReport(saveDir = SAVE_DIR, outDir = BENCH_DIR) {
  const rows = loadRows(saveDir);
  writeFileSync(join(outDir, 'bench-composition.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
  writeFileSync(join(outDir, 'bench-composition.md'), reportMarkdown(rows, { saveDir }) + '\n');
  return rows.length;
}

// ---- the scripted proof: fabricated replies through every scorer, no network ----
export function scriptedReply(p) {
  if (p.set === 'B' || p.set === 'X') { const r = loadReference(p.subject ?? 'merge-sort', p.depth); const { schemaVersion, status, id, family, depth, canonical, ...c } = r; return c; }
  const r = loadReference('tcp-handshake', 'brief'), { schemaVersion, status, id, family, depth, canonical, ...c } = r; return c;
}

// ---- the run ----
async function pool(items, concurrency, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => { while (next < items.length) { const i = next++; await fn(items[i]); } }));
}
export async function runModel(model, prompts, { env, system, schema, rows, dir, concurrency, capModel, capTotal, shared, resume, scripted, log = console.log }) {
  let spent = 0, failures = 0, stopped = null, reached = 0;
  await pool(prompts, concurrency, async p => {
    if (stopped || shared.total >= capTotal) { stopped ??= 'cap-usd'; return; }
    const file = callFile(dir, model.id, p);
    mkdirSync(dirname(file), { recursive: true });
    let saved = resume && existsSync(file) ? readJson(file) : null;
    if (!saved) {
      try {
        const call = scripted ? { ms: 1, raw: '{}', composition: scriptedReply(p), usage: { input: 1, output: 1 }, usd: 0 } : await composeCall(model, { system, request: p.request, depth: p.depth, schema, env });
        saved = { model: model.id, promptId: p.id, set: p.set, subject: p.subject ?? null, depth: p.depth, request: p.request, ts: new Date().toISOString(), ...call };
      } catch (error) {
        saved = { model: model.id, promptId: p.id, set: p.set, subject: p.subject ?? null, depth: p.depth, request: p.request, ts: new Date().toISOString(), ms: null, usd: 0, composition: null, error: String(error.message).slice(0, 500) };
        if (error.status >= 400 && error.status < 500 && error.status !== 429 && ++failures >= 2 && reached === 0) stopped = `skipped: ${saved.error}`;
      }
      writeFileSync(file, JSON.stringify(saved, null, 1)); // before any scoring
    }
    reached++; spent += saved.usd ?? 0; shared.total += saved.usd ?? 0;
    if (saved.composition && !saved.scores?.C) {
      const c = scripted ? { lines: Object.fromEntries([...CARD_LINES, ...UNKNOWN_LINES].map(n => [n, { answer: UNKNOWN_LINES.includes(n) ? 'Unknown' : 'Yes', reason: 'scripted' }])), usd: 0 } : await scorecardCall(saved.composition, saved.depth, { env, rows: shared.cardRows });
      shared.total += c.usd ?? 0; saved.scores = { C: c.lines ? { lines: c.lines } : { lines: null, error: c.error }, cardUsd: c.usd ?? 0 };
      writeFileSync(file, JSON.stringify(saved, null, 1));
    }
    rows.push(scoreRow(saved));
    log(`${model.id} ${p.id}/${p.depth} ${saved.error ? `ERROR ${saved.error.slice(0, 120)}` : `${saved.ms} ms US$${(saved.usd ?? 0).toFixed(3)}`} (model US$${spent.toFixed(2)}, total US$${shared.total.toFixed(2)})`);
    if (spent >= capModel) stopped ??= 'cap-model-usd';
  });
  return { model: model.id, reached, spent: Math.round(spent * 1e4) / 1e4, stopped };
}

async function main() {
  const { values: v } = parseArgs({ options: { models: { type: 'string' }, n: { type: 'string' }, extra: { type: 'boolean' }, concurrency: { type: 'string', default: '2' }, 'cap-usd': { type: 'string', default: '25' }, 'cap-model-usd': { type: 'string', default: '8' }, resume: { type: 'boolean' }, scripted: { type: 'boolean' }, report: { type: 'boolean' }, dir: { type: 'string' } } });
  const dir = v.dir ?? (v.scripted ? mkdtempSync(join(tmpdir(), 'bench-composition-')) : SAVE_DIR);
  if (v.report) { console.log(`${writeReport(dir)} rows -> bench-composition.jsonl and bench-composition.md`); return; }
  const wanted = v.models ? v.models.split(',') : MODELS.map(m => m.id), models = wanted.map(id => MODELS.find(m => m.id === id)); if (models.includes(undefined)) throw new Error(`unknown model in ${v.models}; known: ${MODELS.map(m => m.id).join(', ')}`);
  const spec = partsSpec(), all = loadPrompts(), prompts = [...(v.n ? all.slice(0, Number(v.n)) : all), ...(!v.n || v.extra ? [{ ...WATER, subject: null }] : [])];
  const env = v.scripted ? {} : readEnv(), system = systemFor(readFileSync(GUIDE, 'utf8'), spec), schema = compositionSchema(spec), shared = { total: 0, cardRows: scorecardRows() }, rows = [];
  const missing = models.filter(m => !v.scripted && !env[{ anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', google: 'GEMINI_API_KEY' }[m.provider]]);
  if (missing.length) console.log(`no key for ${missing.map(m => m.id).join(', ')}: skipped (key not in the env file)`);
  const results = await Promise.all(models.filter(m => !missing.includes(m)).map(m => runModel(m, prompts, { env, system, schema, rows, dir, concurrency: Number(v.concurrency), capModel: Number(v['cap-model-usd']), capTotal: Number(v['cap-usd']), shared, resume: v.resume || v.scripted, scripted: v.scripted })));
  console.log(JSON.stringify({ results, totalUsd: Math.round(shared.total * 1e4) / 1e4, dir: v.scripted ? dir : undefined }));
  if (!v.scripted) writeReport(dir);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
