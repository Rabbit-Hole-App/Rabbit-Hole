// Release gate in two tiers (owner 2026-11-09): the smoke set, carried verdicts, tier-aware gate-check. Fixtures only, no network, no judge call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SET_NAMES, loadSet, scoreCard } from './explain-bench/score.mjs';
import { run } from './explain-bench/report.mjs';
import { RUBRICS, useRubrics } from './explain-bench/judge.mjs';
import { cardHash, identity, referenceCopied } from './explain-bench/carry.mjs';
import { SMOKE_TOLERANCE, baselineRuns, gateCheck, lines as gateLines, relativeRows } from './explain-bench/gate-check.mjs';
import { KINDS, rng, shuffle } from './explain-bench/build-smoke-set.mjs';

const fence = d => `\`\`\`rh-diagram\n${JSON.stringify({ version: 1, diagram: d })}\n\`\`\``;
const pic = id => `\`\`\`rh-illustration\n${JSON.stringify({ id, prompt: 'a picture', caption: 'look here' })}\n\`\`\``;
const block = (prose, ...vis) => ({ title: 'T', body: [prose, ...vis].join('\n\n'), interactions: { questions: [{ text: 'Why?' }], terms: [] } });
const seqSpec = { kind: 'sequence', title: 's', actors: [{ id: 'c', label: 'Client' }, { id: 's', label: 'Server' }], messages: [{ from: 'c', to: 's', label: 'SYN' }] };
// Answers factual-v2 (JSON text, no tool) and every tool rubric with its first verdict.
const fakeJudge = sent => async body => { sent.push(body); const usage = { input_tokens: 1000, output_tokens: 500 };
  if (!body.tools) return new Response(JSON.stringify({ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: '{"score": 4, "error": "no", "note": ""}' }] }), { status: 200 });
  const props = body.tools[0].input_schema.properties, input = props.score ? { score: 4, errors: [] } : { verdict: props.verdict.enum[0], reason: 'ok' };
  return new Response(JSON.stringify({ stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', name: 'record_review', input }] }), { status: 200 }); };
const never = async () => { throw new Error('this card must not reach the judge'); };

test('smoke set: loads, ids and prompts are unique, every planner kind is covered, the named prompts are in, and the groups have the owner\'s counts', () => {
  const s = loadSet('smoke'), groups = g => s.prompts.filter(p => p.smoke.groups.some(x => x === g || x.startsWith(`${g}:`)));
  assert.equal(new Set(s.prompts.map(p => p.id)).size, s.prompts.length);
  assert.equal(new Set(s.prompts.map(p => p.prompt.toLowerCase().trim())).size, s.prompts.length, 'deduped by prompt text');
  assert.deepEqual(Object.keys(s.kindCoverage), KINDS);
  assert.deepEqual(KINDS.filter(k => !s.kindCoverage[k]), [], 'every kind has a prompt');
  assert.ok(s.defaultRuns === 1 && s.estUsdPerCard > 0 && s.prompts.length >= 60 && s.prompts.length <= 70);
  assert.deepEqual(['demo-lesson04', 'matrix-heatmap', 'formula-plot', 'sequence-self-message', 'two-structure', 'picture-needed', 'picture-none'].map(g => groups(g).length), [13, 8, 6, 3, 3, 10, 15]);
  const ids = new Set(s.prompts.map(p => p.id));
  for (const id of ['ml-bert-task-heads', 'ml-stable-diffusion-forward-noise', 'ml-stable-diffusion-image-caption-pairs', 'ml-trees-gini-split', 'transformer-block', 'public-key-encryption']) assert.ok(ids.has(id), id);
  for (const p of s.prompts) { // the schema of the source set, so the scorer works unchanged
    assert.ok(p.id && p.prompt && p.smoke.source && typeof p.needsPicture === 'boolean' && typeof p.noPicture === 'boolean', p.id);
    assert.ok(p.best.length || p.depths?.standard?.kinds?.length, `${p.id} has labels`);
  }
  assert.ok(!SET_NAMES.includes('smoke'), 'smoke is its own tier: not in the default sets of a full run');
  assert.deepEqual(shuffle([1, 2, 3, 4, 5, 6], rng('x')), shuffle([1, 2, 3, 4, 5, 6], rng('x')), 'seeded and reproducible');
  assert.notDeepEqual(shuffle([1, 2, 3, 4, 5, 6], rng('x')), shuffle([1, 2, 3, 4, 5, 6], rng('y')));
});

test('carried verdicts: the card hash ignores key order, reads depth null as Standard, and changes with the body, the prompt, the depth or a rubric version', () => {
  const c = { id: 'x', prompt: 'q', depth: null, diagrams: [{ spec: { b: 1, a: { d: 1, c: 2 } } }] }, same = { ...c, depth: 'standard', diagrams: [{ spec: { a: { c: 2, d: 1 }, b: 1 } }] }, V = ['factual-v2', 'faithful-v2'];
  assert.equal(cardHash(c, 'body', V), cardHash(same, 'body', [...V].reverse()));
  assert.notEqual(cardHash(c, 'body', V), cardHash(c, 'body 2', V));
  assert.notEqual(cardHash(c, 'body', V), cardHash({ ...c, prompt: 'q2' }, 'body', V));
  assert.notEqual(cardHash(c, 'body', V), cardHash({ ...c, depth: 'deep' }, 'body', V));
  assert.notEqual(cardHash(c, 'body', V), cardHash(c, 'body', ['factual-v3', 'faithful-v2']), 'a rubric version bump invalidates');
  assert.equal(identity(c), 'undefined|x|standard');
  assert.ok(referenceCopied({ references: { ids: ['shape-flow', 'ml-backpropagation'] } }) && !referenceCopied({ references: { ids: ['shape-flow'] } }) && !referenceCopied({}));
});

test('carried verdicts: an identical delivery is not judged again, a changed one is, a rubric version bump invalidates; the judge cache is the same idea at item grain', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bench-carry-'));
  const write = (name, prose) => { const dir = join(root, name, 'sequence-r1'); mkdirSync(join(dir, 'cards'), { recursive: true }); const row = { id: 'tcp-handshake', delivered: true, totalMs: 3000, repaired: false, repairCauses: [], costUsd: 0.01, ledgerUsd: 0.01 };
    writeFileSync(join(dir, 'cards', 'tcp-handshake.json'), JSON.stringify({ row, response: { result: 'artifact', block: block(prose, fence(seqSpec)) } })); writeFileSync(join(dir, 'results.jsonl'), JSON.stringify(row) + '\n'); return join(root, name); };
  const sent = [], A = await run({ raw: write('a', 'The client and the server agree to talk.'), out: join(root, 'resA'), runId: 'A', judge: true, call: fakeJudge(sent) });
  assert.ok(sent.length >= 2 && A.results.carry.rubrics.factual.judged === 1 && A.results.carry.rubrics.factual.carried === 0, 'first run: everything is judged');
  // identical delivery in another results root (no cache there): only the hash can carry
  const B = await run({ raw: write('b', 'The client and the server agree to talk.'), out: join(root, 'resB'), runId: 'B', judge: true, call: never, carryFrom: A.runDir });
  assert.deepEqual([B.results.carry.rubrics.factual.carriedByHash, B.results.carry.rubrics.factual.judged, B.results.carry.cards], [1, 0, { delivered: 1, carried: 1 }]);
  assert.equal(B.results.cards[0].carried, true); assert.deepEqual(B.results.cards[0].judge, A.results.cards[0].judge);
  assert.deepEqual(B.results.carry.identical.all, { cards: 1, identicalHash: 1, identicalSpec: 1 });
  assert.match(readFileSync(join(B.runDir, 'report.md'), 'utf8'), /Judged and carried[\s\S]*\| factual \| 1 \| 0 \| 1 \| 1 \| 0 \|[\s\S]*\| carried \|/);
  // same diagram, new prose: judged again; the diagram counts as identical, the card does not
  const sentC = [], C = await run({ raw: write('c', 'Different words about the same handshake.'), out: join(root, 'resC'), runId: 'C', judge: true, call: fakeJudge(sentC), carryFrom: A.runDir });
  assert.ok(sentC.length >= 2 && C.results.carry.rubrics.factual.carried === 0 && C.results.cards[0].carried !== true);
  assert.deepEqual(C.results.carry.identical.all, { cards: 1, identicalHash: 0, identicalSpec: 1 });
  // a rubric version bump: the same bytes are judged again
  const before = useRubrics('factual=factual-v1'), sentD = [];
  try { const D = await run({ raw: write('d', 'The client and the server agree to talk.'), out: join(root, 'resD'), runId: 'D', judge: true, call: fakeJudge(sentD), carryFrom: A.runDir }); assert.ok(sentD.length >= 1 && D.results.carry.rubrics.factual.carriedByHash === 0, 'a bumped rubric carries nothing'); } finally { Object.assign(RUBRICS, before); }
  // the cache is content-keyed: the same cards in run A's results root hit it, and the accounting calls that carried
  const E = await run({ raw: write('e', 'The client and the server agree to talk.'), out: join(root, 'resA'), runId: 'E', judge: true, call: never });
  assert.deepEqual([E.results.carry.rubrics.factual.carriedByCache, E.results.carry.rubrics.factual.carriedByHash, E.results.carry.rubrics.factual.judged, E.results.cards[0].carried], [1, 0, 0, true]);
  // dry run: "judged" means "would be judged"
  const F = await run({ raw: write('f', 'New text again.'), out: join(root, 'resF'), runId: 'F', judge: true, judgeDryRun: true, call: never, carryFrom: A.runDir });
  assert.deepEqual([F.results.carry.dryRun, F.results.carry.rubrics.factual.judged, F.results.carry.rubrics.factual.carried], [true, 1, 0]);
});

test('gate-check: smoke fails hard on delivery and the two picture lines, reports the rest and fails them only past their limit; full keeps the thirteen lines with the per-run spread', () => {
  const S = loadSet('smoke').prompts, P = id => S.find(p => p.id === id);
  const judged = c => { c.smoke = { source: P(c.id).smoke.source, unverified: !!P(c.id).smoke.unverified }; c.judge = { factual: { score: 5, errors: [] } }; c.diagrams.forEach(d => { d.beyond = { verdict: 'no' }; if (c.sketch) d.faithful = { verdict: 'fully' }; }); return c; };
  const mk = (id, b, extra = {}) => judged(scoreCard(P(id), { set: 'smoke', run: 1, id, delivered: !!b, block: b, totalMs: 3000, repaired: false, repairCauses: [], costUsd: 0.01, costSource: 'ledger', ...extra }));
  const tcp = block('The client and the server talk.', fence(seqSpec)), heart = block('The heart pumps.', fence({ kind: 'cycle', title: 'c', steps: ['Fill', 'Squeeze'] }), pic('pic-1'));
  const write = (name, cards, sets) => { const dir = mkdtempSync(join(tmpdir(), `bench-gate-${name}-`)); writeFileSync(join(dir, 'results.json'), JSON.stringify({ summary: { sets: Object.fromEntries(sets.map(s => [s, {}])) }, cards })); return dir; };
  const gini = block('The Gini impurity is $G = 2p(1-p)$.', fence({ kind: 'coordinate-plot', title: 'G', x: { label: 'p', min: 0, max: 1 }, y: { label: 'G', min: 0, max: 1 }, series: [{ label: 'G', kind: 'line', points: [0, 0.5, 1].map((x, k) => ({ x, y: [0, 0.5, 0][k] })) }] }));
  const good = [mk('tcp-handshake', tcp), mk('heart', heart), mk('gini', gini)], ok = gateCheck(write('ok', good, ['smoke']), 'abc');
  assert.equal(ok.tier, 'smoke'); assert.match(ok.first, /^GATE: PASS abc tier=smoke/); assert.equal(ok.code, 0);
  assert.match(ok.body, /pictures where none belongs: 0 \[hard\]: 0\/2/); assert.match(ok.body, /REPORTED {2}diagram kinds drawn: 3\/24/);
  const bad = gateCheck(write('bad', [mk('tcp-handshake', block('x', fence(seqSpec), pic('pic-2'))), mk('heart', heart), mk('gini', gini)], ['smoke']), 'abc');
  assert.match(bad.first, /^GATE: FAIL abc tier=smoke .*pictures where none belongs: 0$/); assert.equal(bad.code, 1);
  const slow = gateCheck(write('slow', [mk('tcp-handshake', tcp, { totalMs: 9000 }), mk('heart', heart, { totalMs: 9000 }), mk('gini', gini, { totalMs: 9000 })], ['smoke']), 'abc');
  assert.match(slow.first, /whole-card p90 <= 7000 ms$/, 'a reported line fails only past its limit');
  assert.equal(gateLines('smoke').filter(l => l[1]).length, 3, 'delivery and the two picture lines are the hard ones');
  assert.equal(gateLines('smoke').length, 12); assert.equal(gateLines('full').length, 13, 'the full tier keeps today\'s thirteen lines');
  const full = gateCheck(write('full', [{ ...good[0], set: 'baseline', run: 1 }, { ...good[0], set: 'baseline', run: 2 }], ['baseline']), 'abc');
  assert.equal(full.tier, 'full'); assert.match(full.body, /delivery: at least 99% of cards delivered: 2\/2 \| spread: r1 1\/1, r2 1\/1/);
});

// ---- Smoke gate against a baseline (owner 2026-11-10): hard absolute lines, every other line relative to the baseline's mean on the same prompts. ----

test('smoke vs baseline: a move inside the tolerance passes, a move past it fails, prompts without a baseline are left out', () => {
  const S = loadSet('smoke').prompts.slice(0, 22), flow2 = block('x', fence({ kind: 'flow', title: 'f', nodes: [{ id: 'a', label: 'Start', role: 'process' }, { id: 'b', label: 'End', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }] }));
  const make = (p, run, { wrong = false, ms = 3000, set = 'smoke' } = {}) => { const c = scoreCard(p, { set, run, id: p.id, delivered: true, block: flow2, totalMs: ms, repaired: false, repairCauses: [], costUsd: 0.01, costSource: 'ledger' });
    c.judge = { factual: { score: wrong ? 2 : 5, errors: wrong ? [{ claim: 'x', why: 'y' }] : [] } }; c.diagrams.forEach(d => { d.beyond = { verdict: 'no' }; }); return c; };
  // baseline: 20 prompts x 3 runs with 2 factual errors a run (10%); the last 2 smoke prompts are not in it
  const base = [1, 2, 3].flatMap(r => S.slice(0, 20).map((p, i) => make(p, r, { wrong: i < 2, set: p.smoke.source.set })));
  const runs = baselineRuns(base, S);
  assert.deepEqual(runs.map(r => r.length), [20, 20, 20]);
  const rows = (errors, ms = 3000) => relativeRows(S.map((p, i) => make(p, 1, { wrong: i < errors, ms })), runs), row = (r, name) => r.rows.find(x => x.name.startsWith(name));
  const inside = rows(4);          // 20% against 10%: +10 pp, tolerance max(5 pp, 4/20 = 20 pp) = 20 pp for factual
  assert.equal(row(inside, 'factual error rate').ok, true); assert.match(row(inside, 'factual error rate').detail, /smoke 4\/20 = 20.0% \| baseline mean 10.0% \| delta \+10.0 pp \| tolerance \+20.0 pp/);
  assert.equal(inside.compared, 20, 'the two prompts the baseline does not cover are left out of both sides');
  const outside = rows(7);         // 35% against 10%: +25 pp > 20 pp
  assert.equal(row(outside, 'factual error rate').ok, false);
  assert.equal(row(rows(2, 4900), 'whole-card p90').ok, true, 'p90 +1900 ms is inside +2000');
  assert.equal(row(rows(2, 5100), 'whole-card p90').ok, false, 'p90 +2100 ms is past +2000');
  assert.deepEqual(SMOKE_TOLERANCE, { items: 3, points: 5, factualItems: 4, p90Ms: 2000 });
  const none = relativeRows(S.slice(20).map(p => make(p, 1)), runs);
  assert.ok(none.rows.every(x => x.noBaseline && x.ok) && none.compared === 0, 'no smoke prompt in the baseline: every relative line is "no baseline"');
  assert.ok(relativeRows([make(S[0], 1)], []).rows.every(x => x.noBaseline && x.ok), 'no baseline run at all: every relative line is "no baseline" and none fails');
});

test('smoke vs baseline: gateCheck keeps delivery and the picture lines hard, compares the rest with the baseline, and a full-tier run is unchanged', () => {
  const S = loadSet('smoke').prompts, P = id => S.find(p => p.id === id);
  const mk = (id, b, extra = {}, set = 'smoke') => { const c = scoreCard(P(id), { set, run: 1, id, delivered: !!b, block: b, totalMs: 3000, repaired: false, repairCauses: [], costUsd: 0.01, costSource: 'ledger', ...extra });
    c.smoke = { source: P(id).smoke.source, unverified: !!P(id).smoke.unverified }; c.judge = { factual: { score: 5, errors: [] } }; c.diagrams.forEach(d => { d.beyond = { verdict: 'no' }; if (c.sketch) d.faithful = { verdict: 'fully' }; }); return c; };
  const tcp = block('The client and the server talk.', fence(seqSpec)), heart = block('The heart pumps.', fence({ kind: 'cycle', title: 'c', steps: ['Fill', 'Squeeze'] }), pic('pic-1'));
  const gini = block('The Gini impurity is $G = 2p(1-p)$.', fence({ kind: 'coordinate-plot', title: 'G', x: { label: 'p', min: 0, max: 1 }, y: { label: 'G', min: 0, max: 1 }, series: [{ label: 'G', kind: 'line', points: [0, 0.5, 1].map((x, k) => ({ x, y: [0, 0.5, 0][k] })) }] }));
  const write = (name, cards, sets) => { const dir = mkdtempSync(join(tmpdir(), `bench-bl-${name}-`)); writeFileSync(join(dir, 'results.json'), JSON.stringify({ summary: { sets: Object.fromEntries(sets.map(s => [s, {}])) }, cards })); return dir; };
  const trio = (extra = {}) => [mk('tcp-handshake', tcp, extra), mk('heart', heart, extra), mk('gini', gini, extra)];
  // the baseline run: the same prompts under their source sets, 3 runs, 2 of the 3 prompts covered
  const baseline = write('base', [1, 2, 3].flatMap(r => [mk('tcp-handshake', tcp, { run: r }, 'sequence'), mk('heart', heart, { run: r }, 'baseline')]), ['sequence', 'baseline']);
  const ok = gateCheck(write('ok', trio(), ['smoke']), 'abc', 'smoke', baseline);
  assert.match(ok.first, /^GATE: PASS abc tier=smoke vs baseline/); assert.equal(ok.code, 0);
  assert.match(ok.body, /the baseline covers 2 of 3 smoke prompts, the other 1 have no baseline/); assert.match(ok.body, /PASS {2}delivery.*\[hard\]/);
  assert.match(ok.body, /PASS {2}whole-card p90 vs baseline: smoke 3000 ms \| baseline mean 3000 ms \| delta \+0 ms \| tolerance \+2000 ms \[2 prompts\]/);
  const slow = gateCheck(write('slow', trio({ totalMs: 5500 }), ['smoke']), 'abc', 'smoke', baseline);
  assert.match(slow.first, /^GATE: FAIL abc tier=smoke vs baseline whole-card p90 vs baseline$/); assert.equal(slow.code, 1);
  const pics = gateCheck(write('pics', [mk('tcp-handshake', block('x', fence(seqSpec), pic('pic-2'))), mk('heart', heart), mk('gini', gini)], ['smoke']), 'abc', 'smoke', baseline);
  assert.match(pics.first, /pictures where none belongs: 0/, 'a picture where none belongs fails whatever the baseline says');
  const nobase = gateCheck(write('nb', trio(), ['smoke']), 'abc', 'smoke', write('empty', [], ['baseline']));
  assert.match(nobase.body, /NO BASELINE {2}factual error rate/); assert.equal(nobase.code, 0, 'no baseline is reported, not failed');
  const full = gateCheck(write('full', [{ ...trio()[0], set: 'baseline', run: 1 }], ['baseline']), 'abc');
  assert.equal(full.tier, 'full'); assert.equal(gateLines('full').length, 13);
});
