// Professor Next Steps contract (docs/features/professor-next-steps.md §1.1, §2.2): the hook planner's tool, the server
// validator, minting and the check of an incoming selected_next_step. Pure; no model call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NEXT_STEPS_LIMITS, NEXT_STEPS_TOOL, hookProblem, mintSet, nextStepsInputProblem, nextStepsOutput, selectedStepProblem } from '../src/agents/learn-next-steps.js';
import { LEARNER_LABELS } from '../src/agents/learn-journey.js';

// A generic input on an invented subject (glass making); ids in their own naming style.
const INPUT = {
  mode: 'canvas', basis: 'b-1', goal: 'How glass is shaped by heat',
  canvas: { blocks: [{ id: 'k1', kind: 'Explanation', title: 'Annealing a vase', concept_ids: ['annealing'], claim_ids: ['annealing.slow-cool'], practice: null }] },
  scope: {
    concepts: { annealing: 'Annealing', viscosity: 'Viscosity of molten glass' },
    claims: {
      'annealing.slow-cool': { concept: 'annealing', statement: 'Cooling glass slowly lets internal stresses relax before it hardens.', ideas: ['slow cooling relaxes stress'], drawn: 'a vase cooled overnight in a kiln', state: 'uncertain', settled_passes: 1, settled_negatives: 0, presented: true },
      'viscosity.temperature': { concept: 'viscosity', statement: 'Hotter glass flows more easily because its viscosity drops.', ideas: ['heat lowers viscosity'], drawn: 'a gather on a blowpipe', state: 'not_yet_observed', settled_passes: 0, settled_negatives: 0, presented: false },
    },
  },
  recent: { intent: 'question', question: 'why does my vase crack when it cools', transitions: [], modalities: [], practice: [] },
  previous: { hooks: ['Can a vase remember how fast it cooled?'], goals: [] },
};
const option = (over = {}) => ({ hook: 'What happens inside a vase that cools too fast?', learning_goal: 'Link fast cooling to trapped stress and cracking', concept_ids: ['annealing'], claim_ids: ['annealing.slow-cool'], reason_internal: 'uncertain claim, repair first', ...over });
const THREE = [option(), option({ hook: 'Why does a hotter gather stretch so easily?', learning_goal: 'Connect rising temperature to falling viscosity', concept_ids: ['viscosity'], claim_ids: ['viscosity.temperature'] }),
  option({ hook: 'Could you shape glass without ever heating it?', learning_goal: 'Predict which shaping methods work below the softening point', concept_ids: ['viscosity'], claim_ids: ['viscosity.temperature'] })];
const errorsOf = out => nextStepsOutput(out, INPUT).errors || [];

test('the tool is exactly the owner schema: suggest_next_steps, 3 options of the five fields, no modality or id', () => {
  assert.equal(NEXT_STEPS_TOOL.name, 'suggest_next_steps');
  const options = NEXT_STEPS_TOOL.input_schema.properties.options;
  assert.deepEqual([options.minItems, options.maxItems], [3, 3]);
  assert.deepEqual(Object.keys(options.items.properties), ['hook', 'learning_goal', 'concept_ids', 'claim_ids', 'reason_internal']);
  assert.deepEqual(options.items.required, ['hook', 'learning_goal', 'concept_ids', 'claim_ids', 'reason_internal']);
  assert.equal(options.items.additionalProperties, false);
  assert.equal(JSON.stringify(NEXT_STEPS_TOOL).match(/modality|command|action|"id"/)?.[0] ?? null, null, 'the hook planner never chooses a modality');
});

test('the optional ambiguous boolean sits beside options, never inside one, and is not required', () => {
  const schema = NEXT_STEPS_TOOL.input_schema;
  assert.deepEqual(Object.keys(schema.properties), ['options', 'ambiguous']);
  assert.deepEqual(schema.properties.ambiguous, { type: 'boolean' });
  assert.deepEqual(schema.required, ['options']);
});

test('a valid reply passes and keeps only the five fields', () => {
  const out = nextStepsOutput({ options: THREE.map(o => ({ ...o, modality: 'animation', extra: 1 })) }, INPUT);
  assert.equal(out.ok, true, JSON.stringify(out.errors));
  assert.deepEqual(Object.keys(out.value[0]), ['hook', 'learning_goal', 'concept_ids', 'claim_ids', 'reason_internal']);
});

test('one failing case per rule; errors name the rule, never the hook text', () => {
  const swap = (i, over) => ({ options: THREE.map((o, j) => (j === i ? { ...o, ...over } : o)) });
  const cases = [
    [{ options: THREE.slice(0, 2) }, 'shape'],
    [swap(0, { hook: 'Why cool slowly?' }), 'hook_words'],
    [swap(0, { hook: 'Why does a vase that cools quickly in a cold draughty workshop crack apart?' }), 'hook_words'],
    [swap(0, { hook: 'What happens when\na vase cools too fast?' }), 'hook_line'],
    [swap(0, { hook: 'What does `cool()` do to a vase?' }), 'hook_code'],
    [swap(0, { hook: 'Explain why a vase cracks when cooled' }), 'command'],
    [swap(0, { hook: 'Continue with the next lesson on glass' }), 'command'],
    [swap(0, { hook: 'Want a quiz on how glass cools?' }), 'format_word'],
    [swap(0, { hook: 'The secret trick glassblowers never tell you' }), 'clickbait'],
    [swap(0, { hook: 'You have mastered annealing, so what next?' }), 'level_label'],
    [swap(0, { hook: 'You can now predict why vases crack' }), 'level_label'],
    [swap(0, { hook: 'Why do internal stresses relax before it hardens?' }), 'answer_reveal'],
    [swap(0, { hook: 'Do hotter kilns always make stronger glass?' }), null],
    [swap(0, { hook: 'Do you know why hot glass sags?' }), null],
    [swap(0, { hook: 'So why does my vase crack when it cools?' }), 'learner_words'],
    [swap(0, { learning_goal: 'x'.repeat(121) }), 'goal'],
    [swap(0, { learning_goal: 'Reach mastery of how cooling rate sets stress' }), 'goal'],
    [swap(0, { learning_goal: 'Show that you are a natural at annealing' }), 'goal'],
    [swap(0, { claim_ids: ['not.in-scope'] }), 'ids'],
    [swap(0, { concept_ids: [], claim_ids: [] }), 'ungrounded'],
    [swap(1, { hook: THREE[0].hook }), 'duplicate_hook'],
    [swap(1, { learning_goal: THREE[0].learning_goal }), 'duplicate_goal'],
    [swap(0, { hook: INPUT.previous.hooks[0] }), 'repeat'],
    [swap(0, { reason_internal: '' }), 'reason_internal'],
  ];
  for (const [out, rule] of cases) {
    const errors = errorsOf(out);
    if (rule === null) { assert.deepEqual(errors, [], 'a question opening with Do is not a command'); continue; }
    assert.ok(errors.some(e => e.endsWith(rule)), `${rule}: ${errors.join('; ')}`);
    for (const o of out.options || []) assert.equal(errors.join(' ').includes(o.hook), false, 'never the hook text');
  }
});

test('ids must be unique, at most 3 and strings', () => {
  const swap = over => ({ options: [{ ...THREE[0], ...over }, THREE[1], THREE[2]] });
  for (const over of [{ claim_ids: ['annealing.slow-cool', 'annealing.slow-cool'] }, { concept_ids: ['annealing', 'viscosity', 'annealing.x', 'y'] }, { claim_ids: [7] }, { concept_ids: 'annealing' }]) {
    assert.ok(errorsOf(swap(over)).some(e => e === 'option 1: ids'), JSON.stringify(over));
  }
});

test('an empty scope wants empty ids; completed-section claims only for repair', () => {
  const plain = { ...INPUT, scope: { concepts: {}, claims: {} }, canvas: { blocks: [] } };
  const bare = THREE.map(o => ({ ...o, concept_ids: [], claim_ids: [] }));
  assert.equal(nextStepsOutput({ options: bare }, plain).ok, true);
  assert.ok(nextStepsOutput({ options: THREE }, plain).errors.some(e => e.endsWith('ids')));
  const done = { ...INPUT, mode: 'journey', path: { current: null, completed: [{ id: 's1', title: 'Viscosity', claim_ids: ['viscosity.temperature'] }], upcoming: [] } };
  assert.ok(nextStepsOutput({ options: THREE }, done).errors.some(e => e.endsWith('completed_only')));
  const shaky = { ...done, scope: { ...done.scope, claims: { ...done.scope.claims, 'viscosity.temperature': { ...done.scope.claims['viscosity.temperature'], state: 'misconception' } } } };
  assert.equal(nextStepsOutput({ options: THREE }, shaky).ok, true, 'a repair state allows it');
});

// Ruling F6: only an option whose every claim is completed-only (completed section, not the current one) is refused.
test('completed_only: a claim also in the current section, or a mix with a fresh claim, is allowed', () => {
  const completed = [{ id: 's1', title: 'Viscosity', claim_ids: ['viscosity.temperature'] }];
  const rejects = input => nextStepsOutput({ options: THREE }, input).errors?.some(e => e.endsWith('completed_only')) ?? false;
  const done = { ...INPUT, mode: 'journey', path: { current: null, completed, upcoming: [] } };
  assert.equal(rejects(done), true, 'the control: completed-only claims, no repair state');
  const revisited = { ...done, path: { current: { id: 's2', title: 'Revisiting viscosity', purpose: 'again', claim_ids: ['viscosity.temperature'] }, completed, upcoming: [] } };
  assert.equal(nextStepsOutput({ options: THREE }, revisited).ok, true, 'in both a completed section and the current one: allowed');
  const mixed = THREE.map(o => (o.claim_ids[0] === 'viscosity.temperature' ? { ...o, claim_ids: ['annealing.slow-cool', 'viscosity.temperature'] } : o));
  assert.equal(nextStepsOutput({ options: mixed }, done).ok, true, 'one claim that is not completed-only is enough');
});

// Ruling F9: the option count is NEXT_STEPS_LIMITS.options, not a literal.
test('the option count comes from NEXT_STEPS_LIMITS.options; no literal 3 in the module outside it', () => {
  assert.equal(NEXT_STEPS_LIMITS.options, 3);
  assert.ok(Object.isFrozen(NEXT_STEPS_LIMITS));
  assert.ok(errorsOf({ options: [...THREE, THREE[0]] }).includes('shape'), 'four options is a shape error');
  const source = readFileSync(new URL('../src/agents/learn-next-steps.js', import.meta.url), 'utf8')
    .replace(/export const NEXT_STEPS_LIMITS = Object\.freeze\(\{[\s\S]*?\}\);/, '').replace(/\/\/.*$/gm, '').replace(/'[^'\n]*'/g, "''");
  assert.doesNotMatch(source, /\b3\b/);
});

// Review Focus 1: a topic that is itself a format word.
test('topic escape hatch: a format word passes only when the canvas is about it', () => {
  const hook = 'Why does a video stutter when the network slows?';
  const about = { ...INPUT, canvas: { blocks: [{ ...INPUT.canvas.blocks[0], title: 'How video codecs buffer frames' }] } };
  assert.equal(hookProblem(hook, { topic: 'how video codecs buffer frames', texts: [], question: '' }), null);
  assert.equal(hookProblem(hook, { topic: 'glass annealing', texts: [], question: '' }), 'format_word');
  assert.equal(nextStepsOutput({ options: [option({ hook }), ...THREE.slice(1)] }, about).ok, true);
});

test('topic escape hatch matches whole words: a longer word never lets a format word through', () => {
  const card = 'Why does a card flip so fast?', clip = 'Why does a clip stutter on a phone?';
  assert.equal(hookProblem(card, { topic: 'cardiac rhythm and the heart' }), 'format_word', 'cardiac is not card');
  assert.equal(hookProblem(clip, { topic: 'how an eclipse is timed' }), 'format_word', 'eclipse is not clip');
  assert.equal(hookProblem(card, { topic: 'card sorting methods' }), null, 'a topic that is about cards');
  assert.equal(hookProblem(card, { topic: 'the art of CARD tricks' }), null, 'case does not matter');
  assert.equal(hookProblem('Why does the next lesson plan matter?', { topic: 'planning the next lesson' }), null, 'a two-word format name');
});

test('nextStepsInputProblem refuses wrong shapes, forbidden keys and oversized input', () => {
  assert.equal(nextStepsInputProblem(INPUT), null);
  for (const bad of [null, [], { ...INPUT, mode: 'shared' }, { ...INPUT, basis: '' }, { ...INPUT, scope: { concepts: {}, claims: { a: { state: 'mastered' } } } },
    { ...INPUT, intake: { familiarity: 'new' } }, { ...INPUT, recent: { ...INPUT.recent, question: 'x'.repeat(301) } }, { ...INPUT, goal: 'x'.repeat(12001) }]) {
    assert.equal(typeof nextStepsInputProblem(bad), 'string', JSON.stringify(bad)?.slice(0, 60));
  }
  assert.equal(nextStepsInputProblem({ ...INPUT, canvas: { blocks: [{ ...INPUT.canvas.blocks[0], background: 'x' }] } }).includes('background'), true);
});

test('nextStepsInputProblem: a concept or claim id may be named like a forbidden key; list caps hold', () => {
  const named = { ...INPUT, scope: { concepts: { key: 'Key' }, claims: { key: { ...INPUT.scope.claims['viscosity.temperature'], concept: 'key' } } } };
  assert.equal(nextStepsInputProblem(named), null, 'an id is data, not a field name');
  const claims = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`c${i}`, INPUT.scope.claims['viscosity.temperature']]));
  assert.equal(typeof nextStepsInputProblem({ ...INPUT, scope: { concepts: {}, claims } }), 'string', 'more than 12 claims');
  assert.equal(typeof nextStepsInputProblem({ ...INPUT, previous: { hooks: Array(7).fill('x'), goals: [] } }), 'string', 'more than 6 previous hooks');
  assert.equal(typeof nextStepsInputProblem({ ...INPUT, previous: { hooks: [], goals: Array(4).fill('x') } }), 'string', 'more than 3 previous goals');
  assert.equal(typeof nextStepsInputProblem({ ...INPUT, canvas: { blocks: Array(21).fill(INPUT.canvas.blocks[0]) } }), 'string', 'more than 20 blocks');
});

test('nextStepsInputProblem: a forbidden key is refused at any depth, under scope too; only the id keys are exempt', () => {
  const claim = INPUT.scope.claims['viscosity.temperature'];
  assert.match(nextStepsInputProblem({ ...INPUT, scope: { ...INPUT.scope, familiarity: 'new' } }), /forbidden key familiarity/);
  assert.match(nextStepsInputProblem({ ...INPUT, scope: { ...INPUT.scope, intake: { a: 1 } } }), /forbidden key intake/);
  assert.match(nextStepsInputProblem({ ...INPUT, scope: { concepts: {}, claims: { c: { ...claim, answer: 'x' } } } }), /forbidden key answer/, 'inside a claim');
  assert.match(nextStepsInputProblem({ ...INPUT, scope: { concepts: { c: { level: 1 } }, claims: {} } }), /forbidden key level/, 'inside a concept value');
  assert.equal(nextStepsInputProblem({ ...INPUT, scope: { concepts: { key: 'Key' }, claims: { key: { ...claim, concept: 'key' } } } }), null, 'a claim id literally named key');
});

test('mintSet: ns_ ids, 3 hooks, opaque selected_next_step, no reason_internal anywhere', () => {
  const set = mintSet(THREE, INPUT, { now: () => new Date('2026-10-06T10:00:00Z'), hex: () => 'a1b2c3d4' });
  assert.equal(set.set_id, 'ns_a1b2c3d4');
  assert.deepEqual(set.options.map(o => o.id), ['ns_a1b2c3d4.1', 'ns_a1b2c3d4.2', 'ns_a1b2c3d4.3']);
  assert.deepEqual(Object.keys(set), ['set_id', 'generated_at', 'basis', 'options']);
  assert.deepEqual(Object.keys(set.options[0]), ['id', 'hook', 'selected_next_step']);
  assert.deepEqual(set.options[0].selected_next_step, { v: 1, set_id: 'ns_a1b2c3d4', suggestion_id: 'ns_a1b2c3d4.1', basis: 'b-1', hook: THREE[0].hook, learning_goal: THREE[0].learning_goal, concept_ids: ['annealing'], claim_ids: ['annealing.slow-cool'], scope: 'owned' });
  assert.equal(JSON.stringify(set).includes('reason_internal'), false);
  const shared = mintSet(THREE, { ...INPUT, mode: 'shared' }, { source: { share_version: 4, origin_block_id: ':root' }, hex: () => '00000000' });
  assert.deepEqual([shared.options[2].selected_next_step.scope, shared.options[2].selected_next_step.source], ['shared', { share_version: 4, origin_block_id: ':root' }]);
});

test('mintSet default hex is 8 lowercase hex characters', () => {
  assert.match(mintSet(THREE, INPUT).set_id, /^ns_[0-9a-f]{8}$/);
});

test('selectedStepProblem: shape, bounds, wording, ids, version (409 stale_hook) and origin', () => {
  const step = mintSet(THREE, { ...INPUT, mode: 'shared' }, { source: { share_version: 4, origin_block_id: 'k1' }, hex: () => 'abcdef01' }).options[0].selected_next_step;
  const ctx = { concepts: new Set(['annealing', 'viscosity']), claims: new Set(['annealing.slow-cool', 'viscosity.temperature']), version: 4, origin: 'k1' };
  assert.equal(selectedStepProblem(step, ctx), null);
  assert.deepEqual(selectedStepProblem(step, { ...ctx, version: 5 }), { error: 'stale_hook', status: 409 });
  assert.equal(selectedStepProblem(step, { ...ctx, origin: ':root' }).status, 400);
  for (const bad of [{ ...step, v: 2 }, { ...step, set_id: 'x' }, { ...step, suggestion_id: 'ns_abcdef01.4' }, { ...step, hook: 'Explain annealing to me now' }, { ...step, learning_goal: '' },
    { ...step, learning_goal: 'Reach mastery of how cooling rate sets stress' }, { ...step, claim_ids: ['secret.claim'] }, { ...step, scope: 'owned' }, null]) {
    assert.equal(selectedStepProblem(bad, ctx)?.status, 400, JSON.stringify(bad)?.slice(0, 80));
  }
});

// Ruling F2: a hook that was valid at generation because a format word is the canvas topic stays valid when it comes back.
test('selectedStepProblem takes the topic: a format word is allowed only when the canvas is about it', () => {
  const hook = 'Why does a video stutter when the network slows?';
  const step = mintSet([option({ hook }), ...THREE.slice(1)], { ...INPUT, mode: 'shared' }, { source: { share_version: 4, origin_block_id: 'k1' }, hex: () => 'abcdef01' }).options[0].selected_next_step;
  const ctx = { concepts: new Set(['annealing', 'viscosity']), claims: new Set(['annealing.slow-cool', 'viscosity.temperature']), version: 4, origin: 'k1' };
  const topic = 'how video codecs buffer frames annealing viscosity of molten glass';
  assert.equal(selectedStepProblem(step, { ...ctx, topic }), null, 'the canvas is about video');
  assert.equal(selectedStepProblem(step, { ...ctx, topic: 'glass annealing' }).status, 400, 'a format word the canvas is not about');
  assert.equal(selectedStepProblem(step, ctx).status, 400, 'no topic given: no escape hatch');
});

test('LEARNER_LABELS is the one list: the journey corpus imports it', async () => {
  assert.ok(LEARNER_LABELS.length >= 6 && LEARNER_LABELS.every(re => re instanceof RegExp));
  assert.ok(LEARNER_LABELS.some(re => re.test('You are a natural at this')));
  const corpus = readFileSync(new URL('../../web/e2e/journey-corpus-run.mjs', import.meta.url), 'utf8');
  assert.match(corpus, /LEARNER_LABELS/);
  assert.doesNotMatch(corpus, /const LABELS = \[/);
});
