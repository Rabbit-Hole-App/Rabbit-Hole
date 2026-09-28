import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import g from '../fixtures/generation.generated.js';
import { scene, sources, evidence, reviewStates } from './guided.js';
import { assertCardGates, assertEvidence, assertSources, evaluated } from '../../card-gates.mjs';

const F = g.first;
const P = g.guided.presets;
const ALL = P.map((p, i) => ({ temperature: i }));
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const label = (result, id) => byId(result, id).label;
const shown = result => result.state.objects.filter(o => o.visible && o.label).map(o => o.label).join('\n');
// Independent oracle: softmax(ln(count) / T) from the raw counts, in plain JS.
const oracle = T => {
  const z = F.counts.map(c => Math.log(c) / T);
  const m = Math.max(...z);
  const e = z.map(v => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map(v => v / s);
};
const r3 = v => Math.round(v * 1000) / 1000;
const T1 = P.findIndex(p => p.temperature === 1);

test('guided passes every gate at every preset; one slider; builds on the Overview', () => {
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.ok(scene.objects[0].initialState.text.length <= 95);
  assert.equal(scene.inputs.length, 1);
  assert.equal(scene.inputs[0].presentation, 'slider');
  assert.deepEqual(reviewStates, ALL, 'six presets: every configuration');
  const results = assertCardGates(scene, ALL);
  assert.match(label(results[0], 'prerequisites'), /^Builds on: Overview .*; softmax\.$/);
  assert.ok(!scene.objects.some(o => o.type === 'equation' || o.type === 'code'), 'relationships as numbers, not equations');
  const surface = [scene.title, ...scene.inputs.map(i => i.label), shown(results[3])].join('\n');
  assert.doesNotMatch(surface, /beginner|intermediate|advanced|expert|newcomer|novice/i);
});

test('the fixture is ln(count), and T = 1 gives the count share', () => {
  F.counts.forEach((c, i) => assert.ok(Math.abs(F.logits[i] - Math.log(c)) < 1e-4, `logit ${i}`));
  assert.equal(F.total, F.counts.reduce((a, b) => a + b, 0));
  oracle(1).forEach((p, i) => assert.ok(Math.abs(p - F.counts[i] / F.total) < 1e-12, `softmax(ln c)[${i}] = c / total`));
});

test('live numbers match the oracle at every preset, and the relationships hold', () => {
  const results = assertCardGates(scene, ALL);
  results.forEach((result, k) => {
    const p = P[k];
    const where = p.label;
    const expected = oracle(p.temperature);
    const probs = byId(result, 'probs').values;
    probs.forEach((v, i) => {
      assert.ok(Math.abs(v - expected[i]) <= 0.0015, `${where} p[${i}] ${v} vs ${expected[i]}`);
      assert.ok(Math.abs(v - p.probs[i]) <= 0.0015, `${where} p[${i}] vs fixture`);
    });
    assert.deepEqual(byId(result, 'bars').values, probs);
    byId(result, 'scaled').values.forEach((v, i) => assert.ok(Math.abs(v - F.logits[i] / p.temperature) < 0.002, `${where} logit/T[${i}]`));
    // Order kept: the top is the same character at every T, and so is the ranking.
    const order = [...probs.keys()].sort((a, b) => expected[b] - expected[a]);
    assert.deepEqual(order, [...F.counts.keys()], `${where} ranking`);
    assert.deepEqual([...probs.keys()].sort((a, b) => probs[b] - probs[a]), [...F.counts.keys()], `${where} card ranking`);
    assert.equal(result.derived.topAt, 0);
    assert.equal(label(result, 'order'), `Top is still “${F.display[0]}”.`);
    // The takeaway is on the final frame at every preset, and true there: the ranking
    // above is T = 1's, and the odds are sharper or flatter than T = 1's unless T = 1.
    assert.ok(byId(result, 'takeaway').visible && byId(result, 'takeaway').opacity === 1, `${where} takeaway shown`);
    assert.equal(byId(result, 'takeaway').typography, 'heading', `${where} takeaway is the prominent line`);
    assert.equal(label(result, 'takeaway'), 'Temperature changes how sharp the odds are; it doesn’t change their ordering.');
    assert.equal(p.temperature !== 1, result.derived.pTop !== results[T1].derived.pTop, `${where} sharpness moves with T`);
    // Gap ÷ T, exactly as the line says.
    const rawGap = r3(F.logits[0] - F.logits[1]);
    assert.equal(result.derived.rawGap, rawGap);
    assert.equal(result.derived.gap, r3(rawGap / p.temperature));
    assert.equal(label(result, 'gap'), `Gap “z” − “o”: ${rawGap} ÷ T = ${r3(rawGap / p.temperature)}`);
    assert.ok(Math.abs(result.derived.gap - (byId(result, 'scaled').values[0] - byId(result, 'scaled').values[1])) < 0.002, 'the ÷ T row shows the same gap');
    // The lead: p(z) ÷ p(o) = (141 ÷ 82)^(1/T) = e^(gap ÷ T), from the unrounded p.
    const lead = expected[0] / expected[1];
    assert.ok(Math.abs(p.ratio - lead) < 0.0006, `${where} ratio ${p.ratio} vs ${lead}`);
    assert.ok(Math.abs(lead - (F.counts[0] / F.counts[1]) ** (1 / p.temperature)) < 1e-3, `${where} count ratio ^ 1/T`);
    assert.ok(Math.abs(Math.exp(result.derived.gap) - p.ratio) < 0.005, `${where} e^gap`);
    assert.equal(label(result, 'ratio'), `Lead p(“z”) ÷ p(“o”) = ${p.ratio}`);
    assert.equal(label(result, 'ratio-2'), '= (141 ÷ 82)^(1/T) = e^(gap ÷ T)');
    assert.equal(label(result, 'ratio-3'), `rounded p: ${result.derived.pTop} ÷ ${result.derived.pSecond} ≈ ${p.ratio}`);
    assert.ok(Math.abs(result.derived.pTop / result.derived.pSecond - p.ratio) / p.ratio < 0.01, `${where} rounded p give the ratio`);
    // The card shows its numbers; it does not explain how the renderer prints them.
    assert.equal(scene.objects.some(o => o.id === 'whole' || o.id === 'cells-note'), false);
    // The count share at T = 1 is stated at every preset and is a live fraction.
    assert.equal(label(result, 'share-2'), `${F.counts[0]} ÷ ${F.total} = ${r3(F.counts[0] / F.total)}`);
    // Sharper / flatter than T = 1, judged by the oracle.
    const word = expected[0] > oracle(1)[0] + 1e-9 ? 'Sharper than' : expected[0] < oracle(1)[0] - 1e-9 ? 'Flatter than' : 'The same as';
    assert.equal(label(result, 'relation'), `${word} T = 1.0`);
    assert.equal(label(result, 't-now'), p.label);
    assert.equal(label(result, 'p-top'), `p(“z”) = ${result.derived.pTop},  p(“o”) = ${result.derived.pSecond}`);
    // Recorded draws: the fixture's twenty, bold on every non-top draw.
    const drawn = [...byId(result, 'draws-a').tokens, ...byId(result, 'draws-b').tokens];
    assert.deepEqual(drawn, p.drawn);
    const top = drawn.filter(d => d === F.display[0]).length;
    assert.equal(top, p.drawnTop);
    assert.equal(label(result, 'draw-count'), `${top} of 20 draws were “z”`);
    const bold = [...byId(result, 'draws-a').cellHighlight.map(i => drawn[i]), ...byId(result, 'draws-b').cellHighlight.map(i => drawn[10 + i])];
    assert.ok(bold.length === 20 - top && bold.every(d => d !== F.display[0]), `${where} bold marks the non-top draws`);
    assert.ok(Math.abs(result.derived.expected - 20 * expected[0]) < 0.02, `${where} expected count`);
  });
  // The takeaway waits for the draws: hidden before its 2.6 step.
  assert.equal(byId(evaluated(scene, { temperature: T1 }, 2.5), 'takeaway').opacity, 0, 'takeaway fades in last');
  // Lower T concentrates the same seeded draws on the top character.
  for (let k = 1; k < P.length; k += 1) assert.ok(P[k].drawnTop <= P[k - 1].drawnTop, 'draws on z never rise with T');
  assert.ok(results[0].derived.pTop > results.at(-1).derived.pTop);
  // The evidence task's claim: f, v and c appear at T = 2.0 and not at T = 1.0.
  const rare = p => p.drawn.filter(d => ['f', 'v', 'c'].includes(d)).length;
  assert.equal(rare(P[T1]), 0);
  assert.ok(rare(P.at(-1)) > 0 && P.at(-1).drawnTop === 4);
});

const PINNED = process.env.NANOGPT_PINNED
  || 'C:/Users/cyudhist/AppData/Local/Temp/claude/C--Users-cyudhist-Desktop-workspace-small-deploy/a0a20b94-1113-4966-863f-feffed07c1b6/scratchpad/nanogpt-3adf61e';
test('sources: well-formed, pinned, labelled, and quoted verbatim', () => {
  assertSources(sources, scene);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Calculated toy example', 'Live calculation', 'Recorded toy run']);
  for (const s of sources.filter(s => s.kind === 'calculation' && s.status !== 'Live calculation')) assert.match(s.reproduce, /gen_generation\.py --check$/);
  const [result] = assertCardGates(scene, [{ temperature: 3 }]);
  assert.ok(sources.some(s => s.kind === 'code' && s.path === 'sample.py' && s.lines[0] === g.sample.temperature.line));
  assert.ok(P.some(p => p.temperature === g.sample.temperature.value), 'sample.py\'s temperature is a preset');
  assert.ok(shown(result).includes('Calculated toy example') && shown(result).includes('Recorded toy run'));
  if (!existsSync(PINNED)) return;
  for (const { path, lines: [start, end], note } of sources.filter(s => s.kind === 'code')) {
    const cited = readFileSync(join(PINNED, path), 'utf8').split('\n').slice(start - 1, end).join('\n');
    const quotes = [...note.matchAll(/“([^”]+)”/g)].map(m => m[1]);
    assert.ok(quotes.length, `${path}:${start} quotes the source`);
    for (const quote of quotes) assert.ok(cited.includes(quote), `${path}:${start}-${end} contains "${quote}"`);
  }
});

test('evidence record is complete', () => {
  assertEvidence(evidence);
  assert.equal(evidence.depth, 'Guided');
  assert.ok(evidence.prerequisites && evidence.ladderRole);
  assert.equal(evidence.learningQuestion, evaluated(scene).state.objects[0].label);
});
