// bench-composition.mjs proof ($0, no network): the prompt set, the PARTS block (kind names only), scorers A, B, D and the summary on fabricated and reference compositions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CARD_LINES, COVERAGE, DEPTHS, SUBJECTS, compositionSchema, loadReference, partsBlock, partsSpec, promptList, reportMarkdown, runModel, scoreA, scoreB, scoreD, scorecardRows, scriptedReply, summarize, systemFor, MODELS, loadRows, yesCount } from '../../../scripts/interact/bench-composition.mjs';

const clone = x => structuredClone(x);
const spec = partsSpec();
const ref = (subject = 'tcp-handshake', depth = 'balanced') => { const { schemaVersion, status, id, family, depth: d, canonical, ...c } = loadReference(subject, depth); return c; };

test('prompt set: 44 stepper rows round robin 15/15/14 plus 9 reference rows = 53, ids unique per depth', () => {
  const list = promptList(readFileSync(COVERAGE, 'utf8').trim().split('\n').map(l => JSON.parse(l)));
  const a = list.filter(p => p.set === 'A'), b = list.filter(p => p.set === 'B');
  assert.equal(a.length, 44); assert.equal(b.length, 9); assert.equal(list.length, 53);
  assert.deepEqual(DEPTHS.map(d => a.filter(p => p.depth === d).length), [15, 15, 14]);
  assert.deepEqual(a.slice(0, 4).map(p => p.depth), ['brief', 'balanced', 'detailed', 'brief']);
  assert.equal(new Set(list.map(p => `${p.id}-${p.depth}`)).size, 53);
  assert.deepEqual(SUBJECTS.map(s => s.request), b.filter(p => p.depth === 'brief').map(p => p.request));
});

test('PARTS block and system text name kinds and bind keys only: no reference story, region label or sentence reaches the model', () => {
  const block = partsBlock(spec), system = systemFor('GUIDE TEXT', spec);
  for (const kind of ['step-rail', 'fixed-picture', 'active-callout', 'previous-state-ghost', 'value-readout', 'progress']) assert.ok(block.includes(`\`${kind}\``), kind);
  assert.ok(block.includes('`index`') && block.includes('`select`') && block.includes('`reset`'));
  assert.ok(system.startsWith('GUIDE TEXT') && system.includes('## LIMITS'));
  const ref0 = ref('merge-sort', 'detailed'), leaks = [ref0.story, ref0.data.variants[0].states[0].sentence, ref0.data.variants[0].regions[0].label];
  for (const text of leaks) assert.ok(!system.includes(text), `leaked: ${text}`);
  assert.ok(!compositionSchema(spec).properties.parts.items.properties.kind.enum.includes('graph'));
});

test('A and B pass on every reference composition (the answer key is itself a valid composition)', () => {
  for (const subject of SUBJECTS.map(s => s.id)) for (const depth of DEPTHS) { const c = ref(subject, depth); assert.deepEqual([scoreA(c, spec).ok, scoreB(c).ok], [true, true], `${subject} ${depth}: ${scoreA(c, spec).problems} ${scoreB(c).problems}`); }
});

test('A: unknown part or control kind, two index controls, an unbound index and two parameter controls fail with a named problem', () => {
  const c = ref(); c.parts[0].kind = 'sparkle';
  assert.match(scoreA(c, spec).problems[0], /part kind "sparkle"/);
  const k = ref(); k.controls[1].kind = 'dial'; assert.match(scoreA(k, spec).problems[0], /control kind "dial"/);
  const two = ref(); two.controls.push({ id: 'again', kind: 'index', items: 'variant.states', default: 0 }); assert.match(scoreA(two, spec).problems.join(), /exactly one index control.*found 2/);
  const unbound = ref(); unbound.controls.find(x => x.kind === 'index').items = 'variant.regions'; assert.match(scoreA(unbound, spec).problems.join(), /bound to variant.regions/);
  const params = ref(); params.controls.push({ id: 'p2', kind: 'select', options: ['a'], default: 0 }); assert.match(scoreA(params, spec).problems.join(), /at most one parameter control/);
  assert.equal(scoreA(null, spec).ok, false); assert.equal(scoreA({}, spec).ok, false);
});

test('B: a bind that points nowhere and an aha.stateId that names no state fail', () => {
  const c = ref(); c.parts[1].bind.regions = 'variant.nothing'; assert.match(scoreB(c).problems[0], /variant.nothing/);
  const s = ref(); s.parts[0].bind.active = 'inputs.missing'; assert.match(scoreB(s).problems[0], /inputs.missing/);
  const t = ref(); t.parts[2].bind.text = 'state.nothing'; assert.match(scoreB(t).problems[0], /state.nothing/);
  const w = ref(); w.parts[0].bind.items = 'world.states'; assert.match(scoreB(w).problems[0], /world.states/);
  const a = ref(); a.aha.stateId = 'nowhere'; assert.match(scoreB(a).problems.join(), /aha.stateId "nowhere"/);
  assert.equal(scoreB(null).ok, false);
});

test('D: the reference against itself is five true booleans; each mutation flips exactly its boolean', () => {
  const r = loadReference('tcp-handshake', 'balanced'), same = ref('tcp-handshake', 'balanced');
  same.story = `${same.story} ${r.data.variants[0].regions.map(x => x.label).join(' ')}`; // the hand-written story does not name every region label; a story that does makes all five true
  assert.deepEqual(scoreD(same, r), { partsKinds: true, controlKinds: true, stateCount: true, storyNamesRegions: true, ahaIndex: true });
  const kinds = clone(same); kinds.parts.pop(); assert.deepEqual(Object.entries(scoreD(kinds, r)).filter(([, v]) => !v).map(([k]) => k), ['partsKinds']);
  const ctl = clone(same); ctl.controls = ctl.controls.filter(x => x.kind !== 'select'); assert.deepEqual(Object.entries(scoreD(ctl, r)).filter(([, v]) => !v).map(([k]) => k), ['controlKinds']);
  const count = clone(same); count.data.variants[0].states.push(clone(count.data.variants[0].states[0]), clone(count.data.variants[0].states[0])); count.data.variants[0].states.at(-1).id = 'x2'; count.data.variants[0].states.at(-2).id = 'x1';
  assert.equal(scoreD(count, r).stateCount, false);
  const story = clone(same); story.story = 'A short story naming nothing.'; assert.equal(scoreD(story, r).storyNamesRegions, false);
  const aha = clone(same); const ids = aha.data.variants[0].states.map(s => s.id); aha.aha.stateId = ids[0] === r.aha.stateId ? ids[1] : ids[0]; assert.equal(scoreD(aha, r).ahaIndex, false);
  assert.deepEqual(Object.values(scoreD(null, r)), [false, false, false, false, false]);
});

test('scorecard rows: lines 1 to 10 are read from the rubric file; C asks for 1, 2, 3, 4, 6, 7, 8 only', () => {
  const rows = scorecardRows();
  assert.deepEqual(Object.keys(rows).map(Number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); assert.deepEqual(CARD_LINES, [1, 2, 3, 4, 6, 7, 8]);
});

test('summary and report on fabricated rows: percentages, mean Yes, median ms, USD, reached; the water cycle prints in full', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bc-test-')), shared = { total: 0, cardRows: scorecardRows() }, rows = [];
  const prompts = [{ id: 'a01', set: 'A', request: 'q', depth: 'brief' }, { id: 'b-tcp-handshake', set: 'B', subject: 'tcp-handshake', request: 'how does the TCP handshake work?', depth: 'balanced' }, { id: 'x-water-cycle', set: 'X', subject: null, request: 'how does the water cycle work?', depth: 'balanced' }];
  const r = await runModel(MODELS[0], prompts, { env: {}, system: '', schema: {}, rows, dir, concurrency: 1, capModel: 8, capTotal: 25, shared, resume: true, scripted: true, log: () => {} });
  assert.deepEqual([r.reached, r.stopped], [3, null]);
  const loaded = loadRows(dir, [MODELS[0].id], spec), s = summarize(loaded);
  assert.deepEqual([s.reached, s.schemaPct, s.bindsPct, s.meanYes, s.usd, s.errors], [2, 100, 100, 7, 0, 0]);
  assert.equal(yesCount(loaded[0]), 7);
  const d = loaded.find(x => x.set === 'B').D; assert.equal(d.stateCount && d.ahaIndex && d.partsKinds, true);
  const md = reportMarkdown(loaded, { saveDir: dir, models: [MODELS[0].id], spec });
  assert.match(md, /## claude-opus-5-5/); assert.match(md, /calls reached of 53/); assert.match(md, /water cycle/); assert.match(md, /```json/);
  const cap = await runModel(MODELS[1], prompts, { env: {}, system: '', schema: {}, rows: [], dir, concurrency: 1, capModel: -1, capTotal: 25, shared: { total: 0, cardRows: shared.cardRows }, resume: true, scripted: true, log: () => {} });
  assert.equal(cap.stopped, 'cap-model-usd'); assert.equal(cap.reached, 1, 'a model stops at its cap after the call that crossed it');
});

test('scriptedReply is a composition the scorers accept for every set', () => {
  for (const p of [{ set: 'A', depth: 'brief' }, { set: 'B', subject: 'mitosis', depth: 'detailed' }, { set: 'X', subject: null, depth: 'balanced' }]) { const c = scriptedReply(p); assert.deepEqual([scoreA(c, spec).ok, scoreB(c).ok], [true, true]); }
});
