// EXP-T26 M2: the declared presentation earns its controls. Deterministic state comparisons over every setting; they
// support, and do not replace, the independent review of usefulness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCENE_EXAMPLE } from '../src/agents/learn-scene-author.js';
import { presentationProblem, sceneProblem } from '../src/learn-scene-gates.js';

const pendulum = () => JSON.parse(readFileSync(new URL('../../web/src/explain-examples/pendulum.json', import.meta.url), 'utf8')).block.scene;
const withPresentation = (scene, presentation) => ({ ...structuredClone(scene), presentation });

test('a saved scene without a presentation is not held to one', () => {
  assert.equal(presentationProblem(pendulum()), null);
});

test('the authoring example declares a static presentation with one experiment per control, and passes every gate', () => {
  assert.equal(SCENE_EXAMPLE.presentation.mode, 'static');
  assert.equal(presentationProblem(SCENE_EXAMPLE), null);
  assert.equal(sceneProblem(SCENE_EXAMPLE), null);
});

test('a static architecture diagram needs no controls and no playback', () => {
  const diagram = {
    id: 'pipeline', duration: 1, width: 700, height: 240,
    objects: [
      { id: 'a', type: 'box', initialState: { label: 'tokens', x: 40, y: 80, w: 160, h: 60 } },
      { id: 'b', type: 'box', initialState: { label: 'embeddings', x: 280, y: 80, w: 160, h: 60 } },
      { id: 'ab', type: 'arrow', initialState: { from: { x: 200, y: 110 }, to: { x: 276, y: 110 } } },
    ],
    timeline: [],
    presentation: { mode: 'static' },
  };
  assert.equal(presentationProblem(diagram), null);
});

test('time mode on a timeline that only reveals is refused: declare static', () => {
  const scene = withPresentation(SCENE_EXAMPLE, { ...SCENE_EXAMPLE.presentation, mode: 'time' });
  assert.match(presentationProblem(scene), /time mode on a timeline that only reveals/);
});

test('meaningful algorithm steps pass; a step that only moves a highlight is refused', () => {
  const sort = steps => ({
    id: 'swap', duration: 3, width: 600, height: 200,
    objects: [{ id: 'list', type: 'strip', initialState: { label: 'the list', x: 40, y: 80, cell: 48, values: [3, 1, 2] } }],
    timeline: [
      { at: 1, action: 'set_values', target: 'list', value: [1, 3, 2] },
      { at: 2, action: 'highlight_cell', target: 'list', value: 1 },
      { at: 2.5, action: 'set_values', target: 'list', value: [1, 2, 3] },
    ],
    presentation: { mode: 'steps', steps },
  });
  assert.equal(presentationProblem(sort([{ id: 's0', title: 'start', at: 0 }, { id: 's1', title: 'swap the first pair', at: 1.5 }, { id: 's3', title: 'swap the last pair', at: 3 }])), null);
  assert.match(presentationProblem(sort([{ id: 's1', title: 'swap the first pair', at: 1.5 }, { id: 's2', title: 'look at position 2', at: 2.2 }])),
    /step "look at position 2" draws the same as "swap the first pair"/);
});

test('every control needs a declared experiment', () => {
  const scene = withPresentation(SCENE_EXAMPLE, { mode: 'static', experiments: [SCENE_EXAMPLE.presentation.experiments[0]] });
  assert.match(presentationProblem(scene), /control "showParts" has no experiment/);
});

test('an experiment that only moves a highlight is decorative and refused', () => {
  const scene = {
    id: 'pick', duration: 1, width: 600, height: 200,
    inputs: [{ name: 'which', type: 'index', label: 'Which item', of: 'items', default: 0 }],
    exampleData: { items: ['a', 'b', 'c'] },
    objects: [{ id: 'list', type: 'strip', initialState: { label: 'items', x: 40, y: 80, cell: 48, values: [1, 2, 3], cellHighlight: { $derive: 'which' } } }],
    timeline: [],
    presentation: { mode: 'static', experiments: [{ id: 'e', input: 'which', purpose: 'Which item is picked?', affects: ['list'], contrasts: ['first', 'last'] }] },
  };
  assert.match(presentationProblem(scene), /says "which" changes "list", but it draws the same at which = 0 and 1 \(a moved highlight does not count\)/);
});

test('pendulum: length changes the period readout at every setting, but the drawing stops changing past 2 m, so a claim that it changes the bob is refused', () => {
  const experiment = affects => ({ id: 'length', input: 'len', purpose: 'Make the pendulum 4x longer: does it swing 4x slower?', affects, contrasts: ['0.25 m: 1.00 s', '1.00 m: 2.01 s', '4.00 m: 4.01 s'] });
  const reference = { id: 'reference', input: 'compare', purpose: 'Compare with the 1.00 m bob', affects: ['refBob'], contrasts: ['reference shown', 'reference hidden'] };
  assert.equal(presentationProblem(withPresentation(pendulum(), { mode: 'static', experiments: [experiment(['result', 'rate']), reference] })), null);
  assert.match(presentationProblem(withPresentation(pendulum(), { mode: 'static', experiments: [experiment(['result', 'bob']), reference] })),
    /changes "bob", but it draws the same at len = 3 and 4/);
});

test('an experiment that depends on another control may show its change under that control\'s settings', () => {
  const scene = {
    id: 'dep', duration: 1, width: 600, height: 200,
    inputs: [{ name: 'on', type: 'bool', label: 'Show', default: false }, { name: 'size', type: 'choice', label: 'Size', default: 'small', options: [{ id: 'small', label: 'small' }, { id: 'big', label: 'big' }] }],
    exampleData: { sizes: { small: 'small box', big: 'big box' }, shown: 'shown', hidden: '', visible: 1, invisible: 0 },
    derived: { name: { op: 'pick', args: ['sizes', 'size'] }, note: { op: 'choose', args: ['on', 'shown', 'hidden'] }, alpha: { op: 'choose', args: ['on', 'visible', 'invisible'] } },
    objects: [
      { id: 'box', type: 'box', initialState: { label: '{{name}}', x: 40, y: 60, w: 200, h: 60, opacity: { $derive: 'alpha' } } },
      { id: 'note', type: 'text', initialState: { text: 'on: {{note}}', x: 40, y: 160 } },
    ],
    timeline: [],
  };
  const sizeAffectsBox = dependsOn => ({ id: 'size', input: 'size', purpose: 'p', affects: ['box'], contrasts: ['c'], ...(dependsOn ? { dependsOn } : {}) });
  const toggle = { id: 'toggle', input: 'on', purpose: 'p', affects: ['box', 'note'], contrasts: ['c'] };
  assert.equal(presentationProblem(withPresentation(scene, { mode: 'static', experiments: [toggle, sizeAffectsBox(['on'])] })), null);
  assert.match(presentationProblem(withPresentation(scene, { mode: 'static', experiments: [toggle, sizeAffectsBox(['nope'])] })), /depends on "nope"/);
});
