// Builds sets/smoke.json, the tier-1 "smoke" set (owner 2026-11-09): ~60 fixed prompts, every diagram kind at least once, the known-fragile groups, the picture-routing sample
// and the 13 Lesson 04 demo prompts. Seeded and reproducible: same inputs and seed give the same file.
// Usage: node scripts/explain-bench/build-smoke-set.mjs [--results <a judged 3x run's results.json>] [--out sets/smoke.json] [--seed smoke-v1]
// Entries keep the schema of their source set (best/acceptable, kinds, sketch, depths, needsPicture/noPicture) so score.mjs scores them unchanged; the two sources that live on other
// branches (demo-lesson04, figure-chapters) are read with `git show`. Selection evidence: a prompt "reliably produces" a kind when its three runs all scored right and all drew it.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadSet } from './score.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOTS = ['C:/s/spec/benchmarks/explain-bench', 'C:/s/spec/benchmarks/figure-chapters']; // where earlier runs of the demo-lesson04 and figure-chapters sets live (evidence only; a missing root is skipped)
const RESULTS = 'C:/s/spec/benchmarks/explain-bench/2026-11-09T105915-117-rerun-3x-judged/results.json';
// The planner's KIND list (explanation-planner.js on release/explain-118): 24 kinds. The owner's brief says 21; all 24 are covered.
export const KINDS = ['flow', 'sequence', 'cycle', 'timeline', 'tree', 'relationship', 'transformation', 'comparison', 'layers', 'matrix', 'coordinate-plot', 'bar-chart', 'histogram', 'box-plot', 'heatmap',
  'number-line', 'figure', 'sample-set', 'argument', 't-account', 'waterfall', 'tensor', 'token-links', 'block-stack'];
const GIT = { 'demo-lesson04': ['rabbit-hole/explain/demo-lesson04', 'scripts/explain-bench/sets/demo-lesson04.json'], 'figure-chapters': ['rabbit-hole/explain/figure-chapters-bench', 'scripts/explain-bench/sets/figure-chapters.json'] };
const setCache = {};
const source = name => (setCache[name] ||= GIT[name] ? JSON.parse(execFileSync('git', ['-C', HERE, 'show', GIT[name].join(':')], { encoding: 'utf8', maxBuffer: 1 << 26 })) : loadSet(name));
const entry = (set, id) => { const p = source(set).prompts.find(x => x.id === id); if (!p) throw new Error(`no ${set}/${id}`); return p; };

export function rng(seed) { // mulberry32 over a sha256 of the seed text
  let a = parseInt(createHash('sha256').update(String(seed)).digest('hex').slice(0, 8), 16);
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const shuffle = (xs, rand) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Per prompt, from a judged 3x run: right in every run, the kinds all runs drew, a picture / no picture in every run, a plot that recomputes in every run, a self-message.
export function evidence(cards, sets) {
  const by = {};
  for (const c of cards) if (sets.includes(c.set)) (by[`${c.set}/${c.id}`] ||= []).push(c);
  return Object.fromEntries(Object.entries(by).map(([k, cs]) => {
    const all = cs.length >= 3, right = all && cs.every(c => c.score === 'right'), kinds = cs.map(c => new Set(c.diagrams.map(d => d.kind)));
    return [k, { runs: cs.length, right, kinds: right ? KINDS.filter(x => kinds.every(s => s.has(x))) : [], picture: all && cs.every(c => c.hasPicture), none: all && cs.every(c => !c.hasPicture),
      plotOk: all && cs.every(c => c.formulaPlotOk), self: cs.filter(c => c.diagrams.some(d => d.spec?.messages?.some(m => m.from === m.to))).length, needsPicture: cs[0].needsPicture, noPicture: cs[0].noPicture }];
  }));
}

// How often earlier runs of a set 117 did not run drew each kind: { 'set/id': { n, kinds: { kind: runs } } }. Evidence for the label, not a selection input.
export function observed(sets, roots = ROOTS) {
  const seen = {};
  for (const root of roots.filter(existsSync)) for (const d of readdirSync(root)) {
    const f = join(root, d, 'results.json'); if (!existsSync(f)) continue;
    let r; try { r = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
    if (!Object.keys(r.meta?.sets || {}).some(s => sets.includes(s))) continue;
    for (const c of r.cards) if (sets.includes(c.set) && c.delivered) { const x = (seen[`${c.set}/${c.id}`] ||= { n: 0, kinds: {} }); x.n++; for (const k of new Set(c.diagrams.map(g => g.kind))) x.kinds[k] = (x.kinds[k] || 0) + 1; }
  }
  return seen;
}

// Kinds no 117 prompt reliably draws: the reference prompt that covers them (planner KIND list / reference library), labelled unverified. [set or null, id, prompt, extra]
const REFERENCE = {
  histogram: ['phase02-batch', 'two-histograms'],
  'number-line': ['figure-chapters', 'ml-word2vec-trait-rescale'],
  'box-plot': [null, 'ref-box-plot-iqr-fences', 'Explain quartiles, IQR fences, whiskers and outliers on one scale.', 'reference iqr-fences-and-outliers (release/explain-118 reference-library)'],
  tensor: ['illustrations', 'ml-transformer-qkv-projections'],
  argument: [null, 'ref-argument-reading', 'Explain build a reading of a passage', 'reference general-argument-7'],
  't-account': [null, 'ref-t-account-cash', 'Explain post entries to cash', 'reference general-t-account-9'],
  waterfall: [null, 'ref-waterfall-cash', 'Explain from opening cash to closing cash', 'reference general-waterfall-10'],
};
// Demo and figure-chapter prompts score by the reference kind at Balanced (standard); no sketch: the figure-chapter one is the worked reference's JSON, not a Core line.
const fromRef = (set, id) => { const e = entry(set, id); return { ...e, depths: { standard: { kinds: [e.referenceKind], acceptableKinds: [] } } }; };
const referenceEntry = (kind, [set, id, prompt, from]) => set ? { ...(set === 'figure-chapters' ? fromRef(set, id) : entry(set, id)), source: { set, id } } : { id, group: 'kind-reference', prompt, kinds: [kind], best: [[`D:${kind}`], [`D:${kind}`, 'D:*']], acceptable: [], badKinds: [], needsPicture: false, noPicture: true, source: { set: 'reference-library', id: from } };

export function build({ results = RESULTS, seed = 'smoke-v1' } = {}) {
  const rand = rng(seed), cards = JSON.parse(readFileSync(results, 'utf8')).cards, ev = evidence(cards, ['regression', 'baseline', 'aiml', 'sequence', 'content', 'illustrations']);
  const picked = new Map(), covered = new Map(); // prompt text -> entry; kind -> prompt id
  const add = (set, id, group, { kinds = null, unverified = null, e = null } = {}) => {
    const src = e || entry(set, id), text = src.prompt.toLowerCase().trim(), k = `${set}/${id}`;
    const have = picked.get(text), reliable = ev[k]?.kinds ?? [], covers = kinds || reliable;
    if (have) { if (!have.smoke.groups.includes(group)) have.smoke.groups.push(group); return have; }
    const out = { ...src, id: [...picked.values()].some(x => x.id === src.id) ? `${set}-${src.id}` : src.id, smoke: { groups: [group], source: { set, id }, kindsReliable: covers, ...(unverified ? { unverified } : {}) } };
    picked.set(text, out); for (const x of covers) if (!covered.has(x)) covered.set(x, out.id);
    return out;
  };
  const refKind = e => [e.referenceKind]; // the kind the reference spec draws; seen live in the 2026-11-09 demo and figure-chapter runs, not in the 117 set

  // 1. The 13 Lesson 04 demo prompts at Balanced: reference-steer check.
  for (const p of source('demo-lesson04').prompts) add('demo-lesson04', p.id, 'demo-lesson04', { e: fromRef('demo-lesson04', p.id), kinds: refKind(p), unverified: 'kind seen in the 2026-11-09 demo runs, not a 117 3x' });
  // 2. Matrix / heatmap: the owner's four (figure-chapters 12, 27, 28 and demo gini-split) and four more.
  for (const id of ['ml-bert-task-heads', 'ml-stable-diffusion-forward-noise', 'ml-stable-diffusion-image-caption-pairs', 'ml-word2vec-signed-embedding-heatmap', 'd2l-transformer-encoder-head-weight-grids', 'ml-transformer-one-hot-target']) add('figure-chapters', id, 'matrix-heatmap', { e: fromRef('figure-chapters', id), kinds: refKind(entry('figure-chapters', id)), unverified: 'figure-chapters reference kind, seen in the 2026-11-09 figure-chapter runs' });
  add('demo-lesson04', 'ml-trees-gini-split', 'matrix-heatmap');
  add('content', 'precision-recall', 'matrix-heatmap');
  // 3. Formula plots: six of the content-formula prompts whose plot recomputed in all three 117 runs.
  const formula = shuffle(source('content').prompts.filter(p => p.category === 'formula' && ev[`content/${p.id}`]?.plotOk && ev[`content/${p.id}`].kinds.some(k => ['coordinate-plot', 'bar-chart'].includes(k))).map(p => p.id).sort(), rand);
  const rest = shuffle(source('content').prompts.filter(p => p.category === 'formula' && !formula.includes(p.id) && p.id !== 'precision-recall').map(p => p.id).sort(), rand); // no plot recomputed in all 3 runs: topped up to six
  for (const id of [...formula, ...rest].slice(0, 6)) add('content', id, 'formula-plot');
  // 4. Sequences (the self-message rule is exercised by the public-key card; the sequence set covers the plain case) and two-structure prompts (secondVisual).
  add('review-batch-01', 'public-key-encryption', 'sequence-self-message', { kinds: ['sequence'], unverified: 'review-batch-01 card 01: its raw spec has a bob-to-bob self-message; not in the 117 set' });
  add('sequence', 'send-email', 'sequence-self-message'); add('sequence', 'dns-lookup', 'sequence-self-message');
  for (const id of ['stack-vs-queue', 'dfs-vs-bfs', 'arrays-vs-lists']) add('baseline', id, 'two-structure');
  // 5. Picture routing: 10 of the prompts that got a picture where needed in all three runs, 15 where none belongs and none came (content/transformer-block always in).
  const pool = (flag, key) => Object.keys(ev).filter(k => ev[k].right && ev[k][flag] && ev[k][key]).map(k => k.split('/')).filter(([s]) => s !== 'illustrations').sort((a, b) => `${a}`.localeCompare(`${b}`));
  const sample = (candidates, n, group, must = []) => { // seeded; each pick prefers a prompt that adds a kind no earlier pick covers
    for (const [s, i] of must) add(s, i, group);
    const order = shuffle(candidates.filter(([s, i]) => !picked.has(entry(s, i).prompt.toLowerCase().trim())), rand);
    const have = () => [...picked.values()].filter(p => p.smoke.groups.includes(group)).length; // distinct prompts: two sets can share a prompt text
    while (have() < n && order.length) { const at = Math.max(0, order.findIndex(([s, i]) => ev[`${s}/${i}`].kinds.some(x => !covered.has(x)))); const [s, i] = order.splice(at, 1)[0]; add(s, i, group); }
  };
  sample(pool('needsPicture', 'picture'), 10, 'picture-needed');
  sample(pool('noPicture', 'none'), 15 + 0, 'picture-none', [['content', 'transformer-block']]);
  // 6. Every remaining kind: a reliable prompt first, else its reference prompt.
  for (const kind of KINDS.filter(k => !covered.has(k))) {
    const cands = Object.keys(ev).filter(k => ev[k].kinds.includes(kind) && !ev[k].picture && !k.startsWith('illustrations/') || ev[k]?.kinds.includes(kind) && k.startsWith('illustrations/')).sort();
    if (cands.length) { const [s, i] = shuffle(cands, rand)[0].split('/'); add(s, i, `kind:${kind}`); continue; }
    if (REFERENCE[kind]) { const e = referenceEntry(kind, REFERENCE[kind]); add(e.source.set, e.id, `kind:${kind}`, { e, kinds: [kind], unverified: 'no 117 prompt draws this kind reliably: covered by a reference prompt' }); }
  }
  const seen = observed(['demo-lesson04', 'figure-chapters']);
  for (const p of picked.values()) { const x = seen[`${p.smoke.source.set}/${p.smoke.source.id}`], k = p.smoke.kindsReliable[0]; if (x && k) p.smoke.observed = `earlier runs: ${k} drawn ${x.kinds[k] || 0} of ${x.n} cards`; }
  const prompts = [...picked.values()], pictures = prompts.filter(p => p.needsPicture).length;
  const estUsdPerCard = +((prompts.length * 0.0027 + pictures * 0.007) / prompts.length + 0.0018).toFixed(4); // 117 ledger: US$0.0027 a card without a picture, 0.0097 with one (+0.007); +0.0018 margin
  const weight = (p, k) => (p.smoke.unverified ? Number(/drawn ([0-9]+) of/.exec(p.smoke.observed || '')?.[1] || 0) : 1e6); // reliable in the 117 3x first, then the most-drawn in earlier runs
  const coverage = Object.fromEntries(KINDS.map(k => [k, prompts.filter(p => p.smoke.kindsReliable.includes(k)).sort((x, y) => weight(y, k) - weight(x, k))[0]?.id ?? null]));
  return { name: 'smoke', version: { prompts: `S1 2026-11-09 (seed ${seed}; ${prompts.length} prompts)`, labels: 'S1 2026-11-09 (labels copied from each prompt\'s source set; demo and figure-chapter prompts score by the reference kind)' },
    measures: 'Tier 1 of the release gate: one run of a fixed, versioned set. Every diagram kind at least once, the fragile groups (matrix/heatmap, formula plots, sequences with self-messages, two-structure prompts), the picture-routing sample and the 13 Lesson 04 demo prompts.',
    written: '2026-11-09 by build-smoke-set.mjs from the 117 rerun 3x (reliable = right and drawn in all 3 runs)', defaultRuns: 1, estUsdPerCard, pass: {}, kindCoverage: coverage, prompts };
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const { values: a } = parseArgs({ options: { results: { type: 'string' }, out: { type: 'string' }, seed: { type: 'string' } } });
  const set = build({ results: a.results, seed: a.seed }), file = resolve(a.out || join(HERE, 'sets/smoke.json'));
  writeFileSync(file, JSON.stringify(set, null, 1) + '\n');
  const g = {}; for (const p of set.prompts) for (const x of p.smoke.groups) g[x.split(':')[0]] = (g[x.split(':')[0]] || 0) + 1;
  console.log(`✓ ${file}: ${set.prompts.length} prompts, groups ${JSON.stringify(g)}, kinds covered ${Object.values(set.kindCoverage).filter(Boolean).length}/${KINDS.length}, estUsdPerCard ${set.estUsdPerCard}`);
}
