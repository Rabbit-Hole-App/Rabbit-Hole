// /explain's interactive scene (the `animation` primitive, L10): the authoring contract, the gates that run the existing
// scene validators, the one repair, the honest failure and the precomputed-samples note. Model calls are scripted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateArtifact } from '../src/learn-artifact.js';
import { SCENE_AUTHORING, SCENE_EXAMPLE } from '../src/agents/learn-scene-author.js';
import { SAMPLES_NOTE, calculationProblem, falseCalculation, inputStates, sceneProblem, withSamplesNote } from '../src/learn-scene-gates.js';
import { evaluateScene } from '../../web/src/scene-evaluate.js';

// L10's two real /explain scenes with wrong stored content (2026-10-21 run records, kept exactly as they came back).
const wrongRun = name => JSON.parse(readFileSync(new URL(`./fixtures/explain-wrong/${name}.json`, import.meta.url), 'utf8'));

const scripted = (...replies) => {
  const seen = [];
  const callModel = async (env, body) => {
    seen.push(body);
    const [name, input] = replies[seen.length - 1];
    return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `call-${seen.length}`, name, input }] });
  };
  return { callModel, seen };
};
const scene = (overrides = {}) => ({ title: 'How weights decide a final grade', calculation: 'live', scene: { ...structuredClone(SCENE_EXAMPLE), ...overrides } });
// A grid with values must say what it is (animation-scene.js): the validator's own refusal, no test-made rule.
const noKind = scene({ objects: [...SCENE_EXAMPLE.objects, { id: 'table', type: 'grid', initialState: { x: 400, y: 300, rows: 1, cols: 2, cell: 48, values: [1, 2] } }] });

test('the contract\'s own example passes every gate, at every input state it offers', () => {
  assert.equal(sceneProblem(SCENE_EXAMPLE), null);
  assert.deepEqual(inputStates(SCENE_EXAMPLE), [{}, { scheme: 'exam' }, { showParts: false }]);
  assert.match(SCENE_AUTHORING, /"id":"weighted-grade"/);
});

test('/explain offers the interactive scene beside text, with the authoring contract and its own longer output cap', async () => {
  const { callModel, seen } = scripted(['make_animation', scene()]);
  const out = await generateArtifact({}, { command: 'explain', args: 'how weighting changes a final grade' }, { callModel });
  assert.deepEqual(seen[0].tools.map(tool => tool.name), ['make_explanation', 'make_table', 'make_animation', 'ask_clarifying_question']);
  assert.ok(seen[0].tools.find(tool => tool.name === 'make_animation').description.includes(SCENE_AUTHORING));
  assert.equal(seen[0].max_tokens, 16000);
  assert.equal(out.result, 'artifact');
  assert.equal(out.primitive, 'animation');
  // The authored cards' block shape (nanogpt/board.js cardBlock), shown at its end state.
  assert.deepEqual(Object.keys(out.block).sort(), ['calculation', 'marked', 'scene', 'selectedObject', 'time', 'title', 'type']);
  assert.equal(out.block.type, 'animation');
  assert.equal(out.block.time, SCENE_EXAMPLE.duration);
  const evaluated = evaluateScene(out.block.scene, out.block.time, { scheme: 'exam' });
  assert.equal(evaluated.derived.grade, 82, 'the grade is computed from the input: 80x0.2 + 60x0.2 + 90x0.6');
  // Every other card command keeps its own cap.
  const quiz = scripted(['make_quiz', { question: 'Q?', options: [{ text: 'a', correct: true }, { text: 'b', correct: false }], why: 'w' }]);
  await generateArtifact({}, { command: 'quiz' }, quiz);
  assert.equal(quiz.seen[0].max_tokens, 4000);
});

test('an explicit interactive request offers only the scene; a plain-text request never does', async () => {
  const interactive = scripted(['make_animation', scene()]);
  await generateArtifact({}, { command: 'explain', args: 'an interactive look at weighted grades' }, interactive);
  assert.deepEqual(interactive.seen[0].tools.map(tool => tool.name), ['make_animation', 'ask_clarifying_question']);
  const plain = scripted(['make_explanation', { title: 'Weights', body: 'A weighted average.' }]);
  await generateArtifact({}, { command: 'explain', args: 'in plain text: an interactive look at weighted grades' }, plain);
  assert.deepEqual(plain.seen[0].tools.map(tool => tool.name), ['make_explanation', 'ask_clarifying_question']);
  assert.equal(plain.seen[0].max_tokens, 4000);
});

test('a scene the validator refuses gets the one repair, carrying the validator\'s own first error', async () => {
  const fixed = scripted(['make_animation', noKind], ['make_animation', scene()]);
  const out = await generateArtifact({}, { command: 'explain', args: 'interactive weighted grades' }, fixed);
  assert.equal(out.result, 'artifact');
  assert.equal(out.repaired, true);
  assert.match(fixed.seen[1].messages.at(-1).content[0].content, /grid "table" carries values and must declare matrixKind/);
});

test('a scene that still fails after its repair is no card: an honest validation error naming the scene', async () => {
  const stuck = scripted(['make_animation', noKind], ['make_animation', noKind], ['make_animation', scene()]);
  const out = await generateArtifact({}, { command: 'explain', args: 'interactive weighted grades' }, stuck);
  assert.equal(stuck.seen.length, 2, 'one repair, never a third call');
  assert.equal(out.result, 'validation_error');
  assert.equal(out.primitive, 'animation');
  assert.ok(!('block' in out));
});

test('every control setting is checked: a failure at one choice names that setting', async () => {
  const broken = scene({ exampleData: { ...SCENE_EXAMPLE.exampleData, weightSets: { equal: [0.34, 0.33, 0.33], exam: [0.5, 0.5] } } });
  assert.match(sceneProblem(broken.scene), /^With input scheme = "exam": .*elementwise needs equal-length vectors/);
  assert.match(sceneProblem({ ...SCENE_EXAMPLE, objects: [...SCENE_EXAMPLE.objects, { id: 'pic', type: 'image', initialState: { src: '/a.png', x: 0, y: 0, w: 10, h: 10 } }] }), /draws no images/);
  // A refusal real runs kept repeating carries its fix after the validator's own words.
  const toggled = structuredClone(SCENE_EXAMPLE); toggled.objects[1].initialState.opacity = { $derive: 'showParts' };
  assert.match(sceneProblem(toggled), /opacity: .*boolean\. Fix: to show or hide with a toggle/);
  // A list written inline as an arg (seen in a real run) is named, not a bare TypeError from the derive seam.
  assert.match(sceneProblem({ ...SCENE_EXAMPLE, derived: { ...SCENE_EXAMPLE.derived, extra: { op: 'sum', args: [[1, 2]] } } }), /^derived\.extra \(sum\): every arg is a name/);
});

test('precomputed samples carry the fixed note under the content; a live scene carries none, whatever the model wrote', async () => {
  const stored = scripted(['make_animation', { ...scene(), calculation: 'precomputed' }]);
  const out = await generateArtifact({}, { command: 'explain', args: 'interactive weighted grades' }, stored);
  const note = out.block.scene.objects.find(object => object.id === 'samples-note');
  assert.equal(note.initialState.text, SAMPLES_NOTE);
  assert.ok(note.initialState.y > Math.max(...SCENE_EXAMPLE.objects.map(object => object.initialState.y)));
  const claimed = withSamplesNote({ ...SCENE_EXAMPLE, objects: [...SCENE_EXAMPLE.objects, { id: 'samples-note', type: 'text', initialState: { text: 'All live!', x: 0, y: 0 } }] }, 'live');
  assert.ok(!claimed.objects.some(object => object.id === 'samples-note'));
});

test('a scene that only selects stored numbers cannot claim to calculate them live', async () => {
  const lookups = { scheme: { op: 'pick', args: ['weightSets', 'scheme'] }, partsNote: SCENE_EXAMPLE.derived.partsNote };
  const stored = scene({ derived: { weights: lookups.scheme, partsNote: lookups.partsNote },
    objects: SCENE_EXAMPLE.objects.filter(object => !['parts', 'grade'].includes(object.id)), timeline: SCENE_EXAMPLE.timeline.filter(event => event.target !== 'parts') });
  const claimed = scripted(['make_animation', stored], ['make_animation', { ...stored, calculation: 'precomputed' }]);
  const out = await generateArtifact({}, { command: 'explain', args: 'interactive weighted grades' }, claimed);
  assert.match(claimed.seen[1].messages.at(-1).content[0].content, /calculation is "live" but no derived op calculates anything/);
  assert.equal(out.result, 'artifact');
  assert.equal(out.block.calculation, 'precomputed');
  assert.ok(out.block.scene.objects.some(object => object.id === 'samples-note'));
});

test('a data object with no authored size gets the size the renderer draws, so the frame never crops its cells or bars', async () => {
  const out = await generateArtifact({}, { command: 'explain', args: 'interactive weighted grades' }, scripted(['make_animation', scene()]));
  const sized = Object.fromEntries(out.block.scene.objects.map(object => [object.id, object.initialState]));
  assert.deepEqual([sized.scores.w, sized.scores.h], [3 * 56, 56], 'a strip: one cell per value');
  assert.deepEqual([sized.parts.w, sized.parts.h], [3 * 64, 120], 'bars: one pitch per bar, the authored height');
  assert.equal(sized.question.w, undefined, 'text keeps its estimate');
});

test('a refused spend admission is said in its own words, never as a bare status', async () => {
  const refusal = { error: 'Paid Learn calls are paused because the platform daily dollar cap has been reached.', code: 'spend_limited', reason: 'daily_cap_reached' };
  await assert.rejects(generateArtifact({}, { command: 'explain', args: 'interactive weighted grades' }, { callModel: async () => Response.json(refusal, { status: 429 }) }),
    { message: refusal.error });
});

test('L10\'s two wrong real scenes stay refused, each for the contradiction the review found', async () => {
  const binary = wrongRun('binary-search-run2'), market = wrongRun('supply-demand-run1'), rerun = wrongRun('binary-search-run4');
  // Binary search, step 2: "2 candidates left" over a range that still draws 3 cells.
  assert.match(sceneProblem(binary.response.block.scene), /^With input step = 2: "sizetext" says "Step 2: Candidates remaining: 2", but "survivors" draws 3 non-zero entries there.*Fix: .*sum over the 0\/1 list/);
  // Its rerun after the count rule (uiexplain, 2026-10-21): the count derived, but step 1 says "Range 0..6" and draws 0..7.
  assert.match(sceneProblem(rerun.response.block.scene), /^With input step = 1: "stepText" says "Step 1: .*Range 0\.\.6\.", but "alive" draws its non-zero entries at 0\.\.7 there, not 0\.\.6.*Fix: /);
  // The same card with the cells its sentences name passes: the rule refuses the contradiction, not the topic.
  const fixed = structuredClone(rerun.response.block.scene);
  fixed.exampleData.alive = [[0, 15], [0, 6], [4, 6], [6, 6], [6, 6]].map(([a, b]) => fixed.exampleData.array.map((_, i) => Number(i >= a && i <= b)));
  assert.equal(sceneProblem(fixed), null);
  // Price ceiling: "live" while it only selects stored numbers, and, declared precomputed, a shortage line its own numbers contradict.
  assert.match(calculationProblem(market.response.block.scene, 'live'), /no derived op calculates anything/);
  assert.match(sceneProblem(market.response.block.scene), /^"short" writes "60 - 100 = 0", but 60 - 100 = -40\. Fix: /);
  // Through the artifact path: the same answer twice is no card, and the one repair is told what is wrong.
  for (const [record, said] of [[binary, /draws 3 non-zero entries there/], [market, /writes "60 - 100 = 0"/], [rerun, /non-zero entries at 0\.\.7 there/]]) {
    const { title, scene } = record.response.block;
    const answer = ['make_animation', { title, calculation: 'precomputed', scene }];
    const again = scripted(answer, answer);
    const out = await generateArtifact({}, { command: 'explain', args: record.args }, again);
    assert.equal(out.result, 'validation_error', record.id);
    assert.ok(!('block' in out), record.id);
    assert.match(again.seen[1].messages.at(-1).content[0].content, said, record.id);
  }
});

test('a written calculation is checked against its own numbers; ranges, units, percentages and powers are not read', () => {
  for (const right of ['Shortage = 80 - 60 = 20 units', 'Balance: $1,000 × 1.05 = $1,050', 'I = 12 / 4 = 3', '10 / 3 = 3.33, rounded', 'mid=5 holds 31 < 37, so discard index 0-5.']) {
    assert.equal(falseCalculation(right), null, right);
  }
  assert.equal(falseCalculation('Shortage = 70 - 80 = 0 units'), 'writes "70 - 80 = 0", but 70 - 80 = -10');
  assert.equal(falseCalculation('10 / 3 = 3.4'), 'writes "10 / 3 = 3.4", but 10 / 3 = 3.333333');
  assert.equal(falseCalculation('mid=8 holds 55 < 37'), 'writes "55 < 37", which is false');
  for (const unread of ['index 0-5 = 6 cells', '12 V / 4 Ω = 3 A', 'Growth 5% x 2 = 11', '2^3 = 9', 'x2 + 1 = 7']) assert.equal(falseCalculation(unread), null, unread);
});
