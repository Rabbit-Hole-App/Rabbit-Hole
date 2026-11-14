#!/usr/bin/env node
// scripts/interact/bench-pick.mjs (owner brief 13 section 3): does the pick (interact-design-pick.js pickFamily, JEV) send a prompt to the right family, or to `gap`, from prompt + depth alone?
// Every prompt of scripts/interact/sets/design-pick.json x 3 depths x 3 repeats, for TWO family lists: [vertical-throw] and [vertical-throw, curve-sliders] (the second criterion is a string: the question differs
// per list, so each list is its own 540 JEV calls, 1080 in all). pickFamily runs once per call with threshold 0, so the raw choice and probabilities are stored; the thresholds are applied offline to the stored rows.
//   node scripts/interact/bench-pick.mjs [--concurrency 4] [--repeats 3] [--depths brief,balanced,detailed] [--limit-prompts N] [--lists vt,vt+curve] [--dry] [--no-write]
//   node scripts/interact/bench-pick.mjs --report        (docs/features/interact/benchmarks/bench-pick.jsonl -> bench-pick.md)
// --dry: no network, a keyword stub stands in for pickFamily (harness proof). A real run needs TYPESAFE_API_KEY, read BY NAME from small-deploy/.env and never printed. No Opus; JEV only.
import { parseArgs } from 'node:util';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BENCH_DIR = join(REPO, 'docs/features/interact/benchmarks'), OUT = join(BENCH_DIR, 'bench-pick.jsonl'), REPORT = join(BENCH_DIR, 'bench-pick.md');
export const SET_FILE = join(REPO, 'scripts/interact/sets/design-pick.json');
const ENV_FILE = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env';
export const THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9], DEPTHS = ['brief', 'balanced', 'detailed'];
export const MAX_MISSED = 3; // the brief's pass rule: 0 wrong fits with at most 3 missed fits
export const NEAR_MISS = ['49', '50'], OVER_TIME = ['33', '36', '37'];
// The second family's criterion is the brief's own text; no module exists for it yet (Codex's branch), the question only needs the string.
export const CURVE_SLIDERS = Object.freeze({ id: 'curve-sliders', pickCriterion: 'One quantity as a function of another, drawn as a curve whose shape a few parameters change; no motion over time.' });
const VERTICAL_THROW_FALLBACK = Object.freeze({ id: 'vertical-throw', pickCriterion: 'One object launched straight up under constant gravity, slowing, stopping for an instant at the top and falling back; no air resistance, no angle, no second force.' });

// ---- offline decision and aggregation (pure; tested with fabricated rows) ----
// The top choice is the most probable key of the stored probabilities (a family id or 'none'); it fits only when that is a family and its probability reaches the threshold. A call with no
// probabilities (JEV failed or timed out) is a gap, as in the job.
export function decide(row, threshold) {
  const entries = Object.entries(row.probabilities ?? {});
  if (!entries.length) return null;
  const [top, p] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  return top !== 'none' && p >= threshold ? top : null;
}
export const topOf = row => Object.entries(row.probabilities ?? {}).reduce((a, b) => (b[1] > a[1] ? b : a), [null, 0]);
const sortedNums = a => [...a].sort((x, y) => x - y);
export const median = a => { const s = sortedNums(a); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
export const p95 = a => { const s = sortedNums(a); return s.length ? s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)] : null; };
const round = (n, d = 2) => (n === null || n === undefined ? null : Math.round(n * 10 ** d) / 10 ** d);

// rows: [{ list, id, depth, rep, probabilities, ms, failed?, timeout? }], set: [{ id, label }]. Returns { <list>: { families, calls, ms: {median, p95}, timeouts, failures, byThreshold: { <t>: {...} }, cheapest, focus } }.
export function aggregate(rows, set, { thresholds = THRESHOLDS, families = {} } = {}) {
  const label = Object.fromEntries(set.map(p => [String(p.id), p.label])), out = {};
  for (const list of [...new Set(rows.map(r => r.list))]) {
    const mine = rows.filter(r => r.list === list), ids = families[list] ?? [...new Set(mine.flatMap(r => Object.keys(r.probabilities ?? {})).filter(k => k !== 'none'))];
    const byThreshold = {}, prompts = [...new Set(mine.map(r => String(r.id)))];
    for (const t of thresholds) {
      const wrongCalls = [], gapCalls = {}, perDepth = Object.fromEntries(DEPTHS.map(d => [d, { wrong: 0, missed: 0, calls: 0 }]));
      for (const r of mine) {
        const got = decide(r, t), want = label[String(r.id)], d = perDepth[r.depth] ?? (perDepth[r.depth] = { wrong: 0, missed: 0, calls: 0 });
        d.calls++;
        if (got && got !== want) { wrongCalls.push(String(r.id)); d.wrong++; }
        if (!got && ids.includes(want)) { (gapCalls[String(r.id)] ??= []).push(r); d.missed++; }
      }
      const callsOf = id => mine.filter(r => String(r.id) === id).length;
      // A wrong fit counts when ANY call of the prompt picked a family it is not labelled; a missed fit when MORE THAN HALF of the prompt's calls came back gap.
      const wrongPrompts = [...new Set(wrongCalls)], missedPrompts = Object.keys(gapCalls).filter(id => gapCalls[id].length * 2 > callsOf(id));
      byThreshold[t] = { wrongCalls: wrongCalls.length, wrongPrompts, missedCalls: Object.values(gapCalls).reduce((n, a) => n + a.length, 0), missedPrompts, perDepth,
        passes: wrongPrompts.length === 0 && missedPrompts.length <= MAX_MISSED };
    }
    const focus = {};
    for (const id of [...NEAR_MISS, ...OVER_TIME]) {
      const rs = mine.filter(r => String(r.id) === id); if (!rs.length) continue;
      const tops = rs.map(topOf), fam = tops.filter(([k]) => k !== 'none' && k).map(([, p]) => p);
      focus[id] = { label: label[id], calls: rs.length, topNone: tops.filter(([k]) => k === 'none').length, topFamily: tops.filter(([k]) => k && k !== 'none').length, failed: rs.filter(r => !r.probabilities).length,
        famConf: fam.length ? { min: round(Math.min(...fam)), median: round(median(fam)), max: round(Math.max(...fam)) } : null, noneMedian: round(median(rs.filter(r => r.probabilities).map(r => r.probabilities.none ?? 0))),
        fitsAt: Object.fromEntries(thresholds.map(t => [t, rs.filter(r => decide(r, t)).length])) };
    }
    const ms = mine.map(r => r.ms).filter(Number.isFinite), cheapest = thresholds.find(t => byThreshold[t].passes) ?? null;
    out[list] = { families: ids, prompts: prompts.length, calls: mine.length, ms: { median: round(median(ms), 0), p95: round(p95(ms), 0) }, timeouts: mine.filter(r => r.timeout).length, failures: mine.filter(r => !r.probabilities).length, byThreshold, cheapest, focus };
  }
  return out;
}

export function reportMarkdown(rows, set, opts = {}) {
  const agg = aggregate(rows, set, opts), lines = [];
  const lists = Object.keys(agg);
  lines.push('# bench-pick: does the pick send a prompt to its family or to `gap`?', '',
    `${rows.length} JEV calls (pickFamily, threshold 0, raw probabilities stored; thresholds applied offline). Two family lists, so two questions and two sets of calls: ${lists.map(l => `\`${l}\``).join(' and ')}. Prompts: ${new Set(rows.map(r => r.id)).size}, depths ${[...new Set(rows.map(r => r.depth))].join(', ')}, repeats ${Math.max(0, ...rows.map(r => (r.rep ?? 0) + 1))}.`, '',
    'Definitions. Top choice = the most probable of the family ids and `none`; it fits only when it is a family and its probability >= the threshold, else `gap`; a failed or timed-out call is `gap`. **Wrong fit**: a prompt with ANY call that fit a family other than its label (labelled none or the other family). **Missed fit**: a prompt labelled a family in the list for which MORE THAN HALF of its calls came back `gap`. Pass rule: 0 wrong fits and at most 3 missed fits.', '');
  for (const list of lists) {
    const a = agg[list];
    lines.push(`## ${list}`, '', `${a.calls} calls over ${a.prompts} prompts; ms median ${a.ms.median}, p95 ${a.ms.p95}; timeouts ${a.timeouts}; failed calls (no answer, counted as gap) ${a.failures}.`, '',
      `Cheapest threshold with 0 wrong fits and <= ${MAX_MISSED} missed fits: **${a.cheapest ?? 'none'}**`, '', '| Threshold | Wrong fits (prompts) | Wrong calls | Missed fits (prompts) | Missed calls | Pass |', '|---|---|---|---|---|---|');
    for (const [t, b] of Object.entries(a.byThreshold)) lines.push(`| ${t} | ${b.wrongPrompts.length}${b.wrongPrompts.length ? ` (${b.wrongPrompts.join(', ')})` : ''} | ${b.wrongCalls} | ${b.missedPrompts.length}${b.missedPrompts.length ? ` (${b.missedPrompts.join(', ')})` : ''} | ${b.missedCalls} | ${b.passes ? 'yes' : 'no'} |`);
    lines.push('', 'Per depth (wrong calls / missed calls of the depth\'s calls):', '', `| Threshold | ${DEPTHS.join(' | ')} |`, `|---|${DEPTHS.map(() => '---').join('|')}|`);
    for (const [t, b] of Object.entries(a.byThreshold)) lines.push(`| ${t} | ${DEPTHS.map(d => `${b.perDepth[d]?.wrong ?? 0} / ${b.perDepth[d]?.missed ?? 0} of ${b.perDepth[d]?.calls ?? 0}`).join(' | ')} |`);
    lines.push('', 'Near misses (49, 50) and over-time scenes no family covers (33, 36, 37): the top-family confidence over the prompt\'s calls, the median `none` probability, and how many calls fit at each threshold.', '',
      `| Prompt | Label | Calls | Top = none | Top = family | Family confidence min / median / max | none median | Fits at ${THRESHOLDS.join(' / ')} |`, '|---|---|---|---|---|---|---|---|');
    for (const [id, f] of Object.entries(a.focus)) lines.push(`| ${id} | ${f.label} | ${f.calls} | ${f.topNone} | ${f.topFamily} | ${f.famConf ? `${f.famConf.min} / ${f.famConf.median} / ${f.famConf.max}` : 'none'} | ${f.noneMedian} | ${THRESHOLDS.map(t => f.fitsAt[t] ?? '').join(' / ')} |`);
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

// ---- the run ----
const keyFromEnvFile = (file = ENV_FILE) => {
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) { const m = /^\s*TYPESAFE_API_KEY\s*=\s*(.*)$/.exec(line); if (m) return m[1].trim().replace(/^["']|["']$/g, ''); }
  return null;
};
// A keyword stand-in for pickFamily so the harness runs with no network (--dry): throw words -> vertical-throw, curve words -> curve-sliders (when listed), else none.
export const stubPick = async (env, { request }, { families }) => {
  const ids = families.map(f => f.id), vt = /\b(throw|thrown|toss|tossed|ball)\b/i.test(request), curve = /\b(curve|sigmoid|logistic|decay|rate)\b/i.test(request);
  const probabilities = Object.fromEntries([...ids, 'none'].map(k => [k, 0.05]));
  const top = vt && ids.includes('vertical-throw') ? 'vertical-throw' : curve && ids.includes('curve-sliders') ? 'curve-sliders' : 'none';
  probabilities[top] = 0.9;
  return { family: top === 'none' ? null : top, confidence: 0.9, probabilities, ms: 1, reason: 'stub' };
};

async function loadPick(dry) {
  const pickMod = await import('../../packages/control-plane/src/interact-design-pick.js').catch(error => { if (dry) return null; throw error; });
  const famMod = await import('../../packages/control-plane/src/interact-families.js').catch(error => { if (dry) return null; throw error; });
  const registry = famMod && (famMod.FAMILIES ?? famMod.families ?? famMod.default);
  return { pickFamily: dry || !pickMod ? stubPick : pickMod.pickFamily, registry: registry ?? [VERTICAL_THROW_FALLBACK] };
}

export const FAMILY_LISTS = registry => ({ vt: registry, 'vt+curve': [...registry, CURVE_SLIDERS] });
const LIST_NAMES = { vt: 'vertical-throw', 'vt+curve': 'vertical-throw+curve-sliders' };

async function main() {
  const { values } = parseArgs({ options: { concurrency: { type: 'string', default: '4' }, repeats: { type: 'string', default: '3' }, depths: { type: 'string', default: DEPTHS.join(',') }, 'limit-prompts': { type: 'string' }, lists: { type: 'string', default: 'vt,vt+curve' },
    dry: { type: 'boolean', default: false }, report: { type: 'boolean', default: false }, 'no-write': { type: 'boolean', default: false }, set: { type: 'string', default: SET_FILE } } });
  const set = JSON.parse(readFileSync(values.set, 'utf8').replace(/^﻿/, ''));
  const prompts = set.slice(0, values['limit-prompts'] ? Number(values['limit-prompts']) : set.length);
  if (values.report) {
    const rows = readFileSync(OUT, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
    writeFileSync(REPORT, reportMarkdown(rows, set)); console.log(`wrote ${REPORT} from ${rows.length} rows`); return;
  }
  const depths = values.depths.split(',').map(d => d.trim()), repeats = Number(values.repeats), concurrency = Math.max(1, Number(values.concurrency));
  if (depths.some(d => !DEPTHS.includes(d))) throw new Error(`--depths takes ${DEPTHS.join(', ')}`);
  const key = values.dry ? 'stub' : keyFromEnvFile();
  if (!key) throw new Error('TYPESAFE_API_KEY is not in small-deploy/.env. Next: add it there, or run with --dry.');
  const { pickFamily, registry } = await loadPick(values.dry), env = { TYPESAFE_API_KEY: key }, lists = FAMILY_LISTS(registry);
  const jobs = [];
  for (const name of values.lists.split(',')) { if (!lists[name]) throw new Error(`--lists takes ${Object.keys(lists).join(', ')}`); for (const p of prompts) for (const depth of depths) for (let rep = 0; rep < repeats; rep++) jobs.push({ name, p, depth, rep }); }
  console.log(`${jobs.length} calls (${values.lists}; ${prompts.length} prompts x ${depths.length} depths x ${repeats} repeats per list), concurrency ${concurrency}${values.dry ? ', DRY (stub, no network)' : ''}`);
  const rows = []; let next = 0, done = 0;
  const worker = async () => {
    for (let i = next++; i < jobs.length; i = next++) {
      const { name, p, depth, rep } = jobs[i], started = globalThis.performance.now();
      let r; try { r = await pickFamily(env, { request: p.prompt, depth }, { families: lists[name], threshold: 0 }); } catch (error) { r = { family: null, confidence: 0, probabilities: null, reason: `threw: ${String(error.message).slice(0, 120)}` }; }
      const row = { list: LIST_NAMES[name], id: String(p.id), label: p.label, depth, rep, family: r.family ?? null, confidence: r.confidence ?? null, probabilities: r.probabilities ?? null, ms: Math.round(r.ms ?? globalThis.performance.now() - started), reason: r.reason ?? null,
        failed: !r.probabilities, timeout: !r.probabilities && /timeout|abort/i.test(String(r.reason ?? '')), at: new Date().toISOString() };
      rows.push(row); if (!values['no-write']) { mkdirSync(BENCH_DIR, { recursive: true }); appendFileSync(OUT, JSON.stringify(row) + '\n'); }
      if (++done % 50 === 0) console.log(`${done}/${jobs.length}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  const md = reportMarkdown(rows, set);
  if (!values['no-write']) writeFileSync(REPORT, md);
  console.log(md);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main().catch(error => { console.error(`RESULT FAILED: ${error.message}`); process.exit(1); });
