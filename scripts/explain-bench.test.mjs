// /explain card benchmark (scripts/explain-bench): scoring, content flags, plotted-value recompute, criteria, delta, judge blindness and the report, on fixtures (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { arithmetic, compileFormula, criteria, diagramScore, loadSet, matches, scoreCard, scoreMix, summarize, visuals, SET_NAMES } from './explain-bench/score.mjs';
import { delta, richnessVerdict, run } from './explain-bench/report.mjs';
import { combine, judgeItems, JUDGE_MODEL } from './explain-bench/judge.mjs';

const fence = d => `\`\`\`rh-diagram\n${JSON.stringify({ version: 1, diagram: d })}\n\`\`\``;
const pic = id => `\`\`\`rh-illustration\n${JSON.stringify({ id, prompt: 'a picture', caption: 'look here' })}\n\`\`\``;
const block = (prose, ...vis) => ({ title: 'T', body: [prose, ...vis].join('\n\n'), interactions: { questions: [{ text: 'Why?' }], terms: [] } });
const flow = (labels, { decision = false, edgeLabel } = {}) => ({ kind: 'flow', title: 'F', nodes: labels.map((label, i) => ({ id: `n${i}`, label, role: decision && i === 1 ? 'decision' : i === labels.length - 1 ? 'outcome' : 'process' })),
  edges: labels.slice(1).map((_, i) => ({ from: `n${i}`, to: `n${i + 1}`, ...(edgeLabel ? { label: edgeLabel } : {}) })) });
const sigmoidPlot = ys => ({ kind: 'coordinate-plot', title: 'S', x: { label: 'z', min: -2, max: 2 }, y: { label: 's', min: 0, max: 1 }, series: [{ label: 's', kind: 'line', points: [-2, 0, 2].map((x, i) => ({ x, y: ys[i] })) }] });

test('every set file is versioned and each prompt carries its labels and picture flags', () => {
  for (const n of SET_NAMES) {
    const s = loadSet(n);
    assert.ok(s.version.prompts && s.version.labels && s.defaultRuns >= 1 && s.estUsdPerCard > 0, n);
    for (const p of s.prompts) assert.ok(p.id && p.prompt && p.best.length && Array.isArray(p.acceptable) && typeof p.needsPicture === 'boolean' && typeof p.noPicture === 'boolean', `${n}/${p.id}`);
  }
  const content = loadSet('content');
  assert.equal(content.prompts.length, 20); assert.equal(content.defaultRuns, 3);
  assert.equal(content.prompts.filter(p => p.category === 'formula').length, 8);
  assert.ok(content.prompts.every(p => p.kinds.length && p.sketch.length === 2));
  // Owner relabels 2026-11-08 live in the set files.
  const entropy = loadSet('regression').prompts.find(p => p.id === 'entropy');
  assert.equal(scoreMix(entropy, visuals(block('x', fence({ kind: 'transformation', title: 't', before: { label: 'a', items: ['x'] }, after: { label: 'b', items: ['y'] }, operation: 'o' })))), 'right');
  assert.equal(scoreMix(entropy, [{ type: 'diagram', kind: 'relationship', diagram: {} }]), 'acceptable');
});

test('mix matching: any order, kind alternatives, and the flow-needs-a-decision relabel', () => {
  assert.ok(matches(['P', 'D:tree|flow'], ['D:flow', 'P']) && !matches(['P'], ['D:flow']) && matches(['D:*'], ['D:layers']) && !matches(['D:cycle'], ['D:cycle', 'P']));
  const dns = loadSet('sequence').prompts.find(p => p.id === 'dns-lookup');
  const v = d => visuals(block('prose', ...d.map(fence)));
  assert.equal(scoreMix(dns, v([flow(['Ask resolver', 'Cached?', 'Answer'], { decision: true })])), 'right');
  assert.equal(scoreMix(dns, v([flow(['Ask resolver', 'Query root', 'Answer'])])), 'acceptable');
  assert.equal(scoreMix(dns, v([{ kind: 'sequence', title: 's', actors: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], messages: [{ from: 'a', to: 'b', label: 'q' }] }, flow(['Ask', 'Query', 'Answer'])])), 'right');
  assert.equal(scoreMix(dns, v([{ kind: 'layers', title: 'l', layers: [{ label: 'a' }, { label: 'b' }] }])), 'wrong');
});

test('content flags follow the written rules', () => {
  const nouns = diagramScore(flow(['Water', 'Cloud', 'Rain']), 'water cloud rain');
  assert.equal(nouns.flags.nounBoxFlow, true); assert.equal(nouns.flagged, true); assert.equal(nouns.proseNounBox, true);
  const verbs = diagramScore(flow(['Evaporates from the sea', 'Cloud forms', 'Rain falls']), 'prose');
  assert.equal(verbs.flags.nounBoxFlow, false); assert.equal(verbs.flagged, false);
  assert.deepEqual(diagramScore(flow(['Compute a', 'Compute b', 'Done'], { edgeLabel: 'Input' }), '').flags.placeholderEdge, ['Input', 'Input']);
  assert.deepEqual(diagramScore(flow(['Split data', 'split data ', 'Done']), '').flags.duplicateLabels, ['split data']);
  const maths = diagramScore(flow(['Compute $p_i$', 'Compute p_i', 'Done']), '');
  assert.deepEqual(maths.flags.bareMaths, ['Compute p_i']);
  const rel = diagramScore({ kind: 'relationship', title: 'r', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], edges: [{ from: 'a', to: 'b', label: 'feeds' }, { from: 'a', to: 'c', label: 'trains' }] }, '');
  assert.deepEqual(rel.duplicatedRelationshipNodes, ['A']);
  assert.match(rel.describe, /A — feeds → B/);
  assert.equal(diagramScore(flow(['A', 'B']), '', ['cycle']).kindRight, false);
});

test('plotted values are recomputed from the one-variable formula in the prose', () => {
  assert.equal(compileFormula('\\frac{1}{1+e^{-z}}').f(0), 0.5);
  assert.equal(compileFormula('2p(1-p)').f(0.5), 0.5);
  assert.equal(compileFormula('-\\ln p'), null, 'a function without brackets is not guessed');
  assert.equal(compileFormula('P(1+r)^t'), null, 'more than one variable is not checkable');
  assert.equal(compileFormula('\\sum_i p_i'), null);
  const prose = 'The sigmoid is $\\sigma(z) = \\frac{1}{1+e^{-z}}$.';
  assert.deepEqual(arithmetic(sigmoidPlot([0.12, 0.5, 0.88]), prose), { checked: true, formula: '\\frac{1}{1+e^{-z}}', variable: 'z', points: 3, errors: 0 });
  assert.equal(arithmetic(sigmoidPlot([0.12, 0.6, 0.88]), prose).errors, 1);
  assert.equal(arithmetic(sigmoidPlot([0.12, 0.5, 0.88]), 'no formula here').checked, false);
});

const P = { regression: loadSet('regression').prompts, content: loadSet('content').prompts };
const rec = (set, run, id, b, extra = {}) => ({ set, run, id, delivered: !!b, block: b, totalMs: 3000, repaired: false, repairCauses: [], costUsd: 0.01, costSource: 'ledger', ...extra });
const card = (set, run, id, b, extra) => scoreCard(P[set].find(p => p.id === id), rec(set, run, id, b, extra));

test('summary and pass criteria: regression every run, formula plots per run, pictures, speed splits, repairs by cause', () => {
  const tree = { kind: 'tree', title: 't', nodes: [{ id: 'r', label: '8' }, { id: 'a', label: '3', parent: 'r' }] };
  const cards = [card('regression', 1, 'bst', block('p', fence(tree))), card('regression', 2, 'bst', block('p', fence(flow(['Compare key', 'Go left', 'Found']))), { repaired: true, repairCauses: [{ attempt: 0, error: 'diagram.nodes: A flow needs exactly one root' }], totalMs: 7000 }),
    card('regression', 1, 'water-cycle', block('p', fence({ kind: 'cycle', title: 'c', steps: ['Evaporate', 'Condense', 'Fall'] }), pic('pic-1')), { totalMs: 5000 })];
  const s = summarize(cards);
  assert.deepEqual([s.regression.pass, s.regression.prompts], [1, 2]);
  assert.deepEqual(s.repairs.byCause, { 'two roots': 1 });
  assert.deepEqual([s.speed.cleanNoPicture.n, s.speed.cleanPicture.n, s.speed.repaired.n, s.speed.within4s], [1, 1, 1, 1]);
  assert.equal(s.pictures.violations.length, 0);
  assert.deepEqual(criteria(loadSet('regression'), cards).map(c => c.ok), [false]);
  const formula = id => P.content.find(p => p.id === id);
  const prose = 'The sigmoid is $\\sigma(z) = \\frac{1}{1+e^{-z}}$.';
  const ok = id => scoreCard(formula(id), rec('content', 1, id, block(prose, fence(sigmoidPlot([0.12, 0.5, 0.88])))));
  const run1 = P.content.filter(p => p.category === 'formula').map((p, i) => (i < 6 ? ok(p.id) : scoreCard(p, rec('content', 1, p.id, block('x', fence(flow(['Score a', 'Score b', 'Done'])))))));
  const c = criteria(loadSet('content'), run1);
  assert.equal(c.find(x => x.rule.startsWith('coordinate-plot')).ok, true);
  const bad = [...run1.slice(0, 5), scoreCard(formula('sigmoid'), rec('content', 1, 'sigmoid', block(prose, fence(sigmoidPlot([0.3, 0.5, 0.88]))))), ...run1.slice(6)];
  assert.equal(criteria(loadSet('content'), bad).find(x => x.rule.startsWith('coordinate-plot')).ok, false, 'a plot whose values do not recompute does not count');
});

test('delta marks each metric better, worse or same; the richness rule keeps or reverts', () => {
  const mk = (flagged, quantUsed, yes) => ({ cards: { sent: 10, delivered: 10 }, choice: { right: 5, of: 10, acceptable: 0, wrong: 0, rightMixWrongKind: [] }, regression: null, pictures: { given: 0, needed: 0, violations: [], noPictureSubjects: 0 },
    richness: { diagrams: 10, sizeMedian: 5, graphDiagrams: 0, graphOutside3to8: 0, edges: 0, labelledEdges: 0, fieldUse: {}, labels: 0, numericLabels: 0, proseNounBox: 0, quant: { used: quantUsed, labelled: 8 } },
    content: { diagrams: 10, flagged, placeholderEdge: 0, duplicateLabels: 0, nounBoxFlow: 0, bareMaths: 0, relationships: 0, duplicatedRelationshipNodes: 0, kindRight: 0, kindJudged: 0, formulaPlotOk: 0, formulaPrompts: 0, points: 0, pointErrors: 0, faithful: yes === null ? null : { yes, judged: 10 } },
    factual: null, repairs: { repaired: 2, of: 10, correctionTotal: 0, visualFallback: [], unknownKeysStripped: null }, speed: { all: { p50: 3000, p90: 6000 }, cleanNoPicture: {}, cleanPicture: {}, repaired: {}, within4s: 7, of: 10 },
    output: { cardsWithLists: 0, fields: {} }, tokens: null, cost: { perCard: 0.01, total: 0.1 } });
  const rows = delta(mk(4, 2, 8), { ...mk(2, 5, 8), speed: { ...mk(0, 0, 0).speed, all: { p50: 3500, p90: 6000 } } });
  const row = l => rows.find(r => r.label === l);
  assert.deepEqual(row('content flags: noun-box or placeholder labels'), { label: 'content flags: noun-box or placeholder labels', before: '4/10', after: '2/10', change: '↓ better' });
  assert.equal(row('speed p50 ms, all').change, '↑ worse');
  assert.equal(row('speed p90 ms, all').change, '= same');
  assert.equal(richnessVerdict(mk(4, 2, 8), mk(2, 5, 8)).verdict, 'KEEP');
  assert.deepEqual(richnessVerdict(mk(4, 2, 8), mk(2, 5, 7)).reasons, ['faithfulness down']);
  assert.deepEqual(richnessVerdict(mk(4, 2, null), mk(2, 5, null)).reasons, ['faithfulness not judged on both runs']);
});

test('the judge is Sonnet, blind, shuffled, capped and cached', async () => {
  const sent = [], call = async body => { sent.push(body); return new Response(JSON.stringify({ stop_reason: 'tool_use', usage: { input_tokens: 1000, output_tokens: 500 }, content: [{ type: 'tool_use', name: 'record_review', input: body.system.includes('FACTUAL') ? { score: 4, errors: [] } : { verdict: 'yes', reason: 'ok' } }] }), { status: 200 }); };
  const items = Array.from({ length: 6 }, (_, i) => ({ key: `baseline/r1/secret-id-${i}`, rubric: i < 5 ? 'factual' : 'faithful', text: `card ${i}` }));
  const dir = mkdtempSync(join(tmpdir(), 'bench-judge-')), cacheFile = join(dir, 'cache.json');
  let seed = 1; const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const r = await judgeItems(items, { call, cap: 1, random, cacheFile, log: () => {} });
  assert.equal(sent.length, 6); assert.ok(sent.every(b => b.model === JUDGE_MODEL && b.model === 'claude-sonnet-5-5'));
  assert.ok(sent.every(b => !JSON.stringify(b).includes('secret-id') && !JSON.stringify(b).includes('baseline')), 'no set, id or label reaches the judge');
  assert.notDeepEqual(sent.map(b => b.messages[0].content), items.map(i => i.text), 'shuffled');
  assert.equal(r.spent, +(6 * (1000 * 2e-6 + 500 * 1e-5)).toFixed(4));
  const again = await judgeItems(items, { call, cap: 1, random, cacheFile, log: () => {} });
  assert.deepEqual([again.calls, again.cached, sent.length], [0, 6, 6], 'a second run reads the cache');
  const capped = await judgeItems(items, { call, cap: 0.03, random, judges: 2, cacheFile: null, log: () => {} });
  assert.equal(capped.stopped, true); assert.ok(capped.spent <= 0.03);
  assert.deepEqual(combine('faithful', [{ verdict: 'yes', reason: 'a' }, { verdict: 'no', reason: 'b' }, { verdict: 'yes', reason: 'c' }]), { verdict: 'yes', reason: 'a', judges: 3 });
  assert.deepEqual(combine('factual', [{ score: 4, errors: [] }, { score: 2, errors: [{ claim: 'x', why: 'y' }] }]).score, 3);
});

test('report: scores a raw folder, writes the delta against the previous run and exits 1 when a criterion fails', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bench-report-')), raw = d => { const r = join(root, `raw-${d}`); return r; };
  const write = (dir, id, b, row = {}) => { mkdirSync(join(dir, 'cards'), { recursive: true }); const full = { id, delivered: true, totalMs: 3000, repaired: false, repairCauses: [], costUsd: 0.01, ledgerUsd: 0.01, ...row };
    writeFileSync(join(dir, 'cards', `${id}.json`), JSON.stringify({ row: full, response: { result: 'artifact', block: b } })); writeFileSync(join(dir, 'results.jsonl'), (existsSync(join(dir, 'results.jsonl')) ? readFileSync(join(dir, 'results.jsonl'), 'utf8') : '') + JSON.stringify(full) + '\n'); };
  const tcp = block('p', fence({ kind: 'sequence', title: 's', actors: [{ id: 'c', label: 'Client' }, { id: 's', label: 'Server' }], messages: [{ from: 'c', to: 's', label: 'SYN' }] }));
  write(join(raw('a'), 'D-r1'), 'tcp-handshake', tcp, { totalMs: 4000 }); // the study's legacy folder letter
  const first = await run({ raw: raw('a'), out: join(root, 'results'), label: 'before', runId: '2026-11-08T100000-before', tagBaseline: true });
  assert.equal(first.code, 1, 'dns-lookup and send-email were not run, so their criteria fail');
  write(join(raw('b'), 'sequence-r1'), 'tcp-handshake', tcp, { totalMs: 2500 });
  const second = await run({ raw: raw('b'), out: join(root, 'results'), label: 'after', runId: '2026-11-08T110000-after' });
  const md = readFileSync(join(second.runDir, 'report.md'), 'utf8');
  assert.match(md, /Delta against the previous run[\s\S]*Against `2026-11-08T100000-before`/);
  assert.match(md, /Delta against the release baseline[\s\S]*Against `2026-11-08T100000-before`/);
  assert.match(md, /\| speed p50 ms, all \| 4000 \| 2500 \| ↓ better \|/);
  assert.match(md, /raw: not logged/);
  assert.ok(JSON.parse(readFileSync(join(second.runDir, 'metrics.json'), 'utf8')).summary.overall);
});

test('picture-content check: the judge reads the question, the prose either side of the picture and its prompt, alt and caption; a dry run sends nothing', async () => {
  const b = block('Intro paragraph.\n\nThe heart has four chambers.', pic('pic-1'), 'Blood leaves through the aorta.\n\nLast paragraph.');
  b.body = b.body.replace('"caption":"look here"', '"alt":"a cut-away heart","caption":"look here"');
  const [v] = visuals(b);
  assert.deepEqual([v.before, v.after, v.alt], ['The heart has four chambers.', 'Blood leaves through the aorta.', 'a cut-away heart']);
  const root = mkdtempSync(join(tmpdir(), 'bench-pic-')), dir = join(root, 'raw', 'baseline-r1');
  mkdirSync(join(dir, 'cards'), { recursive: true });
  const row = { id: 'heart', delivered: true, totalMs: 3000, repaired: false, repairCauses: [], costUsd: 0.01, ledgerUsd: 0.01 };
  writeFileSync(join(dir, 'cards', 'heart.json'), JSON.stringify({ row, response: { result: 'artifact', block: b } })); writeFileSync(join(dir, 'results.jsonl'), JSON.stringify(row) + '\n');
  const call = async () => { throw new Error('a dry run must not call'); };
  const r = await run({ raw: join(root, 'raw'), out: join(root, 'results'), runId: 'dry', judge: true, judgeDryRun: true, judgeOnly: ['picture'], call });
  assert.deepEqual([r.results.judge.items, r.results.judge.byRubric, r.results.judge.calls], [1, { picture: 1 }, 0]);
  assert.ok(r.results.judge.estimate.high > r.results.judge.estimate.low && r.results.judge.estimate.low > 0);
  const [item] = JSON.parse(readFileSync(join(r.runDir, 'judge-items.json'), 'utf8'));
  assert.match(item.text, /^Learner's question: how does the human heart pump blood\?/);
  assert.match(item.text, /The heart has four chambers\.\n\nBlood leaves through the aorta\./);
  assert.match(item.text, /prompt: a picture\nalt text: a cut-away heart\ncaption: look here/);
  assert.ok(!item.text.includes('Intro paragraph') && !item.text.includes('baseline'));
  assert.match(r.results.provenance.judgeRubrics.picture.version, /^picture-v1/);
  const yes = async () => new Response(JSON.stringify({ stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'tool_use', name: 'record_review', input: { verdict: 'no', reason: 'decoration' } }] }));
  const real = await run({ raw: join(root, 'raw'), out: join(root, 'results'), runId: 'real', judge: true, judgeOnly: ['picture'], call: yes });
  assert.deepEqual([real.results.summary.overall.pictures.content.no, real.results.summary.overall.pictures.content.judged], [1, 1]);
  assert.deepEqual(real.results.summary.judgedByRun[0].picture, [1, 1]);
  assert.match(readFileSync(join(real.runDir, 'report.md'), 'utf8'), /\| all runs \| 1\/1 \| 100% \|/);
});

test('pictures dropped: a figure with status dropped or a logged picture that never became ready; unknown without a log', () => {
  const b = block('p', pic('pic-1')); b.figures = { 'pic-1': { status: 'ready' }, 'pic-2': { status: 'dropped' } };
  const p = loadSet('baseline').prompts.find(x => x.id === 'heart');
  const known = scoreCard(p, { set: 'baseline', run: 1, id: 'heart', delivered: true, block: b, totalMs: 1, picturesDropped: ['pic-3'] });
  assert.deepEqual(known.picturesDropped, ['pic-3', 'pic-2']);
  const s = summarize([known]);
  assert.deepEqual([s.pictures.present, s.pictures.dropped.count, s.pictures.dropped.known], [1, 2, 1]);
  const unknown = scoreCard(p, { set: 'baseline', run: 1, id: 'heart', delivered: true, block: block('p', pic('pic-1')), totalMs: 1 });
  assert.equal(unknown.picturesDropped, null);
  assert.equal(summarize([unknown]).pictures.dropped, null);
});
