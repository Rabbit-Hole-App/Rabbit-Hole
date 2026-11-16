// bench-pick.mjs aggregation proof ($0, no network): fabricated rows, thresholds applied offline, wrong and missed fits, per-depth counts, the cheapest passing threshold and the report text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, decide, median, p95, reportMarkdown, stubPick, FAMILY_LISTS, CURVE_SLIDERS } from '../../../scripts/interact/bench-pick.mjs';

const SET = [{ id: 1, label: 'vertical-throw' }, { id: 2, label: 'vertical-throw' }, { id: 3, label: 'none' }, { id: 49, label: 'none' }, { id: 17, label: 'curve-sliders' }];
const L = 'vertical-throw';
const row = (id, depth, p, ms = 800, extra = {}) => ({ list: L, id: String(id), depth, rep: 0, probabilities: p, ms, ...extra });
const vt = (v, none = 1 - v) => ({ 'vertical-throw': v, none });

test('label either (an ambiguous prompt) is never a wrong fit and never a missed fit, whatever the pick does', () => {
  const set = [{ id: 11, label: 'either' }, { id: 1, label: 'vertical-throw' }];
  const rows = [row(11, 'brief', vt(0.95)), row(11, 'balanced', vt(0.1)), row(11, 'detailed', null), row(1, 'brief', vt(0.95))];
  const b = aggregate(rows, set)[L].byThreshold[0.7];
  assert.deepEqual([b.wrongPrompts, b.missedPrompts, b.wrongCalls, b.missedCalls, b.passes], [[], [], 0, 0, true]);
});

test('decide: a family fits only when it is the top choice and reaches the threshold; no answer is a gap', () => {
  assert.equal(decide(row(1, 'brief', vt(0.8)), 0.7), 'vertical-throw');
  assert.equal(decide(row(1, 'brief', vt(0.8)), 0.9), null);
  assert.equal(decide(row(1, 'brief', vt(0.4)), 0), null, 'none is the top choice');
  assert.equal(decide(row(1, 'brief', null), 0), null);
});

test('aggregate: wrong fits (any call), missed fits (most calls gap), per depth, cheapest passing threshold, timeouts', () => {
  const rows = [
    ...['brief', 'balanced', 'detailed'].map(d => row(1, d, vt(0.95))), // always fits
    row(2, 'brief', vt(0.65)), row(2, 'balanced', vt(0.65)), row(2, 'detailed', vt(0.95)), // gap at 0.7 in two of three calls: missed from 0.7, fits at 0.6
    row(3, 'brief', vt(0.55)), row(3, 'balanced', vt(0.1)), // a none prompt that fits at 0.5: wrong at 0.5 only
    row(49, 'brief', vt(0.2), 900), row(49, 'balanced', null, 1200, { timeout: true }),
    row(17, 'brief', vt(0.9)), // labelled curve, picked vertical-throw: wrong
  ];
  const a = aggregate(rows, SET)[L];
  assert.equal(a.calls, 11); assert.equal(a.timeouts, 1); assert.equal(a.failures, 1);
  assert.deepEqual(a.byThreshold[0.5].wrongPrompts.sort(), ['17', '3']);
  assert.deepEqual(a.byThreshold[0.6].wrongPrompts, ['17']);
  assert.deepEqual(a.byThreshold[0.6].missedPrompts, []);
  assert.deepEqual(a.byThreshold[0.7].missedPrompts, ['2']);
  assert.equal(a.byThreshold[0.7].missedCalls, 2);
  assert.equal(a.byThreshold[0.5].perDepth.brief.wrong, 2, 'prompts 3 and 17 at brief, counted per call');
  assert.equal(a.cheapest, null, 'prompt 17 is picked as vertical-throw at every threshold up to 0.9');
  const clean = aggregate(rows.filter(r => r.id !== '17'), SET)[L];
  assert.equal(clean.cheapest, 0.6, '0.5 has the wrong fit of prompt 3; 0.6 has 0 wrong and no missed fit');
  assert.deepEqual([a.ms.median, a.ms.p95], [800, 1200]);
  assert.equal(a.focus['49'].calls, 2); assert.equal(a.focus['49'].failed, 1);
});

test('statistics and the report text', () => {
  assert.equal(median([3, 1, 2]), 2); assert.equal(median([1, 2, 3, 4]), 2.5); assert.equal(p95([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 10);
  const md = reportMarkdown([row(1, 'brief', vt(0.95)), row(3, 'brief', vt(0.1))], SET);
  assert.match(md, /Cheapest threshold with 0 wrong fits and <= 3 missed fits: \*\*0\.5\*\*/);
  assert.match(md, /\| Threshold \| Wrong fits \(prompts\)/);
});

test('the family lists: the registry, and the registry plus the inline curve-sliders criterion; the stub runs with no network', async () => {
  const lists = FAMILY_LISTS([{ id: 'vertical-throw', pickCriterion: 'x' }]);
  assert.deepEqual(lists.vt.map(f => f.id), ['vertical-throw']); assert.deepEqual(lists['vt+curve'].map(f => f.id), ['vertical-throw', 'curve-sliders']);
  assert.match(CURVE_SLIDERS.pickCriterion, /^One quantity as a function of another/);
  const r = await stubPick({}, { request: 'A ball thrown straight up' }, { families: lists.vt });
  assert.equal(r.family, 'vertical-throw');
  assert.equal((await stubPick({}, { request: 'How does DNS resolve a name?' }, { families: lists.vt })).family, null);
});

test('three-family run: the groups are the both-vote rows and the design-pick labels; outcome and the report pick the threshold with 0 wrong fits on groups a, b, c and the fewest missed fits', async () => {
  const { threePrompts, outcome, threeReportMarkdown } = await import('../../../scripts/interact/bench-pick.mjs');
  const cov = [
    { set: 's', id: 'a', prompt: 'merge sort', jevTop: 'stepper-states', sonnetChoice: 'stepper-states' },
    { set: 's', id: 'b', prompt: 'split vote', jevTop: 'stepper-states', sonnetChoice: 'none' },
    { set: 's', id: 'c', prompt: 'poetry', jevTop: 'none', sonnetChoice: 'none' },
  ];
  const design = [{ id: 1, prompt: 'toss', label: 'vertical-throw' }, { id: 11, prompt: 'either', label: 'either' }, { id: 3, prompt: 'neg', label: 'none' }, { id: 4, prompt: 'handshake', label: 'stepper-states' }, { id: 5, prompt: 'gravity', label: 'vertical-throw', accept: ['curve-sliders'] }];
  const prompts = threePrompts(cov, design);
  assert.deepEqual(prompts.map(p => `${p.group}:${p.label}`), ['a:stepper-states', 'b:vertical-throw', 'b:vertical-throw', 'a:stepper-states', 'c:none', 'd:none']);
  const call = (id, p) => ({ list: 'three', id, depth: 'balanced', rep: 0, probabilities: p });
  const rows = [
    call('st:s/a', { 'stepper-states': 0.8, none: 0.2 }), call('dp:1', { 'vertical-throw': 0.99, none: 0.01 }),
    call('no:s/c', { 'stepper-states': 0.6, none: 0.4 }), call('dp:3', { none: 1 }), call('dp:4', { 'stepper-states': 0.8, none: 0.2 }),
  ];
  assert.deepEqual([0.5, 0.7, 0.9].map(t => outcome([rows[0]], 'stepper-states', t)), ['ok', 'ok', 'm']);
  assert.deepEqual([0.5, 0.7].map(t => outcome([rows[2]], 'none', t)), ['W', '-']);
  assert.equal(outcome([call('dp:5', { 'curve-sliders': 0.9, none: 0.1 })], 'vertical-throw', 0.5, ['curve-sliders']), 'ok'); // an accepted family is a right fit, not a wrong one
  assert.match(threeReportMarkdown(rows, prompts, { thresholds: [0.5, 0.7, 0.9] }), /Chosen threshold: \*\*0\.7\*\*; stepper prompts passing at it: \*\*2 of 2\*\*/); // 0.5 has a wrong fit (group c), 0.9 misses the stepper fit
});
