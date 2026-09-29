import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import { scene, sources, evidence, reviewStates } from './overview.js';
import { assertCardGates, assertEvidence, assertSources, evaluated } from '../../card-gates.mjs';
import { sceneContentBounds, sceneLegibility } from '../../../scene-layout.js';

const byId = result => new Map(result.state.objects.map(object => [object.id, object]));
const on = (objects, id) => objects.get(id).visible && objects.get(id).opacity > 0;
const labels = result => result.state.objects.filter(o => o.visible && o.opacity > 0 && o.label).map(o => o.label);
const CE = fx.crossEntropy;
const TOY = CE.presets.find(preset => preset.id === 'confident-right');
// Which picture each stage shows (ids that appear only in that stage).
const LISTS = ['piece-list', 'place-list', 'sum-list'].flatMap(id => [id, `${id}-label`, `${id}-tail`]);
const PICTURES = [['context', 'context-note'], ['pieces'], ['pieces', ...LISTS, 'lists-note'], ['pieces', 'fan-0', 'fan-in', 'blocks-note'],
  ['scores', 'scores-note'], ['next-pieces', 'next-note']];
const PICTURE_IDS = [...new Set(PICTURES.flat())];

test('passes every card gate at every stage', () => {
  assert.equal(reviewStates.length, 6);
  assertCardGates(scene, reviewStates);
});

test('Overview ladder rung: one discrete control, no equations, no shapes, no prerequisites', () => {
  const visible = scene.inputs.filter(input => !input.hidden);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].type, 'index');
  assert.equal(scene.exampleData[visible[0].of].length, 6);
  assert.equal(scene.objects.filter(o => o.type === 'equation' || o.type === 'code').length, 0);
  for (const inputs of reviewStates) {
    const text = labels(evaluated(scene, inputs)).join('\n');
    assert.doesNotMatch(text, /\(\s*[A-Za-z][\w·]*(?:\s*,\s*[\w·×/]+)+\s*\)/, `no tensor shape at ${JSON.stringify(inputs)}`);
    assert.doesNotMatch(text, /\b(beginner|intermediate|advanced|expert|newcomer)s?\b/i);
  }
  assert.equal(scene.objects[1].initialState.text, 'No prerequisites.');
});

test('sizes are bound to the fixture, and the fixture matches the pinned config', () => {
  // Independent oracle: the literals in config/train_shakespeare_char.py @3adf61e
  // (n_layer = 6, n_embd = 384) and prepare.py's 65-character vocabulary.
  assert.deepEqual([fx.architecture.n_layer, fx.architecture.n_embd, fx.architecture.vocab_size], [6, 384, 65]);
  const { L, V, C } = scene.exampleData;
  assert.deepEqual({ L, V, C }, { L: fx.architecture.n_layer, V: fx.architecture.vocab_size, C: fx.architecture.n_embd });
  const objects = byId(evaluated(scene, { stage: 3 }));
  assert.equal(objects.get('stage-3').label, '6 blocks');
  assert.equal(objects.get('stage-4').label, '65 next-character scores');
  assert.match(objects.get('stage-line').label, /^6 blocks in a row/);
  assert.match(byId(evaluated(scene, { stage: 2 })).get('stage-line').label, / 384 learned numbers/);
});

test('the example is the fixture context, one piece per character', () => {
  assert.equal(CE.context, 'hear me spea');
  const pieces = byId(evaluated(scene, { stage: 1 })).get('pieces').tokens;
  assert.deepEqual(pieces, [...'hear me spea'].map(ch => (ch === ' ' ? '•' : ch)));
  assert.match(byId(evaluated(scene, { stage: 1 })).get('stage-line').label, /so 12 pieces\.$/);
  assert.match(byId(evaluated(scene, { stage: 0 })).get('context-note').label, /these 12 characters/);
  // The space key sits in a parenthetical after the row's label, never as a
  // line of its own that starts with the glyph (reads as a bullet).
  for (const [stage, id] of [[1, 'pieces'], [5, 'next-pieces']]) {
    assert.equal(byId(evaluated(scene, { stage })).get(id).label, 'the pieces (• marks a space)');
  }
  for (const inputs of reviewStates) {
    for (const label of labels(evaluated(scene, inputs))) assert.doesNotMatch(label, /^\s*•\s*\p{L}/u, `${JSON.stringify(inputs)}: ${label}`);
  }
});

test('stage 2 pictures the last piece: its list plus its place list, each standing for C numbers', () => {
  // Oracle from the context string: the last piece, its 1-based place, and
  // the other place the same character takes.
  const last = CE.context.length - 1;
  const ch = CE.context[last];
  assert.deepEqual([ch, last + 1, CE.context.indexOf(ch) + 1], ['a', 12, 3]);
  const objects = byId(evaluated(scene, { stage: 2 }));
  assert.equal(objects.get('pieces').cellHighlight, last);
  assert.equal(objects.get('piece-list-label').label, `the piece “${ch}”`);
  assert.equal(objects.get('place-list-label').label, `+ its place, number ${last + 1}`);
  for (const id of ['piece-list', 'place-list', 'sum-list']) {
    assert.match(objects.get(`${id}-tail`).label, new RegExp(` ${fx.architecture.n_embd} numbers`), id);
  }
  assert.match(objects.get('lists-note').label, new RegExp(`is also piece ${CE.context.indexOf(ch) + 1}:`));
  // Stage 3 follows the same piece and names both steps of a block.
  const blocks = byId(evaluated(scene, { stage: 3 }));
  assert.equal(blocks.get('pieces').cellHighlight, last);
  assert.match(blocks.get('stage-line').label, /mixes in itself and the pieces before it, then is reworked alone\.$/);
  assert.match(blocks.get('blocks-note-2').label, /reworked on its own/);
  assert.equal(byId(evaluated(scene, { stage: 1 })).get('pieces').cellHighlight, null);
});

test('the chosen character is the argmax of the toy scores, computed live', () => {
  // Oracle: plain JS argmax over the fixture logits.
  const top = TOY.logits.indexOf(Math.max(...TOY.logits));
  assert.equal(CE.vocab[top], 'k');
  const result = evaluated(scene, { stage: 4 });
  assert.equal(result.derived.top, top);
  const objects = byId(result);
  assert.deepEqual(objects.get('scores').values, TOY.logits);
  assert.equal(objects.get('scores').cellHighlight, top);
  assert.match(objects.get('scores-note').label, /“hear me spea”, k scores highest/);
  const next = byId(evaluated(scene, { stage: 5 }));
  assert.deepEqual(next.get('next-pieces').tokens, [...next.get('pieces').tokens, 'k']);
  assert.equal(next.get('next-pieces').cellHighlight, 12);
  assert.match(next.get('next-note').label, /^k is added\. Now 13 characters/);
});

test('each stage lights its box, dims later stages and shows only its own picture', () => {
  reviewStates.forEach(({ stage }) => {
    const objects = byId(evaluated(scene, { stage }));
    for (let i = 0; i < 6; i += 1) {
      assert.equal(objects.get(`stage-${i}`).role, i === stage ? 'prediction' : 'neutral', `stage ${stage}: box ${i} role`);
      assert.equal(objects.get(`stage-${i}`).opacity, i <= stage ? 1 : 0.3, `stage ${stage}: box ${i} opacity`);
    }
    for (const id of PICTURE_IDS) assert.equal(on(objects, id), PICTURES[stage].includes(id), `stage ${stage}: ${id}`);
    assert.equal(objects.get('loop-back').opacity, stage === 5 ? 1 : 0.3);
  });
});

test('sources: well-formed, pinned, and both statuses labelled on the card', () => {
  assertSources(sources, scene);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status).sort(), ['Calculated toy example', 'Source value']);
});

const PINNED = process.env.NANOGPT_PINNED
  || 'C:/Users/cyudhist/AppData/Local/Temp/claude/C--Users-cyudhist-Desktop-workspace-small-deploy/a0a20b94-1113-4966-863f-feffed07c1b6/scratchpad/nanogpt-3adf61e';
test('sources: quoted code is verbatim at the cited lines', { skip: !existsSync(PINNED) && 'pinned NanoGPT copy not present' }, () => {
  for (const { path, lines: [start, end], note } of sources.filter(source => source.kind === 'code')) {
    const cited = readFileSync(join(PINNED, path), 'utf8').split('\n').slice(start - 1, end).join('\n');
    const quotes = [...note.matchAll(/"([^"]+)"/g)].map(match => match[1]);
    assert.ok(quotes.length, `${path}:${start}: note quotes the source`);
    for (const quote of quotes) assert.ok(cited.includes(quote), `${path}:${start}-${end} contains "${quote}"`);
  }
});

const DATASET = join(tmpdir(), 'nanogpt-fixture-cache', fx.provenance.dataset.sha256);
test('the context is in the pinned dataset, followed by k', { skip: !existsSync(DATASET) && 'dataset cache not present' }, () => {
  const text = readFileSync(DATASET, 'utf8');
  assert.ok(text.includes('Before we proceed any further, hear me speak.'));
});

test('evidence record is complete, depth-labelled and pinned', () => {
  assertEvidence(evidence);
  assert.equal(evidence.depth, 'Overview');
  assert.equal(evidence.prerequisites, 'No prerequisites.');
  assert.ok(evidence.ladderRole.length > 20);
  assert.equal(evidence.sourceRevision, `karpathy/nanoGPT@${fx.provenance.nanogpt.commit}`);
  assert.equal(scene.objects[0].initialState.text, evidence.learningQuestion);
  assert.ok(evidence.learningQuestion.length <= 95);
});

// In the app the block is sized from the scene's static content
// (LearningBlocks sizeFor -> sceneLegibility) and each state is fitted into it
// (AnimatedScene -> sceneContentBounds); equal bounds mean the card never
// refits between states and renders at scale 1.
test('the frame never refits: every state has the bounds the block is sized from', () => {
  const block = sceneLegibility(structuredClone(scene)).bounds;
  for (const inputs of reviewStates) {
    const fitted = sceneContentBounds(evaluated(scene, inputs).scene);
    for (const edge of ['xMin', 'xMax', 'yMin', 'yMax']) {
      assert.ok(Math.abs(fitted[edge] - block[edge]) < 0.5, `${JSON.stringify(inputs)} ${edge}: ${fitted[edge]} vs ${block[edge]}`);
    }
  }
});
