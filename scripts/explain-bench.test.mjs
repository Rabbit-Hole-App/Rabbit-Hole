// /explain card benchmark (scripts/explain-bench): scoring, content flags, plotted-value recompute, criteria, delta, judge blindness and the report, on fixtures (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { arithmetic, compileFormula, criteria, diagramScore, loadSet, matches, scoreCard, scoreMix, summarize, diagramWidthOf, mixName, expectedMix, mixMatrix, useSpecTree, visuals, planOf, kindStatus, SET_NAMES } from './explain-bench/score.mjs';
import { delta, g3CardText, rankArms, richnessVerdict, run } from './explain-bench/report.mjs';
import { combine, judgeItems, JUDGE_MODEL, requestBody, useRubrics, RUBRICS, RUBRIC_VERSIONS } from './explain-bench/judge.mjs';
// Answers every rubric's request shape: no tools = the JSON text of factual-v2, else a record_review call (verdict = the first enum value unless `pick` says otherwise).
const fakeJudge = (sent, pick = {}) => async body => { sent.push(body); const usage = { input_tokens: 1000, output_tokens: 500 };
  if (!body.tools) return new Response(JSON.stringify({ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: pick.json ?? '{"score": 4, "error": "no", "note": ""}' }] }), { status: 200 });
  const props = body.tools[0].input_schema.properties, kind = body.system.includes('Core line') ? 'faithful' : body.system.includes('NAMED fact') || body.system.includes('state any fact') ? 'beyond' : props.score ? 'factual' : 'picture';
  const input = props.score ? { score: 4, errors: [] } : { verdict: pick[kind] ?? props.verdict.enum[0], reason: 'ok' };
  return new Response(JSON.stringify({ stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', name: 'record_review', input }] }), { status: 200 }); };

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
  const graph = diagramScore({ kind: 'relationship', layout: 'graph', title: 'r', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], edges: [{ from: 'a', to: 'b', label: 'feeds' }, { from: 'a', to: 'c', label: 'trains' }] }, '');
  assert.deepEqual(graph.duplicatedRelationshipNodes, [], 'graph layout draws each node once (owner 2026-11-08 finding 1)');
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
  const { series: _s, ...checkedPlot } = arithmetic(sigmoidPlot([0.12, 0.5, 0.88]), prose);
  assert.deepEqual(checkedPlot, { checked: true, formula: '\\frac{1}{1+e^{-z}}', points: 3, errors: 0 });
  assert.deepEqual(arithmetic(sigmoidPlot([0.12, 0.5, 0.88]), prose, 'legacy'), { checked: true, formula: '\\frac{1}{1+e^{-z}}', variable: 'z', points: 3, errors: 0 });
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
    richness: { diagrams: 10, sizeMedian: 5, graphDiagrams: 0, graphOutside3to8: 0, edges: 0, labelledEdges: 0, fieldUse: {}, labels: 0, numericLabels: 0, proseNounBox: 0, quant: { used: quantUsed, labelled: 8 }, quantityPlot: { withPlot: 0, prompts: 0 }, binaryLayout: 0 },
    content: { diagrams: 10, flagged, placeholderEdge: 0, duplicateLabels: 0, nounBoxFlow: 0, bareMaths: 0, relationships: 0, duplicatedRelationshipNodes: 0, kindRight: 0, kindJudged: 0, formulaPlotOk: 0, formulaPrompts: 0, points: 0, pointErrors: 0, faithful: yes === null ? null : { yes, judged: 10 } },
    factual: null, repairs: { repaired: 2, of: 10, correctionTotal: 0, corrections: {}, visualFallback: [], unknownKeysStripped: null }, speed: { all: { p50: 3000, p90: 6000 }, cleanNoPicture: {}, cleanPicture: {}, repaired: {}, within4s: 7, of: 10 },
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
  const sent = [], call = fakeJudge(sent);
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
  assert.deepEqual(combine('faithful', [{ verdict: 'fully', reason: 'a' }, { verdict: 'not', reason: 'b' }, { verdict: 'fully', reason: 'c' }]), { verdict: 'fully', reason: 'a', judges: 3 });
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

test('examples A/B: references from explanation_author_raw attempt 0 split every metric; gates score an arm and the tie-break ranks arms', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bench-refs-')), dir = join(root, 'raw', 'regression-r1');
  mkdirSync(join(dir, 'cards'), { recursive: true });
  const cyc = block('p', fence({ kind: 'cycle', title: 'c', steps: ['Evaporate', 'Condense', 'Fall'] }));
  const rows = [['water-cycle', [{ attempt: 0, references: ['ref-cycle-1', 'ref-cycle-2'], visuals: [] }], 2500], ['bst', [{ attempt: 0, references: [], visuals: [] }], 3500]];
  for (const [id, raw, ms] of rows) { const row = { id, delivered: true, totalMs: ms, repaired: false, repairCauses: [], costUsd: 0.01, ledgerUsd: 0.01, raw };
    writeFileSync(join(dir, 'cards', `${id}.json`), JSON.stringify({ row, response: { result: 'artifact', block: cyc } })); writeFileSync(join(dir, 'results.jsonl'), (existsSync(join(dir, 'results.jsonl')) ? readFileSync(join(dir, 'results.jsonl'), 'utf8') : '') + JSON.stringify(row) + '\n'); }
  const r = await run({ raw: join(root, 'raw'), out: join(root, 'results'), runId: 'refs' });
  assert.deepEqual(r.results.cards.map(c => c.references), [{ count: 2, ids: ['ref-cycle-1', 'ref-cycle-2'] }, { count: 0, ids: [] }]);
  const row = l => r.results.referencesAB.rows.find(x => x[0] === l);
  assert.deepEqual(row('speed p50 ms, all').slice(1, 3), ['3500', '2500']);
  const md = readFileSync(join(r.runDir, 'report.md'), 'utf8');
  assert.match(md, /0 references \(1 cards\) \| 1-2 references \(1 cards\)/);
  assert.match(md, /Owner decision rule \(examples A\/B\): quality up and repairs not up -> keep/);
  assert.match(md, /\| 1 \(-\)|\| 2 \(ref-cycle-1, ref-cycle-2\) \|/);
  const g = Object.fromEntries(r.results.gates.map(x => [x.gate.split(':')[0], x.ok]));
  assert.equal(g.speed, true); assert.equal(g.factual, null);
  const fake = (p90, err, cost) => ({ name: `${p90}`, summary: { ...r.results.summary.overall, speed: { ...r.results.summary.overall.speed, all: { n: 2, p50: 2000, p90 } }, factual: { withErrors: err, judged: 10 }, cost: { perCard: cost } }, byRun: r.results.summary.byRun });
  assert.deepEqual(rankArms([fake(3900, 1, 0.01), fake(3000, 1, 0.02), fake(3500, 0, 0.03)]).map(a => a.name), ['3500', '3000', '3900']);
});

test('correct-svg: per-depth kinds and sketch score each card; folders carry the depth; the depth pass line', async () => {
  const set = loadSet('correct-svg');
  assert.equal(set.prompts.length, 14); assert.deepEqual(set.defaultDepths, ['overview', 'standard', 'deep']);
  assert.ok(set.prompts.every(p => ['overview', 'standard', 'deep'].every(d => p.depths[d].kinds.length && p.depths[d].sketch.length === 2)));
  assert.equal(set.prompts.filter(p => p.deepPlot).length, 6);
  const sig = set.prompts.find(p => p.id === 'sigmoid'), prose = 'The sigmoid is $\sigma(z) = \frac{1}{1+e^{-z}}$.';
  const deep = scoreCard(sig, { set: 'correct-svg', run: 1, depth: 'deep', id: 'sigmoid', delivered: true, block: block(prose, fence(sigmoidPlot([0.12, 0.5, 0.88]))), totalMs: 1 });
  assert.deepEqual([deep.score, deep.depth, deep.sketch], ['right', 'deep', sig.depths.deep.sketch]);
  const over = scoreCard(sig, { set: 'correct-svg', run: 1, depth: 'overview', id: 'sigmoid', delivered: true, block: block('p', fence(flow(['Take any number', 'Squash it', 'Between 0 and 1 = output']))), totalMs: 1 });
  assert.equal(over.score, 'wrong'); assert.deepEqual(over.diagrams[0].flags.formulaLabels, ['Between 0 and 1 = output']);
  const c = criteria(set, [deep, over]);
  assert.equal(c.find(x => x.rule.startsWith('overview')).ok, false);
  assert.match(c.find(x => x.rule.startsWith('deep')).detail, /^1\/1, 0 point errors$/);
  const root = mkdtempSync(join(tmpdir(), 'bench-depth-')), dir = join(root, 'raw', 'correct-svg-r1-deep');
  mkdirSync(join(dir, 'cards'), { recursive: true });
  const row = { id: 'sigmoid', delivered: true, totalMs: 2000, repaired: false, repairCauses: [], costUsd: 0.01, ledgerUsd: 0.01 };
  writeFileSync(join(dir, 'cards', 'sigmoid.json'), JSON.stringify({ row, response: { result: 'artifact', block: block(prose, fence(sigmoidPlot([0.12, 0.5, 0.88]))) } })); writeFileSync(join(dir, 'results.jsonl'), JSON.stringify(row) + '\n');
  const r = await run({ raw: join(root, 'raw'), out: join(root, 'results'), runId: 'depth' });
  assert.equal(r.results.cards[0].depth, 'deep'); assert.equal(r.results.summary.byDepth.deep.quantityPlots, 1);
  assert.match(readFileSync(join(r.runDir, 'report.md'), 'utf8'), /## By depth[\s\S]*\| right kind \| 1\/1 \|/);
});

// Selector bench (owner 2026-11-08): its copy of the reference selector must pick exactly what production picks for every labelled prompt. Runs against
// this checkout's selector; a branch without the reference library (older base) skips, and SELECTOR_TREE points it at another checkout.
test('selector bench: the copy of the reference selector matches production on every labelled prompt', async t => {
  const { selectorBench, SELECTOR_FILE } = await import('./explain-bench/selector.mjs');
  const tree = process.env.SELECTOR_TREE || join(import.meta.dirname, '..');
  if (!existsSync(join(tree, SELECTOR_FILE))) return t.skip(`no ${SELECTOR_FILE} in ${tree}`);
  const out = await selectorBench({ tree });
  assert.deepEqual(out.mismatches, []);
  assert.equal(out.rows.reduce((n, r) => n + r.prompts, 0), out.detail.length);
});

test('correct-svg v3 and the judge rubrics: Core/Optional sketches, faithful-v2 fully/partly/not, beyond-v1 per diagram, v3 acceptability', async () => {
  const set = loadSet('correct-svg');
  assert.match(set.version.labels, /^L3 /); assert.ok(set.relabels.some(r => r.includes('owner 2026-11-08 closing pass')));
  assert.ok(set.prompts.every(p => Object.values(p.depths).every(d => d.sketch[0].startsWith('Core: ') && d.sketch[1].startsWith('Optional: '))));
  assert.match(set.prompts.find(p => p.id === 'roman-empire').depths.deep.sketch[0], /285 or 395/);
  assert.match(set.prompts.find(p => p.id === 'gradient-descent').depths.deep.sketch[0], /descent path: points in order/);
  const v = (p, depth, ...d) => scoreCard(set.prompts.find(x => x.id === p), { set: 'correct-svg', run: 1, depth, id: p, delivered: true, block: block('p', ...d), totalMs: 1 }).score;
  assert.equal(v('atmosphere', 'overview', pic('pic-1')), 'acceptable'); assert.equal(v('atmosphere', 'standard', pic('pic-1')), 'wrong');
  assert.equal(v('roman-empire', 'deep', pic('pic-1')), 'acceptable');
  const pr = fence(sigmoidPlot([0.1, 0.5, 0.9]));
  for (const d of ['overview', 'standard', 'deep']) assert.equal(v('precision-recall', d, pr), 'acceptable', d);
  assert.equal(v('entropy', 'overview', fence({ kind: 'relationship', title: 'r', nodes: [{ id: 'a', label: 'Entropy' }, { id: 'b', label: 'Disorder' }], edges: [{ from: 'a', to: 'b', label: 'measures' }] })), 'right');
  const { rubricHash } = await import('./explain-bench/judge.mjs');
  assert.match(RUBRICS.faithful.version, /^faithful-v2/); assert.match(RUBRICS.faithful.text, /Core line only: fully/); assert.match(RUBRICS.beyond.version, /^beyond-v2/); assert.match(RUBRICS.factual.version, /^factual-v2/);
  assert.notEqual(rubricHash('faithful'), rubricHash('beyond'));
  // Report: faithful items for every sketched diagram and a beyond item for every diagram, verdicts fully/partly/not and counted claims beyond the prose.
  const root = mkdtempSync(join(tmpdir(), 'bench-v3-')), dir = join(root, 'raw', 'correct-svg-r1-deep');
  mkdirSync(join(dir, 'cards'), { recursive: true });
  const row = { id: 'sigmoid', delivered: true, totalMs: 2000, repaired: false, repairCauses: [], costUsd: 0.01, ledgerUsd: 0.01 };
  writeFileSync(join(dir, 'cards', 'sigmoid.json'), JSON.stringify({ row, response: { result: 'artifact', block: block('The sigmoid is $\sigma(z) = \frac{1}{1+e^{-z}}$.', fence(sigmoidPlot([0.12, 0.5, 0.88]))) } })); writeFileSync(join(dir, 'results.jsonl'), JSON.stringify(row) + '\n');
  const sent = [], call = fakeJudge(sent, { faithful: 'partly', beyond: 'yes' });
  const r = await run({ raw: join(root, 'raw'), out: join(root, 'results'), runId: 'v3', judge: true, call });
  assert.deepEqual(sent.map(b => b.system.includes('Core line') ? 'faithful' : b.system.includes('NAMED fact') ? 'beyond' : 'factual').sort(), ['beyond', 'factual', 'faithful']);
  const s = r.results.summary.overall;
  assert.deepEqual([s.content.faithful.fully, s.content.faithful.partly, s.content.faithful.not, s.content.beyond.yes, s.content.beyond.judged], [0, 1, 0, 1, 1]);
  const md = readFileSync(join(r.runDir, 'report.md'), 'utf8');
  assert.match(md, /\| diagrams with claims beyond the prose \(judge\) \| 1\/1 /);
  assert.match(md, /\*\*beyond\*\* `beyond-v2 2026-11-08` \(hash `[0-9a-f]{16}`\)/);
  assert.match(md, /Not fully faithful to the sketch \(Core\)/);
});

test('factual-v2 is the G3 setup: strict fact-checker, json answer with no tool, error only for a false statement; factual-v1 and beyond-v1 stay selectable', async () => {
  const body = requestBody('factual', 'card text');
  assert.equal(body.tools, undefined); assert.equal(body.output_config, undefined); assert.equal(body.max_tokens, 1200);
  assert.match(body.system, /strict fact-checker/); assert.match(body.system, /a simplification is not an error/); assert.equal(body.messages.length, 1);
  assert.match(RUBRICS.factual.version, /^factual-v2/); assert.match(RUBRICS.beyond.version, /^beyond-v2/);
  assert.match(RUBRICS.beyond.text, /NAMED fact/); assert.match(RUBRICS.beyond.text, /Do NOT count: plotted values/);
  const before = useRubrics('factual=factual-v1,beyond-v1');
  try { assert.match(requestBody('factual', 'x').system, /FACTUAL ACCURACY only/); assert.ok(requestBody('factual', 'x').tools); assert.match(RUBRICS.beyond.version, /^beyond-v1/); } finally { Object.assign(RUBRICS, before); }
  assert.match(RUBRICS.factual.version, /^factual-v2/);
  assert.throws(() => useRubrics('factual=beyond-v2'), /unknown rubric/);
  assert.deepEqual(Object.keys(RUBRIC_VERSIONS).filter(k => k.startsWith('factual') || k.startsWith('beyond')), ['factual-v1', 'factual-v2', 'beyond-v1', 'beyond-v2']);
  // The json answer is read from the first { to the last }, as the G3 judge did; error "yes" becomes the one listed error; no JSON fails the item.
  const answer = text => async b => new Response(JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text }] }), { status: 200 });
  const run1 = await judgeItems([{ key: 'a', rubric: 'factual', text: 'one' }], { call: answer('Here: {"score": 3, "error": "yes", "note": "wrong boiling point"} done'), cap: 1, log: () => {} });
  assert.deepEqual(combine('factual', run1.results.a), { score: 3, errors: [{ claim: 'wrong boiling point', why: '' }], notes: ['wrong boiling point'], judges: 1 });
  const ok = await judgeItems([{ key: 'a', rubric: 'factual', text: 'two' }], { call: answer('{"score": 5, "error": "no", "note": ""}'), cap: 1, log: () => {} });
  assert.deepEqual(combine('factual', ok.results.a).errors, []);
  const bad = await judgeItems([{ key: 'a', rubric: 'factual', text: 'three' }], { call: answer('no json here'), cap: 1, log: () => {} });
  assert.equal(bad.failed, 1);
});

test('factual-v2 text is the G3 cardText: title, prose without the fences, each diagram\'s visible text, each picture caption', () => {
  const b = block('Intro.\n\nMore.', fence(flow(['Boil the water', 'Collect steam', 'Done'])), pic('pic-1'));
  b.title = 'Water';
  b.body = b.body.replace('"caption":"look here"', '"alt":"a kettle","caption":"look here"');
  const text = g3CardText(b);
  assert.match(text, /^Title: Water\n\nProse:\nIntro\.\n\nMore\.\n\nDiagram \(flow\): F \| Boil the water \| Collect steam \| Done\n\nPicture caption: look here \(shows: a kettle\)$/);
});

test('--same-as judges only the items the earlier run answered; --rubrics is restored afterwards; --spec-tree falls back to this tree', async () => {
  assert.equal(await useSpecTree('C:/no/such/tree'), null);
  const root = mkdtempSync(join(tmpdir(), 'bench-same-')), mk = depth => { const dir = join(root, 'raw', `correct-svg-r1-${depth}`); mkdirSync(join(dir, 'cards'), { recursive: true });
    const row = { id: 'sigmoid', delivered: true, totalMs: 1000, repaired: false, repairCauses: [], costUsd: 0.01, ledgerUsd: 0.01 };
    writeFileSync(join(dir, 'cards', 'sigmoid.json'), JSON.stringify({ row, response: { result: 'artifact', block: block('The sigmoid squashes any number into 0 to 1.', fence(sigmoidPlot([0.12, 0.5, 0.88]))) } })); writeFileSync(join(dir, 'results.jsonl'), JSON.stringify(row) + '\n'); };
  mk('overview'); mk('deep');
  const prev = join(root, 'prev'); mkdirSync(prev);
  writeFileSync(join(prev, 'results.json'), JSON.stringify({ cards: [{ set: 'correct-svg', run: 1, depth: 'deep', id: 'sigmoid', judge: { factual: { score: 4, errors: [] } }, diagrams: [{ beyond: { verdict: 'no' } }], pictures: [] }, { set: 'correct-svg', run: 1, depth: 'overview', id: 'sigmoid', diagrams: [{}], pictures: [] }] }));
  const sent = [], call = fakeJudge(sent);
  const r = await run({ raw: join(root, 'raw'), out: join(root, 'results'), runId: 'same', judge: true, sameAs: prev, rubrics: 'factual=factual-v1', call });
  assert.deepEqual(sent.map(b => (b.system.includes('NAMED fact') ? 'beyond' : b.system.includes('Core line') ? 'faithful' : 'factual')).sort(), ['beyond', 'factual']);
  assert.ok(sent.find(b => b.system.includes('FACTUAL ACCURACY')), 'the factual-v1 rubric was used for this run');
  assert.deepEqual(r.results.cards.filter(c => c.judge).map(c => c.depth), ['deep']);
  assert.match(RUBRICS.factual.version, /^factual-v2/, 'restored');
  assert.match(readFileSync(join(r.runDir, 'report.md'), 'utf8'), /\*\*factual\*\* `factual-v1 2026-11-08`/);
});

test('planner arm: plan from explanation_author_raw (fixed, two offered, rules failure, picture only), latency, fixed vs offered right rates, disagreements labelled', async () => {
  const set = loadSet('correct-svg');
  assert.deepEqual(planOf([{ attempt: 0, plan: { planner: 'rules' } }]), { planner: 'rules' });
  assert.equal(planOf([{ attempt: 0, plan: null }]), null); assert.equal(planOf(null), null);
  const root = mkdtempSync(join(tmpdir(), 'bench-plan-')), dir = join(root, 'raw', 'correct-svg-r1-deep');
  mkdirSync(join(dir, 'cards'), { recursive: true });
  const plan = (kind, fixed, ms, choose = null) => ({ attempt: 0, plan: { visuals: [{ type: 'diagram', ...(fixed ? { kind } : { choose }) }], depthTreatment: 'quantitative', kind, fixed, confidence: { kind: 0.7 }, flags: {}, ms }, references: [], visuals: [] });
  const bar = fence({ kind: 'bar-chart', title: 'b', bars: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }] });
  const cards = [
    ['sigmoid', plan('coordinate-plot', true, 200), fence(sigmoidPlot([0.12, 0.5, 0.88]))],            // fixed, author agrees, right
    ['gini', plan('flow', true, 400), bar],                                                              // fixed flow (wrong for gini), author drew a bar-chart (right)
    ['softmax', plan('transformation', false, 600, ['transformation', 'flow']), fence({ kind: 'relationship', title: 'r', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b', label: 'x' }] })], // offered two, author drew neither
    ['lr-schedule', { attempt: 0, plan: { planner: 'rules' }, references: [], visuals: [] }, fence(sigmoidPlot([0.1, 0.2, 0.3]))],
    ['precision-recall', plan('matrix', true, 500), pic('pic-1')],                                    // a diagram planned, none drawn: a disagreement
  ];
  for (const [id, raw, vis] of cards) { const row = { id, delivered: true, totalMs: 1000, repaired: false, repairCauses: [], costUsd: 0.01, ledgerUsd: 0.01, raw: [raw] };
    writeFileSync(join(dir, 'cards', `${id}.json`), JSON.stringify({ row, response: { result: 'artifact', block: block('p', vis) } })); writeFileSync(join(dir, 'results.jsonl'), (existsSync(join(dir, 'results.jsonl')) ? readFileSync(join(dir, 'results.jsonl'), 'utf8') : '') + JSON.stringify(row) + '\n'); }
  mkdirSync(join(root, 'results', 'plan'), { recursive: true }); writeFileSync(join(root, 'results', 'plan', 'provenance.json'), JSON.stringify({ plannerInputTokensEstimate: 1000 }));
  const r = await run({ raw: join(root, 'raw'), out: join(root, 'results'), runId: 'plan' });
  const P = r.results.summary.overall.planner;
  assert.deepEqual([P.cards, P.failed, P.pictureOnly, P.ms.p50, P.ms.n], [5, 1, 0, 500, 4]);
  assert.deepEqual([P.fixed.cards, P.fixed.right, P.suggested.cards, P.suggested.right], [3, 2, 1, 0]);
  assert.deepEqual([P.disagreements.cards, P.disagreements.authorOnly, P.disagreements.planOnly, P.disagreements.neither], [3, 1, 2, 0]);
  assert.ok(P.disagreements.list.some(l => l.includes('plan matrix (fixed) = right; author drew no diagram = wrong')));
  assert.ok(P.disagreements.list.some(l => l.includes('plan flow (fixed) = wrong; author drew bar-chart = right')));
  assert.ok(P.disagreements.list.some(l => l.includes('plan transformation (offered transformation or flow) = acceptable; author drew relationship = wrong')));
  assert.deepEqual(r.results.plannerCost, { tokens: 1000, perCard: 0.000042, cards: 5 });
  const md = readFileSync(join(r.runDir, 'report.md'), 'utf8');
  assert.match(md, /## Planner \(JEV\)/); assert.match(md, /planner failures \(planner: rules, the author ran without a plan\) \| 1 \|/); assert.match(md, /two kinds offered: cards, right \/ acceptable \/ wrong \| 1: 0 \/ 0 \/ 1 \|/);
  assert.equal(kindStatus({ best: [['D:coordinate-plot'], ['D:coordinate-plot', 'D:*']], acceptable: [['D:transformation']] }, 'transformation'), 'acceptable'); // a D:* second slot does not make every kind right
});

test('plot rule (owner 2026-11-08): any wrong point makes the card wrong; every stated formula is tried so a derivative plot is not a wrong point; strict-first and legacy keep old runs re-scorable; the header lists the point errors', async () => {
  const prose = String.raw`The sigmoid is $\sigma(z)=\frac{1}{1+e^{-z}}$ and its slope is $\sigma'(z)=\sigma(z)(1-\sigma(z))$.`;
  const good = sigmoidPlot([0.12, 0.5, 0.88]), oneWrong = sigmoidPlot([0.12, 0.6, 0.88]), derivative = sigmoidPlot([0.1049, 0.25, 0.1049]);
  assert.equal(arithmetic(good, prose).errors, 0);
  assert.equal(arithmetic(oneWrong, prose).errors, 1);
  assert.deepEqual([arithmetic(derivative, prose).errors, arithmetic(derivative, prose, 'legacy').errors], [0, 3]); // per series: the derivative is checked against the derivative the prose states; legacy: first formula only
  assert.equal(arithmetic(sigmoidPlot([0.1049, 0.5, 0.1049]), prose).errors, 1, 'a wrong derivative point is still wrong');
  const two = { ...good, series: [good.series[0], { ...derivative.series[0], label: 'derivative' }] };
  assert.deepEqual(arithmetic(two, prose).series.map(x => [x.label, x.checked, x.errors]), [['s', true, 0], ['derivative', true, 0]], 'each series against its own formula');
  assert.equal(arithmetic(sigmoidPlot([0.9, 0.9, 0.9]), prose).checked, false, 'a series that fits no stated formula is not checked');
  assert.match(arithmetic(sigmoidPlot([0.9, 0.9, 0.9]), prose).reason, /different function/);
  const sig = loadSet('correct-svg').prompts.find(p => p.id === 'sigmoid');
  const card = (rule, ...plots) => scoreCard(sig, { set: 'correct-svg', run: 1, depth: 'deep', id: 'sigmoid', delivered: true, block: block(prose, ...plots.map(fence)), totalMs: 1 }, { plotRule: rule });
  assert.deepEqual([card('strict', good).score, card('strict', good).plotWrong], ['right', false]);
  assert.deepEqual([card('strict', oneWrong).score, card('strict', oneWrong).plotWrong], ['wrong', true]);
  assert.equal(card('strict', good, oneWrong).score, 'wrong', 'a wrong point in a second plot counts');
  assert.equal(card('strict', good, derivative).score, 'right', 'the derivative is a different function, not a wrong point');
  assert.equal(card('strict-first', good, derivative).score, 'wrong', 'strict-first compares with the first stated formula only');
  assert.equal(card('legacy', oneWrong).score, 'right', 'legacy: points are reported, the score is unchanged');
  assert.equal(card('legacy', oneWrong).diagrams[0].arithmetic.errors, 1);
  // The deep-plot gate counts only plots with no wrong point and says how many were drawn.
  const set = loadSet('correct-svg'), cards = set.prompts.filter(p => p.deepPlot).map(p => scoreCard(p, { set: 'correct-svg', run: 1, depth: 'deep', id: p.id, delivered: true, block: block(prose, fence(p.id === 'sigmoid' ? oneWrong : good)), totalMs: 1 }));
  const c = criteria({ name: 'correct-svg', pass: { deepPlots: { min: 5, maxPointErrors: 0 } } }, cards).find(x => x.rule.startsWith('deep'));
  assert.deepEqual([c.ok, c.detail], [false, '5/6 (6 drawn, 1 with a wrong point), 1 point errors']);
  // The report header lists the plots, checked and not, and which.
  const root = mkdtempSync(join(tmpdir(), 'bench-plotrule-')), dir = join(root, 'raw', 'correct-svg-r1-deep');
  mkdirSync(join(dir, 'cards'), { recursive: true });
  const row = { id: 'sigmoid', delivered: true, totalMs: 1000, repaired: false, repairCauses: [], costUsd: 0.01, ledgerUsd: 0.01 };
  writeFileSync(join(dir, 'cards', 'sigmoid.json'), JSON.stringify({ row, response: { result: 'artifact', block: block(prose, fence(good), fence(derivative)) } })); writeFileSync(join(dir, 'results.jsonl'), JSON.stringify(row) + '\n');
  const r = await run({ raw: join(root, 'raw'), out: join(root, 'results'), runId: 'pr' });
  const md = readFileSync(join(r.runDir, 'report.md'), 'utf8');
  assert.match(md, /Plot point errors \(rule: strict;[^)]*\): 2 plots drawn, 2 checked \(6 points, 0 wrong\), 0 not checked\./);
  assert.match(md, /- correct-svg\/r1\/deep\/sigmoid coordinate-plot: 0\/3 points off/);
  assert.equal(r.results.meta.plotRule, 'strict'); assert.equal(r.results.summary.byDepth.deep.quantityPlotsCorrect, 1);
  const legacy = await run({ raw: join(root, 'raw'), out: join(root, 'results'), runId: 'pr-legacy', plotRule: 'legacy' });
  assert.match(readFileSync(join(legacy.runDir, 'report.md'), 'utf8'), /rule: legacy; points reported, the score unchanged/);
});

test('planner bench v2: no second-visual question, one diagram unless the type is both, kind fixed at 0.6 else the top two offered, no plot override', async () => {
  const { planOf: benchPlan, QUESTIONS: Q, FIX_AT } = await import('./explain-bench/planner.mjs');
  assert.equal(Q.secondVisual, undefined); assert.deepEqual(Object.keys(Q), ['visualType', 'kind', 'depthTreatment', 'needsPlot', 'isPhysical', 'needsWorkedExample']); assert.equal(FIX_AT, 0.6);
  const a = (type, probabilities, extra = {}) => ({ visualType: { choice: type, confidence: 0.9 }, kind: { choice: Object.keys(probabilities)[0], confidence: Object.values(probabilities)[0], probabilities }, depthTreatment: { choice: 'mechanism' },
    needsPlot: { noul: extra.needsPlot ?? 0.9 }, isPhysical: { noul: 0.1 }, needsWorkedExample: { noul: 0.1 } });
  const fixed = benchPlan(a('diagram', { flow: 0.7, cycle: 0.2 }));
  assert.deepEqual([fixed.fixed, fixed.kinds, fixed.mixes, fixed.offered], [true, ['flow'], [['D:flow']], null]);
  const two = benchPlan(a('diagram', { flow: 0.5, cycle: 0.4, tree: 0.1 }));
  assert.deepEqual([two.fixed, two.kinds, two.mixes, two.offered], [false, ['flow', 'cycle'], [['D:flow'], ['D:cycle']], ['flow', 'cycle']]);
  assert.deepEqual(benchPlan(a('both', { cycle: 0.9, flow: 0.1 })).mixes, [['P', 'D:cycle']]);
  assert.deepEqual(benchPlan(a('picture', { cycle: 0.9, flow: 0.1 })).mixes, [['P']]);
  const noOverride = benchPlan(a('diagram', { flow: 0.9, cycle: 0.1 }, { needsPlot: 0.95 }));
  assert.deepEqual([noOverride.kind, noOverride.overridden], ['flow', false], 'a high needsPlot no longer turns the kind into a plot');
});

test('keep checks (owner 2026-11-08): right kind at Standard and Deep vs the compared run, repairs <= compared + 2, p90 <= 7 s, p50 reported', async () => {
  const prose = 'The sigmoid squashes any number into 0 to 1.', root = mkdtempSync(join(tmpdir(), 'bench-keep-'));
  const mk = (raw, depth, ms, repaired) => { const dir = join(raw, `correct-svg-r1-${depth}`); mkdirSync(join(dir, 'cards'), { recursive: true });
    const row = { id: 'sigmoid', delivered: true, totalMs: ms, repaired, repairCauses: repaired ? [{ attempt: 0, error: 'label too long: Use at most 55 characters' }] : [], costUsd: 0.01, ledgerUsd: 0.01 };
    writeFileSync(join(dir, 'cards', 'sigmoid.json'), JSON.stringify({ row, response: { result: 'artifact', block: block(prose, fence(sigmoidPlot([0.12, 0.5, 0.88]))) } })); writeFileSync(join(dir, 'results.jsonl'), JSON.stringify(row) + '\n'); };
  for (const d of ['standard', 'deep']) { mk(join(root, 'a'), d, 3000, false); mk(join(root, 'b'), d, 7400, true); }
  const a = await run({ raw: join(root, 'a'), out: join(root, 'results'), runId: 'a' });
  const b = await run({ raw: join(root, 'b'), out: join(root, 'results'), runId: 'b', against: a.runDir });
  const k = b.results.keepChecks;
  assert.deepEqual(k.rows.map(x => [x.check, x.ok]), [['right kind at Standard', true], ['right kind at Deep', true], ['repairs', true], ['p90 ms', false]]);
  assert.equal(k.pass, false); assert.equal(k.p50, 7400);
  assert.deepEqual(k.rows.find(x => x.check === 'repairs').limit, '<= 2 (compared run 0 + 2)');
  assert.match(readFileSync(join(b.runDir, 'report.md'), 'utf8'), /\*\*Keep checks\*\* against `a`: right kind at Standard 1 \(>= 1\) PASS; right kind at Deep 1 \(>= 1\) PASS; repairs 2\/2 \(<= 2 \(compared run 0 \+ 2\)\) PASS; p90 ms 7400 \(<= 7000\) FAIL; p50 7400 ms \(reported\)\. \*\*DO NOT KEEP\*\*/);
});

test('visual-mix matrix (owner 2026-11-08): rows = expected mix, columns = made; the alternative-shape label lands on the made shape; off-diagonal cards listed; two expected / two made', () => {
  assert.deepEqual(['P', 'D:flow'].map(t => mixName([t])), ['pic', 'svg']);
  assert.equal(mixName(['D:tree', 'P']), 'svg-pic');
  assert.equal(mixName([]), 'none');
  assert.equal(expectedMix([['D:a'], ['D:a', 'D:b']], 'svg-svg'), 'svg-svg');
  assert.equal(expectedMix([['D:a'], ['D:a', 'D:b']], 'pic'), 'svg');
  const c = (expected, made, id) => ({ set: 's', run: 1, id, depth: null, expectedMix: expected, madeMix: made });
  const m = mixMatrix([c('svg-svg', 'svg-svg', 'a'), c('svg-svg', 'svg', 'b'), c('svg', 'svg', 'c'), c('svg-pic', 'none', 'd')]);
  assert.equal(m.counts['svg-svg']['svg'], 1);
  assert.equal(m.counts['svg-svg']['svg-svg'], 1);
  assert.deepEqual(m.off.map(o => o.cards), [['s/b#r1'], ['s/d#r1']]);
  assert.deepEqual(m.twoVisuals, { expected: 3, madeTwoOfExpected: 1, madeTwo: 1, madeTwoNotExpected: 0 });
});

test('diagram natural width (card width follows it, owner 2026-11-08): recorded per diagram from the tree\'s own renderer at the usual 408 px, summarised in four buckets plus the max, no gate', async () => {
  const flowSpec = { kind: 'flow', title: 'F', nodes: [{ id: 'a', label: 'Do a', role: 'process' }, { id: 'b', label: 'Done', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }] };
  const dense = { kind: 'comparison', title: 'Four', columns: ['A', 'B', 'C', 'D'].map(h => ({ heading: `${h} thing`, items: ['one item here', 'second item here', 'third item'] })) };
  assert.equal(diagramWidthOf(flowSpec), 408, 'an ordinary diagram fits the usual room');
  assert.ok(diagramWidthOf(dense) > 408, 'a four-column comparison needs more');
  assert.equal(diagramWidthOf({ kind: 'nonsense' }), null, 'an undrawable spec has no width');
  const scored = [flowSpec, dense].map(d => diagramScore(d, ''));
  assert.deepEqual(scored.map(d => d.width), [408, diagramWidthOf(dense)]);
  const cards = [flowSpec, dense].map((d, i) => card('content', 1, P.content[i].id, block('x', fence(d))));
  const s = summarize(cards);
  assert.equal(s.widths.measured, 2);
  assert.equal(s.widths.le408, 1);
  assert.equal(s.widths.to700 + s.widths.to960 + s.widths.over960, 1);
  assert.equal(s.widths.max, Math.max(...scored.map(d => d.width)));
});
