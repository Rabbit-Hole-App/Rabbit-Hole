import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import g from '../fixtures/generation.generated.js';
import { scene, sources, evidence, reviewStates } from './overview.js';
import { assertCardGates, assertEvidence, assertSources, evaluated } from '../../card-gates.mjs';

const STEPS = g.overview.steps;
const ALL = STEPS.map((s, i) => ({ step: i }));
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const label = (result, id) => byId(result, id).label;
const quoted = c => (c === 'space' ? 'a space' : `“${c}”`);
const shown = result => result.state.objects.filter(o => o.visible && o.label).map(o => o.label).join('\n');
const HERE = dirname(fileURLToPath(import.meta.url));

test('overview passes every gate at every step; one discrete control; no prerequisites', () => {
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.ok(scene.objects[0].initialState.text.length <= 95);
  assert.equal(scene.inputs.length, 1);
  assert.equal(scene.inputs[0].type, 'index');
  assert.equal(scene.inputs[0].presentation, 'picker', 'discrete steps, not the Guided slider');
  assertCardGates(scene, ALL);
  assert.ok(reviewStates.length >= 2 && reviewStates.length <= 6);
  const [first] = assertCardGates(scene, reviewStates);
  assert.equal(label(first, 'prerequisites'), 'No prerequisites.');
  // Intuition only: no equations, no tensor shapes, no probabilities printed.
  assert.ok(!scene.objects.some(o => o.type === 'equation' || o.type === 'code'));
  for (const result of assertCardGates(scene, ALL)) {
    assert.doesNotMatch(shown(result), /\(\s*[A-Za-z]\w*\s*,/, 'no tensor shapes');
    assert.doesNotMatch(shown(result), /\d\.\d|\.\d\d|\d%|[=÷×]/, 'no probabilities or arithmetic printed');
  }
});

test('the learner is never labelled', () => {
  const surface = [scene.title, ...scene.inputs.map(i => i.label), shown(evaluated(scene, { step: 0 }))].join('\n');
  assert.doesNotMatch(surface, /beginner|intermediate|advanced|expert|newcomer|novice/i);
});

test('each step shows the recorded pick joining the text and the next read', () => {
  STEPS.forEach((s, i) => {
    const [result] = assertCardGates(scene, [{ step: i }]);
    // Independent: the written text is the prompt plus every pick so far.
    const picks = STEPS.slice(0, i + 1).map(t => (t.picked === 'space' ? ' ' : t.picked)).join('');
    // A space is drawn as a visible • chip, never an empty one.
    const glyphs = s => [...s].map(c => (c === ' ' ? '•' : c));
    assert.deepEqual(byId(result, 'prompt').tokens, glyphs(g.prompt));
    assert.deepEqual(byId(result, 'written').tokens, glyphs(picks));
    for (const row of ['prompt', 'written']) assert.ok(byId(result, row).tokens.every(t => t.trim() !== ''), `${row}: no blank chip`);
    assert.equal(byId(result, 'written').cellHighlight, i, 'the newest character is lit');
    const before = g.prompt + picks.slice(0, -1);
    assert.equal(s.window, before.slice(-g.block), 'the model reads the last block characters');
    assert.equal(s.nextWindow, (before + picks.at(-1)).slice(-g.block), 'the pick is part of the next read');
    assert.equal(label(result, 'read-now'), `reads the last ${g.block}: “${glyphs(s.window).join('')}”`);
    assert.equal(label(result, 'add-now'), `now ends “${glyphs(s.nextWindow).join('')}”`);
    assert.equal(label(result, 'pick-now'), `picked ${quoted(s.picked)}`);
    assert.equal(label(result, 'score-now'), `most likely: ${quoted(s.favourite)}`);
    assert.equal(label(result, 'say-step'), `Step ${i + 1} of ${STEPS.length}`);
    // Bars: the recorded top five, highest first, the pick lit and marked.
    const bars = byId(result, 'bars');
    assert.deepEqual(bars.values, s.probs);
    assert.deepEqual(bars.labels, s.shown);
    for (let k = 1; k < s.probs.length; k += 1) assert.ok(s.probs[k - 1] >= s.probs[k], 'bars are in order');
    assert.equal(bars.cellHighlight, s.pickedRank);
    assert.equal(s.shown[s.pickedRank], s.picked);
    assert.equal(s.shown[0], s.favourite);
    const mark = byId(result, 'picked-mark');
    assert.equal(mark.x, bars.x + s.pickedRank * 64 + 9);
    const barTop = bars.y + bars.h - s.probs[s.pickedRank] * (bars.h - 4);
    assert.ok(Math.abs(mark.y - (barTop - 10)) < 0.01, `step ${i + 1}: mark rides the picked bar`);
    // Cause and effect captions agree with the record.
    const verdict = s.pickedRank === 0 ? `The random pick landed on the favourite, ${quoted(s.picked)}.`
      : `${quoted(s.favourite)} was the favourite, but the random pick landed on ${quoted(s.picked)}.`;
    assert.equal(label(result, 'say-pick'), verdict);
    assert.equal(label(result, 'say-join'), `The pick joins the text, so the next step reads “${glyphs(s.nextWindow).join('')}”`);
    assert.equal(label(result, 'say-next'), `and scores again from there: now ${quoted(s.nextFavourite)} leads.`);
    if (i + 1 < STEPS.length) assert.equal(STEPS[i + 1].favourite, s.nextFavourite, 'the next favourite is the next step\'s');
  });
  // The step the card is built around: the favourite loses at step 1, and
  // the caption that says a less likely pick can win names that step.
  assert.equal(STEPS[0].favourite, 'z');
  assert.equal(STEPS[0].picked, 'o');
  assert.equal(STEPS[0].nextFavourite, 'n');
  assert.equal(label(evaluated(scene, { step: 3 }), 'say-random-2'), 'can win, as “o” beat the favourite “z” at step 1.');
  // Spaces the model picked (steps 3 and 6) show as • in the text row.
  assert.deepEqual(STEPS.flatMap((s, i) => (s.picked === 'space' ? [i] : [])), [2, 5]);
  assert.equal(byId(evaluated(scene, { step: 5 }), 'written').tokens.filter(t => t === '•').length, 2);
});

// Independent oracle for the toy model: recount the cached, sha-pinned
// dataset in plain JS (skipped where the generator's cache is absent).
const DATASET = join(tmpdir(), 'nanogpt-fixture-cache', g.provenance.dataset);
test('recounting the dataset reproduces every recorded distribution', { skip: !existsSync(DATASET) && 'dataset cache absent' }, () => {
  const text = readFileSync(DATASET, 'utf8');
  const train = text.slice(0, Math.floor(text.length * 0.9));
  assert.equal(train.length, g.trainChars);
  assert.equal(new Set(text).size, g.vocabSize);
  const counts = window => {
    const out = new Map();
    for (let i = train.indexOf(window); i >= 0 && i + window.length < train.length; i = train.indexOf(window, i + 1)) {
      const next = train[i + window.length];
      out.set(next, (out.get(next) || 0) + 1);
    }
    return out;
  };
  const name = c => ({ ' ': 'space', '\n': 'newline' }[c] || c);
  for (const s of STEPS) {
    const c = counts(s.window);
    const total = [...c.values()].reduce((a, b) => a + b, 0);
    const ranked = [...c.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    assert.equal(ranked.length, s.candidates, `${s.window}: candidates`);
    assert.deepEqual(ranked.slice(0, 5).map(([ch]) => name(ch)), s.shown, `${s.window}: top five`);
    ranked.slice(0, 5).forEach(([, n], k) => assert.ok(Math.abs(n / total - s.probs[k]) < 1e-4, `${s.window}: p[${k}]`));
  }
});

test('the generator reproduces its fixture byte for byte', { skip: !existsSync(DATASET) && 'dataset cache absent' }, () => {
  const out = execFileSync('python', [join(HERE, '..', 'fixtures', 'gen_generation.py'), '--check'], { encoding: 'utf8' });
  assert.match(out, /matches a fresh regeneration/);
});

const PINNED = process.env.NANOGPT_PINNED
  || 'C:/Users/cyudhist/AppData/Local/Temp/claude/C--Users-cyudhist-Desktop-workspace-small-deploy/a0a20b94-1113-4966-863f-feffed07c1b6/scratchpad/nanogpt-3adf61e';
test('sources: well-formed, pinned, labelled, and quoted verbatim', () => {
  assertSources(sources, scene);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Recorded toy run']);
  assert.match(sources.find(s => s.kind === 'calculation').reproduce, /gen_generation\.py --check$/);
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
  assert.equal(evidence.depth, 'Overview');
  assert.ok(evidence.prerequisites && evidence.ladderRole);
  assert.equal(evidence.learningQuestion, scene.objects[0].initialState.text);
});
