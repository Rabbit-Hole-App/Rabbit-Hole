// /explain's interactive scene (the `animation` primitive, L10): the authoring contract, the gates that run the existing
// scene validators, the one repair, the honest failure and the precomputed-samples note. Model calls are scripted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateArtifact } from '../src/learn-artifact.js';
import { SCENE_AUTHORING, SCENE_EXAMPLE } from '../src/agents/learn-scene-author.js';
import { MAX_SETTINGS, SAMPLES_NOTE, calculationProblem, cardAtSettings, falseCalculation, inputStates, sceneProblem, withSamplesNote } from '../src/learn-scene-gates.js';
import { VERIFY_SYSTEM, VERIFY_TOOL } from '../src/agents/learn-scene-verify.js';
import { attemptKind } from '../src/learn-usage.js';
import { evaluateScene } from '../../web/src/scene-evaluate.js';

// L10's two real /explain scenes with wrong stored content (2026-10-21 run records, kept exactly as they came back).
const wrongRun = name => JSON.parse(readFileSync(new URL(`./fixtures/explain-wrong/${name}.json`, import.meta.url), 'utf8'));

// Card calls are kept in `seen`; the verifier pass's calls in `checks`, answered from `verdicts` (a problems list each), clean
// when none is scripted.
const scripted = (...replies) => {
  const seen = [], checks = [], verdicts = [];
  const callModel = async (env, body) => {
    const verifying = body.tools.some(tool => tool.name === VERIFY_TOOL.name);
    if (verifying) checks.push({ env, body }); else seen.push(body);
    const [name, input] = verifying ? [VERIFY_TOOL.name, { problems: verdicts.shift() || [] }] : replies[seen.length - 1];
    return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `call-${seen.length + checks.length}`, name, input }] });
  };
  return { callModel, seen, checks, verdicts };
};
const scene = (overrides = {}) => ({ title: 'How weights decide a final grade', calculation: 'live', scene: { ...structuredClone(SCENE_EXAMPLE), ...overrides } });
// A grid with values must say what it is (animation-scene.js): the validator's own refusal, no test-made rule.
const noKind = scene({ objects: [...SCENE_EXAMPLE.objects, { id: 'table', type: 'grid', initialState: { x: 400, y: 300, rows: 1, cols: 2, cell: 48, values: [1, 2] } }] });

test('the contract\'s own example passes every gate, at every input state it offers', () => {
  assert.equal(sceneProblem(SCENE_EXAMPLE), null);
  // Every setting, the combination included (EXP-04, owner review 2026-10-21): the defaults, each control alone, then both.
  assert.deepEqual(inputStates(SCENE_EXAMPLE), [{}, { scheme: 'exam' }, { showParts: false }, { scheme: 'exam', showParts: false }]);
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

test('a scene that passes the gates is read back by the verifier pass, setting by setting, before it becomes a card', async () => {
  const run = scripted(['make_animation', scene()]);
  const out = await generateArtifact({}, { command: 'explain', args: 'interactive weighted grades' }, run);
  assert.equal(out.result, 'artifact');
  assert.equal(run.checks.length, 1, 'one verifier call');
  const { env, body } = run.checks[0];
  assert.equal(body.system, VERIFY_SYSTEM);
  assert.deepEqual(body.tools.map(tool => tool.name), ['report_check']);
  assert.equal(attemptKind(env), 'evaluation', 'recorded as an evaluation attempt in usage');
  const card = body.messages[0].content;
  assert.match(card, /^The learner asked: interactive weighted grades\nCard title: How weights decide a final grade\nThe card says its numbers are calculated live/);
  // Every control setting, as the learner sees it: the defaults in full, then what changes.
  assert.match(card, /Setting scheme = Equal weights, showParts = on \(the defaults\):\n- question: text "Why can the same three scores give different grades\?"/);
  assert.match(card, /Setting scheme = Exam counts most, showParts = on \(only what differs from the defaults\):\n- weights: strip "weights \(sum to 1\)": \[0\.20, 0\.20, 0\.60\]/);
  assert.match(card, /- grade: text "Final grade: 82"/);
  // Off: no verifier call.
  const off = scripted(['make_animation', scene()]);
  assert.equal((await generateArtifact({ LEARN_SCENE_VERIFIER: 'off' }, { command: 'explain', args: 'interactive weighted grades' }, off)).result, 'artifact');
  assert.equal(off.checks.length, 0);
});

test('the supply-demand rerun (a false equilibrium no gate reads) is refused by the verifier pass; a corrected answer becomes the card', async () => {
  const record = wrongRun('supply-demand-run3');
  const { title, calculation, scene: stored } = record.response.block;
  // The deterministic gates pass it: the false statement is about the subject, in words.
  assert.equal(calculationProblem(stored, calculation), null);
  assert.equal(sceneProblem(stored), null);
  const verdict = [{ status: 'false', setting: 'price = $5', object: 'note', says: '$5 is the equilibrium price: the market clears, no shortage.', against: '[60.00, 80.00]', finding: 'at $5 the card draws 60 demanded and 80 supplied, so the market does not clear there; its own lines cross at $4.50 and 70 units' }];
  const answer = ['make_animation', { title, calculation, scene: stored }];
  const stuck = scripted(answer, answer);
  stuck.verdicts.push(verdict, verdict);
  const out = await generateArtifact({}, { command: 'explain', args: record.args }, stuck);
  assert.equal(out.result, 'validation_error');
  assert.ok(!('block' in out));
  assert.deepEqual([stuck.seen.length, stuck.checks.length], [2, 2], 'generation, check, the one repair, check');
  // The verifier reads what the learner would: the claim and the numbers that contradict it, at the same setting.
  const card = stuck.checks[0].body.messages[0].content;
  assert.ok(card.includes('- sub: text "Equilibrium in this illustrative market: price $5, quantity 80 units."'));
  assert.match(card, /Setting price = \$5 \(position 3\), showGap = on \(only what differs from the defaults\):\n- priceline: text "Legal price set at \$5"\n- schedule: grid .*\[60\.00, 80\.00\]/);
  assert.match(stuck.seen[1].messages.at(-1).content[0].content, /^Validation failed: A check of the card found statements that are false: 1\) with price = \$5, "note" says "\$5 is the equilibrium price.*", against "\[60\.00, 80\.00\]": at \$5 the card draws 60 demanded/);
  assert.match(out.error, /^A check of the card found statements that are false/);
  // A repair the verifier finds clean is the card.
  const fixed = scripted(answer, ['make_animation', scene()]);
  fixed.verdicts.push(verdict);
  const repaired = await generateArtifact({}, { command: 'explain', args: record.args }, fixed);
  assert.equal(repaired.result, 'artifact');
  assert.equal(repaired.repaired, true);
  assert.equal(fixed.checks.length, 2);
});

test('when the verifier pass cannot run, nothing is added and nothing is repaired: the reason is said', async () => {
  const failing = status => {
    const seen = [];
    const callModel = async (env, body) => {
      seen.push(body);
      if (body.tools.some(tool => tool.name === VERIFY_TOOL.name)) {
        return status === 429 ? Response.json({ error: 'Paid Learn calls are paused because the platform daily dollar cap has been reached.', code: 'spend_limited' }, { status })
          : status ? new Response('overloaded', { status }) : Response.json({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Looks fine.' }] });
      }
      return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c1', name: 'make_animation', input: scene() }] });
    };
    return { callModel, seen };
  };
  for (const [status, said] of [[503, /could not be checked \(model HTTP 503\), so nothing was added/], [429, /platform daily dollar cap/], [null, /could not be checked \(the check gave no verdict\)/]]) {
    const run = failing(status);
    await assert.rejects(generateArtifact({}, { command: 'explain', args: 'interactive weighted grades' }, run), { message: said });
    assert.equal(run.seen.length, 2, `${status}: no repair after a check that did not run`);
  }
});

test('the server keeps only verifier items marked false, quoted from the card, and not a number at its display precision', async () => {
  const record = wrongRun('supply-demand-run3');
  const { title, calculation, scene: stored } = record.response.block;
  const says = '$5 is the equilibrium price: the market clears, no shortage.';
  const ignored = [
    { status: 'correct', object: 'note', says, against: '[60.00, 80.00]', finding: 'checked: it holds' },
    { status: 'false', object: 'note', says: 'Equilibrium is at $5 with 80 units', against: '[60.00, 80.00]', finding: 'a quote the card does not show' },
    { status: 'false', object: 'note', says, against: 'demand 60 and supply 80', finding: 'a value the card does not show in those words' },
    { status: 'false', object: 'gapsent', says: '80 wanted - 60 offered = 20 units of shortage', against: '[80.00, 60.00]', shown: '20', expected: 20.4, finding: 'rounding only' },
  ];
  const run = scripted(['make_animation', { title, calculation, scene: stored }]);
  run.verdicts.push(ignored);
  assert.equal((await generateArtifact({}, { command: 'explain', args: record.args }, run)).result, 'artifact', 'nothing kept: the card stands');
  const kept = scripted(['make_animation', { title, calculation, scene: stored }], ['make_animation', { title, calculation, scene: stored }]);
  kept.verdicts.push([...ignored, { status: 'false', object: 'note', says: `  “${says.toUpperCase()}” `, against: '60.00, 80.00', shown: '80', expected: 60, finding: 'kept' }]);
  await generateArtifact({}, { command: 'explain', args: record.args }, kept);
  assert.equal(kept.seen.length, 2, 'the kept item (matched despite case, spacing and curly quotes) goes to the repair');
  assert.doesNotMatch(kept.seen[1].messages.at(-1).content[0].content, /checked: it holds|a quote the card does not show|rounding only/);
});

// EXP-04 (owner review 2026-10-21, item 1): the gates and the verifier see every setting a learner can reach, combinations of
// controls and every slider position included. Each hand-made scene (test/fixtures/explain-states/) says one false thing at
// a setting the old single-control sampling never reached; its gate variant puts a fault a deterministic gate reads there.
const stateCase = name => JSON.parse(readFileSync(new URL(`./fixtures/explain-states/${name}.json`, import.meta.url), 'utf8')).response.block;
const settingOf = (card, words) => card.split('\n\n').find(part => part.includes(words))?.split('\n')[0];
const verifierRefuses = async (block, says, against) => {
  const answer = ['make_animation', { title: block.title, calculation: block.calculation, scene: block.scene }];
  const run = scripted(answer, answer);
  const verdict = [{ status: 'false', object: 'line', says, against, finding: 'false at this setting' }];
  run.verdicts.push(verdict, verdict);
  const out = await generateArtifact({}, { command: 'explain', args: 'interactive' }, run);
  return { out, run };
};

test('a two-toggle contradiction visible only with both toggles on is refused by the gates and shown to the verifier', async () => {
  const block = stateCase('two-toggles');
  assert.deepEqual(inputStates(block.scene), [{}, { heat: true }, { lid: true }, { heat: true, lid: true }]);
  const gated = structuredClone(block.scene);
  gated.exampleData.both = 'Heat with the lid on: 20 + 30 = 60 degrees gained.';
  assert.match(sceneProblem(gated), /^With inputs heat = true, lid = true: "line" writes "20 \+ 30 = 60", but 20 \+ 30 = 50/);
  // The verifier reads the combined setting, so a finding quoted from it is kept: the one repair, then no card.
  assert.equal(sceneProblem(block.scene), null);
  const card = cardAtSettings(block.scene);
  assert.equal(settingOf(card, 'boils at 60 °C'), 'Setting heat = on, lid = on (only what differs from the defaults):');
  const { out, run } = await verifierRefuses(block, 'Heat with the lid on: the water now boils at 60 °C.', 'At sea level, pure water boils at 100 °C.');
  assert.deepEqual([run.seen.length, run.checks.length], [2, 2], 'generation, check, the one repair, check');
  assert.equal(out.result, 'validation_error');
  assert.ok(!('block' in out));
});

test('a derived value that is invalid only in a combination of controls is refused before any verifier call', async () => {
  const block = stateCase('combined-chance');
  // The chance as a bar's opacity: 0.3 and 0.7 are valid, 1.1 (both on) is not.
  const gated = structuredClone(block.scene);
  gated.objects[1].initialState.opacity = { $derive: 'chance' };
  assert.match(sceneProblem(gated), /^With inputs clouds = true, wind = true: .*opacity/);
  const answer = ['make_animation', { title: block.title, calculation: 'live', scene: gated }];
  const run = scripted(answer, answer);
  const out = await generateArtifact({}, { command: 'explain', args: 'interactive' }, run);
  assert.deepEqual([out.result, run.seen.length, run.checks.length], ['validation_error', 2, 0], 'one repair, still invalid: no card and no verifier call');
  assert.match(run.seen[1].messages.at(-1).content[0].content, /With inputs clouds = true, wind = true:/);
  // As drawn (no opacity), the gates pass and the verifier reads the impossible 1.1 at the combined setting.
  assert.equal(sceneProblem(block.scene), null);
  assert.equal(settingOf(cardAtSettings(block.scene), 'Chance of rain: 1.1"'), 'Setting clouds = on, wind = on (only what differs from the defaults):');
});

test('every position of a slider is checked, the interior ones included', async () => {
  const block = stateCase('interior-slider');
  assert.deepEqual(inputStates(block.scene), [...Array(12).keys()].map(k => (k ? { k } : {})));
  const gated = structuredClone(block.scene);
  gated.exampleData.lines[3] = 'After 3 half-lives: 80 / 8 = 12 g remain.';
  assert.match(sceneProblem(gated), /^With input k = 3: "line" writes "80 \/ 8 = 12", but 80 \/ 8 = 10/);
  assert.equal(sceneProblem(block.scene), null);
  assert.equal(settingOf(cardAtSettings(block.scene), '1/6 of the sample'), 'Setting k = 3 half-lives (position 3) (only what differs from the defaults):');
  const { out } = await verifierRefuses(block, 'After 3 half-lives, 1/6 of the sample remains.', 'Remaining: 10 g of 80 g');
  assert.equal(out.result, 'validation_error');
});

test('a scene with more settings than are checked, or a control whose settings cannot all be listed, is refused: never sampled', async () => {
  const slider = length => {
    const scene = structuredClone(stateCase('interior-slider').scene);
    for (const key of ['names', 'grams', 'lines']) scene.exampleData[key] = Array.from({ length }, (_, i) => scene.exampleData[key][i % 12]);
    return scene;
  };
  assert.equal(MAX_SETTINGS, 64);
  assert.equal(inputStates(slider(64)).length, 64, 'at the bound: every position');
  assert.match(sceneProblem(slider(65)), /^The controls offer 65 settings in combination \(k: 65\); every setting is checked, and at most 64 are supported: use fewer controls, options or positions/);
  assert.throws(() => inputStates(slider(65)), /offer 65 settings/);
  // Combinations count: a 5-position picker, a 2-option choice, a toggle and a 4-option choice make 80.
  const four = { ...SCENE_EXAMPLE, exampleData: { ...SCENE_EXAMPLE.exampleData, tries: ['a', 'b', 'c', 'd', 'e'] }, inputs: [...SCENE_EXAMPLE.inputs,
    { name: 'attempt', type: 'index', label: 'Attempt', default: 0, of: 'tries' }, { name: 'mood', type: 'choice', label: 'Mood', default: 'a', options: ['a', 'b', 'c', 'd'].map(id => ({ id, label: id })) }] };
  assert.match(sceneProblem(four), /offer 80 settings in combination \(scheme: 2 x showParts: 2 x attempt: 5 x mood: 4\)/);
  assert.match(sceneProblem({ ...SCENE_EXAMPLE, inputs: [...SCENE_EXAMPLE.inputs, { name: 'picked', type: 'indices', label: 'Pick scores', default: [0], of: 'scores' }] }),
    /^Input "picked": a generated scene's controls are bool, choice or index inputs, whose settings can all be checked, not "indices"/);
  // Through the artifact path: the one repair is told why, a second over-bound answer is no card, and the verifier never runs.
  const answer = ['make_animation', { title: 'Half-life', calculation: 'precomputed', scene: slider(65) }];
  const run = scripted(answer, answer);
  const out = await generateArtifact({}, { command: 'explain', args: 'interactive half-life' }, run);
  assert.deepEqual([out.result, 'block' in out, run.seen.length, run.checks.length], ['validation_error', false, 2, 0]);
  assert.match(run.seen[1].messages.at(-1).content[0].content, /offer 65 settings/);
});

test('the verifier reads exactly the settings the gates check', () => {
  for (const name of ['two-toggles', 'combined-chance', 'interior-slider']) {
    const { scene } = stateCase(name);
    assert.equal(cardAtSettings(scene).match(/^Setting /gm).length, inputStates(scene).length, name);
  }
  assert.equal(cardAtSettings(SCENE_EXAMPLE).match(/^Setting /gm).length, 4);
});
