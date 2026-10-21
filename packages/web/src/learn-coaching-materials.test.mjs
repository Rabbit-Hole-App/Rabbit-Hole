// Tutor Task 07 (C:/s/spec/tutor-workflow/draft.md): choosing one next activity and applying a Tutor action once. The draft's
// named tests, plus the fixtures it asks for (the same objective under a text preference, unavailable sound, a short time, an
// unreadable source and an exhausted allowance, and a retry during material insertion). No model: `plan` is a counted stub.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTutorAction, assessmentText, chooseNextActivity, difficultyOffers, explainMaterial, proposalFromActions, scopeFromJourney } from './learn-coaching-materials.js';

const CLAIM = 'logistic-regression-core/mechanism';
const C1 = { criterionId: 'mech', version: 1, label: 'Explain the mechanism', requirement: 'Explain how the score becomes a probability', requiresReasoning: true, rubricVersion: 'r1', skillKey: CLAIM };
const C2 = { criterionId: 'thresh', version: 1, label: 'Use a threshold', requirement: 'Classify an example under two thresholds', requiresReasoning: true, rubricVersion: 'r1' };
const GOAL = { goalId: 'lg_j1', label: 'Logistic regression', scopeVersion: 1, criteria: [C1, C2], journeyId: 'j1' };
const MATERIALS = ['explain', 'diagram', 'graph', 'quiz', 'compare', 'walkthrough'].map(command => ({ command, cards: ['explanation'], paid: false })).concat({ command: 'video', cards: ['video'], paid: true });
const CAPS = { materials: MATERIALS, blocks: [] };
const JOURNEY = {
  id: 'j1', path_version: 2, active_section_id: 's2', evidence: { events: [] },
  section_plan: { section_id: 's2', checks: [{ id: 'c1', kind: 'mcq', prompt: 'Which holds?', options: [{ id: 'x', label: 'One' }, { id: 'y', label: 'Two' }], claims: [CLAIM] }] },
  diagnostic: { probes: [] },
};
const saved = (over = {}) => ({ activityId: 'la_1', goalId: GOAL.goalId, revision: 1, status: 'in_progress', objective: 'Explain the mechanism', prompt: 'In two sentences, how does the score become a probability?', responseKind: 'text', criterionRefs: [{ criterionId: 'mech', version: 1 }], sourceRefs: [], updatedAt: 'now', ...over });
const planner = (actions = [{ type: 'ask_question', text: 'What does the sigmoid do to a score of 0?', purpose: 'check' }, { type: 'create_material', command: 'graph', request: 'the sigmoid' }]) => {
  const calls = [];
  return { calls, plan: async input => { calls.push(input); return actions; } };
};

test('saved_step_uses_no_planner: a valid saved step comes back as it was, with no planner call; a stale one is not reused', async () => {
  const p = planner();
  const out = await chooseNextActivity({ goal: GOAL, activity: saved(), journey: JOURNEY, capabilities: CAPS }, { plan: p.plan });
  assert.deepEqual([out.source, out.activityId, out.proposal.prompt, p.calls.length], ['saved', 'la_1', saved().prompt, 0]);
  // A paused one too (a return to a paused goal restores its step).
  assert.equal((await chooseNextActivity({ goal: GOAL, activity: saved({ status: 'paused' }), capabilities: CAPS }, { plan: p.plan })).source, 'saved');
  // One whose criterion version changed is not this scope's step any more: a new choice is made.
  const stale = await chooseNextActivity({ goal: GOAL, activity: saved({ criterionRefs: [{ criterionId: 'mech', version: 9 }] }), journey: JOURNEY, capabilities: CAPS }, { plan: p.plan });
  assert.notEqual(stale.source, 'saved');
});

test('format_override_keeps_goal: asking for another format keeps the goal, criteria, objective and prompt; only the material changes', async () => {
  const p = planner();
  const before = await chooseNextActivity({ goal: GOAL, activity: saved(), capabilities: CAPS }, { plan: p.plan });
  const after = await chooseNextActivity({ goal: GOAL, activity: saved(), request: { format: 'diagram' }, capabilities: CAPS }, { plan: p.plan });
  for (const key of ['goalRef', 'criterionRefs', 'objective', 'prompt']) assert.deepEqual(after.proposal[key], before.proposal[key], key);
  assert.deepEqual([after.reason, after.proposal.material.format, after.proposal.material.command, after.proposal.material.fallback.format], ['format_changed', 'diagram', 'diagram', 'text']);
  assert.equal(p.calls.length, 0);
  // With no saved step, a text preference makes a text explanation for the same objective and still asks one question.
  const text = await chooseNextActivity({ goal: GOAL, request: { format: 'text' }, capabilities: CAPS }, {});
  assert.deepEqual([text.proposal.objective, text.proposal.material.command, text.proposal.prompt], [C1.label, 'explain', C1.requirement]);
});

test('missing_video_has_text_fallback: video with sound off or no video on the canvas keeps the objective and offers text; paid generation is never chosen', async () => {
  const noSound = await chooseNextActivity({ goal: GOAL, request: { format: 'video' }, constraints: { sound: false }, capabilities: { ...CAPS, blocks: [{ id: 'v1', type: 'video' }] } }, {});
  assert.deepEqual([noSound.proposal.objective, noSound.proposal.material.format, noSound.proposal.material.reason], [C1.label, 'text', 'sound_unavailable']);
  const none = await chooseNextActivity({ goal: GOAL, request: { format: 'video' }, capabilities: CAPS }, {});
  assert.deepEqual([none.proposal.material.format, none.proposal.material.command, none.proposal.material.reason], ['text', 'explain', 'video_unavailable']);
  // An existing video on the canvas is used as it is, with a text alternative for the same objective.
  const there = await chooseNextActivity({ goal: GOAL, request: { format: 'video' }, capabilities: { ...CAPS, blocks: [{ id: 'v1', type: 'video' }] } }, {});
  assert.deepEqual([there.proposal.material.existing, there.proposal.material.fallback.command], [{ blockId: 'v1' }, 'explain']);
  // The planner's paid material is dropped by the adapter; its question stays.
  const paid = proposalFromActions([{ type: 'ask_question', text: 'Predict the next frame?' }, { type: 'create_material', command: 'video', request: 'x' }], { goal: GOAL, criterion: C1, capabilities: CAPS });
  assert.equal(paid.material, undefined);
});

test('fixtures: short time, unreadable source and an exhausted allowance each keep the same objective with the smallest supported activity', async () => {
  const p = planner();
  const base = { goal: GOAL, journey: JOURNEY, capabilities: CAPS };
  const check = await chooseNextActivity(base, { plan: p.plan });
  assert.deepEqual([check.source, check.proposal.responseKind, check.proposal.prompt, check.activity.sourceRefs], ['journey_check', 'choice', 'Which holds?', [{ kind: 'journey_probe', id: 'c1', version: 2, locator: { sectionId: 's2' } }]]);
  assert.deepEqual(check.activity.checkpoint.options, [{ id: 'x', label: 'One' }, { id: 'y', label: 'Two' }]);
  assert.equal(p.calls.length, 0, 'existing material needs no planner');
  const unreadable = await chooseNextActivity({ ...base, constraints: { unreadable: ['j1'] } }, { plan: p.plan });
  assert.deepEqual([unreadable.source, unreadable.proposal.objective, p.calls.length], ['planner', C1.label, 1]);
  const short = await chooseNextActivity({ ...base, journey: null, constraints: { minutes: 3 } }, {});
  assert.deepEqual([short.proposal.objective, short.proposal.material], [C1.label, undefined]);
  const broke = await chooseNextActivity({ ...base, journey: null, request: { format: 'diagram' }, constraints: { allowance: 'exhausted' } }, { plan: p.plan });
  assert.deepEqual([broke.source, broke.reason, broke.proposal.objective, broke.proposal.material, p.calls.length], ['requirement', 'allowance_exhausted', C1.label, undefined, 1]);
  // Once that check is answered (the saved activity has its feedback), it is not offered again, even before the journey copy
  // in the browser shows the new evidence: a question on the same skill comes next.
  const answered = saved({ status: 'feedback_ready', responseKind: 'choice', sourceRefs: check.activity.sourceRefs });
  const after = await chooseNextActivity({ ...base, statuses: { mech: 'practising' }, activity: answered }, {});
  assert.deepEqual([after.source, after.proposal.responseKind, after.proposal.criterionRefs], ['requirement', 'text', [{ criterionId: 'mech', version: 1 }]]);
  // A planner reply with no question proposes nothing of its own: the requirement question stands.
  const empty = await chooseNextActivity({ ...base, journey: null }, { plan: planner([{ type: 'respond_text', text: 'Hi' }]).plan });
  assert.equal(empty.source, 'requirement');
});

test('silence_does_not_generate_retry: no answer leaves the step as it is; waiting feedback proposes nothing; nothing is planned', async () => {
  const p = planner();
  for (let i = 0; i < 3; i += 1) assert.equal((await chooseNextActivity({ goal: GOAL, activity: saved(), journey: JOURNEY, capabilities: CAPS }, { plan: p.plan })).source, 'saved');
  const waiting = await chooseNextActivity({ goal: GOAL, activity: saved({ status: 'awaiting_feedback' }), capabilities: CAPS }, { plan: p.plan });
  assert.deepEqual([waiting.proposal, waiting.reason, p.calls.length], [null, 'awaiting_feedback', 0]);
  // No observations is not a miss: silence never triggers the difficulty offers.
  assert.deepEqual(difficultyOffers([]), []);
});

test('repeated difficulty offers a worked answer, a simpler task, a different goal or a pause; a worked answer is recorded as help', async () => {
  const misses = [{ fit: 'not_met', validity: 'valid', observedAt: '1' }, { fit: 'partial', validity: 'valid', observedAt: '2' }];
  const out = await chooseNextActivity({ goal: GOAL, statuses: { mech: 'practising' }, evidence: { mech: misses }, journey: JOURNEY, capabilities: CAPS }, { plan: planner().plan });
  assert.deepEqual([out.proposal, out.offers], [null, ['worked_answer', 'simpler_task', 'change_goal', 'pause']]);
  assert.deepEqual(difficultyOffers([...misses, { fit: 'met', validity: 'valid', observedAt: '3' }]), [], 'a later success ends it');
  assert.deepEqual(difficultyOffers([misses[0], { ...misses[1], validity: 'superseded' }]), [], 'superseded evidence is not read');
  const worked = await chooseNextActivity({ goal: GOAL, statuses: { mech: 'practising' }, evidence: { mech: misses }, request: { kind: 'worked_answer' }, capabilities: CAPS }, {});
  assert.deepEqual([worked.reason, worked.activity.checkpoint.assistanceRefs, worked.proposal.material.command], ['worked_answer', ['worked_answer'], 'explain']);
  const simpler = await chooseNextActivity({ goal: GOAL, statuses: { mech: 'practising' }, evidence: { mech: misses }, request: { kind: 'simpler_task' }, journey: JOURNEY, capabilities: CAPS }, { plan: planner().plan });
  assert.deepEqual([simpler.source, simpler.proposal.reason], ['planner', 'simpler_task']);
});

test('the next criterion is the most uncertain one; a goal whose criteria are all shown proposes none; a journey goal with none proposes its scope', async () => {
  const out = await chooseNextActivity({ goal: GOAL, statuses: { mech: 'demonstrated_independently', thresh: 'needs_review' }, capabilities: CAPS }, {});
  assert.deepEqual(out.proposal.criterionRefs, [{ criterionId: 'thresh', version: 1 }]);
  assert.equal((await chooseNextActivity({ goal: GOAL, statuses: { mech: 'demonstrated_independently', thresh: 'demonstrated_independently' } }, {})).reason, 'goal_demonstrated');
  const registry = { concepts: { 'lr-core': { label: 'LR: core' } }, claims: { 'lr-core/mechanism': { concept: 'lr-core', statement: 'The mechanism can be explained.' } } };
  const path = { sections: [{ expected_evidence: [{ claim: 'lr-core/mechanism', kind: 'explain' }] }, { expected_evidence: [{ claim: 'lr-core/mechanism', kind: 'transfer' }] }] };
  const scoped = await chooseNextActivity({ goal: { ...GOAL, criteria: [], scopeVersion: 0 }, journey: { id: 'j1', registry }, path }, {});
  assert.deepEqual([scoped.reason, scoped.scope], ['accept_scope', [{ criterionId: 'lr-core:mechanism', label: 'LR: core: mechanism', requirement: 'The mechanism can be explained.', requiresReasoning: true, requiresTransfer: false, skillKey: 'lr-core/mechanism' }]]);
  assert.deepEqual(scopeFromJourney({ registry }, { sections: [] }), []);
});

// ---- applyTutorAction ----
const HERE = { userId: 'u1', app: 'canvas-0a1b2c3d', board: 'main', goalId: GOAL.goalId };
const ON = { mode: 'tutor', tutorEnabled: true, suggestionsPaused: false, revision: 4 };
const now = (over = {}) => ({ ...HERE, coachingRevision: 4, controls: ON, chat: { chatOpen: true, ready: true, activeInput: false }, canEdit: true, ...over });
let n = 0;
const action = (over = {}, payload = {}) => ({ actionId: `act-${++n}`, kind: 'start_activity', originContext: HERE, expectedRevisions: { coaching: 4 },
  payload: { proposal: { goalRef: { goalId: GOAL.goalId, scopeVersion: 1 }, criterionRefs: [{ criterionId: 'mech', version: 1 }], objective: 'o', prompt: 'p', responseKind: 'text', nextActions: [], reason: 'r', material: { format: 'graph', command: 'graph', request: 'the sigmoid' } }, requested: true, ...payload }, ...over });
function world() {
  const blocks = [{ id: 'work', type: 'explanation' }], writes = [], made = [];
  const canvas = { blocks: () => blocks, insertBlock: (block, options) => { const id = `b${blocks.length}`; blocks.push({ ...block, id, options }); return id; }, reserve: () => 'slot', release: () => {}, revealBlock: () => {} };
  const coaching = async (kind, payload, meta) => { writes.push({ kind, payload, meta }); return { activeActivityId: 'la_new' }; };
  const makeMaterial = async (material, { canvas: c }) => { made.push(material); await new Promise(resolve => setTimeout(resolve, 5)); c.insertBlock({ type: 'graph', title: material.request }, { into: c.reserve?.({}) ?? null }); };
  return { blocks, writes, made, deps: { canvas, coaching, makeMaterial } };
}

test('duplicate_action_inserts_once: a double click, a retry during material insertion and a later replay make one activity write and one card', async () => {
  const w = world(), a = action({}, { besideBlockId: 'work' });
  const [one, two] = await Promise.all([applyTutorAction(a, now(), w.deps), applyTutorAction(a, now(), w.deps)]);
  assert.deepEqual([one.status, one.material, two === one || two.blockId === one.blockId], ['applied', 'made', true]);
  assert.equal(w.writes.length, 1);
  assert.deepEqual(w.writes[0].meta, { actionId: a.actionId, expectedRevision: 4 }, 'the action id is the coaching write id: a retried write replays');
  await new Promise(resolve => setTimeout(resolve, 5));
  const later = await applyTutorAction(a, now(), w.deps);
  assert.deepEqual([later.status, w.writes.length, w.blocks.filter(b => b.tutor_action === a.actionId).length], ['duplicate', 1, 1]);
  // Beside the relevant work, stamped with its action, activity and goal; nothing replaced.
  const card = w.blocks.find(b => b.tutor_action === a.actionId);
  assert.deepEqual([card.options, card.coaching, w.blocks[0].id], [{ after: 'work' }, { goalId: GOAL.goalId, activityId: 'la_new' }, 'work']);
});

test('viewer_cannot_insert: a read-only canvas gets no activity and no card; neither does another learner, canvas or goal', async () => {
  const w = world();
  assert.deepEqual(await applyTutorAction(action(), now({ canEdit: false }), w.deps), { status: 'refused', reason: 'read_only' });
  for (const other of [{ userId: 'u2' }, { app: 'canvas-ffffffff' }, { board: 'other' }, { goalId: 'lg_other' }]) {
    assert.deepEqual(await applyTutorAction(action(), now(other), w.deps), { status: 'kept_at_origin', reason: 'context_changed' });
  }
  assert.deepEqual([w.writes.length, w.made.length, w.blocks.length], [0, 0, 1]);
  assert.deepEqual(await applyTutorAction(action({}, { proposal: null }), now(), w.deps).then(r => r.status), 'refused', 'an action that is not a TutorAction');
});

test('off_prevents_late_automatic_material: unrequested material waits for selected, enabled, unpaused Tutor, and a card arriving after Off, a pause or a context change is not inserted', async () => {
  const w = world();
  for (const controls of [{ ...ON, tutorEnabled: false }, { ...ON, suggestionsPaused: true }, { ...ON, mode: 'auto' }]) {
    assert.equal((await applyTutorAction(action({}, { requested: false }), now({ controls }), w.deps)).status, 'suppressed');
  }
  assert.equal(w.writes.length, 0);
  // Late: the controls change while the card is being made. The activity was saved; the card is never inserted.
  let context = now();
  const pending = applyTutorAction(action({}, { requested: false }), () => context, w.deps);
  context = now({ controls: { ...ON, tutorEnabled: false } });
  const late = await pending;
  assert.deepEqual([late.status, late.material, w.blocks.length], ['applied', 'suppressed', 1]);
  // A requested card still goes in after Off (an explicit request runs in every mode), but never on another canvas.
  context = now();
  const moved = applyTutorAction(action(), () => context, w.deps);
  context = now({ app: 'canvas-ffffffff' });
  assert.deepEqual([(await moved).material, w.blocks.length], ['kept_at_origin', 1]);
  assert.equal((await applyTutorAction(action(), now({ controls: { ...ON, tutorEnabled: false } }), w.deps)).material, 'made');
});

test('stale revision, a refused save and a failed material: nothing is inserted at the wrong version, the activity is kept when the card fails', async () => {
  const w = world();
  assert.deepEqual(await applyTutorAction(action(), now({ coachingRevision: 5 }), w.deps), { status: 'stale', reason: 'revision' });
  const refused = await applyTutorAction(action(), now(), { ...w.deps, coaching: async () => { throw Object.assign(new Error('revision'), { status: 409, data: { error: 'revision' } }); } });
  assert.deepEqual(refused, { status: 'stale', reason: 'revision' });
  const failed = await applyTutorAction(action(), now(), { ...w.deps, makeMaterial: async () => { throw new Error('no'); } });
  assert.deepEqual([failed.status, failed.activityId, failed.material, failed.alternatives], ['applied', 'la_new', 'failed', ['text']]);
  // An existing card is revealed, never made again.
  let revealed = null;
  const existing = await applyTutorAction(action({}, { proposal: { ...action().payload.proposal, material: { format: 'video', existing: { blockId: 'work' } } } }), now(), { ...w.deps, canvas: { ...w.deps.canvas, revealBlock: id => { revealed = id; } } });
  assert.deepEqual([existing.material, revealed], ['existing', 'work']);
});

test('the material seam is the Tutor material tool through the existing Learn command path, internal only', async () => {
  const seen = [];
  const make = explainMaterial(async (line, deps) => { seen.push([line, deps.internal, deps.app]); }, { app: 'canvas-0a1b2c3d' });
  await make({ command: 'explain', request: 'how the sigmoid maps a score' }, { canvas: {} });
  assert.deepEqual(seen, [['/explain how the sigmoid maps a score', true, 'canvas-0a1b2c3d']]);
});

test('assessmentText: honest copy for every processing state; an unassessable answer never reads as feedback or progress', () => {
  assert.match(assessmentText({ status: 'unavailable', reason: 'no_registered_claims' }), /cannot be checked yet.*not assessed.*unchanged/);
  assert.match(assessmentText({ status: 'pending' }), /Checking/);
  assert.match(assessmentText({ status: 'unknown' }), /unknown/);
  assert.match(assessmentText({ status: 'failed' }), /failed/);
  assert.match(assessmentText({ status: 'completed', observations: [{ fit: 'met', reasoning: 'missing' }] }), /Explain why/);
  assert.match(assessmentText({ status: 'completed', observations: [{ fit: 'unclear', conflict: true }] }), /needs a review/);
  assert.match(assessmentText({ status: 'completed', observations: [{ fit: 'not_met' }] }), /Not yet/);
  assert.match(assessmentText({ status: 'unavailable', reason: 'source_unavailable' }), /code it is about is not available.*not checked.*unchanged/);
  for (const reason of ['no_criteria', 'rubric_not_supported', 'visual_not_supported', 'allowance_refused', 'activity_changed', 'source_unavailable', 'evaluator_unconfigured']) {
    const text = assessmentText({ status: 'unavailable', reason });
    assert.match(text, /saved/); assert.doesNotMatch(text, /correct|meets/i);
  }
});
