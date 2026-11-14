#!/usr/bin/env node
// scripts/interact/bench-coverage.mjs (owner 2026-11-14 02:55): which scene mechanism would each bench prompt need? Every unique prompt of scripts/explain-bench/sets/*.json is classified into one of six
// mechanisms or `none` by (1) JEV (the pick module's transport, interact-design-pick.js pickFamily, one choice question with seven criteria, 3 repeats) and (2) claude-sonnet-5-5 once (a forced tool call:
// the choice and one sentence of reason). Measurement only: no template or family is built from it. No Opus. Keys BY NAME from small-deploy/.env, never printed.
//   node scripts/interact/bench-coverage.mjs [--limit N] [--repeats 3] [--concurrency 4] [--cap-usd 1] [--dry] [--no-write]
//   node scripts/interact/bench-coverage.mjs --report      (docs/features/interact/benchmarks/bench-coverage.jsonl -> bench-coverage.md)
import { parseArgs } from 'node:util';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickFamily } from '../../packages/control-plane/src/interact-design-pick.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SETS_DIR = join(REPO, 'scripts/explain-bench/sets'), BENCH_DIR = join(REPO, 'docs/features/interact/benchmarks');
export const OUT = join(BENCH_DIR, 'bench-coverage.jsonl'), REPORT = join(BENCH_DIR, 'bench-coverage.md');
const ENV_FILE = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', SONNET = 'claude-sonnet-5-5', SONNET_USD_PER_MTOK = { in: 2, out: 10 }; // pricing-registry.js: anthropic('claude-sonnet-5-5', 2, 10, ...)
export const MECHANISMS = Object.freeze([
  { id: 'curve-sliders', pickCriterion: 'One quantity as a function of another, drawn as a curve whose shape a few parameters change; no motion over time.' },
  { id: 'scene-over-time', pickCriterion: 'Something moving or changing continuously with time (a body, a charge, a signal, a population) played or scrubbed on a timeline with a few controls.' },
  { id: 'stepper-states', pickCriterion: 'A process shown as a sequence of discrete states or steps that the learner advances one at a time (an algorithm, a protocol, a cycle).' },
  { id: 'graph-active-path', pickCriterion: 'A network of nodes and edges where one path, flow or message is highlighted as it moves through the structure.' },
  { id: 'grid-highlights', pickCriterion: 'A grid or table of values (a matrix, a board, a confusion table, an image patch) where cells are highlighted, combined or filled.' },
  { id: 'before-after', pickCriterion: 'Two states of the same thing side by side or toggled (before/after, with and without, two settings) so the difference is the point.' },
]);
// pickFamily appends its own `none` criterion; this is the brief's seven-way text for Sonnet's enum and for the report.
export const NONE_TEXT = 'Nothing above fits (pure definition, prose comparison, a list, a proof).';
export const CHOICES = Object.freeze([...MECHANISMS.map(m => m.id), 'none']);

// ---- prompts: every unique prompt text of the bench sets ----
export const normalize = text => String(text).toLowerCase().replace(/\s+/g, ' ').replace(/[?.!\s]+$/g, '').trim();
export function loadPrompts(dir = SETS_DIR) {
  const seen = new Map();
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    for (const p of Array.isArray(data) ? data : data.prompts ?? []) {
      const text = typeof p === 'string' ? p : p?.prompt;
      if (!text) continue;
      const key = normalize(text);
      if (!seen.has(key)) seen.set(key, { set: file.replace(/\.json$/, ''), id: p.id ?? null, prompt: String(text), group: p.group ?? null, kind: p.regressionKind ?? p.kinds?.[0] ?? null });
    }
  }
  return [...seen.values()];
}

// ---- aggregation (pure; tested with fabricated rows) ----
// row: { prompt, jev: [{ choice, confidence, probabilities }], sonnetChoice, sonnetReason }.
export function jevTop(reps) {
  const votes = {}, mean = {};
  for (const r of reps) { if (!r.choice || r.choice === 'error') continue; votes[r.choice] = (votes[r.choice] ?? 0) + 1; mean[r.choice] = (mean[r.choice] ?? 0) + (r.probabilities?.[r.choice] ?? r.confidence ?? 0); }
  const best = Object.keys(votes).sort((a, b) => votes[b] - votes[a] || mean[b] / votes[b] - mean[a] / votes[a])[0];
  return best ?? null;
}
const pct = (n, d) => (d ? `${Math.round((1000 * n) / d) / 10}%` : 'n/a');
export function summarize(rows) {
  const withTop = rows.map(r => ({ ...r, jevTop: r.jevTop ?? jevTop(r.jev ?? []) }));
  const share = key => Object.fromEntries(CHOICES.map(c => [c, withTop.filter(r => r[key] === c).length]));
  const agree = withTop.filter(r => r.jevTop && r.sonnetChoice && r.jevTop === r.sonnetChoice);
  const perMechanism = Object.fromEntries(CHOICES.map(c => {
    const either = withTop.filter(r => r.jevTop === c || r.sonnetChoice === c), both = either.filter(r => r.jevTop === c && r.sonnetChoice === c);
    return [c, { either: either.length, both: both.length }];
  }));
  const calls = withTop.flatMap(r => r.jev ?? []).length;
  // self-consistency: the share of prompts where all 3 (valid) repeats gave the same choice
  const unanimous = withTop.filter(r => { const c = (r.jev ?? []).map(x => x.choice).filter(x => x && x !== 'error'); return c.length && c.every(x => x === c[0]); }).length;
  const bothNone = withTop.filter(r => r.jevTop === 'none' && r.sonnetChoice === 'none');
  return { n: withTop.length, jevShare: share('jevTop'), sonnetShare: share('sonnetChoice'), agree: agree.length, perMechanism, jevCalls: calls, unanimous, bothNone, rows: withTop };
}

export function reportMarkdown(s, { spendUsd = null } = {}) {
  const L = [];
  L.push('# bench-coverage: which scene mechanism would each bench prompt need?', '');
  L.push(`${s.n} unique prompts of scripts/explain-bench/sets/*.json (deduplicated by normalized text). Classifier 1: JEV (pickFamily transport, one choice question, seven criteria, ${s.jevCalls} calls, threshold ignored; a prompt's JEV bucket is the majority of its repeats, ties by mean probability). Classifier 2: ${SONNET}, one forced tool call per prompt (the choice and one sentence of reason). Measurement only: no template is built from it. No Opus.`, '');
  L.push('The seven criteria (what the scene shows):', '', ...MECHANISMS.map(m => `- \`${m.id}\`: ${m.pickCriterion}`), `- \`none\`: ${NONE_TEXT}`, '');
  L.push('## Share per mechanism', '', '| Mechanism | JEV | JEV share | Sonnet | Sonnet share | both agree on it | either says it |', '|---|---|---|---|---|---|---|');
  for (const c of CHOICES) L.push(`| ${c} | ${s.jevShare[c]} | ${pct(s.jevShare[c], s.n)} | ${s.sonnetShare[c]} | ${pct(s.sonnetShare[c], s.n)} | ${s.perMechanism[c].both} | ${s.perMechanism[c].either} |`);
  L.push('', `\`none\` share: JEV ${pct(s.jevShare.none, s.n)}, Sonnet ${pct(s.sonnetShare.none, s.n)}; both none: ${s.bothNone.length} prompts (${pct(s.bothNone.length, s.n)}).`, '');
  L.push('## Agreement', '', `- JEV majority vs Sonnet, same bucket: **${s.agree} of ${s.n} (${pct(s.agree, s.n)})**.`, `- JEV self-consistency: all repeats gave the same choice for ${s.unanimous} of ${s.n} prompts (${pct(s.unanimous, s.n)}).`, '', '| Mechanism | prompts either puts there | both put there | agreement |', '|---|---|---|---|');
  for (const c of CHOICES) L.push(`| ${c} | ${s.perMechanism[c].either} | ${s.perMechanism[c].both} | ${pct(s.perMechanism[c].both, s.perMechanism[c].either)} |`);
  L.push('', '## Five example prompts per bucket', '', 'Prompts both classifiers agree on first (the agreed bucket); a bucket with fewer than five agreed prompts is filled from the prompts either puts there (marked J for JEV only, S for Sonnet only).', '');
  for (const c of CHOICES) {
    const agreed = s.rows.filter(r => r.jevTop === c && r.sonnetChoice === c).map(r => `- ${r.prompt}`);
    const rest = s.rows.filter(r => (r.jevTop === c) !== (r.sonnetChoice === c)).map(r => `- ${r.prompt} (${r.jevTop === c ? 'J' : 'S'})`);
    L.push(`**${c}**`, '', ...(agreed.slice(0, 5).concat(rest).slice(0, 5).length ? agreed.slice(0, 5).concat(rest).slice(0, 5) : ['- (none)']), '');
  }
  L.push(`## Prompts both classifiers put in \`none\` (${s.bothNone.length})`, '', ...(s.bothNone.length ? s.bothNone.map(r => `- [${r.set}] ${r.prompt}`) : ['- (none)']), '');
  L.push('## Spend', '', spendUsd === null ? 'Not recorded.' : `Sonnet about US$${spendUsd.toFixed(3)} (tokens at the registry price, US$2 / US$10 per million); JEV calls are fractions of a cent each and are not priced here.`, '');
  return L.join('\n');
}

// ---- transports ----
function readEnv(names) {
  const out = {};
  for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) { const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line); if (m && names.includes(m[1])) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); }
  return out;
}
async function jevOnce(env, prompt, retry = true) {
  const r = await pickFamily(env, { request: prompt, depth: 'balanced' }, { families: MECHANISMS, threshold: 0, timeoutMs: 8000 });
  const choice = r.family ?? (r.reason === 'none' ? 'none' : 'error');
  if (choice === 'error' && retry) return jevOnce(env, prompt, false);
  return { choice, confidence: r.confidence, probabilities: r.probabilities, reason: choice === 'error' ? r.reason : undefined };
}
const TOOL = { name: 'classify', description: 'Name the scene mechanism that would best show the answer to the request, and say why in one sentence.', input_schema: { type: 'object', properties: { choice: { type: 'string', enum: [...CHOICES] }, reason: { type: 'string' } }, required: ['choice', 'reason'], additionalProperties: false } };
const SYSTEM = ['Which scene would show the answer to this request? Judge by what the scene draws, not by the subject of the words. The choices:', ...MECHANISMS.map(m => `- ${m.id}: ${m.pickCriterion}`), `- none: ${NONE_TEXT}`, 'Answer by calling the classify tool once.'].join('\n'); // Sonnet 5.5 refuses a forced tool_choice (400), so the tool is asked for in the system text
async function sonnetOnce(env, prompt, retry = true) {
  try { return await sonnetCall(env, prompt); } catch (error) { if (retry) return sonnetOnce(env, prompt, false); throw error; }
}
async function sonnetCall(env, prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json', 'User-Agent': 'rabbit-hole-owner-bench/1', ...(env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID } : {}) },
    body: JSON.stringify({ model: SONNET, max_tokens: 400, thinking: { type: 'between_tools' }, system: SYSTEM, tools: [TOOL], messages: [{ role: 'user', content: String(prompt).slice(0, 2000) }] }) });
  if (!r.ok) throw new Error(`anthropic http ${r.status}`);
  const j = await r.json(), out = j.content?.find(b => b.type === 'tool_use')?.input;
  if (!CHOICES.includes(out?.choice)) throw new Error('bad choice');
  return { choice: out.choice, reason: String(out.reason ?? '').slice(0, 400), usd: ((j.usage?.input_tokens ?? 0) * SONNET_USD_PER_MTOK.in + (j.usage?.output_tokens ?? 0) * SONNET_USD_PER_MTOK.out) / 1e6 };
}
// $0 harness proof: a keyword stub for both classifiers.
const stub = prompt => (/curve|function|sigmoid/i.test(prompt) ? 'curve-sliders' : /step|algorithm|handshake/i.test(prompt) ? 'stepper-states' : 'none');

async function pool(items, concurrency, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}

async function main() {
  const { values: a } = parseArgs({ options: { limit: { type: 'string' }, repeats: { type: 'string', default: '3' }, concurrency: { type: 'string', default: '4' }, 'cap-usd': { type: 'string', default: '1' }, dry: { type: 'boolean' }, 'no-write': { type: 'boolean' }, report: { type: 'boolean' } } });
  if (a.report) { const rows = readFileSync(OUT, 'utf8').trim().split('\n').map(l => JSON.parse(l)); writeFileSync(REPORT, reportMarkdown(summarize(rows), { spendUsd: rows.reduce((n, r) => n + (r.cost ?? 0), 0) })); console.log(`RESULT OK report from ${rows.length} rows`); return; }
  let prompts = loadPrompts(); if (a.limit) prompts = prompts.slice(0, Number(a.limit));
  const env = a.dry ? {} : readEnv(['TYPESAFE_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID']);
  if (!a.dry && (!env.TYPESAFE_API_KEY || !env.ANTHROPIC_API_KEY)) throw new Error('TYPESAFE_API_KEY and ANTHROPIC_API_KEY are needed in small-deploy/.env (read by name); nothing was called');
  const cap = Number(a['cap-usd']); let spent = 0, done = 0;
  console.log(`${prompts.length} unique prompts x ${a.repeats} JEV repeats + 1 ${SONNET} call each${a.dry ? ' (dry)' : ''}`);
  const rows = await pool(prompts, Number(a.concurrency), async p => {
    let jev, sonnet;
    if (a.dry) { jev = Array.from({ length: Number(a.repeats) }, () => ({ choice: stub(p.prompt), confidence: 0.9, probabilities: { [stub(p.prompt)]: 0.9 } })); sonnet = { choice: stub(p.prompt), reason: 'stub', usd: 0 }; }
    else {
      jev = []; for (let i = 0; i < Number(a.repeats); i++) jev.push(await jevOnce(env, p.prompt));
      if (spent >= cap) sonnet = { choice: null, reason: 'cap reached', usd: 0 };
      else { try { sonnet = await sonnetOnce(env, p.prompt); } catch (e) { sonnet = { choice: null, reason: String(e.message).slice(0, 120), usd: 0 }; } }
    }
    spent += sonnet.usd; if (++done % 20 === 0) console.log(`${done}/${prompts.length} spent ~US$${spent.toFixed(3)}`);
    return { ...p, jev, jevTop: jevTop(jev), sonnetChoice: sonnet.choice, sonnetReason: sonnet.reason, cost: sonnet.usd };
  });
  const s = summarize(rows);
  if (!a['no-write']) { mkdirSync(BENCH_DIR, { recursive: true }); writeFileSync(OUT, rows.map(r => JSON.stringify(r)).join('\n') + '\n'); writeFileSync(REPORT, reportMarkdown(s, { spendUsd: spent })); }
  console.log(`RESULT OK ${s.n} prompts; JEV none ${s.jevShare.none}, Sonnet none ${s.sonnetShare.none}, agree ${s.agree}, both none ${s.bothNone.length}; Sonnet spend ~US$${spent.toFixed(3)}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main().catch(error => { console.error(`RESULT FAILED: ${error.message}`); process.exit(1); });
