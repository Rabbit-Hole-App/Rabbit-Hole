// /explain's stored interactive examples in View > Slash commands (L10): each is a checked block the server returned, still
// passing every scene gate at every control setting, labelled by origin; the window opens /explain on them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPLAIN_EXAMPLES, ORIGIN_NOTES } from './explain-examples.js';
import { sheetCards, TAB_LABELS } from './slash-sheet.js';
import { SAMPLES_NOTE, sceneProblem } from '../../control-plane/src/learn-scene-gates.js';

test('every stored interactive example is a labelled animation card that passes the scene gates at every setting', () => {
  assert.ok(EXPLAIN_EXAMPLES.length >= 3);
  assert.equal(new Set(EXPLAIN_EXAMPLES.map(entry => entry.id)).size, EXPLAIN_EXAMPLES.length);
  for (const entry of EXPLAIN_EXAMPLES) {
    assert.ok(ORIGIN_NOTES[entry.origin], `${entry.id}: origin`);
    assert.ok(entry.label && entry.args, entry.id);
    assert.equal(entry.block.type, 'animation', entry.id);
    assert.equal(sceneProblem(entry.block.scene), null, entry.id);
    assert.ok((entry.block.scene.inputs || []).some(input => !input.hidden), `${entry.id}: has a control`);
    const noted = entry.block.scene.objects.some(object => object.id === 'samples-note' && object.initialState.text === SAMPLES_NOTE);
    assert.equal(noted, entry.block.calculation === 'precomputed', `${entry.id}: the samples note exactly when precomputed`);
  }
});

test('the window opens /explain on its Interactive visual, then text and table', () => {
  assert.deepEqual(sheetCards('explain').map(entry => entry.card), ['animation', 'explanation', 'table']);
  assert.equal(TAB_LABELS.animation, 'Interactive visual');
});

test('the pendulum example states its period to two decimals at every length (owner follow-up: "Period T = 1 s")', async () => {
  const { evaluateScene } = await import('./scene-evaluate.js');
  const pendulum = EXPLAIN_EXAMPLES.find(example => example.id === 'pendulum');
  const shown = [0, 1, 2, 3, 4].map(len => evaluateScene(pendulum.block.scene, 0, { len }).scene.objects.find(object => object.id === 'result').initialState.text);
  assert.deepEqual(shown, ['1.00', '1.42', '2.01', '2.84', '4.01'].map(t => `T = ${t} s per full back-and-forth swing`));
});
