// JEV planner bench (owner 2026-11-08): offline, no author call. Every labelled prompt (correct-svg x 3 depths, AI/ML at Standard) goes once through
// TypeSafe System One (jev-latest) with the owner's planner questions; the answers are mapped to a plan with the owner's server rules and scored against the
// pre-written labels. PLANNER v2 (owner 2026-11-08, packages/control-plane/src/explanation-planner.js on explain/correct-svg 8e861fdb3): no second-visual question, one diagram unless the visual type is both,
// no plot override, the kind FIXED when its top probability is >= 0.6 else the top two kinds OFFERED (the author chooses). Price: $0.042 per million input tokens, output free (docs.typesafe.ai/models, read 2026-11-08).
// Usage: node scripts/explain-bench/planner.mjs [--out dir] [--only correct-svg|aiml] [--dry-run]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matches } from './score.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env';
const USD_PER_TOKEN = 0.042 / 1e6, TIMEOUT_MS = 8000;

// --- the owner's request (2026-11-08), verbatim criteria. Tuning pass 1 (depth rule in the kind instructions, decision-tree prediction as a flow) lowered kind accuracy (raw right 55 -> 52 of 67) and was reverted. ---
const KIND = {
  flow: 'Ordered steps of one process, with or without decisions; the default only when nothing below fits.',
  sequence: 'Two to four named parties sending things to each other: client/server, sender/receiver, protocols, handshakes, request/response.',
  cycle: 'Steps that repeat, where the last feeds the first: water cycle, training loop, engine strokes.',
  timeline: 'Events ordered by dates, years or eras.',
  tree: 'A hierarchy, parts of one thing, splits, recursive calls; binary trees, BSTs, heaps, decision trees as structures.',
  relationship: 'Named things linked by labelled relations, including feedback and cycles between them; causes and effects.',
  transformation: 'The same thing before and after an operation: reshape, encode, normalise, differencing. Never for a function, wave or encoding over position or time.',
  comparison: 'Two to four separate things set side by side on shared attributes.',
  layers: 'A real ordered stack: network layers, atmosphere, software tiers, a transformer block. A stack: frames or levels pushed and popped (a call stack, a protocol stack), even when the question mentions recursion.',
  matrix: 'A grid of values with row and column headings: truth table, confusion matrix.',
  'coordinate-plot': 'How one quantity varies with another: a function\'s curve, a loss curve, a decision boundary, points in a plane. A function, wave or periodic quantity over a position or time (sinusoidal position encoding), or a set of points with centroids or a fitted line (k-means clustering).',
  'bar-chart': 'Comparing a few quantities by size, one worked example.',
  histogram: 'The distribution of one numeric variable in bins.',
  'box-plot': 'Quartiles, median, whiskers, outliers of one or more groups.',
  heatmap: 'A numeric grid coloured by value, with an explicit scale.',
  'number-line': 'Values and intervals on one axis.',
  figure: 'A labelled schematic of a cell, a free-body force diagram, or a layered cross-section only; a device or machine (a lens, an engine, a camera) is a flow or sequence of what it does, not a figure.',
  'sample-set': 'Identifiable samples and their group membership, replacement or weights (bootstrap, folds).',
  argument: 'A claim with supporting and opposing evidence and a conclusion.',
  't-account': 'Debits and credits.',
  waterfall: 'An opening value changed by signed steps to a closing value.',
};
export const QUESTIONS = {
  visualType: { type: 'choice', instructions: "What should the card's main visual be? Objects, 3D shapes, anatomy, places, living things, natural events and 'how does X look' get a picture; if the thing also does something, both. Processes, relationships, comparisons, hierarchies, quantities, algorithms, data structures and anything digital, abstract or mathematical get a diagram only.",
    criteria: { picture: 'A drawn illustration of a physical thing, place, organism or natural event.', diagram: 'A schematic: process, relationship, comparison, structure, quantity or formula.', both: 'A physical thing that also has a mechanism to explain (volcano erupting, engine, eclipse).' } },
  kind: { type: 'choice', instructions: 'If a diagram is used, which kind best teaches the answer? Judge by the shape of the answer, not by words in the question.', criteria: KIND },
  depthTreatment: { type: 'choice', instructions: 'How technical should the explanation and its visual be for this depth? Overview: plain words, no formulas or jargon, the simplest visual with plain labels. Standard: the mechanism with its proper terms; a plot or chart if a quantity is central. Deep: precise terms, the formula or exact relationship in the labels, the quantitative view.',
    criteria: { plain: 'No formulas, no jargon, plain-word labels.', mechanism: 'Proper terms, the mechanism; a plot if a quantity is central.', quantitative: 'Formula and exact relationships in labels; plot or chart where a quantity is involved.' } },
  needsPlot: { type: 'noul', instructions: 'Is this a question about a formula, a metric, a loss, an activation function, a schedule, or how one quantity changes with another?' },
  isPhysical: { type: 'noul', instructions: 'Is the subject a physical object, place, organism, 3D shape, repeating structure (molecule, lattice, gear train) or natural event?' },
  needsWorkedExample: { type: 'noul', instructions: 'Would a small worked numeric example (computed from the formula the explanation states) make the answer clearer?' },
};

// The server's mapping (explanation-planner.js planFromAnswers, v2): answers -> plan (visuals as bench mixes: 'P' and 'D:<kind>'). Offered kinds give one candidate mix each (the author picks one).
export const FIX_AT = 0.6;
const top2 = probabilities => Object.entries(probabilities || {}).sort((x, y) => y[1] - x[1]).slice(0, 2);
export function planOf(a) {
  const [[kind, p1] = [a.kind?.choice, a.kind?.confidence], second] = top2(a.kind?.probabilities);
  const fixed = p1 >= FIX_AT || !second, kinds = fixed ? [kind] : [kind, second[0]], type = a.visualType.choice;
  const mixes = kinds.map(k => (type === 'picture' ? ['P'] : type === 'both' ? ['P', `D:${k}`] : [`D:${k}`]));
  return { mix: mixes[0], mixes, kind, kinds, fixed, offered: fixed ? null : kinds, overridden: false, depthTreatment: a.depthTreatment.choice, ambiguous: a.kind.confidence < 0.5,
    physicalDisagrees: a.isPhysical.noul >= 0.7 && type === 'diagram', confidence: { kind: a.kind.confidence, visualType: a.visualType.confidence } };
}

// Labelled prompts with per-depth best/acceptable mixes (the same construction as score.mjs scoreCard) and the expected depth treatment / plot flag.
const TREAT = { overview: 'plain', standard: 'mechanism', deep: 'quantitative' };
const kindsIn = mixes => new Set(mixes.flat().filter(t => t.startsWith('D:')).flatMap(t => t.slice(2).split('|')));
export function cases(setDir = join(HERE, 'sets')) {
  const out = [];
  const cs = JSON.parse(readFileSync(join(setDir, 'correct-svg.json'), 'utf8'));
  for (const p of cs.prompts) for (const depth of ['overview', 'standard', 'deep']) {
    const dp = p.depths[depth], k = `D:${dp.kinds.join('|')}`, a = dp.acceptableKinds.length ? `D:${dp.acceptableKinds.join('|')}` : null;
    out.push({ set: 'correct-svg', id: p.id, depth, prompt: p.prompt, best: [[k], [k, 'D:*'], [k, 'P'], ...(dp.extraBest || [])], acceptable: [...(a ? [[a], [a, 'D:*'], [a, 'P']] : []), ...(dp.extraAcceptable || [])],
      quantity: p.group === 'content-formula' });
  }
  const ai = JSON.parse(readFileSync(join(setDir, 'aiml.json'), 'utf8'));
  for (const p of ai.prompts) out.push({ set: 'aiml', id: p.id, depth: 'standard', prompt: p.prompt, best: p.best, acceptable: p.acceptable,
    quantity: [...kindsIn([p.best[0] || []])].some(k => k === 'coordinate-plot' || k === 'bar-chart') });
  // The review loop's batch-01 prompts (owner 2026-11-09): same best/acceptable notation as aiml.json; read when the file is there.
  try { for (const p of JSON.parse(readFileSync(join(setDir, 'review-batch-01.json'), 'utf8')).prompts) out.push({ set: 'review-batch-01', id: p.id, depth: 'standard', prompt: p.prompt, best: p.best, acceptable: p.acceptable, quantity: [...kindsIn([p.best[0] || []])].some(k => k === 'coordinate-plot' || k === 'bar-chart') }); } catch { /* shortcut: a missing set file is skipped, the bench keeps its two original sets */ }
  return out.map(c => ({ ...c, rightKinds: kindsIn(c.best), okKinds: new Set([...kindsIn(c.best), ...kindsIn(c.acceptable)]),
    expectType: (ms => (ms.some(m => m.includes('P') && m.some(t => t.startsWith('D:'))) ? ['both'] : []).concat(ms.some(m => m.length && m.every(t => t === 'P')) ? ['picture'] : [], ms.some(m => m[0]?.startsWith('D:')) ? ['diagram'] : []))(c.best) }));
}

async function ask(key, c) {
  const body = { model: 'jev-latest', state: { question: c.prompt, depth: c.depth, context: null }, questions: QUESTIONS };
  const t0 = Date.now();
  const r = await fetch('https://api.typesafe.ai/v1/systemone', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'rabbit-hole-bench/1' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  const ms = Date.now() - t0, j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`http ${r.status}: ${JSON.stringify(j?.detail ?? j).slice(0, 300)}`);
  return { ms, answers: j.answers, usage: j.usage, model: j.model };
}

const pct = (a, b) => (b ? `${a}/${b} (${Math.round((100 * a) / b)}%)` : '-');
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
export function summarize(rows) {
  const by = set => rows.filter(r => !set || r.set === set), lines = [];
  for (const set of [null, 'correct-svg', 'aiml']) {
    const rs = by(set).filter(r => r.answers); if (!rs.length) continue;
    const kindOk = rs.filter(r => r.plan.kinds.some(k => r.okKinds.has(k))), kindRight = rs.filter(r => r.plan.kinds.some(k => r.rightKinds.has(k)));
    const typeRight = rs.filter(r => r.expectType.includes(r.answers.visualType.choice));
    const mixRight = rs.filter(r => r.plan.mixes.some(m => r.best.some(b => matches(b, m)))), mixOk = rs.filter(r => r.plan.mixes.some(m => r.best.some(b => matches(b, m)) || r.acceptable.some(a => matches(a, m))));
    const fixedRs = rs.filter(r => r.plan.fixed), offeredRs = rs.filter(r => !r.plan.fixed);
    const treat = rs.filter(r => r.answers.depthTreatment.choice === TREAT[r.depth]), plot = rs.filter(r => (r.answers.needsPlot.noul >= 0.5) === r.quantity);
    const conf = (xs) => (xs.length ? (xs.reduce((s, r) => s + r.answers.kind.confidence, 0) / xs.length).toFixed(2) : '-');
    const wrongK = rs.filter(r => !r.plan.kinds.some(k => r.okKinds.has(k)));
    lines.push({ set: set || 'all', plans: rs.length, 'kind fixed: kind right': pct(fixedRs.filter(r => kindRight.includes(r)).length, fixedRs.length), 'two offered: a right kind among them': pct(offeredRs.filter(r => kindRight.includes(r)).length, offeredRs.length), 'kind right': pct(kindRight.length, rs.length), 'kind right or acceptable': pct(kindOk.length, rs.length),
      'visualType right': pct(typeRight.length, rs.length), 'plan (type+kind+count) right': pct(mixRight.length, rs.length), 'plan right or acceptable': pct(mixOk.length, rs.length),
      'depthTreatment right': pct(treat.length, rs.length), 'needsPlot agrees': pct(plot.length, rs.length),
      'kind confidence right / wrong': `${conf(kindOk)} / ${conf(wrongK)}`, 'ambiguous (<0.5)': rs.filter(r => r.plan.ambiguous).length, 'kind overridden to a plot': rs.filter(r => r.plan.overridden).length,
      'p50 / p90 ms': `${q(rs.map(r => r.ms), 0.5)} / ${q(rs.map(r => r.ms), 0.9)}`, 'cost US$': (rs.reduce((s, r) => s + (r.usage?.input_tokens || 0), 0) * USD_PER_TOKEN).toFixed(5),
      'input tokens per plan': Math.round(rs.reduce((s, r) => s + (r.usage?.input_tokens || 0), 0) / rs.length) });
  }
  return lines;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
  const only = arg('--only'), all = cases(arg('--set-dir', join(HERE, 'sets'))).filter(c => !only || c.set === only);
  if (process.argv.includes('--dry-run')) { console.log(`${all.length} plans; request size ${JSON.stringify({ model: 'jev-latest', state: {}, questions: QUESTIONS }).length} chars`); process.exit(0); }
  const key = ((readFileSync(ENV_FILE, 'utf8').match(/^TYPESAFE_API_KEY=(.*)$/m) || [])[1] || '').trim().replace(/^["']|["']$/g, '');
  if (!key) { console.error('TYPESAFE_API_KEY missing from the credentials file'); process.exit(2); }
  const rows = [];
  for (const c of all) {
    try { const r = await ask(key, c); rows.push({ ...c, ...r, plan: planOf(r.answers) }); }
    catch (e) { rows.push({ ...c, error: String(e.message || e).slice(0, 300) }); }
  }
  const out = arg('--out', join('C:/s/spec/benchmarks/jev-planner', new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'rows.json'), JSON.stringify(rows, (k, v) => (v instanceof Set ? [...v] : v), 1));
  const table = summarize(rows); writeFileSync(join(out, 'summary.json'), JSON.stringify(table, null, 1));
  console.log(`out: ${out}; errors: ${rows.filter(r => r.error).length}`); console.table(table);
  for (const r of rows.filter(r => r.answers && !r.plan.kinds.some(k => r.okKinds.has(k)))) console.log(`wrong kind  ${r.set}/${r.id}/${r.depth}: ${r.plan.kinds.join(' or ')} (${r.answers.kind.confidence}) expected ${[...r.rightKinds].join('|')}`);
  for (const r of rows.filter(r => r.error)) console.log(`error ${r.set}/${r.id}/${r.depth}: ${r.error}`);
}
