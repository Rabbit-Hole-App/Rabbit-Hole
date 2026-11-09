// /explain card benchmark: scores a run's saved cards, optionally judges them, writes results.json, metrics.json and report.md with the delta against the
// previous run and the release baseline, and exits non-zero when a pass criterion on record fails.
// Usage: node scripts/explain-bench/report.mjs --raw <dir of set-run folders> [--label "..."] [--out <results root>] [--against <run dir>] [--baseline <run id>]
//          [--tag-baseline] [--judge] [--judges N] [--judge-cap 1.00] [--richness-change]
// A raw dir holds <set>-r<run>/results.jsonl + cards/<id>.json (+ tokens.json), as bench.mjs writes and as the 2026-11-08 study's 5d folders are laid out.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { PLOT_KINDS, availableSets, cardKey, criteria, loadSet, proseOf, scoreCard, summarize, useSpecTree, visibleText } from './score.mjs';
import { RUBRICS, combine, judgeItems, keyTransport, useRubrics } from './judge.mjs';

export const DEFAULT_OUT = 'C:/s/spec/benchmarks/explain-bench';
// The 2026-11-08 study's folder letters (5d, 5e): A regression, B baseline, C AI/ML, D sequence.
const LEGACY = { A: 'regression', B: 'baseline', C: 'aiml', D: 'sequence' };
const rd = f => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
const json = f => JSON.parse(readFileSync(f, 'utf8'));

// PT wall clock, sortable: 2026-11-08T1712-label
export const runDirName = (label, now = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}${p.minute}${p.second}-${String(label || 'run').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`;
};

export function loadRaw(rawDir, folders = null) {
  const recs = [], notes = [];
  for (const dir of readdirSync(rawDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).filter(n => !folders?.length || folders.includes(n)).sort()) {
    const m = /^(.+?)(?:-r(\d+))?(?:-(overview|standard|deep))?$/.exec(dir), set = LEGACY[m[1]] || m[1], run = Number(m[2] || 1), depth = m[3] || null; // <set>-r<run>[-<depth>]
    if (!availableSets().includes(set)) { notes.push(`skipped folder ${dir}: no set named ${set}`); continue; }
    const base = join(rawDir, dir), tokens = existsSync(join(base, 'tokens.json')) ? json(join(base, 'tokens.json')).cards : [];
    for (const row of rd(join(base, 'results.jsonl'))) {
      const card = existsSync(join(base, 'cards', `${row.id}.json`)) ? json(join(base, 'cards', `${row.id}.json`)) : null, t = tokens.find(x => x.id === row.id);
      recs.push({ set, run, depth, id: row.id, delivered: !!row.delivered && !!card?.response?.block, failure: row.failure, block: card?.response?.block || null, totalMs: row.totalMs, repaired: row.repaired,
        repairCauses: row.repairCauses || [], diagramCorrections: row.diagramCorrections, visualFallback: row.visualFallback, costUsd: row.costUsd,
        costSource: row.costSource || (row.ledgerUsd > 0 ? 'ledger' : 'estimate'), tokens: t ? { input: t.input, output: t.output, authorUsd: t.authorUsd, pictureUsd: t.pictureUsd } : null,
        raw: row.raw ?? null, unknownKeysStripped: row.unknownKeysStripped ?? null, picturesDropped: row.picturesDropped ?? null, startedAt: row.startedAt });
    }
  }
  return { recs, notes };
}

// Every metric shown in the tables and the deltas: [label, value(summary) -> [count, of] | number | null, better: 'up' | 'down' | null]
const pair = (a, b) => (b ? [a, b] : null);
export const METRICS = [
  ['cards delivered', s => pair(s.cards.delivered, s.cards.sent), 'up'],
  ['kind/mix right', s => pair(s.choice.right, s.choice.of), 'up'],
  ['kind/mix acceptable', s => pair(s.choice.acceptable, s.choice.of), null],
  ['kind/mix wrong', s => pair(s.choice.wrong, s.choice.of), 'down'],
  ['right mix, wrong kind', s => pair(s.choice.rightMixWrongKind.length, s.choice.of), 'down'],
  ['kind regression pass (best kind every run)', s => s.regression && pair(s.regression.pass, s.regression.prompts), 'up'],
  ['picture given where needed', s => pair(s.pictures.given, s.pictures.needed), 'up'],
  ['picture where none belongs', s => pair(s.pictures.violations.length, s.pictures.noPictureSubjects), 'down'],
  ['diagrams', s => s.richness.diagrams, null],
  ['size: median items per diagram', s => s.richness.sizeMedian, null],
  ['diagram natural width (card width follows it): <= 408 / 409-700 / 701-960 / > 960, max px (no gate)', s => (s.widths?.measured ? `${s.widths.le408} / ${s.widths.to700} / ${s.widths.to960} / ${s.widths.over960}, max ${s.widths.max}` : null), null],
  ['size: graph diagrams outside 3-8 items', s => pair(s.richness.graphOutside3to8, s.richness.graphDiagrams), 'down'],
  ['fields: edges labelled', s => pair(s.richness.labelledEdges, s.richness.edges), 'up'],
  ...['caption', 'detail', 'highlightPath', 'units', 'point labels'].map(k => [`fields: ${k} used`, s => pair(s.richness.fieldUse[k], s.richness.diagrams), 'up']),
  ['labels with maths or numbers', s => pair(s.richness.numericLabels, s.richness.labels), 'up'],
  ['prose noun-box diagrams (study rule)', s => pair(s.richness.proseNounBox, s.richness.diagrams), 'down'],
  ['quantitative kind on formula/metric/quantity prompts', s => pair(s.richness.quant.used, s.richness.quant.labelled), 'up'],
  ['content flags: noun-box or placeholder labels', s => pair(s.content.flagged, s.content.diagrams), 'down'],
  ['content flags: placeholder edge label', s => pair(s.content.placeholderEdge, s.content.diagrams), 'down'],
  ['content flags: duplicate node labels', s => pair(s.content.duplicateLabels, s.content.diagrams), 'down'],
  ['content flags: noun-box flow', s => pair(s.content.nounBoxFlow, s.content.diagrams), 'down'],
  ['content flags: bare maths', s => pair(s.content.bareMaths, s.content.diagrams), 'down'],
  ['renderer: relationship with duplicated boxes', s => pair(s.content.duplicatedRelationshipNodes, s.content.relationships), 'down'],
  ['content: diagram kind right', s => pair(s.content.kindRight, s.content.kindJudged), 'up'],
  ['content: formula prompts with a plot that recomputes', s => pair(s.content.formulaPlotOk, s.content.formulaPrompts), 'up'],
  ['arithmetic: plotted points off', s => pair(s.content.pointErrors, s.content.points), 'down'],
  // fully/not (faithful-v2); runs judged with faithful-v1 stored yes/no.
  ['faithful to the sketch (Core): fully', s => s.content.faithful && pair(s.content.faithful.fully ?? s.content.faithful.yes, s.content.faithful.judged), 'up'],
  ['faithful to the sketch (Core): not', s => s.content.faithful && pair(s.content.faithful.not ?? s.content.faithful.no, s.content.faithful.judged), 'down'],
  ['diagrams with claims beyond the prose (judge)', s => s.content.beyond && pair(s.content.beyond.yes, s.content.beyond.judged), 'down'],
  ['picture shows what the question asks: no (judge)', s => s.pictures.content && pair(s.pictures.content.no, s.pictures.content.judged), 'down'],
  ['pictures present', s => s.pictures.present, null],
  ['pictures dropped (status dropped or fence removed) of planned', s => s.pictures.dropped && pair(s.pictures.dropped.count, s.pictures.present + s.pictures.dropped.count), 'down'],
  ['factual score (judge mean, 1-5)', s => s.factual?.mean ?? null, 'up'],
  ['cards with a factual error', s => s.factual && pair(s.factual.withErrors, s.factual.judged), 'down'],
  ['repaired', s => pair(s.repairs.repaired, s.repairs.of), 'down'],
  ['server diagram corrections', s => s.repairs.correctionTotal, 'down'],
  ['visual fallback', s => pair(s.repairs.visualFallback.length, s.cards.sent), 'down'],
  ['unknown keys stripped (events)', s => s.repairs.unknownKeysStripped?.events ?? null, 'down'],
  ['speed p50 ms, all', s => s.speed.all.p50, 'down'],
  ['speed p90 ms, all', s => s.speed.all.p90, 'down'],
  ['speed p50 ms, no repair no picture', s => s.speed.cleanNoPicture.p50, 'down'],
  ['speed p90 ms, no repair no picture', s => s.speed.cleanNoPicture.p90, 'down'],
  ['speed p50 ms, no repair with picture', s => s.speed.cleanPicture.p50, 'down'],
  ['speed p90 ms, no repair with picture', s => s.speed.cleanPicture.p90, 'down'],
  ['speed p50 ms, repaired', s => s.speed.repaired.p50, 'down'],
  ['speed p90 ms, repaired', s => s.speed.repaired.p90, 'down'],
  ['cards within 4 s', s => pair(s.speed.within4s, s.speed.of), 'up'],
  ['cards with prose lists', s => pair(s.output.cardsWithLists, s.cards.delivered), 'down'],
  ['output chars per card: body', s => s.output.fields.body, null],
  ['output chars per card: visuals', s => s.output.fields.visuals, null],
  ['output chars per card: questions', s => s.output.fields.questions, null],
  ['output chars per card: terms', s => s.output.fields.terms, null],
  ['output tokens per card (mean)', s => s.tokens?.outputMean ?? null, 'down'],
  ['output tokens per card (p90)', s => s.tokens?.outputP90 ?? null, 'down'],
  ['cost per card US$', s => s.cost.perCard, 'down'],
  ['cost total US$', s => s.cost.total, null],
  ['quantity prompts with a plot or chart (the 6 quantity prompts)', s => pair(s.richness.quantityPlot.withPlot, s.richness.quantityPlot.prompts), 'up'],
  ['quantity prompts with a plot or chart and no wrong point', s => (s.richness.quantityPlot.withCorrectPlot == null ? null : pair(s.richness.quantityPlot.withCorrectPlot, s.richness.quantityPlot.prompts)), 'up'],
  ['server rewrite: flow -> sequence', s => s.repairs.corrections.flow_to_sequence ?? 0, null],
  ['server rewrite: flow loop -> cycle', s => s.repairs.corrections.flow_loop_to_cycle ?? 0, null],
  ['binary tree layout used', s => s.richness.binaryLayout, null],
  ['planner: failed (author ran without a plan)', s => s.planner && pair(s.planner.failed, s.planner.cards), 'down'],
  ['planner: p50 ms added per card', s => s.planner?.ms.p50 ?? null, 'down'],
  ['planner: p90 ms added per card', s => s.planner?.ms.p90 ?? null, 'down'],
  ['planner: right kind when the kind was fixed', s => s.planner?.fixed.cards ? pair(s.planner.fixed.right, s.planner.fixed.cards) : null, 'up'],
  ['planner: right kind when two kinds were offered', s => s.planner?.suggested.cards ? pair(s.planner.suggested.right, s.planner.suggested.cards) : null, 'up'],
  ['planner: author drew a kind the plan did not offer', s => s.planner && pair(s.planner.disagreements.cards, s.planner.cards - s.planner.failed - s.planner.pictureOnly), null],
  ['cards with 1-2 author references', s => s.references && pair(s.references.some, s.references.known), null],
];
const share = v => (Array.isArray(v) && v[1] ? v[0] / v[1] : null);
// Absolute gates for choosing a model arm (owner 2026-11-08). gate(summary, byRun) -> [shown value, ok]; ok null = cannot be scored on this run.
export const GATE_RULES = [
  ['factual: cards with a factual error <= 10% of judged cards', s => { const v = s.factual && [s.factual.withErrors, s.factual.judged]; return [v, v ? share(v) <= 0.10 : null]; }],
  ['speed: whole-card p50 1-4 s and p90 < 4 s', s => [`p50 ${s.speed.all.p50} / p90 ${s.speed.all.p90} ms`, s.speed.all.n ? s.speed.all.p50 >= 1000 && s.speed.all.p50 <= 4000 && s.speed.all.p90 < 4000 : null]],
  ['pictures both ways: none missing where needed, none where none belongs', s => [`missing ${s.pictures.missing.length}/${s.pictures.needed}, unwanted ${s.pictures.violations.length}/${s.pictures.noPictureSubjects}`,
    s.pictures.needed + s.pictures.noPictureSubjects ? s.pictures.missing.length === 0 && s.pictures.violations.length === 0 : null]],
  ['right kind >= 80% of delivered cards', s => { const v = [s.choice.right, s.choice.of]; return [v, v[1] ? share(v) >= 0.8 : null]; }],
  ['plot or chart on >= 5 of the 6 quantity prompts, every run', (s, byRun) => { const per = byRun.map(r => [r.summary.richness.quantityPlot.withCorrectPlot ?? r.summary.richness.quantityPlot.withPlot, r.summary.richness.quantityPlot.prompts]).filter(v => v[1]);
    return [per.map(v => `${v[0]}/${v[1]}`).join(', ') || '-', per.length ? per.every(v => v[1] === 6 && v[0] >= 5) : null]; }],
  ['noun-box or placeholder labels < 5% of diagrams', s => { const v = [s.content.flagged, s.content.diagrams]; return [v, v[1] ? share(v) < 0.05 : null]; }],
  ['faithfulness to the sketch (reported; no threshold on record)', s => [s.content.faithful ? `fully ${s.content.faithful.fully ?? s.content.faithful.yes}, partly ${s.content.faithful.partly}, not ${s.content.faithful.not ?? s.content.faithful.no} of ${s.content.faithful.judged}` : 'not judged', null]],
];
export const gates = (s, byRun) => GATE_RULES.map(([gate, f]) => { const [v, ok] = f(s, byRun); return { gate, value: show(v), ok }; });
// Arms ranked: every gate passing first, then the owner's tie-break: fewer factual errors, then lower p90, then lower cost per card.
export function rankArms(arms) {
  const key = s => [share(s.factual && [s.factual.withErrors, s.factual.judged]) ?? 1, s.speed.all.p90 ?? Infinity, s.cost.perCard ?? Infinity];
  const scored = arms.map(a => { const g = gates(a.summary, a.byRun); return { ...a, gates: g, passes: g.every(x => x.ok !== false), key: key(a.summary) }; });
  return scored.sort((x, y) => { if (x.passes !== y.passes) return x.passes ? -1 : 1; const i = x.key.findIndex((v, k) => v !== y.key[k]); return i < 0 ? 0 : x.key[i] - y.key[i]; });
}
export const REFERENCES_RULE = 'Owner decision rule (examples A/B): quality up and repairs not up -> keep; repairs or output tokens up without quality -> one example only, matched kind only, one re-run; neutral -> keep if warm-call time holds.';
const value = v => (Array.isArray(v) ? (v[1] ? v[0] / v[1] : null) : v);
export const show = v => (v === null || v === undefined ? '-' : Array.isArray(v) ? `${v[0]}/${v[1]}` : String(v));
// before/after summaries -> [{ label, before, after, change }] for every metric both runs have.
export function delta(before, after) {
  const rows = [];
  for (const [label, get, better] of METRICS) {
    const b = before ? get(before) : null, a = after ? get(after) : null, vb = value(b), va = value(a);
    if (vb === null || va === null || vb === undefined || va === undefined) continue;
    const d = va - vb, same = Math.abs(d) < 1e-9;
    rows.push({ label, before: show(b), after: show(a), change: same ? '= same' : `${d > 0 ? '↑' : '↓'}${better ? ((d > 0) === (better === 'up') ? ' better' : ' worse') : ''}` });
  }
  return rows;
}
// Owner pass rule for a richness change: content flags down, quantitative use up on labelled prompts, faithfulness not down; else revert.
export function richnessVerdict(before, after) {
  if (!before || !after) return { verdict: 'no comparison run', reasons: [] };
  const r = (s, f) => value(f(s)), flags = [r(before, s => pair(s.content.flagged, s.content.diagrams)), r(after, s => pair(s.content.flagged, s.content.diagrams))];
  const quant = [r(before, s => pair(s.richness.quant.used, s.richness.quant.labelled)), r(after, s => pair(s.richness.quant.used, s.richness.quant.labelled))];
  const faith = [r(before, s => s.content.faithful && pair(s.content.faithful.fully ?? s.content.faithful.yes, s.content.faithful.judged)), r(after, s => s.content.faithful && pair(s.content.faithful.fully ?? s.content.faithful.yes, s.content.faithful.judged))];
  const reasons = [];
  if (!(flags[1] < flags[0])) reasons.push('content flags not down');
  if (!(quant[1] > quant[0])) reasons.push('quantitative use not up');
  if (faith.some(x => x === null || x === undefined)) reasons.push('faithfulness not judged on both runs');
  else if (faith[1] < faith[0]) reasons.push('faithfulness down');
  return { verdict: reasons.length ? 'REVERT' : 'KEEP', reasons };
}

const runsOf = cards => [...new Set(cards.map(c => c.run))].sort((a, b) => a - b);
function summaries(cards, setNames) {
  const sets = Object.fromEntries(setNames.map(n => [n, summarize(cards.filter(c => c.set === n))]));
  const spread = Object.fromEntries(setNames.filter(n => runsOf(cards.filter(c => c.set === n)).length > 1).map(n => {
    const per = runsOf(cards.filter(c => c.set === n)).map(r => [r, summarize(cards.filter(c => c.set === n && c.run === r))]);
    return [n, METRICS.map(([label, get]) => { const vs = per.map(([, s]) => get(s)); const nums = vs.map(v => (Array.isArray(v) ? v[0] : v)).filter(x => Number.isFinite(x)); // counts, not rates (owner: report counts per run); a text row (the width buckets) has no min-max
      return nums.length ? { label, runs: per.map(([r]) => r), values: vs.map(show), min: Math.min(...nums), max: Math.max(...nums) } : null; }).filter(Boolean)];
  }));
  const judgedByRun = runsOf(cards).map(r => { const s = summarize(cards.filter(c => c.run === r)), pc = s.pictures.content, f = s.content.faithful;
    return { run: r, picture: pc ? [pc.no, pc.judged] : null, faithful: f ? [f.not ?? f.no, f.judged] : null, beyond: s.content.beyond ? [s.content.beyond.yes, s.content.beyond.judged] : null }; });
  const byRun = runsOf(cards).map(r => ({ run: r, summary: summarize(cards.filter(c => c.run === r)) }));
  // Examples A/B: every metric for cards the server gave 0 author references vs 1-2 (from explanation_author_raw); null when not logged.
  const refs = cards.some(c => c.references) ? { none: summarize(cards.filter(c => c.references && !c.references.count)), some: summarize(cards.filter(c => c.references?.count > 0)) } : null;
  // Per depth (--depths): the owner's correct-svg rows.
  const byDepth = Object.fromEntries([...new Set(cards.map(c => c.depth).filter(Boolean))].map(dep => { const cs = cards.filter(c => c.depth === dep), s = summarize(cs), deep = cs.filter(c => c.deepPlot);
    const faithfulCards = cs.filter(c => c.diagrams.some(d => d.faithful)), plots = cs.flatMap(c => c.diagrams.filter(d => PLOT_KINDS.includes(d.kind)).map(d => `${c.id} ${d.kind}: ${d.arithmetic?.checked ? `${d.arithmetic.errors}/${d.arithmetic.points} points off` : `not checked (${d.arithmetic?.reason})`}`));
    return [dep, { cards: cs.length, right: s.choice.right, faithful: faithfulCards.filter(c => c.diagrams.every(d => !d.faithful || ['fully', 'yes'].includes(d.faithful.verdict))).length, beyond: s.content.beyond ? `${s.content.beyond.yes}/${s.content.beyond.judged}` : '-', faithfulJudged: faithfulCards.length,
      quantityPlots: deep.filter(c => c.diagrams.some(d => PLOT_KINDS.includes(d.kind))).length, quantityPlotsCorrect: deep.filter(c => c.diagrams.some(d => PLOT_KINDS.includes(d.kind)) && !c.plotWrong).length, quantityPrompts: deep.length, placeholders: s.content.placeholderEdge, duplicates: s.content.duplicateLabels, bareMaths: s.content.bareMaths,
      formulaLabelCards: s.content.formulaLabelCards, repaired: s.repairs.repaired, p50: s.speed.all.p50, p90: s.speed.all.p90, pointErrors: s.content.pointErrors, points: s.content.points, plots }]; }));
  return { overall: summarize(cards), sets, spread, judgedByRun, byRun, refs, byDepth };
}

const previousRun = (root, exclude) => (existsSync(root) ? readdirSync(root).filter(d => d !== exclude && existsSync(join(root, d, 'results.json'))).sort().at(-1) : undefined);
const baselineRun = (root, exclude) => (existsSync(root) ? readdirSync(root).filter(d => d !== exclude && existsSync(join(root, d, 'results.json'))).sort().reverse().find(d => json(join(root, d, 'results.json')).meta?.baseline) : undefined);

const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');
const list = (title, xs) => (xs?.length ? `\n**${title}** (${xs.length})\n\n${xs.map(x => `- ${x}`).join('\n')}\n` : '');
const pct = v => (v === null || v === undefined ? '-' : Array.isArray(v) ? `${v[0]}/${v[1]}` : v);

export function markdown(r) {
  const { meta, summary: S, criteria: C, deltas, judge, provenance: P } = r, setNames = Object.keys(S.sets), cols = ['overall', ...setNames], at = n => (n === 'overall' ? S.overall : S.sets[n]);
  const out = [`# /explain card benchmark: ${meta.label}`, '', `Run \`${meta.runId}\`, scored ${meta.scored} (PT). Sets: ${setNames.map(n => `${n} (${meta.sets[n].prompts} prompts x ${meta.sets[n].runs} run${meta.sets[n].runs > 1 ? 's' : ''}, ${meta.sets[n].version.prompts} / ${meta.sets[n].version.labels})`).join('; ')}.${meta.baseline ? ' **Tagged as the release baseline.**' : ''}`, ''];
  if (r.keepChecks) out.push(`**Keep checks** against \`${r.keepChecks.against}\`: ${r.keepChecks.rows.map(x => `${x.check} ${x.value} (${x.limit}) ${x.ok ? 'PASS' : 'FAIL'}`).join('; ')}; p50 ${r.keepChecks.p50} ms (reported). **${r.keepChecks.pass ? 'KEEP' : 'DO NOT KEEP'}**`, '');
  out.push('## Provenance', '', P ? table(['field', 'value'], Object.entries(P).map(([k, v]) => [k, typeof v === 'object' ? `\`${JSON.stringify(v)}\`` : String(v)])) : 'Not recorded for this run (imported from saved cards: no stack commit, prompt hash or model profile was captured when they were made).', '');
  if (judge) out.push('## Judge', '', judge.dryRun ? `**Dry run: no call made.** ${judge.items} items (${Object.entries(judge.byRubric).map(([k, v]) => `${k} ${v}`).join(', ')}), ${judge.cached} already cached; a real pass would cost about US$${judge.estimate.low}-${judge.estimate.high} (${judge.estimate.inputTokens} input tokens estimated from characters, 150-600 output tokens a call) with ${judge.model}.`
    : `Model ${judge.model}, ${judge.judges} judge(s) per item, ${judge.calls} calls + ${judge.cached} cached, US$${judge.spent} spent of the US$${judge.cap} judge cap${judge.stopped ? ' (cap reached: some items unjudged)' : ''}${judge.failed ? `, ${judge.failed} failed calls` : ''}${judge.only ? `; rubrics run: ${judge.only.join(', ')}` : ''}.`,
  '', ...Object.entries(RUBRICS).map(([k, v]) => `- **${k}** \`${v.version}\` (hash \`${judge.rubrics[k]?.hash}\`): ${v.text}`), '');
  else out.push('## Judge', '', 'Not run (no --judge): factual, faithfulness and picture-content rows are empty.', '');
  if (S.judgedByRun.some(x => x.picture || x.faithful || x.beyond)) out.push('### Picture content, diagram faithfulness and claims beyond the prose', '', table(['run', 'picture shows what the question asks: no', 'share', 'diagram faithful to the sketch: not', 'share', 'diagram claims beyond the prose: yes', 'share'],
    [...S.judgedByRun.map(x => [`r${x.run}`, ...[x.picture, x.faithful, x.beyond].flatMap(v => (v ? [`${v[0]}/${v[1]}`, `${Math.round(100 * v[0] / v[1])}%`] : ['-', '-']))]),
      ['all runs', ...[S.overall.pictures.content && [S.overall.pictures.content.no, S.overall.pictures.content.judged], S.overall.content.faithful && [S.overall.content.faithful.not ?? S.overall.content.faithful.no, S.overall.content.faithful.judged], S.overall.content.beyond && [S.overall.content.beyond.yes, S.overall.content.beyond.judged]].flatMap(v => (v ? [`${v[0]}/${v[1]}`, `${Math.round(100 * v[0] / v[1])}%`] : ['-', '-']))]]), '');
  out.push('## Pass criteria on record', '', C.length ? table(['set', 'criterion', 'result', 'detail'], C.map(c => [c.set, c.rule, c.ok ? 'PASS' : '**FAIL**', c.detail])) : 'None for these sets.', '');
  const PC = S.overall.content.plotChecks;
  if (PC) out.push(`Plot point errors (rule: ${meta.plotRule}; ${meta.plotRule === 'strict' ? 'a plot with any wrong point makes its card wrong; every stated formula is tried and a plot matching fewer than half its points on all of them is a different function, not checked' : meta.plotRule === 'strict-first' ? 'a plot with any wrong point makes its card wrong; first stated formula only' : 'points reported, the score unchanged, first stated formula only'}): ${PC.plots} plots drawn, ${PC.checked} checked (${PC.points} points, ${PC.errors} wrong), ${PC.unchecked} not checked.`, '', ...PC.list.map(x => `- ${x}`), '');
  const BD = Object.entries(S.byDepth || {});
  if (BD.length) out.push('## By depth', '', table(['metric', ...BD.map(([d]) => d)], [
    ['right kind', ...BD.map(([, v]) => `${v.right}/${v.cards}`)], ['faithful to the sketch, Core (judge, cards with every diagram fully)', ...BD.map(([, v]) => (v.faithfulJudged ? `${v.faithful}/${v.faithfulJudged}` : '-'))], ['diagrams with claims beyond the prose (judge)', ...BD.map(([, v]) => v.beyond)],
    ['plot or chart on the 6 quantity prompts (drawn / with no wrong point)', ...BD.map(([, v]) => `${v.quantityPlots} / ${v.quantityPlotsCorrect}`)], ['placeholder edge labels (diagrams)', ...BD.map(([, v]) => v.placeholders)], ['duplicate node labels (diagrams)', ...BD.map(([, v]) => v.duplicates)],
    ['bare maths (diagrams)', ...BD.map(([, v]) => v.bareMaths)], ['cards with formulas/maths in diagram labels', ...BD.map(([, v]) => v.formulaLabelCards)], ['repaired', ...BD.map(([, v]) => `${v.repaired}/${v.cards}`)],
    ['p50 / p90 ms', ...BD.map(([, v]) => `${v.p50} / ${v.p90}`)], ['plotted points off (recomputed from the prose formula)', ...BD.map(([, v]) => `${v.pointErrors}/${v.points}`)]]), '',
    ...BD.flatMap(([d, v]) => (v.plots.length ? [`- ${d} plots: ${v.plots.join('; ')}`] : [])), '');
  out.push('## Absolute gates (model arm choice; not in the exit code)', '', table(['gate', 'value', 'result'], gates(S.overall, S.byRun).map(g => [g.gate, g.value, g.ok === null ? 'n/a' : g.ok ? 'PASS' : '**FAIL**'])), '');
  if (r.referencesAB) out.push(`## Examples A/B: cards with 0 vs 1-2 author references`, '', table(['metric', `0 references (${S.refs.none.cards.sent} cards)`, `1-2 references (${S.refs.some.cards.sent} cards)`, `${r.referencesAB.against ?? 'no comparison run'} (all cards)`], r.referencesAB.rows), '', REFERENCES_RULE, '');
  else out.push('## Examples A/B', '', 'references: not logged (no explanation_author_raw line with references in the app log).', '');
  if (r.richness) out.push(`Richness change rule (content flags down, quantitative use up, faithfulness not down) against ${r.richness.against}: **${r.richness.verdict}**${r.richness.reasons.length ? ` (${r.richness.reasons.join('; ')})` : ''}.`, '');
  for (const [title, d] of [['Delta against the previous run', deltas.previous], ['Delta against the release baseline', deltas.baseline]]) {
    out.push(`## ${title}`, '', d ? `Against \`${d.against}\`${d.comparable ? '' : ` (**not like for like**: ${d.comparable === false ? d.why : ''})`}.` : 'No such run in the results folder.', '');
    if (d) out.push(d.rows.length ? table(['metric', 'before', 'after', 'change'], d.rows.map(x => [x.label, x.before, x.after, x.change])) : 'No metric in common.', '');
  }
  // Range over runs (all sets of each run): a rate's min-max share, a number's min-max.
  const range = get => { if (S.byRun.length < 2) return null; const vs = S.byRun.map(x => get(x.summary)).filter(v => v !== null && v !== undefined);
    if (!vs.length) return '-'; const rates = vs.map(v => (Array.isArray(v) ? share(v) : v)).filter(Number.isFinite); if (!rates.length) return '-';
    const [lo, hi] = [Math.min(...rates), Math.max(...rates)]; return Array.isArray(vs[0]) ? `${Math.round(100 * lo)}-${Math.round(100 * hi)}%` : `${+lo.toFixed(4)}-${+hi.toFixed(4)}`; };
  const rangeCol = S.byRun.length > 1 ? [`range over ${S.byRun.length} runs`] : [];
  out.push('## All metrics (counts are count/denominator)', '', table(['metric', ...cols, ...rangeCol], METRICS.map(([label, get]) => [label, ...cols.map(n => pct(get(at(n)))), ...(rangeCol.length ? [range(get)] : [])]).filter(row => row.slice(1).some(v => v !== '-'))), '');
  for (const [n, rows] of Object.entries(S.spread)) out.push(`### Spread over runs: ${n}`, '', table(['metric', ...rows[0].runs.map(r => `r${r}`), 'min-max'], rows.map(x => [x.label, ...x.values, `${x.min}-${x.max}`])), '');
  const O = S.overall;
  out.push('## Output tokens by diagram kind', '', O.tokens ? table(['kind in card', 'cards', 'output tokens mean', 'output tokens p90', 'ms p50', 'ms p90'], Object.entries(O.tokens.byKind).sort((a, b) => b[1].outputMean - a[1].outputMean).map(([k, v]) => [k, v.cards, v.outputMean, v.outputP90, v.msP50, v.msP90])) : 'No token counts (run bench.mjs with --persist <stack persist dir>).', '');
  out.push('## Visual-mix matrix (rows: expected mix from the labels; columns: what the card got)', '', 'A label that lists best mixes of several shapes counts on the shape the card made when it is one of them, else on its first listed shape. Diagonal = the expected shape was made.', '');
  for (const n of cols) { const M = at(n).mixMatrix; if (!M?.cards) continue; const T = M.twoVisuals, PG = at(n).pictures;
    out.push(`### ${n}: ${M.cards} cards`, '', table(['expected / made', ...M.cols, 'cards'], M.rows.map(r => [r, ...M.cols.map(m => (M.counts[r][m] ? (m === r ? `**${M.counts[r][m]}**` : M.counts[r][m]) : '.')), M.cols.reduce((s, m) => s + M.counts[r][m], 0)])), '',
      `Two expected / two made: ${T.madeTwoOfExpected}/${T.expected} cards expected to have two visuals got two; ${T.madeTwoNotExpected} cards got two where the label expects one. Picture needed / given: ${PG.given}/${PG.needed}; picture where none belongs: ${PG.violations.length}/${PG.noPictureSubjects}.`, list('Off-diagonal cards (expected -> made)', M.off.map(o => `${o.expected} -> ${o.made}: ${o.cards.join(', ')}`))); }
  out.push('## Repairs', '', table(['cause (first attempt)', 'cards'], Object.entries(O.repairs.byCause).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v])), '',
    `Server corrections: ${Object.entries(O.repairs.corrections).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}. Unknown keys stripped: ${O.repairs.unknownKeysStripped ? `${O.repairs.unknownKeysStripped.events} events, ${O.repairs.unknownKeysStripped.keys} keys, on ${O.repairs.unknownKeysStripped.cards} cards` : 'not logged'}. Raw pre-correction specs: ${O.repairs.rawLogged ? `logged for ${O.repairs.rawLogged}/${O.cards.sent} cards` : 'raw: not logged (no explanation_author_raw event in the app log)'}.`, '');
  out.push(`Slowest card: ${O.speed.slowest ? `${O.speed.slowest.at} ${O.speed.slowest.ms} ms, ${O.speed.slowest.repaired ? `repaired (${O.speed.slowest.causes.join(', ')})` : 'not repaired'}, ${O.speed.slowest.pictures} picture(s)` : '-'}.`, '');
  if (O.planner) { const P = O.planner, f = P.fixed, g = P.suggested, d = P.disagreements, est = r.plannerCost;
    out.push('## Planner (JEV)', '', table(['metric', 'value'], [['cards with a plan attempt', P.cards], ['planner failures (planner: rules, the author ran without a plan)', P.failed], ['planner latency added per card, p50 / p90 ms', `${P.ms.p50} / ${P.ms.p90} (n ${P.ms.n})`], ['plans with no diagram (picture only)', P.pictureOnly],
      ['kind fixed: cards, right / acceptable / wrong', `${f.cards}: ${f.right} / ${f.acceptable} / ${f.wrong}`], ['two kinds offered: cards, right / acceptable / wrong', `${g.cards}: ${g.right} / ${g.acceptable} / ${g.wrong}`],
      ['plans for a physical subject (isPhysical >= 0.7): with a picture / picture alone / picture + diagram / no picture', `${P.physical.cards}: ${P.physical.withPicture} / ${P.physical.pictureOnly} / ${P.physical.both} / ${P.physical.noPicture.length}${P.physical.noPicture.length ? ' (' + P.physical.noPicture.join(', ') + ')' : ''}`], ['plans logging physicalOverride (the raw line does not carry it unless the server adds it)', P.physical.logged],
      ['author drew a kind outside the plan (fixed kind, or neither offered kind)', d.cards], ['  planner label right or acceptable, author not', d.planOnly], ['  author label right or acceptable, planner not', d.authorOnly], ['  both right or acceptable', d.both], ['  neither', d.neither],
      ['cost: author per card (ledger)', O.cost.perCard], ['cost: planner per card (estimate, input tokens only)', est ? `US$${est.perCard} (${est.tokens} tokens x US$0.042 per million; plan.inputTokens is not in the log line)` : 'not estimated (no provenance)']]), '', list('Plan and author disagree', d.list));
  }
  out.push('## Lists', ...[list('Failed sends', O.cards.failures), list('Wrong mix', O.choice.wrongList), list('Right mix, wrong kind', O.choice.rightMixWrongKind), list('Bad kind used', O.choice.badKindUsed),
    list('Picture missing where needed', O.pictures.missing), list('Picture where none belongs', O.pictures.violations), list('Pictures dropped', O.pictures.dropped?.list), list('Quantitative-kind prompts', O.richness.quant.list),
    list('Content flags', O.content.flaggedList), list('Plotted values', O.content.arithmeticList), list('Not fully faithful to the sketch (Core)', O.content.faithful?.list), list('Claims beyond the prose (judge)', O.content.beyond?.list), list('Factual errors (judge)', O.factual?.list), list('Visual fallback', O.repairs.visualFallback)].filter(Boolean));
  out.push('## Cards', '', table(['set', 'run', 'id', 'mix', 'score', 'ms', 'repaired', 'US$', 'references', 'visuals (diagram kind: items, flags; picture check)'], r.cards.map(c => [c.set, c.depth ? `${c.run} ${c.depth}` : c.run, c.id, c.mix.join(' + ') || '-', c.score, c.totalMs ?? '-', c.repaired ? 'yes' : '', c.costUsd ?? '-',
    c.references ? `${c.references.count}${c.references.count ? ` (${c.references.ids.join(', ')})` : ''}` : '-',
    c.diagrams.map(d => `${d.kind}: ${d.units}${d.flagged ? ' FLAG' : ''}${d.arithmetic?.errors ? ` ${d.arithmetic.errors} pts off` : ''}${d.faithful ? ` faithful=${d.faithful.verdict}` : ''}${d.beyond?.verdict === 'yes' ? ' beyond-prose' : ''}`).concat(c.pictures.map(p => `picture${p.content ? `: shows the question=${p.content.verdict}` : ''}`)).join('; ')])), '');
  return out.join('\n');
}

// factual-v2 shows the judge what the G3 gate showed it (judge.mjs of 2026-11-08, cardText): the title, the prose with the visual fences taken out, each diagram's visible text and
// each picture's caption and alt. A diagram kind newer than this tree's spec.js shows every string of its spec except structural keys (the G3 judge showed none: "not drawable").
const FENCE_G3 = /^\s*```\s*(rh-diagram|rh-illustration)[^\n]*\n([\s\S]*?)^\s*```/gim, STRUCTURAL = new Set(['id', 'kind', 'role', 'parent', 'from', 'to', 'side', 'layout', 'variant', 'anchor', 'direction', 'scale', 'figure', 'version']);
const allStrings = (v, key = '') => (typeof v === 'string' ? (STRUCTURAL.has(key) ? [] : [v]) : Array.isArray(v) ? v.flatMap(x => allStrings(x, key)) : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => allStrings(x, k)) : []);
export function g3CardText(block) {
  const body = String(block.body || ''), parts = [`Title: ${block.title || ''}`, `Prose:\n${body.replace(FENCE_G3, '').replace(/\n{3,}/g, '\n\n').trim()}`];
  for (const m of body.matchAll(FENCE_G3)) {
    if (m[1].toLowerCase() === 'rh-diagram') { try { const d = JSON.parse(m[2]).diagram; parts.push(`Diagram (${d.kind}): ${visibleText(d, allStrings(d)).join(' | ')}`); } catch { /* not drawable: not shown */ } }
    else { try { const p = JSON.parse(m[2]); parts.push(`Picture caption: ${p.caption} (shows: ${p.alt})`); } catch { /* none */ } }
  }
  return parts.join('\n\n');
}
const itemText = {
  factual: (c, block) => RUBRICS.factual.json ? g3CardText(block) : [`Learner's question: ${c.prompt}`, `Card title: ${block.title || ''}`, String(block.body || ''),
    (block.interactions?.terms || []).length ? `Key terms:\n${block.interactions.terms.map(t => `- ${t.label}: ${t.definition}`).join('\n')}` : '',
    (block.interactions?.questions || []).length ? `Follow-up questions:\n${block.interactions.questions.map(q => `- ${q.text}`).join('\n')}` : ''].filter(Boolean).join('\n\n'),
  faithful: (c, block, d) => [`Content sketch, written in advance:\n${c.sketch.map(l => `- ${l}`).join('\n')}`, `The diagram, as the renderer describes it:\n${d.describe ?? JSON.stringify(d.spec)}`, `The card's prose:\n${proseOf(block.body).trim()}`].join('\n\n'),
  beyond: (c, block, d) => [`The diagram, as the renderer describes it:\n${d.describe ?? JSON.stringify(d.spec)}`, `The card's prose:\n${proseOf(block.body).trim()}`].join('\n\n'),
  picture: (c, block, p) => [`Learner's question: ${c.prompt}`, `Card prose next to the picture:\n${[p.before, p.after].filter(Boolean).join('\n\n') || '(none)'}`,
    `The picture, as described:\nprompt: ${p.prompt ?? ''}\nalt text: ${p.alt ?? ''}\ncaption: ${p.caption ?? ''}`].join('\n\n'),
};

// The whole pipeline over a raw dir. -> { code, runDir, results }
export async function run(o) {
  const out = resolve(o.out || DEFAULT_OUT), runId = o.runId || runDirName(o.label), runDir = join(out, runId);
  mkdirSync(runDir, { recursive: true });
  // The diagram wording the judge sees and the descriptions come from the tree the cards were made on: --spec-tree, else the run's recorded stack tree, else this tree.
  const specTree = await useSpecTree(o.specTree || (existsSync(join(runDir, 'provenance.json')) ? json(join(runDir, 'provenance.json')).stackTree : null));
  const { recs, notes } = loadRaw(o.raw, o.folders), setNames = [...new Set(recs.map(r => r.set))].sort((a, b) => availableSets().indexOf(a) - availableSets().indexOf(b));
  const defs = Object.fromEntries(setNames.map(n => [n, loadSet(n)])), blocks = new Map(), cards = [];
  for (const rec of recs) {
    const p = defs[rec.set].prompts.find(x => x.id === rec.id);
    if (!p) { notes.push(`skipped ${rec.set}/r${rec.run}/${rec.id}: not in the current ${rec.set} set`); continue; }
    const c = scoreCard(p, rec, { plotRule: o.plotRule }); cards.push(c); blocks.set(c, rec.block);
  }
  let judge = null;
  const restoreRubrics = o.rubrics ? useRubrics(o.rubrics) : null; // --rubrics factual=factual-v1: an older version, for re-scoring
  // --same-as <run dir>: judge only the items that run's judge answered (same cards, diagrams and pictures), not whatever its cap left.
  const keep = o.sameAs ? (prev => { const k = new Set(); for (const c of prev.cards) { const key = cardKey(c); if (c.judge?.factual) k.add(`factual|${key}`);
    c.diagrams.forEach((d, i) => { if (d.faithful) k.add(`faithful|${key}#d${i}`); if (d.beyond) k.add(`beyond|${key}#d${i}b`); }); c.pictures.forEach((p, i) => { if (p.content) k.add(`picture|${key}#p${i}`); }); } return k; })(json(join(resolve(o.sameAs), 'results.json'))) : null;
  if (o.judge) {
    const items = [], ref = new Map(), want = r => !o.judgeOnly?.length || o.judgeOnly.includes(r);
    const push = (key, rubric, text, target) => { if (want(rubric) && (!keep || keep.has(`${rubric}|${key}`))) { items.push({ key, rubric, text }); ref.set(key, [rubric, target]); } };
    for (const c of cards.filter(x => x.delivered)) {
      const key = cardKey(c), b = blocks.get(c);
      push(key, 'factual', itemText.factual(c, b), c);
      c.diagrams.forEach((d, i) => { if (o.judgeDiagrams && i >= o.judgeDiagrams) return; if (c.sketch) push(`${key}#d${i}`, 'faithful', itemText.faithful(c, b, d), d); push(`${key}#d${i}b`, 'beyond', itemText.beyond(c, b, d), d); });
      c.pictures.forEach((p, i) => push(`${key}#p${i}`, 'picture', itemText.picture(c, b, p), p));
    }
    judge = await judgeItems(items, { judges: o.judges || 1, cap: o.judgeCap ?? 1, call: o.call || keyTransport(), cacheFile: join(out, 'judge-cache.json'), log: o.log || console.log, dryRun: !!o.judgeDryRun });
    for (const [key, [rubric, target]] of ref) { const v = combine(rubric, judge.results[key]); if (!v) continue; if (rubric === 'factual') target.judge = { factual: v }; else if (rubric === 'faithful') target.faithful = v; else if (rubric === 'beyond') target.beyond = v; else target.content = v; }
    if (o.judgeDryRun) writeFileSync(join(runDir, 'judge-items.json'), JSON.stringify(items, null, 1)); // exactly what a real pass would send, for inspection
    judge = { ...judge, cap: o.judgeCap ?? 1, only: o.judgeOnly?.length ? o.judgeOnly : null, results: undefined };
  }
  const summary = summaries(cards, setNames), crit = setNames.flatMap(n => criteria(defs[n], cards.filter(c => c.set === n)));
  const meta = { runId, label: o.label || 'run', plotRule: o.plotRule || 'strict', specTree, scored: runDirName('').slice(0, 17), raw: resolve(o.raw), baseline: !!o.tagBaseline, notes,
    sets: Object.fromEntries(setNames.map(n => [n, { prompts: defs[n].prompts.length, runs: runsOf(cards.filter(c => c.set === n)).length, version: defs[n].version }])) };
  const recorded = existsSync(join(runDir, 'provenance.json')) ? json(join(runDir, 'provenance.json')) : null;
  const provenance = judge ? { ...(recorded || { stack: 'not recorded for this run (imported saved cards)' }), judgeRubrics: judge.rubrics } : recorded;
  const like = (other) => { const why = setNames.filter(n => !other.meta.sets?.[n] || other.meta.sets[n].prompts !== meta.sets[n].prompts || other.meta.sets[n].runs !== meta.sets[n].runs || JSON.stringify(other.meta.sets[n].version) !== JSON.stringify(meta.sets[n].version)); return { comparable: why.length === 0, why: `sets differ: ${why.join(', ')}` }; };
  const cmp = dir => { if (!dir) return null; const prev = json(join(dir, 'results.json')); return { against: prev.meta.runId, ...like(prev), rows: delta(prev.summary.overall, summary.overall), summary: prev.summary.overall, byDepth: prev.summary.byDepth }; };
  const prevDir = o.against ? resolve(o.against) : (p => p && join(out, p))(previousRun(out, runId)), baseDir = o.baseline ? join(out, o.baseline) : (b => b && join(out, b))(baselineRun(out, runId));
  const deltas = { previous: cmp(prevDir), baseline: cmp(baseDir) };
  const against = deltas.baseline || deltas.previous;
  const keepChecks = (a => { const A = a?.byDepth, B = summary.byDepth; if (!A?.standard || !B?.standard || !A?.deep || !B?.deep) return null;
    const rep = [summary.overall.repairs.repaired, a.summary.repairs.repaired, summary.overall.repairs.of], p = summary.overall.speed.all;
    const rows = [{ check: 'right kind at Standard', value: B.standard.right, limit: `>= ${A.standard.right}`, ok: B.standard.right >= A.standard.right }, { check: 'right kind at Deep', value: B.deep.right, limit: `>= ${A.deep.right}`, ok: B.deep.right >= A.deep.right },
      { check: 'repairs', value: `${rep[0]}/${rep[2]}`, limit: `<= ${rep[1] + 2} (compared run ${rep[1]} + 2)`, ok: rep[0] <= rep[1] + 2 }, { check: 'p90 ms', value: p.p90, limit: '<= 7000', ok: p.p90 !== null && p.p90 <= 7000 }];
    return { against: a.against, rows, p50: p.p50, pass: rows.every(x => x.ok) }; })(against);
  const richness = { against: against?.against ?? 'none', ...richnessVerdict(against?.summary, summary.overall) };
  const abAgainst = deltas.previous; // the run to compare the examples A/B with: --against <5d run dir>, else the previous run
  const referencesAB = summary.refs ? { against: abAgainst?.against ?? null, rows: METRICS.map(([label, get]) => [label, show(get(summary.refs.none)), show(get(summary.refs.some)), abAgainst ? show(get(abAgainst.summary)) : '-']).filter(row => row.slice(1).some(v => v !== '-')) } : null;
  for (const d of Object.values(deltas)) if (d) { delete d.summary; delete d.byDepth; }
  const pe = provenance?.plannerInputTokensEstimate, plannerCost = pe && summary.overall.planner ? { tokens: pe, perCard: +(pe * 0.042 / 1e6).toFixed(6), cards: summary.overall.planner.cards } : null;
  const results = { keepChecks, plannerCost, meta, provenance, judge, criteria: crit, gates: gates(summary.overall, summary.byRun), richness, referencesAB, deltas, summary, cards };
  writeFileSync(join(runDir, 'results.json'), JSON.stringify(results, null, 1));
  writeFileSync(join(runDir, 'metrics.json'), JSON.stringify({ meta, provenance, criteria: crit, richness, deltas, summary }, null, 1));
  writeFileSync(join(runDir, 'report.md'), markdown(results));
  if (restoreRubrics) Object.assign(RUBRICS, restoreRubrics);
  const failed = crit.filter(c => !c.ok).length + (o.richnessChange && richness.verdict !== 'KEEP' ? 1 : 0);
  return { code: failed ? 1 : 0, runDir, results };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { values: a } = parseArgs({ options: { raw: { type: 'string' }, 'run-id': { type: 'string' }, label: { type: 'string' }, out: { type: 'string' }, against: { type: 'string' }, baseline: { type: 'string' }, 'tag-baseline': { type: 'boolean' },
    judge: { type: 'boolean' }, judges: { type: 'string' }, 'judge-cap': { type: 'string' }, 'judge-only': { type: 'string' }, 'judge-dry-run': { type: 'boolean' }, rubrics: { type: 'string' }, 'spec-tree': { type: 'string' }, folders: { type: 'string' }, 'judge-diagrams': { type: 'string' }, 'plot-rule': { type: 'string' }, 'same-as': { type: 'string' }, 'richness-change': { type: 'boolean' } } });
  if (!a.raw) { console.error('usage: node scripts/explain-bench/report.mjs --raw <dir> [--label ...] [--out ...] [--against <dir>] [--baseline <run id>] [--tag-baseline] [--judge [--judge-dry-run] [--judge-only factual,faithful,beyond,picture] [--same-as <run dir>] [--rubrics factual=factual-v1,beyond=beyond-v1] [--spec-tree <the stack worktree>] [--folders B,C] [--judge-diagrams 1] [--plot-rule strict|strict-first|legacy] [--judges N] [--judge-cap 1.00]] [--richness-change]'); process.exit(2); }
  const r = await run({ raw: a.raw, runId: a['run-id'], label: a.label, out: a.out, against: a.against, baseline: a.baseline, tagBaseline: a['tag-baseline'], judge: a.judge || a['judge-dry-run'], judgeDryRun: a['judge-dry-run'],
    judgeOnly: (a['judge-only'] || '').split(',').filter(Boolean), rubrics: a.rubrics, specTree: a['spec-tree'], folders: (a.folders || '').split(',').filter(Boolean), judgeDiagrams: Number(a['judge-diagrams'] || 0), plotRule: a['plot-rule'], sameAs: a['same-as'], judges: Number(a.judges || 1), judgeCap: Number(a['judge-cap'] || 1), richnessChange: a['richness-change'] });
  for (const n of r.results.meta.notes) console.log(`note: ${n}`);
  for (const c of r.results.criteria) console.log(`${c.ok ? '✓' : '✗'} ${c.set}: ${c.rule}: ${c.detail}`);
  const J = r.results.judge;
  if (J) console.log(J.dryRun ? `judge dry run: ${J.items} items (${Object.entries(J.byRubric).map(([k, v]) => `${k} ${v}`).join(', ')}), ${J.cached} cached, estimate US$${J.estimate.low}-${J.estimate.high}, nothing sent` : `judge: ${J.calls} calls, ${J.cached} cached, US$${J.spent}`);
  console.log(`RESULT ${r.code ? 'FAIL' : 'PASS'} report=${join(r.runDir, 'report.md')}`);
  process.exit(r.code);
}
