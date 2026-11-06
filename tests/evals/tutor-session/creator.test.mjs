// Creator analytics privacy rules (creator.mjs; docs/features/tutor-decision-eval.md §17). Synthetic sessions on eval-only
// publication events, and one real-product session for the Next Steps impressions and selections. Free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmitter, validateEvent } from './events.mjs';
import { MIN_COHORT, SUPPRESSED, creatorAnalytics, publicProfile } from './creator.mjs';
import { loadProfiles, loadTopic, runSession, simulatedIds } from './harness.mjs';
import { HOOK_DEBOUNCE_MS, productWorld, providerBoundary, stubAnswers } from './product.mjs';

const A = { org: 'org-1', canvas: 'canvas-a1', creator_id: 'u-creator-1' }, B = { org: 'org-1', canvas: 'canvas-b2', creator_id: 'u-creator-1' }, C = { org: 'org-2', canvas: 'canvas-c3', creator_id: 'u-creator-2' };
const PUBLICATIONS = [A, B, C].map(p => ({ ...p, listed: true }));
const OPTIONS = [1, 2, 3].map(position => ({ id: `ns_1.${position}`, position, text: `Hook number ${position}?`, set_id: 'ns_1', learning_goal: `goal ${position}`, concept_ids: ['c1'], claim_ids: ['k1'] }));

// One learner session on a publication, as the eval stream records it.
function session({ user, id, publication, opened_at = '2026-10-07T10:00:00Z', concepts = ['c1'], friction = [], pick = null, hole = false, fork = false, active_ms = null }) {
  const { events, emit } = createEmitter({ session_id: id, user_id: user, canvas_id: publication.canvas, clock: () => 0 });
  emit('publication_opened', { publication, source_access_mode: 'public_explore', opened_at });
  emit('tutor_decision_started', { decision_id: `${id}:d1`, trigger: 'opening' });
  emit('tutor_action_ready', { decision_id: `${id}:d1`, decision: { action_type: 'respond_text', modality: 'text', reason_codes: [], target_concepts: concepts } });
  emit('evidence_updated', { claims: friction.map(concept => ({ claim: `${concept}/k`, concept, state: 'misconception', misconception_id: `${user}-private-misreading` })) });
  emit('next_steps_generation_started', { hook_set_id: `${id}:h1` });
  emit('next_steps_ready', { hook_set_id: `${id}:h1`, options: OPTIONS });
  emit('next_steps_shown', { hook_set_id: `${id}:h1` });
  if (pick) emit('next_step_selected', { hook_set_id: `${id}:h1`, option_id: OPTIONS[pick - 1].id, position: pick });
  if (hole) emit('rabbit_hole_opened', { rabbit_hole_id: `hole-of-${user}`, opened_by: 'shared_canvas_hook' });
  if (fork) emit('canvas_forked', { publication });
  if (active_ms != null) emit('material_interaction', { material_id: `${id}:m1`, interaction: 'attempt', meaningful: true, active_ms });
  return events;
}
const learners = (n, publication, extra = () => ({}), from = 0) => Array.from({ length: n }, (_, i) => session({ user: `u-learner-${from + i}`, id: `s-${publication.canvas}-${from + i}`, publication, ...extra(from + i) }));
const PROTECTED = level => [level.metrics.avg_active_learning_seconds, level.metrics.concept_exploration_rate, level.metrics.deeper_branch_rate, level.metrics.rabbit_hole_conversion_rate, level.metrics.fork_conversion_rate, level.metrics.highest_friction_concept, level.metrics.next_steps.selection_rate, ...Object.values(level.metrics.next_steps.by_position)];

test('below 10 unique learners every protected metric is suppressed, never 0; the plain counts stay visible', () => {
  const events = learners(9, A, i => ({ pick: 1, hole: i < 3, fork: i < 2, friction: ['c1'], active_ms: 60000 })).flat();
  const out = creatorAnalytics(events, { publications: PUBLICATIONS });
  const a = out.creators[A.creator_id].publications['org-1/canvas-a1'];
  for (const metric of PROTECTED(a)) assert.deepEqual(metric, SUPPRESSED);
  assert.deepEqual(SUPPRESSED, { value: null, suppressed: true, suppression_reason: 'insufficient_cohort', minimum_unique_learners: 10 });
  // Always visible, as bare counts: opens, unique learners, raw Rabbit Hole starts, forks, published canvases.
  assert.deepEqual(a.counts, { total_opens: 9, unique_learners: 9, rabbit_hole_starts: 3, public_fork_count: 2, published_canvas_count: 1 });
  assert.deepEqual(a.by_concept.c1, { unique_learners: 9, friction_rate: SUPPRESSED });
  const [hook] = Object.values(a.by_hook);
  assert.deepEqual([hook.learning_goal, hook.representative_hook, hook.selection_rate], [null, null, SUPPRESSED]); // no personalised copy below the cohort
});

test('at 10 unique learners the protected metrics appear, computed per learner', () => {
  const events = learners(12, A, i => ({ pick: i % 3 ? 1 : 2, hole: i < 3, fork: i < 6, concepts: i < 4 ? ['c1', 'c2'] : ['c1'], friction: i < 9 ? ['c1'] : [], active_ms: 120000 })).flat();
  const a = creatorAnalytics(events, { publications: PUBLICATIONS }).creators[A.creator_id].publications['org-1/canvas-a1'];
  const v = metric => metric.value;
  assert.deepEqual([v(a.metrics.avg_active_learning_seconds), v(a.metrics.concept_exploration_rate), v(a.metrics.deeper_branch_rate), v(a.metrics.rabbit_hole_conversion_rate), v(a.metrics.fork_conversion_rate)], [120, 0.333, 1, 0.25, 0.5]);
  assert.deepEqual(v(a.metrics.highest_friction_concept), { concept_id: 'c1', friction_rate: 0.75 });
  // 12 impressions per position; position 1 picked by 8, position 2 by 4, position 3 never.
  assert.deepEqual([v(a.metrics.next_steps.selection_rate), ...[1, 2, 3].map(p => v(a.metrics.next_steps.by_position[p]))], [0.333, 0.667, 0.333, 0]);
  // c2 was met by 4 learners: its own cut is suppressed even though the publication's is not.
  assert.deepEqual(a.by_concept.c2, { unique_learners: 4, friction_rate: SUPPRESSED });
  const first = Object.values(a.by_hook).find(hook => hook.representative_hook === 'Hook number 1?');
  assert.deepEqual([first.learning_goal, first.unique_learners, first.selection_rate.value], ['goal 1', 12, 0.667]);
});

test('the threshold holds independently at publication, creator, global, concept, hook, position and time-range cuts', () => {
  const events = [
    ...learners(12, A, i => ({ pick: 1, opened_at: i < 6 ? '2026-10-01T09:00:00Z' : '2026-10-07T09:00:00Z' })),
    ...learners(4, B, () => ({ pick: 3 }), 100),
    ...learners(3, C, () => ({ pick: 2 }), 200),
  ].flat();
  const out = creatorAnalytics(events, { publications: PUBLICATIONS });
  const one = out.creators[A.creator_id], two = out.creators[C.creator_id];
  assert.equal(one.publications['org-1/canvas-a1'].metrics.deeper_branch_rate.value, 1);
  for (const metric of PROTECTED(one.publications['org-1/canvas-b2'])) assert.deepEqual(metric, SUPPRESSED); // 4 learners
  assert.equal(one.metrics.deeper_branch_rate.value, 1); // 16 learners across the creator's two canvases
  for (const metric of PROTECTED(two)) assert.deepEqual(metric, SUPPRESSED); // a creator with 3 learners
  assert.equal(out.global.counts.unique_learners, 19);
  // Position 3 was seen by all 19 but picked only on B: visible globally, a cut with its own cohort.
  assert.equal(out.global.metrics.next_steps.by_position[3].value, round3(4 / 19));
  // A time range that leaves 6 learners on A suppresses what the whole range showed.
  const recent = creatorAnalytics(events, { publications: PUBLICATIONS, filter: { from: '2026-10-05T00:00:00Z' } });
  assert.deepEqual(recent.creators[A.creator_id].publications['org-1/canvas-a1'].counts.unique_learners, 6);
  assert.deepEqual(recent.creators[A.creator_id].publications['org-1/canvas-a1'].metrics.deeper_branch_rate, SUPPRESSED);
});
const round3 = x => Math.round(x * 1000) / 1000;

test('no double counting: a session counts once at every level; a learner counts once per level', () => {
  // u-learner-0 opens A twice and B once: three opens, one learner.
  const events = [...learners(10, A), session({ user: 'u-learner-0', id: 's-again', publication: A }), session({ user: 'u-learner-0', id: 's-b', publication: B })].flat();
  const out = creatorAnalytics(events, { publications: PUBLICATIONS });
  const one = out.creators[A.creator_id];
  assert.deepEqual([one.publications['org-1/canvas-a1'].counts.total_opens, one.publications['org-1/canvas-a1'].counts.unique_learners], [11, 10]);
  assert.deepEqual([one.publications['org-1/canvas-b2'].counts.total_opens, one.publications['org-1/canvas-b2'].counts.unique_learners], [1, 1]);
  assert.deepEqual([one.counts.total_opens, one.counts.unique_learners], [12, 10]); // the sum of opens; learners deduplicated
  assert.deepEqual([out.global.counts.total_opens, out.global.counts.unique_learners], [12, 10]);
  // A session that names two publications is refused, never split or counted twice.
  const both = session({ user: 'u-x', id: 's-x', publication: A });
  both.push({ ...both[0], seq: 99, event_id: 's-x:99', publication: B });
  assert.throws(() => creatorAnalytics(both, { publications: PUBLICATIONS }), /exactly one publication/);
});

test('creator output carries no learner identity, evidence row, individual misconception, Rabbit Hole path or hook history', () => {
  const events = learners(12, A, i => ({ pick: 1, hole: true, friction: ['c1'], active_ms: 1000 })).flat();
  const text = JSON.stringify(creatorAnalytics(events, { publications: PUBLICATIONS }));
  for (const leak of ['u-learner-', 's-canvas-a1', '@', 'private-misreading', 'misconception_id', 'hole-of-', 'rabbit_hole_id', 'claims', 'next_step_selected', 'session_id', 'user_id']) assert.ok(!text.includes(leak), leak);
  // Publication identity is the canonical key only: a share key or a token is refused at the event.
  const base = session({ user: 'u-y', id: 's-y', publication: A })[0];
  assert.match(validateEvent({ ...base, publication: { ...A, share_key: 'abc' } }).join(), /publication is \{ org, canvas, creator_id \}/);
  assert.ok(validateEvent({ ...base, publication: { org: 'o', canvas: 'c', token: 't' } }).some(problem => /token|publication/.test(problem)));
  assert.match(validateEvent({ ...base, publication: { ...A, creator_id: 'maker@example.com' } }).join(), /creator_id looks like an email/);
});

test('the public creator profile reads plain counts only, over listed explainers', () => {
  const events = [...learners(3, A, () => ({ fork: true })), ...learners(2, B, () => ({ fork: true }), 50)].flat();
  const listedOnly = PUBLICATIONS.map(p => (p.canvas === 'canvas-b2' ? { ...p, listed: false } : p)); // B was removed from Explore
  const profile = publicProfile(creatorAnalytics(events, { publications: listedOnly }).creators[A.creator_id]);
  assert.deepEqual(profile, { public_explainer_count: 1, aggregate_unique_learners: 3, aggregate_fork_count: 3 });
});

test('Next Steps impressions and selections come from the product\'s own hook events', async () => {
  // One real-product session (provider boundary, keyless), replayed as twelve learners on one publication.
  const topic = loadTopic('logistic-regression'), profiles = loadProfiles(), profile = profiles[0];
  const boundary = providerBoundary(stubAnswers());
  let bundle;
  try {
    const world = await productWorld({ topic, ids: simulatedIds({ runId: 'creator', topic, profile }), boundary });
    let typed = 0;
    const learner = { reply: async ({ view }) => (view.options.length && typed ? { selected_option_id: view.options[1].id, response: { kind: 'acknowledge', text: '' } } : { selected_option_id: null, response: { kind: 'answer', text: `My answer ${++typed}.` } }) };
    try { bundle = await runSession({ topic, profile, profiles, tutor: world.tutor, hooks: world.hooks, hookStart: world.hookStart, hookDelayMs: HOOK_DEBOUNCE_MS, materialize: world.materialize, learner, runId: 'creator', maxDecisions: 3 }); }
    finally { world.close(); }
  } finally { boundary.restore(); }
  assert.ok(bundle.events.some(event => event.type === 'next_steps_shown' && event.trace?.event === 'next_steps_shown'));
  const replay = Array.from({ length: MIN_COHORT + 2 }, (_, i) => [
    { ...bundle.events[0], type: 'publication_opened', publication: A, source_access_mode: 'public_explore', opened_at: '2026-10-07T10:00:00Z' },
    ...bundle.events,
  ].map(event => ({ ...event, session_id: `replay-${i}`, user_id: `u-replay-${i}` }))).flat();
  const a = creatorAnalytics(replay, { publications: PUBLICATIONS }).creators[A.creator_id].publications['org-1/canvas-a1'];
  const shown = bundle.events.filter(event => event.type === 'next_steps_shown').length, picked = bundle.events.filter(event => event.type === 'next_step_selected').length;
  assert.ok(shown >= 1 && picked >= 1);
  assert.equal(a.metrics.next_steps.selection_rate.value, round3(picked / (shown * 3)));
  assert.equal(a.metrics.next_steps.by_position[2].value, round3(picked / shown));
  assert.deepEqual(a.metrics.next_steps.by_position[1], { value: 0, suppressed: false }); // a real 0 above the cohort, shown as 0
});
