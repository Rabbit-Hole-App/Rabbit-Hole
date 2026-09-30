// Tutor v1 acceptance traces (docs/features/tutor-golden-traces-nanogpt.md, locked decisions §10):
// GT-01, 02, 03, 04, 06, 07, 11, 12, D1, D2, D3, scripted against the real modules. The network is
// stubbed: /evaluate answers with the Tutor JEV protocol's own mapping (evaluationFrom) over
// scripted probabilities, and /plan returns a scripted TutorResponse, so every check below is on
// the deterministic parts - evidence, states, routing, enforcement and canvas actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardBlock } from './nanogpt/board.js';
import { enterPractice, setActivityAnswer, applyCheck, applyNewAttempt } from './scene-activity.js';
import { applyInputToBlock } from './scene-evaluate.js';
import { resolveTarget } from './learn-target.js';
import { cardModule, CLAIMS, PRACTICE, SLICE_CARDS, targetClaims, ladderStep, conceptOf } from './learn-tutor-claims.js';
import { emptyStore, deriveClaimStates, conceptState, appendEvents } from './learn-tutor-evidence.js';
import { runTurn, enforce, executeActions, keepHere, enterHole, arriveAt, openingQuestion, markOpened, targetOf } from './learn-tutor.js';
import { evaluationFrom, tutorQuestions } from '../../control-plane/src/agents/learn-tutor.js';

const THRESHOLDS = { yes: 0.7, no: 0.3 };
const PARENT = { app: 'canvas-aaaa1111', board: 'nanogpt-attention-tutor' };
const block = id => cardBlock(cardModule(id));

// Scripted JEV: every check a confident "no", attempt a confident "yes", unless overridden by
// { claim: { ideas: [p...], mis: { id: p }, transfer: p }, gaps: { concept: p }, attempt, non_attempt }.
function jev(script = {}) {
  return spec => {
    const answers = Object.fromEntries(Object.keys(tutorQuestions(spec)).map(key => [key, 0]));
    if ('attempt' in answers) answers.attempt = script.attempt ?? 1;
    if ('non_attempt' in answers) answers.non_attempt = script.non_attempt ?? 0;
    spec.claims.forEach((claim, c) => {
      const s = script[claim.id];
      if (!s) return;
      (s.ideas || []).forEach((p, i) => { answers[`c${c}_idea${i}`] = p; });
      claim.misconceptions.forEach((wrong, m) => { if (s.mis?.[wrong.id] != null) answers[`c${c}_mis${m}`] = s.mis[wrong.id]; });
      if (s.transfer != null) answers[`c${c}_transfer`] = s.transfer;
    });
    spec.gaps.forEach((gap, g) => { if (script.gaps?.[gap.concept] != null) answers[`g${g}`] = script.gaps[gap.concept]; });
    return { ...evaluationFrom(spec, answers, THRESHOLDS, 'jev'), evaluator: 'jev' };
  };
}
// The stubbed worker: records what it was sent.
function worker({ evaluate = jev(), plan }) {
  const sent = [];
  const post = async (path, body) => {
    sent.push({ path, body });
    if (path === '/api/learn/tutor/evaluate') return evaluate(body.spec, body.message);
    return typeof plan === 'function' ? plan(body.context) : plan;
  };
  return { post, sent };
}
const turnOn = (block, raw, store, plan, evaluate, extra = {}) => {
  const { post, sent } = worker({ evaluate, plan });
  return runTurn({ raw, canvas: PARENT, access: { app: PARENT.app }, block, store, post, ...extra }).then(result => ({ ...result, sent }));
};
const say = text => ({ type: 'respond_text', text });
// A fake canvas holding blocks, with the commands the Tutor uses.
function fakeCanvas(blocks) {
  const calls = [];
  const canvas = {
    calls,
    blocks: () => blocks,
    focusBlock: id => calls.push(['focus', id]),
    insertBlock: inserted => { const id = crypto.randomUUID(); blocks.push({ ...inserted, id }); calls.push(['insert', inserted.scene?.id]); return id; },
    updateBlock: (id, change) => { const at = blocks.findIndex(entry => entry.id === id); blocks[at] = change(blocks[at]); calls.push(['update', id]); return true; },
  };
  return canvas;
}
const practise = (card, answers) => {
  let b = enterPractice(card);
  answers.forEach((answer, index) => {
    if (index) b = applyNewAttempt(b);
    b = applyCheck(setActivityAnswer(b, answer));
  });
  return b;
};

test('registry: every slice card, task, claim and misconception resolves against the frozen cards', () => {
  for (const id of SLICE_CARDS) assert.ok(cardModule(id), id);
  for (const [key, task] of Object.entries(PRACTICE)) {
    const [card, taskId] = key.split(':');
    assert.equal(cardModule(card).activity.id, taskId, key);
    const options = cardModule(card).activity.answer.options.map(option => option.id);
    assert.ok(CLAIMS[task.claim], task.claim);
    for (const [option, wrong] of Object.entries(task.wrong)) {
      assert.ok(options.includes(option), `${key}: ${option}`);
      assert.ok(CLAIMS[task.claim].misconceptions.some(entry => entry.id === wrong), `${key}: ${wrong}`);
    }
    assert.ok(!Object.keys(task.wrong).includes(cardModule(card).activity.expected), `${key}: the expected answer is not a misconception`);
  }
  for (const claim of Object.values(CLAIMS)) for (const concept of claim.prerequisites) assert.ok(Object.values(CLAIMS).some(other => other.concept === concept));
  assert.deepEqual([ladderStep('depth-attention-overview', 'deeper'), ladderStep('depth-attention-deep', 'deeper'), ladderStep('depth-attention-guided', 'shallower')], ['depth-attention-guided', null, 'depth-attention-overview']);
  assert.equal(conceptOf('Softmax'), 'softmax');
});

test('identities stay distinct: block uuid, runtime scene.id, authored evidence.card, partId, concepts', () => {
  const c11 = { ...block('c11-causal-mask'), selectedObject: 'causal-mask-table' };
  const t = targetOf(c11);
  assert.notEqual(t.block_id, t.scene_id);
  assert.equal(t.scene_id, 'nanogpt-c11-causal-mask');
  assert.equal(t.card, 'c11-causal-mask');
  assert.equal(t.part_id, null);
  assert.deepEqual(t.concepts, ['causal-mask']);
  const deep = applyInputToBlock(block('depth-attention-deep'), 'part', 1);
  assert.equal(targetOf(deep).part_id, 'causal-mask');
  assert.deepEqual(targetClaims({ card_id: 'depth-attention-deep', part_id: 'causal-mask' }), ['causal-mask/applied-before-softmax']);
});

test('GT-01 Overview restated: demonstrated_here only -> uncertain; a depth chip, never a navigation or a label', async () => {
  const overview = block('depth-attention-overview');
  const plan = { strategy: 'feynman', move: 'suggest_next_rung', reason: 'restated the drawn case', actions: [
    say('Yes - it looks back, never ahead.'),
    { type: 'suggest_depth', card: 'depth-attention-overview', direction: 'deeper' },
    { type: 'show_authored_card', card: 'depth-attention-guided', mode: 'navigate' },
  ] };
  const result = await turnOn(overview, 'When it reads a character it looks back at earlier ones, mostly at one place, and never ahead.', emptyStore(), plan,
    jev({ 'attention/looks-back-never-ahead': { ideas: [1, 1], transfer: 0 } }));
  const events = result.store.events;
  assert.ok(events.length && events.every(event => event.result === 'pass' && event.kind === 'demonstrated_here' && event.settled));
  assert.equal(result.states['attention/looks-back-never-ahead'].state, 'uncertain');
  assert.notEqual(conceptState(result.states, 'attention'), 'understood');
  assert.equal(result.routed.row, 'uncertain');
  const shown = result.actions.find(action => action.type === 'show_authored_card');
  assert.equal(shown.mode, 'suggest', 'no explicit request: navigate becomes a chip');
  const canvas = fakeCanvas([overview]);
  const chips = executeActions(result.actions, { canvas, suggestDive: () => assert.fail('no dive') });
  assert.ok(chips.some(chip => /Go deeper/.test(chip.label)));
  assert.deepEqual(canvas.calls, [], 'nothing navigates by itself');
});

test('GT-02 one practice fail -> a failed record naming its wrong model, uncertain, never misconception', async () => {
  const c11 = practise(block('c11-causal-mask'), ['target']);
  const result = await turnOn(c11, 'I picked 0 to 100.', emptyStore(), { strategy: 'feynman', move: 'hint', reason: '', actions: [say('Look at row 5 of the table.')] }, jev({ attempt: 0 }));
  const [event] = result.store.events;
  assert.equal(event.evaluator, 'deterministic');
  assert.equal(event.result, 'fail');
  assert.equal(event.misconception_id, 'reads-next-target');
  assert.equal(result.states['causal-mask/reads-self-and-earlier'].state, 'uncertain');
  assert.equal(result.turn.card_state.practice.attempts[0].answer_label, '0 to 100', 'G6: the label, beside the id');
  assert.ok(!JSON.stringify(result.sent.at(-1).body.context).includes('"expected"'), 'the expected answer never reaches the planner');
});

async function gt03() {
  const c11 = practise(block('c11-causal-mask'), ['target', 'target']);
  const plan = { strategy: 'socrates', move: 'counterexample', reason: '', actions: [
    { type: 'ask_question', text: 'If row 3 could read its highlighted cell, what would it learn to predict?', claim: 'causal-mask/reads-self-and-earlier', purpose: 'diagnose' },
    say('A long explanation again.'),
  ] };
  const result = await turnOn(c11, 'Position 99 has to see character 100, otherwise how can it predict it?', emptyStore(), plan,
    jev({ 'causal-mask/reads-self-and-earlier': { ideas: [0, 0], mis: { 'reads-next-target': 1 } } }));
  return { c11, result };
}
test('GT-03 the same wrong model twice -> misconception; Socrates asks, and stops after two turns', async () => {
  const { c11, result } = await gt03();
  assert.equal(result.states['causal-mask/reads-self-and-earlier'].state, 'misconception');
  assert.equal(result.states['causal-mask/reads-self-and-earlier'].misconception_id, 'reads-next-target');
  assert.equal(result.routed.row, 'misconception');
  assert.equal(result.routed.strategy, 'socrates');
  assert.deepEqual(result.actions.map(action => action.type), ['ask_question'], 'the repeated explanation is dropped');
  assert.equal(result.store.open.claim, 'causal-mask/reads-self-and-earlier');
  const second = await turnOn(c11, 'Hmm, still 100.', result.store, { strategy: 'socrates', move: 'ask', reason: '', actions: [{ type: 'ask_question', text: 'Which character is row 3 trained to predict?', claim: 'causal-mask/reads-self-and-earlier', purpose: 'diagnose' }] },
    jev({ 'causal-mask/reads-self-and-earlier': { ideas: [0, 0], mis: { 'reads-next-target': 1 } } }));
  const third = await turnOn(c11, 'Still 100.', second.store, { strategy: 'feynman', move: 'explain', reason: '', actions: [say('Row i keeps columns 0 to i ...')] },
    jev({ 'causal-mask/reads-self-and-earlier': { ideas: [0, 0], mis: { 'reads-next-target': 1 } } }));
  assert.equal(third.routed.row, 'misconception_explain');
  assert.equal(third.routed.strategy, 'feynman');
});

test('GT-04 "Don\'t simplify this. Show me the implementation." -> the Deep card at shapes, no evidence', async () => {
  const overview = block('depth-attention-overview'), deep = block('depth-attention-deep');
  const raw = "Don't simplify this. Show me the implementation.";
  const plan = { strategy: 'none', move: 'go_deeper', reason: '', explicit_request: 'Show me the implementation', constraints_add: ['no_simplify', 'implementation'],
    actions: [{ type: 'show_authored_card', card: 'depth-attention-deep', part_id: 'shapes', mode: 'navigate' }, { type: 'respond_text', text: 'Here is CausalSelfAttention.forward, step by step.', cites: [{ card: 'depth-attention-deep', source_index: 0 }] }] };
  const result = await turnOn(overview, raw, emptyStore(), plan, jev({ attempt: 0 }));
  assert.equal(result.store.events.length, 0, 'a request is not evidence');
  assert.deepEqual(result.store.constraints.sort(), ['implementation', 'no_simplify']);
  assert.equal(result.actions[0].mode, 'navigate');
  const moved = applyInputToBlock(deep, 'part', 2);
  const canvas = fakeCanvas([overview, moved]);
  executeActions(result.actions, { canvas, suggestDive: () => {} });
  assert.deepEqual(canvas.calls.map(call => call[0]), ['update', 'focus']);
  assert.equal(canvas.blocks()[1].inputs.part, 0, 'opened at part shapes');
  // The same navigate without the learner's words is a chip.
  const unasked = enforce({ ...plan, explicit_request: 'Take me there' }, result.routed, result.turn);
  assert.equal(unasked.actions[0].mode, 'suggest');
});

async function gt06(store = emptyStore()) {
  const guided = block('depth-attention-guided');
  const plan = { strategy: 'none', move: 'prerequisite', reason: '', actions: [say('The weights come from softmax.'), { type: 'suggest_dive', concept: 'softmax', title: 'Softmax' }, { type: 'open_dive', concept: 'softmax', title: 'Softmax' }] };
  const result = await turnOn(guided, "I get that q·k gives a score, but why do the weights add up to one? Why isn't the score just the weight?", store, plan, jev({ attempt: 0, gaps: { softmax: 1 } }));
  return { guided, result };
}
test('GT-06 softmax prerequisite gap -> a dive suggestion anchored to the Guided card, never a silent dive', async () => {
  const { guided, result } = await gt06();
  assert.equal(result.states['attention/weights-from-scores'].state, 'prerequisite_gap');
  assert.equal(result.states['attention/weights-from-scores'].prerequisite, 'softmax');
  assert.equal(result.routed.row, 'gap');
  assert.deepEqual(result.actions.map(action => action.type), ['respond_text', 'suggest_dive'], 'open_dive is dropped');
  assert.deepEqual(result.actions[1].from, { block_id: guided.id });
  const suggested = [];
  const chips = executeActions(result.actions, { canvas: fakeCanvas([guided]), suggestDive: detail => suggested.push(detail) });
  assert.deepEqual(suggested, [{ blockId: guided.id, topic: 'Softmax' }]);
  assert.equal(chips.length, 0);
  assert.equal(result.store.suggested.claim, 'attention/weights-from-scores');
});

test('the words before a dive suggestion are cut to two sentences; replies without one are untouched', async () => {
  // The live planner's gap reply (2026-09-30): six sentences, with decimals and code that are not ends.
  const long = 'Because the output is a weighted average of the value vectors, not a sum of scores. Raw scores are unbounded and can be negative, your row is (-1, 1, 4, 1) after scaling. If you used them directly, the output would scale with how big the scores happen to be. "att = F.softmax(att, dim=-1)" fixes both: exp makes everything positive. Here e^4/(e^4 + 2e + e^-1) = 0.904. So the output stays inside the span of the values!';
  const { result } = await gt06();
  const dive = { type: 'suggest_dive', concept: 'softmax', title: 'Softmax' };
  const cut = enforce({ strategy: 'none', move: 'prerequisite', reason: '', actions: [say(long), dive] }, result.routed, result.turn);
  assert.deepEqual(cut.actions.map(action => action.type), ['respond_text', 'suggest_dive'], 'the suggestion stays');
  assert.equal(cut.actions[0].text, 'Because the output is a weighted average of the value vectors, not a sum of scores. Raw scores are unbounded and can be negative, your row is (-1, 1, 4, 1) after scaling.');
  // Two replies share the two sentences; a third sentence's reply is dropped.
  const split = enforce({ strategy: 'none', move: 'prerequisite', reason: '', actions: [say('One. Two.'), say('Three.'), dive] }, result.routed, result.turn);
  assert.deepEqual(split.actions.map(action => action.type === 'respond_text' ? action.text : action.type), ['One. Two.', 'suggest_dive']);
  // Decimals and code are not sentence ends.
  const kept = enforce({ strategy: 'none', move: 'prerequisite', reason: '', actions: [say('The weight is 0.904 via F.softmax here. That is softmax.'), dive] }, result.routed, result.turn);
  assert.equal(kept.actions[0].text, 'The weight is 0.904 via F.softmax here. That is softmax.');
  // Without a dive suggestion the reply is left whole.
  const whole = enforce({ strategy: 'none', move: 'prerequisite', reason: '', actions: [say(long)] }, result.routed, result.turn);
  assert.equal(whole.actions[0].text, long);
});

test('GT-07 strong transfer after GT-03 -> understood; no more practice on the claim', async () => {
  const { c11, result } = await gt03();
  const later = applyCheck(setActivityAnswer(applyNewAttempt(c11), 'self')); // the optional third attempt, after the card's reveal
  const next = await turnOn(later, "If block_size were 8, row 3 keeps columns 0 to 3, four of the eight. Column 4 is its own next character, so it's blocked with everything after it.",
    result.store, { strategy: 'none', move: 'acknowledge', reason: '', actions: [say('Exactly.'), { type: 'suggest_practice', card: 'c11-causal-mask' }, { type: 'suggest_depth', card: 'c11-causal-mask', direction: 'deeper' }] },
    jev({ 'causal-mask/reads-self-and-earlier': { ideas: [1, 1], transfer: 1 } }));
  const practice = next.store.events.find(event => event.evaluator === 'deterministic' && event.result === 'pass');
  assert.equal(practice.kind, 'demonstrated_here', 'a pass after the reveal is not transfer');
  assert.equal(next.states['causal-mask/reads-self-and-earlier'].state, 'understood');
  assert.ok(!next.routed.allowed.includes('suggest_practice'));
  assert.ok(!next.actions.some(action => action.type === 'suggest_practice'));
});

test('GT-11 practice passed, explain-back puts the mask after softmax -> uncertain, one hint', async () => {
  const c11 = practise(block('c11-causal-mask'), ['self']);
  const result = await turnOn(c11, "The mask hides the future so it can't cheat. It's applied after softmax to zero those weights.", emptyStore(),
    { strategy: 'feynman', move: 'hint', reason: '', actions: [{ type: 'focus_part', card: 'c11-causal-mask', part_id: 'x', mode: 'suggest' }, say('What happens to a −∞ score before softmax?')] },
    jev({ 'causal-mask/applied-before-softmax': { ideas: [0, 1], mis: { 'mask-after-softmax': 1 } } }));
  assert.equal(result.states['causal-mask/reads-self-and-earlier'].state, 'understood', 'the first-attempt transfer pass');
  assert.equal(result.states['causal-mask/applied-before-softmax'].state, 'uncertain');
  assert.equal(conceptState(result.states, 'causal-mask'), 'uncertain', 'conflicting evidence: never understood from the pass alone');
  assert.equal(result.routed.row, 'uncertain');
  assert.deepEqual(result.actions.map(action => action.type), ['respond_text'], 'an unpaged card has no part to focus');
});

test('GT-12 practice failed, explanation strong -> uncertain, never misconception; one question', async () => {
  const c11 = practise(block('c11-causal-mask'), ['before']);
  const result = await turnOn(c11, 'Each position reads itself and all earlier positions, never its next character.', emptyStore(),
    { strategy: 'feynman', move: 'clarify', reason: '', actions: [{ type: 'ask_question', text: 'Does position 99 read itself?', claim: 'causal-mask/reads-self-and-earlier', purpose: 'diagnose' }] },
    jev({ 'causal-mask/reads-self-and-earlier': { ideas: [1, 1], transfer: 0 } }));
  assert.equal(result.states['causal-mask/reads-self-and-earlier'].state, 'uncertain');
  assert.equal(result.states['causal-mask/applied-before-softmax'].state, 'not_yet_observed', 'an unengaged claim gets no events');
  assert.deepEqual(result.actions.map(action => action.type), ['ask_question']);
});

const HOLE = (guided, overrides = {}) => ({
  dive_id: 'canvas-bbbb2222', title: 'Softmax', concept: 'Softmax', created_by: 'tutor_confirmed',
  origin: { parent: PARENT, ...Object.fromEntries(Object.entries(resolveTarget(guided)).map(([key, value]) => [`origin_${key === 'concept_ids' ? 'concept_ids' : key}`, value])) },
  return_point: { block_id: guided.id, part_id: null, pending_question: null, viewport: null },
  ...overrides,
});

test('GT-D1 / GT-D2 / GT-D3: suggest, keep or go down, answer in the hole, climb back and re-ask', async () => {
  const { guided, result } = await gt06();
  // GT-D2, Keep it on this canvas: the next turn here carries dive_choice inline, which lets the
  // Tutor place an authored card on this canvas.
  const kept = keepHere(result.store, PARENT);
  const inline = await turnOn(guided, 'Just explain it here.', kept, { strategy: 'feynman', move: 'reuse', reason: '', actions: [{ type: 'show_authored_card', card: 'c21-temperature', mode: 'navigate' }, say('c21 shows softmax with a divisor.')] }, jev({ attempt: 0 }));
  assert.deepEqual(inline.turn.dive_choice, { concept: 'softmax', choice: 'inline' });
  assert.equal(inline.routed.row, 'gap_inline');
  assert.equal(inline.actions[0].mode, 'navigate');
  assert.equal(inline.store.keep, null, 'used once');

  // GT-D1, Go down: the hole's record carries the five origin identities; evidence travels by concept.
  const record = HOLE(guided);
  assert.equal(record.origin.origin_card_id, 'depth-attention-guided');
  assert.equal(record.origin.origin_block_id, guided.id);
  let store = enterHole(result.store, record);
  assert.equal(store.dive.claim, 'attention/weights-from-scores');
  const question = openingQuestion(store, record);
  assert.match(question, /add up to one/);
  const hole = { app: 'canvas-bbbb2222', board: 'main', dive: record };
  const { post } = worker({ plan: context => {
    assert.equal(context.dive.origin_card, 'depth-attention-guided');
    assert.equal(context.dive.concept, 'softmax');
    assert.equal(context.concept_states.softmax, 'not_yet_observed');
    return { strategy: 'feynman', move: 'explain', reason: '', actions: [say('Softmax exponentiates, then divides by the sum.'), { type: 'show_authored_card', card: 'c21-temperature', mode: 'suggest' }] };
  } });
  const opening = await runTurn({ raw: question, opening: true, canvas: hole, access: { app: hole.app }, block: null, store: markOpened(store, record), post });
  assert.equal(opening.evaluation, null, 'the opening turn evaluates nothing');
  assert.equal(opening.turn.canvas.dive.dive_id, 'canvas-bbbb2222');
  assert.ok(opening.routed.allowed.includes('return_from_dive'));
  assert.equal(openingQuestion(opening.store, record), null, 'once per hole');
  const learned = await runTurn({ raw: 'With scores 2, 1, 0: e² ≈ 7.4, e ≈ 2.7, 1; divide each by their sum 11.1 and you get 0.67, 0.24, 0.09, which add up to one.', canvas: hole, access: { app: hole.app }, block: null, store: opening.store,
    post: worker({ evaluate: jev({ 'softmax/normalizes-to-one': { ideas: [1, 1], transfer: 1 } }), plan: { strategy: 'none', move: 'ack', reason: '', actions: [say('Right.'), { type: 'return_from_dive' }] } }).post });
  assert.equal(learned.states['softmax/normalizes-to-one'].state, 'understood');
  const climbed = [];
  const chips = executeActions(learned.actions, { canvas: fakeCanvas([]), suggestDive: () => {}, climb: () => climbed.push(true) });
  chips.find(chip => /Back up/.test(chip.label)).run();
  assert.equal(climbed.length, 1);

  // GT-D3, back on the parent: returned_from once, one question on the blocked claim, no upgrade.
  store = arriveAt(learned.store, PARENT);
  const back = await turnOn(guided, 'OK, I am back.', store, { strategy: 'socrates', move: 're-check', reason: '', actions: [{ type: 'ask_question', text: 'So why do the attention weights add up to one?', claim: 'attention/weights-from-scores', purpose: 'transfer' }, say('Great, you understand attention now.')] }, jev({ attempt: 0 }));
  assert.equal(back.turn.returned_from.dive_id, 'canvas-bbbb2222');
  assert.equal(back.routed.row, 'returned');
  assert.equal(back.routed.claim, 'attention/weights-from-scores');
  assert.deepEqual(back.actions.map(action => action.type), ['ask_question'], 'one question; the upgrade claim is dropped');
  assert.notEqual(back.states['attention/weights-from-scores'].state, 'understood', 'never auto-upgraded');
  assert.equal(back.store.returned, null);
  const again = await turnOn(guided, 'Still here.', back.store, { strategy: 'none', move: 'x', reason: '', actions: [say('ok')] }, jev({ attempt: 0 }));
  assert.equal(again.turn.returned_from, undefined, 'returned_from is carried once');
});

test('evidence: misconception needs two settled events with the same id; a later transfer pass supersedes', () => {
  const fail = id => ({ concept: 'causal-mask', claim: 'causal-mask/reads-self-and-earlier', result: 'fail', misconception_id: id, settled: true, kind: null });
  let { store } = appendEvents(emptyStore(), [fail('reads-next-target'), fail('no-mask')]);
  assert.equal(deriveClaimStates(store.events)['causal-mask/reads-self-and-earlier'].state, 'uncertain');
  ({ store } = appendEvents(store, [fail('reads-next-target')]));
  assert.equal(deriveClaimStates(store.events)['causal-mask/reads-self-and-earlier'].state, 'misconception');
  ({ store } = appendEvents(store, [{ concept: 'causal-mask', claim: 'causal-mask/reads-self-and-earlier', result: 'pass', kind: 'demonstrated_in_transfer', settled: false }]));
  assert.equal(deriveClaimStates(store.events)['causal-mask/reads-self-and-earlier'].state, 'misconception', 'an unsettled pass changes nothing');
  ({ store } = appendEvents(store, [{ concept: 'causal-mask', claim: 'causal-mask/reads-self-and-earlier', result: 'pass', kind: 'demonstrated_in_transfer', settled: true }]));
  assert.equal(deriveClaimStates(store.events)['causal-mask/reads-self-and-earlier'].state, 'understood');
  assert.deepEqual(store.events.map(event => event.seq), [1, 2, 3, 4, 5]);
});

test('no_quiz removes every question for the session', async () => {
  const c11 = block('c11-causal-mask');
  const first = await turnOn(c11, "Don't quiz me. Just explain it.", emptyStore(), { strategy: 'feynman', move: 'explain', reason: '', constraints_add: ['no_quiz'], actions: [say('Row i keeps columns 0 to i.'), { type: 'ask_question', text: 'Which row?', claim: 'causal-mask/reads-self-and-earlier', purpose: 'predict' }] }, jev({ attempt: 0 }));
  assert.deepEqual(first.store.constraints, ['no_quiz']);
  const later = await turnOn(c11, 'And why?', first.store, { strategy: 'feynman', move: 'explain', reason: '', actions: [{ type: 'ask_question', text: 'What do you think?', claim: 'causal-mask/reads-self-and-earlier', purpose: 'predict' }, say('Because ...')] }, jev({ attempt: 0 }));
  assert.ok(!later.routed.allowed.includes('ask_question'));
  assert.deepEqual(later.actions.map(action => action.type), ['respond_text']);
});
