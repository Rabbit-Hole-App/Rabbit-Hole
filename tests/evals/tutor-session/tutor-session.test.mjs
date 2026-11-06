// Tutor decision evaluation harness, free tests (docs/features/tutor-decision-eval.md). Synthetic fixture traces only:
// no model call, no product Tutor. Concept and claim names are deliberately generic (c1, c2) - the harness must
// not care what the topic is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aggregateEvents, aggregate, groupMetrics, hookFlags, stepsCsv, terminalTable, varietyWithPurpose } from './metrics.mjs';
import { createEmitter, deriveTiming, foldSession, foldSessions, validateEvent } from './events.mjs';
import { priceCall } from './cost.mjs';
import { contentHash, describeText, materialRecords } from './materials.mjs';
import { graphMetrics, learningGraph } from './graph.mjs';
import {
  LEARNER_REPLY_SCHEMA, REVIEW_SCHEMA, assertNoProfileLeak, createLedger, freshLearnDb, learnerPrompt, learnerView, loadProfiles, loadRoles,
  loadTaxonomy, loadTopic, parseLearnerReply, parseReview, profileTerms, readSessions, reviewerPrompt, reviewerView, runSession, writeSession,
} from './harness.mjs';

const profiles = loadProfiles();
const taxonomy = loadTaxonomy();
const roles = loadRoles();
const topic = loadTopic('logistic-regression');
const round3 = x => Math.round(x * 1000) / 1000;
const round6 = x => Math.round(x * 1e6) / 1e6;

// ---------- A scripted world: fake Tutor, hooks, learner, material on a fake clock ----------

const claim = (id, concept, state, extra = {}) => ({ claim: id, concept, state, ...extra });
// One scripted Tutor step: the decision, its estimated time, and the evidence after the learner's response.
const say = (modality, codes, targets, seconds, after, extra = {}) => ({
  decision: { action_type: extra.action_type ?? 'respond_text', modality, card_type: extra.card_type ?? modality, reason_codes: codes, rationale_summary: `because ${codes.join(', ')}`, target_concepts: targets, expected_evidence: extra.expected ?? null },
  seconds, after, material: extra.material ?? 'measured', signature: extra.signature ?? null, click: !!extra.click,
});
const HOOKS = [
  [{ id: 'h1', position: 1, text: 'What if every score were identical?', learning_goal: 'g1' }, { id: 'h2', position: 2, text: 'Learn softmax', learning_goal: 'g2' }, { id: 'h3', position: 3, text: 'Why does a bigger input push the output toward one?', learning_goal: 'g3' }],
];
// Provider usage the fake product reports per call (the meter prices it).
const PLANNER = { provider: 'anthropic', model_id: 'claude-opus-5-5', model_role: 'tutor', usage: { input_tokens: 3000, output_tokens: 400, cache_read_input_tokens: 1000 }, latency_ms: 4000 };
const HOOKER = { provider: 'anthropic', model_id: 'claude-sonnet-5-5', model_role: 'tutor_next_steps', usage: { input_tokens: 2000, output_tokens: 300 }, latency_ms: 1500 };
const AUTHOR = { provider: 'anthropic', model_id: 'claude-sonnet-5-5', model_role: 'material_generation', usage: { input_tokens: 2500, output_tokens: 800 }, latency_ms: 2000 };
const JEV = { provider: 'typesafe', model_id: 'jev-1.13.0', model_role: 'jev', latency_ms: 500 };
const SIM = { provider: 'anthropic', model_id: 'claude-sonnet-5-5', model_role: 'learner_simulator', usage: { input_tokens: 1500, output_tokens: 200 } };
const price = call => priceCall(call).cost_usd;
// Card text exists only here, on the producer side: the events carry counts and hashes.
const text = i => `Step ${i}: the score becomes a probability. A larger score moves the value toward one, a smaller one toward zero.`;
const sub = (type, body, index) => ({ subcard_type: type, index, ...describeText(body), content_hash: contentHash(body) });
const LONG = 'word '.repeat(260).trim();

// The learner makes one move per decision, as in the product: it clicks the first hook after a row marked click (or after
// every decision with follow: true; the next decision is a hook turn, and nothing is evaluated), else it types an answer
// that the fake evidence path (observe) reads.
function world({ script, start = [], hookSets = HOOKS, leakAt = null, debugText = true, follow = false }) {
  const time = { now: 0 };
  const advance = ms => { time.now += ms; };
  const seen = [], made = [];
  let index = -1, evidence = start;
  const tutor = {
    start: async () => ({ evidence: start, context: { journey_id: 'j1', section_id: 's1', canvas_version: 1 } }),
    decide: async (input, meter) => {
      seen.push(input);
      index++;
      advance(4000);
      meter.call(PLANNER);
      const row = script[index];
      // Decision 3 moves to section s2; decision 6 is in a Rabbit Hole the learner opened; decision 7 is back.
      const context = index === 2 ? { section_id: 's2' } : index === 5 ? { dive_id: 'hole-1' } : index === 6 ? { dive_id: null } : {};
      const rabbit_hole = index === 5 ? { opened_by: 'learner', origin_action: 'learner_slash', origin_node_id: made[4], origin_concept_ids: ['c2'] } : null;
      return { decision: row.decision, estimated_learning_seconds: row.seconds, available_modalities: Object.keys(taxonomy.modalities).filter(m => !taxonomy.modalities[m].expensive), planner: { model: 'planner-x', version: 'v1' }, planner_version: 'planner-x@v1', material_summary: `material ${index + 1} ${row.decision.modality}`, context, rabbit_hole, tutor_input: { text: input.text ?? null } };
    },
    observe: async (_, meter) => { advance(500); meter.call(JEV); evidence = script[index].after; return { evidence }; },
  };
  const hooks = async ({ decisions }, meter) => { advance(1500); meter.call(HOOKER); return { options: hookSets[(decisions - 1) % hookSets.length] }; };
  const learner = {
    reply: async ({ view }, meter) => {
      advance(30000); meter.call(SIM);
      if ((follow || script[index].click) && view.options.length) return { selected_option_id: view.options[0].id, response: { kind: 'acknowledge', text: '' } };
      return { selected_option_id: null, response: { kind: 'answer', text: index === leakAt ? 'As an advanced learner I know this.' : `answer ${index + 1}` } };
    },
  };
  const materialize = async ({ decision, material_id }, marks, meter) => {
    const kind = script[index].material;
    if (kind === 'not_run') return { timing_source: 'not_run', cache_status: 'not_applicable' };
    made[index] = material_id;
    const structure = decision.modality === 'quiz' ? { is_composite: true, split_reason: 'prerequisite_then_application', subcards: [sub('explanation', text(index), 0), { subcard_type: 'quiz', index: 1, character_count: 80, option_count: 4, option_character_counts: [10, 12, 9, 11] }] }
      : decision.modality === 'explain_back' ? { subcards: [{ subcard_type: 'explain_back', index: 0, character_count: 60, prompt_character_count: 60 }] }
      : index === 4 ? { is_composite: true, subcards: [sub('explanation', text(3), 0), sub('explanation', LONG, 1)] } // repeats decision 4's card, then a long one
      : { subcards: [sub('explanation', text(index), 0)] };
    const common = { material_type: decision.card_type, modality: decision.modality, concept_ids: decision.target_concepts, structure,
      ...(index === 3 ? { links: [{ from_node_id: made[0], relation_type: 'remediates', created_by: 'tutor', reason_codes: ['repair_misconception'], rationale_summary: 'misconception on c1' }] } : {}) };
    if (kind === 'estimated') return { ...common, timing_source: 'estimated', cache_status: 'miss', cache_origin: 'fresh', asset_applicable: true, durations: { first_ms: 60000, complete_ms: 600000 }, descriptors: { content_duration_seconds: 15, renderer: 'remotion' } };
    marks.started(); advance(800); marks.first(); advance(1200);
    if (kind === 'cache_hit') return { ...common, timing_source: 'measured', cache_status: 'hit', cache_origin: 'product_cache', fresh_generation_cost_usd: price(AUTHOR) };
    if (index === 4) { meter.call({ ...AUTHOR, output_accepted: false }); meter.call({ ...AUTHOR, model_role: 'material_repair' }); } // an invalid draft, then a repair
    else meter.call(AUTHOR);
    return { ...common, timing_source: 'measured', cache_status: 'miss', cache_origin: 'fresh', material_signature: script[index].signature ?? `${decision.modality}:${index}` };
  };
  return { args: { topic, profile: profiles[0], profiles, tutor, hooks, learner, materialize, clock: () => time.now, debugText }, seen, made };
}

// A session that misreads a concept, gets it repaired, and runs four explanations in a row.
const REPAIR = [
  say('explanation', ['advance_goal'], ['c1'], 120, [claim('k1', 'c1', 'uncertain'), claim('k2', 'c2', 'not_yet_observed')]),
  say('quiz', ['advance_goal'], ['c1'], 90, [claim('k1', 'c1', 'misconception', { misconception_id: 'm1' }), claim('k2', 'c2', 'not_yet_observed')]),
  say('explanation', ['repair_misconception'], ['c1'], 150, [claim('k1', 'c1', 'misconception', { misconception_id: 'm1' }), claim('k2', 'c2', 'not_yet_observed')], { material: 'not_run', click: true }),
  say('explanation', ['repair_misconception'], ['c1'], 150, [claim('k1', 'c1', 'understood'), claim('k2', 'c2', 'not_yet_observed')], { material: 'cache_hit' }),
  say('explanation', ['advance_goal'], ['c1'], 120, [claim('k1', 'c1', 'understood'), claim('k2', 'c2', 'prerequisite_gap', { prerequisite: 'c0' })]),
  say('explanation', ['vary_modality', 'fill_prerequisite_gap'], ['c2'], 300, [claim('k1', 'c1', 'understood'), claim('k2', 'c2', 'uncertain')], { material: 'estimated' }),
  say('explain_back', ['advance_goal'], ['c2'], 400, [claim('k1', 'c1', 'understood'), claim('k2', 'c2', 'understood')]),
];
const START = [claim('k1', 'c1', 'not_yet_observed'), claim('k2', 'c2', 'not_yet_observed')];
const session = async (extra = {}) => runSession({ ...world({ script: REPAIR, start: START }).args, ...extra });

// ---------- Fixtures ----------

test('topic and profile fixtures are data: a second topic loads through the same code', () => {
  for (const id of ['logistic-regression', 'photosynthesis']) {
    const loaded = loadTopic(id);
    assert.equal(loaded.id, id);
    assert.ok(loaded.session_budget_seconds > 0 && loaded.max_decisions > 0);
  }
  assert.deepEqual(profiles.map(profile => profile.id), ['novice', 'intermediate', 'advanced']);
  // Reconciled at the Learning checkpoint: product names, with the eval's own labels; the material roles stay provisional.
  assert.equal(taxonomy.provisional, undefined);
  assert.deepEqual(roles.provisional_roles, ['material_generation', 'material_repair', 'material_review', 'provider_asset', 'render_compute']);
  assert.throws(() => loadTopic('no-such-topic'));
});

// ---------- The session loop ----------

test('a session stops on the Tutor\'s estimated learning time, not on a turn count', async () => {
  const bundle = await session();
  // 120 + 90 + 150 + 150 + 120 + 300 = 930 < 1200; + 400 = 1330 >= 1200 at decision 7.
  assert.equal(bundle.simulator.stop_reason, 'learning_budget');
  assert.equal(bundle.session.decisions, 7);
  assert.equal(bundle.session.learning_seconds, 1330);
  assert.equal(bundle.steps[6].elapsed_learning_seconds, 930);
});

test('the safety cap stops a session whose decisions are short', async () => {
  const short = Array.from({ length: 20 }, () => say('quiz', ['advance_goal'], ['c1'], 10, START));
  const { args } = world({ script: short, start: START });
  const bundle = await runSession({ ...args, maxDecisions: 15 });
  assert.equal(bundle.simulator.stop_reason, 'max_decisions');
  assert.equal(bundle.session.decisions, 15);
});

test('the Tutor never receives a profile label, and synthetic ids are opaque', async () => {
  for (const profile of profiles) {
    const { args, seen } = world({ script: REPAIR, start: START });
    const bundle = await runSession({ ...args, profile });
    const sent = JSON.stringify(seen) + JSON.stringify(bundle.events.map(({ user_id, canvas_id, session_id }) => ({ user_id, canvas_id, session_id })));
    for (const term of profileTerms(profiles)) assert.ok(!new RegExp(`\\b${term}\\b`, 'i').test(sent), `${term} reached the Tutor`);
    assert.match(bundle.session.user_id, /^sim-user-[0-9a-f]{10}$/);
  }
});

test('a learner who names their level stops the session before the Tutor sees it', async () => {
  const { args, seen } = world({ script: REPAIR, start: START, leakAt: 1 });
  const bundle = await runSession(args);
  assert.equal(bundle.simulator.stop_reason, 'profile_leak');
  assert.equal(seen.length, 2);
  assert.ok(!JSON.stringify(seen).includes('advanced'));
  assert.equal(bundle.events.at(-1).type, 'session_ended');
  assert.throws(() => assertNoProfileLeak({ history: ['I am a Novice'] }, profileTerms(profiles)), /novice/);
});

test('every event validates; the fold of the events is the recorded step list', async () => {
  const bundle = await session();
  for (const event of bundle.events) assert.deepEqual(validateEvent(event), []);
  assert.deepEqual(foldSession(bundle.events).steps, bundle.steps);
  const types = bundle.events.map(event => event.type);
  assert.equal(types[0], 'session_started');
  assert.equal(types.at(-1), 'session_ended');
  assert.equal(types.filter(type => type === 'tutor_decision_started').length, 7);
  assert.equal(types.filter(type => type === 'next_steps_ready').length, 6); // none before the first decision
  assert.ok(types.includes('canvas_context_changed'));
  assert.equal(bundle.steps[3].section_id, 's2');
  assert.deepEqual([bundle.steps[5].dive_id, bundle.steps[6].dive_id], ['hole-1', null]); // the context a decision ends in
});

// ---------- Timing ----------

test('timeline and derived latencies on a measured material', async () => {
  const { steps } = await session();
  const [one, two] = steps;
  assert.equal(one.timing.hook_backend_generation_ms, null);
  assert.equal(one.timing.tutor_decision_ms, 4000);
  assert.equal(one.timing.material_first_ready_ms, 800);
  assert.equal(one.timing.material_complete_ms, 2000);
  assert.equal(one.timing.click_to_first_material_ms, 4800);
  assert.equal(one.timing.click_to_complete_material_ms, 6000);
  assert.equal(one.timing.evaluation_ms, 500);
  assert.equal(one.timing.timing_source, 'measured');
  assert.equal(one.timing.asset_generation_ms, null);
  assert.ok(!('asset' in one.timing.sources)); // no expensive asset: no t9 invented
  // Decision 2 answers the learner's typed reply to decision 1: they waited 1.5 s for the hooks, typed over them, and the
  // reply was evaluated (0.5 s) before it was planned (4 s); the 0.8 s to the first material follows.
  assert.equal(two.timing.hook_backend_generation_ms, 1500);
  assert.equal(two.hooks_overridden, true);
  assert.equal(two.timing.hook_to_tutor_start_ms, null); // a typed turn: no click
  assert.equal(two.timing.click_to_first_material_ms, 5300); // the learner's reading is not a wait
  assert.deepEqual(two.waits.map(wait => [wait.kind, wait.ms]), [['before_options', 1500], ['after_click', 5300]]);
  // Decision 4 is a hook click (after decision 3): nothing is evaluated, the plan starts at the click.
  assert.deepEqual([steps[3].trigger, steps[3].timing.hook_to_tutor_start_ms, steps[2].timing.evaluation_ms, steps[3].learner_selected_option.id], ['hook', 0, null, 'h1']);
});

test('not_run and estimated material are never reported as measured', async () => {
  const { steps } = await session();
  const notRun = steps[2].timing, estimated = steps[5].timing;
  assert.equal(notRun.timing_source, 'not_run');
  assert.equal(notRun.material_complete_ms, null);
  assert.equal(notRun.click_to_complete_material_ms, null);
  assert.deepEqual(steps[2].waits.at(-1), { kind: 'after_click', ms: 4500, lower_bound: true, source: 'not_run' }); // evaluation + plan
  assert.equal(estimated.timing_source, 'estimated');
  assert.equal(estimated.material_complete_ms, 600000);
  assert.equal(estimated.click_to_complete_material_ms, 604500);
  assert.equal(estimated.sources.asset, 'estimated');
  assert.equal(estimated.sources.tutor_decision, 'measured');
});

test('a measured asset gets t9; the derived asset latency follows it', () => {
  const timing = deriveTiming({ t0_state_ready: 0, t1_hooks_start: 0, t2_hooks_ready: 1000, t3_hook_selected: 2000, t4_tutor_plan_start: 2000, t5_tutor_action_ready: 6000, t6_material_generation_start: 6000, t7_first_material_ready: 7000, t8_material_complete: 9000, t9_asset_ready: 600000 }, { timing_source: 'measured', cache_status: 'miss', asset_applicable: true });
  assert.equal(timing.asset_generation_ms, 594000);
  assert.equal(timing.click_to_asset_ready_ms, 598000);
  assert.equal(timing.sources.asset, 'measured');
});

// ---------- Metrics on the synthetic trace ----------

test('modality diversity, repetition and the flagged boring run', async () => {
  const { steps } = await session();
  const m = groupMetrics([steps], taxonomy);
  assert.deepEqual(m.modality.counts, { explanation: 5, quiz: 1, explain_back: 1 });
  assert.equal(m.modality.distinct, 3);
  assert.equal(m.modality.available, 25); // the product's 27 modality names less the expensive media, which were not available
  assert.equal(m.modality.max_run.length, 4);
  assert.deepEqual([m.modality.max_run.from.step, m.modality.max_run.to.step], [3, 6]);
  assert.equal(m.modality.switch_rate, 0.5);
  assert.equal(m.modality.active, 2);
  assert.equal(m.modality.passive, 5);
  assert.equal(m.modality.active_passive_ratio, 0.4);
  assert.ok(m.modality.normalized_entropy > 0 && m.modality.normalized_entropy < 1);
  const [run] = m.repetition.flagged_sequences;
  assert.equal(run.kind, 'same_modality');
  assert.equal(run.justified, null); // the reviewer decides
  assert.equal(m.repetition.max_consecutive_passive, 4);
  assert.deepEqual(m.repetition.explanation_only_sequences.map(entry => entry.length), [4]);
  assert.deepEqual(m.engagement.active_opportunity_candidates.map(entry => entry.step), [4, 5, 6]);
});

test('reason codes are checked against the evidence the decision was made on', async () => {
  const { steps } = await session();
  const { violations, checked, checks } = groupMetrics([steps], taxonomy).reason_consistency;
  assert.equal(checked, 8);
  // Step 4 repairs a misconception that is still there (ok); step 6 varies modality after three explanations (ok)
  // and fills the c0 gap on c2 (ok); step 5 advances c1, already understood - a violation.
  assert.deepEqual(violations.map(entry => [entry.step, entry.code]), [[5, 'advance_goal']]);
  assert.ok(checks.find(entry => entry.step === 3 && entry.code === 'repair_misconception').ok);
  const bare = groupMetrics([[{ step: 1, session_id: 's', tutor_decision: { modality: 'quiz', reason_codes: ['repair_misconception', 'invented_code'], target_concepts: ['c1'] }, evidence_before: [claim('k1', 'c1', 'understood')] }]], taxonomy).reason_consistency;
  assert.deepEqual(bare.violations.map(entry => entry.code), ['repair_misconception']);
  assert.deepEqual(bare.unchecked.map(entry => entry.code), ['invented_code']);
});

test('evidence: repair latency, transitions, time on understood material, stale decisions', async () => {
  const { steps } = await session();
  const e = groupMetrics([steps], taxonomy).evidence;
  assert.deepEqual(e.misconception_repair.repaired.map(({ claim: id, detected, resolved, latency }) => [id, detected, resolved, latency]), [['k1', 2, 4, 2]]);
  assert.deepEqual(e.prerequisite_repair.repaired.map(entry => entry.latency), [1]);
  assert.equal(e.already_understood_time_fraction, round3(120 / 1330));
  assert.deepEqual(e.not_yet_observed_at_end, []);
  assert.equal(e.progression_steps, 4);
  assert.equal(e.remediation_steps, 3);
  assert.ok(e.transitions_by_type['misconception -> understood'] === 1);
  // Step 4's evidence changed (k1 understood) and step 5 repeated its action, modality and target.
  assert.deepEqual(e.decisions_unchanged_after_evidence_change.map(entry => entry.step), [5]);
  const m = groupMetrics([steps], taxonomy).modality;
  assert.equal(m.after_evidence_state.misconception.explanation, 2);
  assert.equal(m.outcome_by_modality.explain_back.improved, 1);
});

test('hooks: curiosity vs generic commands, answer leaks, position, staleness, ignored hooks', async () => {
  assert.deepEqual(hookFlags('Learn softmax'), { generic_command: true, curiosity: false, reveals_answer: false });
  assert.deepEqual(hookFlags('What if every score were identical?'), { generic_command: false, curiosity: true, reveals_answer: false });
  assert.equal(hookFlags('Why is the output a probability? Because the sigmoid squashes it.').reveals_answer, true);
  const { steps } = await session();
  const h = groupMetrics([steps], taxonomy).hooks;
  assert.equal(h.sets, 6);
  assert.equal(h.selection_rate, round3(1 / 6)); // one click (after decision 3); the learner typed over the other five
  assert.equal(h.overridden_by_typed_request, 5);
  assert.deepEqual(h.selected_position, { 1: 1 });
  assert.equal(h.generic_command_rate, round3(6 / 18));
  assert.equal(h.curiosity_rate, round3(12 / 18));
  assert.equal(h.stale_suggestion_rate, 1); // the same set every time
  assert.equal(h.repeatedly_ignored, 2); // h2 and h3 shown six times, never picked
  assert.ok(h.unchanged_after_evidence_change >= 1);
  assert.ok(h.mean_distinctness > 0.5);
});

test('latency: waits, buckets, wait fraction, time to first active learning', async () => {
  const { steps } = await session();
  const l = groupMetrics([steps], taxonomy).latency;
  assert.deepEqual(l.tutor_decision.measured, { n: 7, mean: 4000, p50: 4000, p95: 4000, max: 4000 });
  assert.equal(l.complete_material.not_run, 1);
  assert.equal(l.complete_material.estimated.n, 1);
  assert.equal(l.complete_material.measured.n, 5);
  assert.equal(l.by_cache_status.hit.measured.n, 1);
  assert.equal(l.lower_bound_waits, 1);
  assert.equal(l.longest_wait_ms, 500 + 4000 + 60000); // the estimated first material, never mistaken for measured
  // Step 1's wait (4.8 s) + 120 s learning + step 2's waits (2 s + 4.8 s).
  assert.deepEqual(l.time_to_first_active_learning, { seconds: 131.6, wait_seconds: 11.6, learning_seconds: 120 });
  assert.equal(l.estimated_learning_seconds, 1330);
  assert.ok(l.learner_wait_fraction > 0 && l.learner_wait_fraction < 0.2);
  assert.equal(Object.values(l.wait_buckets).reduce((a, b) => a + b, 0), steps.flatMap(step => step.waits).length);
});

// ---------- Background work: backend time is not learner waiting ----------

// Hooks start with the material when it is passive (the learner only reads), once the learner is done when it is active.
const byMode = ({ decision }) => (taxonomy.modalities[decision.modality]?.mode === 'passive' ? 'with_material' : 'after_consumption');

test('hooks generated while the learner reads cost backend time but no wait', async () => {
  const { steps, events } = await session({ hookStart: byMode });
  const two = steps[1].timing; // hooks for decision 2, generated during decision 1's passive explanation
  assert.equal(two.hook_backend_generation_ms, 1500);
  assert.equal(two.hook_perceived_wait_ms, 0);
  assert.equal(two.hook_background_overlap_ms, 1500);
  assert.equal(two.options_blocking_ms, 0);
  assert.equal(two.sources.hook_wait, 'estimated'); // it depends on the simulated reading time
  assert.equal(two.hook_to_tutor_start_ms, null); // the learner typed over them: no click
  assert.equal(steps[1].hook_state_changed_after_start, true); // the typed answer then changed the evidence
  const three = steps[2].timing; // hooks after decision 2's active quiz: once the learner is done, fully blocking
  assert.deepEqual([three.hook_backend_generation_ms, three.hook_perceived_wait_ms, three.state_wait_before_options_ms, three.options_blocking_ms, three.sources.hook_wait], [1500, 1500, 0, 1500, 'measured']);
  // Appended out of time order (background), folded in time order.
  assert.ok(events.some((event, i) => i && event.t_ms < events[i - 1].t_ms));
  const l = groupMetrics([steps], taxonomy).latency;
  assert.equal(l.hook_perceived_wait.estimated.max, 0);
  assert.equal(l.hooks.measured.n, 6);
  // Every background set was ready before the learner was; the estimated blocking left is the estimated material (step 6).
  assert.deepEqual(steps.flatMap(step => step.waits).filter(wait => wait.kind === 'before_options' && wait.source === 'estimated').map(wait => wait.ms), [0, 0, 0, 0, 0]);
  assert.equal(l.blocking_wait_seconds_by_source.estimated, 64.5);
  // Hook sets 2, 3, 5, 6 and 7 were generated before the learner's typed reply changed the evidence (4 was clicked).
  assert.equal(groupMetrics([steps], taxonomy).hooks.generated_before_evidence_changed, 5);
  // Same backend work as when every hook set waits for the learner; less of it is waiting.
  const serial = groupMetrics([(await session()).steps], taxonomy).latency;
  assert.equal(l.total_backend_generation_seconds, serial.total_backend_generation_seconds);
  assert.ok(l.total_learner_blocking_wait_seconds < serial.total_learner_blocking_wait_seconds);
});

test('session totals keep backend generation and learner blocking apart', async () => {
  const { steps } = await session();
  const l = groupMetrics([steps], taxonomy).latency;
  // Backend: 7 decisions x 4 s, 6 hook sets x 1.5 s, 6 evaluations x 0.5 s (a click is never evaluated), 5 measured
  // materials x 2 s = 50 s.
  assert.equal(l.total_backend_generation_seconds, 50);
  assert.equal(l.total_learner_blocking_wait_seconds, l.waiting_time_seconds);
  assert.notEqual(l.total_learner_blocking_wait_seconds, l.total_backend_generation_seconds);
});

// ---------- Cost ----------

test('pricing is versioned; a cost is reported, else computed, else unknown - never invented', () => {
  assert.equal(price({ model_id: 'claude-opus-5-5', usage: { input_tokens: 1e6, output_tokens: 1e6 } }), 24);
  const cached = priceCall({ model_id: 'claude-sonnet-5-5', usage: { input_tokens: 1e6, output_tokens: 0, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 1e6 } });
  assert.deepEqual([cached.cost_usd, cached.cost_status, cached.pricing_version, cached.pricing_effective_date], [4.7, 'computed', 'anthropic-first-party-2026-09-25', '2026-09-25']);
  assert.equal(cached.prompt_cache_saved_usd, 1.3); // reads at input price minus their cost, less the write premium
  assert.equal(priceCall({ model_id: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 10 }, date: '2026-01-01' }).cost_status, 'unknown'); // before any version
  assert.equal(priceCall({ model_id: 'claude-opus-5-5', usage: { input_tokens: 1000 } }).cost_status, 'partial'); // the output never arrived
  assert.equal(priceCall({ model_id: 'claude-opus-5-5', usage: { input_tokens: 1e6, output_tokens: 0 }, speed: 'fast' }).cost_usd, 8);
  assert.deepEqual(['cost_usd', 'cost_status'].map(key => priceCall({ model_id: 'claude-opus-5-5', usage: { input_tokens: 1, output_tokens: 1 }, provider_reported_cost_usd: 0.5 })[key]), [0.5, 'provider_reported']);
  assert.equal(priceCall({ model_id: 'jev-1.13.0', usage: {} }).cost_status, 'unknown');
});

test('the ledger refuses an unbounded Anthropic call and stops at the ceiling; JEV stays apart', () => {
  const ledger = createLedger(4);
  assert.throws(() => ledger.record({ provider: 'anthropic', model_id: 'claude-unknown', model_role: 'tutor', usage: { input_tokens: 1, output_tokens: 1 } }), /no price/);
  ledger.record({ provider: 'anthropic', model_id: 'claude-opus-5-5', model_role: 'tutor', usage: { input_tokens: 500000, output_tokens: 50000 } }); // $3.00
  const learner = ledger.reserve({ body: { model: 'claude-sonnet-5-5', max_tokens: 1000, messages: [{ role: 'user', content: 'x'.repeat(3000) }] }, role: 'learner_simulator' });
  // $3 spent + the learner's reservation + a 200 kB reviewer request (over 200000 input tokens at $4, 16000 output at $20) > $4.
  assert.throws(() => ledger.reserve({ body: { model: 'claude-opus-5-5', max_tokens: 16000, messages: [{ role: 'user', content: 'x'.repeat(200000) }] }, role: 'session_reviewer' }), err => err.code === 'COST_CEILING');
  ledger.settle(learner, { provider: 'anthropic', model_id: 'claude-sonnet-5-5', model_role: 'learner_simulator', usage: { input_tokens: 900, output_tokens: 100 } });
  assert.equal(ledger.summary().anthropic.by_role.tutor.usd, 3);
  ledger.record({ ...JEV, latency_ms: 180 });
  ledger.record({ ...JEV, latency_ms: 3000, outcome: 'timeout' });
  let jev = ledger.summary().external['typesafe:jev'];
  assert.deepEqual([jev.calls, jev.ok, jev.failed, jev.usd, jev.unknown_cost_calls, jev.cost_status], [2, 1, 1, null, 2, 'unknown']); // never a fake $0
  assert.equal(ledger.spent(), round6(3 + (900 * 2 + 100 * 10) / 1e6)); // JEV never counts against the Anthropic ceiling
  ledger.record({ ...JEV, model_id: 'typesafe-ai/jev', provider_reported_cost_usd: 0.0000126 });
  jev = ledger.summary().external['typesafe:jev'];
  assert.deepEqual([jev.usd, jev.unknown_cost_calls, jev.cost_status, jev.lower_bound], [0.000013, 2, 'partial', true]);
});

test('cost is attributed once per call: decision, hook set, material, session; the eval\'s own calls apart', async () => {
  const bundle = await session();
  const c = groupMetrics([bundle.steps], taxonomy, roles).cost;
  const [planner, hooks, author, sim] = [PLANNER, HOOKER, AUTHOR, SIM].map(price);
  assert.deepEqual([c.decision_costs[0].decision_shared_cost_usd, c.decision_costs[0].decision_material_cost_usd, c.decision_costs[0].unknown_cost_calls], [planner, author, 1]); // JEV: unknown, counted
  assert.equal(c.decision_costs[1].decision_shared_cost_usd, round6(planner + hooks)); // a hook set belongs to the decision that used it
  assert.equal(c.total_usd, round6(7 * planner + 6 * hooks + 5 * author));
  assert.deepEqual([c.unknown_cost_calls, c.lower_bound, c.cost_status], [6, true, 'partial']); // six typed replies were evaluated
  assert.deepEqual([c.by_model['jev-1.13.0'].usd, c.by_model['jev-1.13.0'].unknown_cost_calls], [null, 6]);
  assert.equal(c.by_model['claude-opus-5-5'].materials_influenced, 6);
  assert.equal(c.eval_only_cost_usd, round6(7 * sim)); // one learner move per decision, never product cost
  // The invalid draft still cost money: attempted counts it, wasted names it.
  assert.deepEqual([c.wasted_cost_usd, c.successful_output_cost_usd], [author, round6(c.total_usd - author)]);
  assert.equal(c.highest_cost_decision.step, 5);
  assert.equal(c.cache_savings_usd.materials, author); // the cache hit would have cost a fresh generation
  assert.equal(c.cache_savings_usd.prompt_cache, round6(7 * 1000 * (4 - 0.2) / 1e6));
  assert.equal(c.cost_per_learning_minute, round6(c.total_usd / (1330 / 60)));
  assert.equal(c.by_modality.explanation.count, 4); // the not_run explanation has no material
  // Every cost line is an event with full attribution and a price version.
  const line = bundle.events.find(event => event.type === 'model_call_completed' && event.model_role === 'material_generation');
  for (const key of ['call_id', 'session_id', 'user_id', 'canvas_id', 'decision_id', 'material_id', 'provider', 'model_id', 'cost_status', 'pricing_version']) assert.ok(line[key] != null, key);
});

// ---------- Materials ----------

test('material records keep authored, generation, dwell, active and completion time apart', async () => {
  const bundle = await session();
  const records = materialRecords([bundle.steps], { roles, taxonomy });
  assert.equal(records.length, 6); // one per generated material; the not_run one is counted, not recorded
  const [first] = records;
  assert.deepEqual([first.authored_duration_basis, first.generation_seconds, first.dwell_seconds, first.active_engagement_seconds, first.completion_seconds, first.engagement_source], ['estimated_reading', 2, 120, null, 120, 'estimated']);
  // The decision's shared cost (planning) is reported apart; the per-card number is labelled as an allocation.
  assert.deepEqual([first.cost.direct_material_cost_usd, first.cost.decision_shared_cost_usd, first.cost.allocated_shared_cost_usd, first.cost.allocation_method, first.cost.material_attributed_total_cost_usd],
    [price(AUTHOR), price(PLANNER), price(PLANNER), 'equal_split', round6(price(PLANNER) + price(AUTHOR))]);
  // Reading time is a versioned estimate, never learner truth.
  assert.deepEqual([first.authored_duration_source, first.structure.reading_estimate_versions, first.structure.subcards[0].reading_estimate], ['estimated', ['reading-v1'], { words_per_minute: 230, estimate_version: 'reading-v1', source: 'evaluation_default' }]);
  const slower = describeText(text(0), { words_per_minute: 115, estimate_version: 'reading-test', source: 'test' });
  assert.deepEqual([slower.estimated_reading_seconds, slower.reading_estimate.estimate_version], [Math.round((slower.word_count / 115) * 600) / 10, 'reading-test']);
  const repair = records.find(record => record.decision_id.endsWith(':d5'));
  assert.deepEqual([repair.cost.generation_model_cost_usd, repair.cost.wasted_cost_usd], [round6(2 * price(AUTHOR)), price(AUTHOR)]); // $0.45 invalid + $0.28 repair = $0.73, not $0.28
  const motion = records.find(record => record.decision_id.endsWith(':d6'));
  assert.deepEqual([motion.authored_duration_seconds, motion.generation_seconds, motion.generation_source, motion.generation_time_to_content_time_ratio], [15, 600, 'estimated', 40]);
  const hit = records.find(record => record.cache_status === 'hit');
  assert.equal(hit.cost.estimated_cost_saved_usd, price(AUTHOR));
  assert.equal(records.find(record => record.modality === 'explain_back').misconception_repaired, false);
  assert.equal(records.find(record => record.decision_id.endsWith(':d4')).misconception_repaired, true);
  const m = groupMetrics([bundle.steps], taxonomy, roles).materials;
  assert.deepEqual(m.decisions_without_material, { explanation: 1 });
  assert.equal(m.by_modality.explanation.count, 4);
  assert.equal(m.by_modality.explanation.dwell_seconds.n, 4); // one generic summary, no per-type code
});

test('real-user material events: playback, attempts, hints and dwell, measured', () => {
  let t = 0;
  const { events, emit } = createEmitter({ session_id: 'real-1', user_id: 'u-1', canvas_id: 'cv-1', clock: () => t });
  emit('session_started');
  emit('evidence_updated', { claims: [claim('k1', 'c1', 'misconception')], cause: 'session_start' });
  emit('tutor_decision_started', { decision_id: 'd1', trigger: 'opening' });
  t = 3000; emit('tutor_action_ready', { decision_id: 'd1', decision: { action_type: 'show', modality: 'video', reason_codes: ['repair_misconception'], target_concepts: ['c1'] }, estimated_learning_seconds: 60, planner_version: 'p@1' });
  emit('material_generation_started', { decision_id: 'd1', material_id: 'm-video' });
  t = 423000; emit('material_complete', { decision_id: 'd1', material_id: 'm-video', timing_source: 'measured', cache_status: 'miss', material_type: 'motion', modality: 'motion', descriptors: { content_duration_seconds: 15, renderer: 'remotion', repair_count: 1 } });
  emit('material_complete', { decision_id: 'd1', material_id: 'm-quiz', timing_source: 'measured', cache_status: 'miss', material_type: 'quiz', modality: 'quiz', descriptors: { question_count: 1 } });
  const at = (ms, type, fields) => { t = ms; emit(type, fields); };
  at(424000, 'material_visibility', { material_id: 'm-video', visible: true });
  at(425000, 'material_interaction', { material_id: 'm-video', interaction: 'play', position_seconds: 0 });
  at(440000, 'material_interaction', { material_id: 'm-video', interaction: 'ended', position_seconds: 15, played_seconds: 15 });
  at(441000, 'material_interaction', { material_id: 'm-video', interaction: 'replay', position_seconds: 0 });
  at(453000, 'material_interaction', { material_id: 'm-video', interaction: 'pause', position_seconds: 12, played_seconds: 12 });
  at(454000, 'material_visibility', { material_id: 'm-video', visible: false });
  at(455000, 'material_visibility', { material_id: 'm-quiz', visible: true });
  at(456000, 'material_interaction', { material_id: 'm-quiz', interaction: 'pointer', meaningful: false });
  at(460000, 'material_interaction', { material_id: 'm-quiz', interaction: 'attempt', result: 'incorrect', active_ms: 5000 });
  at(462000, 'material_interaction', { material_id: 'm-quiz', interaction: 'hint' });
  at(470000, 'material_interaction', { material_id: 'm-quiz', interaction: 'attempt', result: 'correct', active_ms: 8000 });
  at(470000, 'material_completed', { material_id: 'm-quiz' });
  emit('evidence_updated', { claims: [claim('k1', 'c1', 'understood')], cause: 'learner_message' });
  const line = (call_id, fields) => emit('model_call_completed', { call_id, decision_id: 'd1', provider: 'anthropic', cost_status: 'provider_reported', ...fields });
  line('c1', { model_id: 'claude-opus-5-5', model_role: 'tutor', cost_usd: 0.04 });
  line('c2', { model_id: 'claude-opus-5-5', model_role: 'material_generation', material_id: 'm-video', cost_usd: 0.3 });
  line('c3', { model_id: 'claude-sonnet-5-5', model_role: 'material_generation', material_id: 'm-quiz', cost_usd: 0.02 });
  emit('session_ended', { reason: 'dropped' });
  const [real] = foldSessions(events);
  const [video, quiz] = materialRecords([real.steps], { roles, taxonomy });
  // One decision, two related materials: still one decision. Its shared $0.04 stays the decision's; each card shows
  // its direct cost and a labelled equal-split share; totals sum the cost lines, never the allocations.
  assert.deepEqual([real.steps.length, real.steps[0].materials.length], [1, 2]);
  assert.deepEqual([video.cost.direct_material_cost_usd, video.cost.decision_shared_cost_usd, video.cost.allocated_shared_cost_usd, video.cost.material_attributed_total_cost_usd], [0.3, 0.04, 0.02, 0.32]);
  assert.equal(round6(video.cost.material_attributed_total_cost_usd + quiz.cost.material_attributed_total_cost_usd), 0.36);
  assert.equal(groupMetrics([real.steps], taxonomy, roles).cost.total_usd, 0.36);
  // A 15 s video watched once and then 12 s again: still 15 s long, 27 s played. It took 420 s to make: 28x.
  assert.deepEqual([video.authored_duration_seconds, video.total_playback_seconds, video.playback_completion_percent, video.watched_to_end, video.replay_count, video.pause_count], [15, 27, 100, true, 1, 1]);
  assert.deepEqual([video.generation_seconds, video.generation_time_to_content_time_ratio, video.dwell_seconds, video.first_play_delay_seconds, video.engagement_source], [420, 28, 30, 1, 'measured']);
  assert.equal(video.was_completed, false); // playing is not completing; completion_ratio comes from playback
  assert.equal(video.completion_ratio, 1);
  assert.deepEqual([quiz.attempt_count, quiz.correct_count, quiz.first_attempt_correct, quiz.eventual_correct, quiz.retry_count, quiz.hint_count], [2, 1, false, true, 1, 1]);
  assert.deepEqual([quiz.raw_interaction_count, quiz.interaction_count, quiz.active_engagement_seconds, quiz.completion_seconds, quiz.engagement_ratio], [4, 3, 13, 15, 0.867]);
  assert.deepEqual([quiz.time_to_first_attempt_seconds, quiz.time_to_correct_attempt_seconds, quiz.misconception_repaired], [5, 15, true]);
});

test('content shape: subcards are structure, not decisions; reading load before the first active element', async () => {
  const bundle = await session();
  const s = groupMetrics([bundle.steps], taxonomy, roles).structure;
  assert.equal(s.subcards, 8);
  assert.equal(s.average_subcards_per_tutor_decision, Math.round((8 / 7) * 100) / 100);
  assert.deepEqual(s.split_reasons, { prerequisite_then_application: 1, unknown: 1 });
  assert.equal(s.card_size_by_type.quiz.option_character_counts.n, 4);
  // Decision 1's card and decision 2's explanation subcard are read before decision 2's quiz subcard.
  const [load] = s.reading_load_before_first_active.segments;
  assert.deepEqual([load.subcards, load.reached_active, load.characters], [2, true, describeText(text(0)).character_count + describeText(text(1)).character_count]);
  const kinds = s.review_flags.map(flag => flag.kind).sort();
  assert.deepEqual(kinds, ['explanation_subcard_run', 'repeated_content', 'very_long_explanation_card']);
  assert.ok(s.review_flags.every(flag => flag.justified === null)); // for review, never failures
  assert.ok(!JSON.stringify(bundle.events).includes('the score becomes a probability')); // counts and hashes, no card text
});

test('the runner takes several materials from one decision without a schema change', async () => {
  const w = world({ script: REPAIR.map((row, i) => (i ? row : { ...row, click: true })), start: START });
  const base = w.args.materialize;
  let calls = 0;
  w.args.materialize = async (input, marks, meter) => {
    const one = await base(input, marks, meter);
    if (calls++) return one;
    return { ...one, materials: [{ ...one }, { material_type: 'quiz', modality: 'quiz', structure: { subcards: [{ subcard_type: 'quiz', index: 0, character_count: 50 }] } }] };
  };
  const bundle = await runSession(w.args);
  assert.equal(bundle.session.decisions, 7); // one decision, however many materials
  const [first, second] = bundle.steps;
  assert.deepEqual(first.materials.map(material => material.material_id.split(':').at(-1)), ['m1', 'm2']);
  assert.equal(bundle.learning_graph.nodes.length, 7);
  // The next selection leads from the decision's last material; each material keeps its own subcards.
  const selection = bundle.learning_graph.edges.find(edge => edge.relation_type === 'next_step_selection' && edge.decision_id === second.decision_id);
  assert.ok(selection.from_node_id.endsWith(':d1:m2'));
  const records = materialRecords([bundle.steps], { roles, taxonomy });
  assert.deepEqual(records.filter(record => record.decision_id === first.decision_id).map(record => [record.material_type, record.structure.subcard_count, record.cost.allocation_method]), [['explanation', 1, 'equal_split'], ['quiz', 1, 'equal_split']]);
});

// ---------- Graph ----------

test('the learning graph: explicit edges, offered hooks as candidates, Rabbit Holes, topology', async () => {
  const bundle = await runSession(world({ script: REPAIR, start: START, follow: true }).args); // the learner follows every hook
  const g = bundle.learning_graph;
  assert.equal(g.nodes.length, 6);
  assert.ok(!g.nodes.some(node => ['h1', 'h2', 'h3'].includes(node.node_id))); // unselected hooks never become nodes
  assert.deepEqual(g.metrics.edges_by_created_by, { learner: 5, tutor: 1 });
  assert.deepEqual(g.metrics.edges_by_relation, { next_step_selection: 5, remediates: 1 });
  const m = g.metrics;
  assert.deepEqual([m.node_count, m.edge_count, m.max_depth, m.max_breadth, m.branch_node_count, m.cross_link_count, m.longest_linear_run, m.main_path_length, m.shape], [6, 6, 5, 1, 1, 1, 4, 4, 'branching']);
  assert.deepEqual([m.rabbit_holes.count, m.rabbit_holes.opened_by, m.rabbit_holes.return_rate, m.rabbit_holes.max_depth], [1, { learner: 1 }, 1, 1]);
  assert.deepEqual([m.next_steps.sets_shown, m.next_steps.hook_branch_selection_rate, m.next_steps.unselected_option_rate, m.next_steps.repeated_unselected_goal_rate], [6, 1, 0.667, 0.833]);
  // Decision 3's material was not run: its selection committed to no node (and never to decision 4's).
  assert.deepEqual(m.next_steps.selections.map(selection => selection.selection_to_material_node_id?.split(':').at(-2) ?? null), ['d2', null, 'd4', 'd5', 'd6', 'd7']);
  assert.deepEqual([m.cards_before_first_branch, m.cards_before_first_learner_choice], [2, 1]);
  assert.equal(m.topology_by.modality.explain_back.leaf_rate, 1);
  // The graph at any earlier point: by decision 3, two nodes and one edge.
  const third = bundle.events.find(event => event.type === 'tutor_decision_started' && event.decision_id.endsWith(':d3')).t_ms;
  const early = learningGraph(bundle.events, { until: third });
  assert.deepEqual([early.nodes.length, early.edges.length], [2, 1]);
});

test('topology shapes are descriptive: linear vs branching', () => {
  const node = id => ({ node_id: id, created_at: 0, concept_ids: [], rabbit_hole_id: null });
  const edge = (from, to) => ({ edge_id: `${from}${to}`, from_node_id: from, to_node_id: to, relation_type: 'continues', created_by: 'tutor', reason_codes: [], created_at: 0 });
  const graph = (ids, pairs) => ({ nodes: ids.map(node), edges: pairs.map(([a, b]) => edge(a, b)), rabbit_holes: [], next_step_options: [] });
  const linear = graphMetrics(graph(['A', 'B', 'C', 'D'], [['A', 'B'], ['B', 'C'], ['C', 'D']]), { taxonomy });
  assert.deepEqual([linear.shape, linear.longest_linear_run, linear.max_depth, linear.linear_edge_ratio], ['linear', 4, 3, 1]);
  const branching = graphMetrics(graph(['A', 'B', 'C', 'D', 'E'], [['A', 'C'], ['C', 'B'], ['C', 'D'], ['D', 'E']]), { taxonomy });
  assert.deepEqual([branching.shape, branching.branch_node_count, branching.max_breadth, branching.linear_edge_ratio], ['branching', 1, 2, 0.5]);
});

// ---------- Real-user shape: events in, any grouping out ----------

test('events of many sessions aggregate by user, canvas, user x canvas, journey, section and planner', async () => {
  const events = [];
  for (const [i, profile] of profiles.slice(0, 2).entries()) for (const runId of ['a', 'b']) events.push(...(await session({ profile, runId: `${runId}${i}` })).events);
  const shuffled = events.toReversed(); // arrival order does not matter: each session folds in time order
  const agg = aggregateEvents(shuffled, taxonomy, { roles });
  assert.equal(agg.sessions, 4);
  assert.equal(agg.global.decisions, 28);
  assert.equal(Object.keys(agg.groups.user).length, 4);
  assert.equal(Object.keys(agg.groups.user_canvas).length, 4);
  assert.deepEqual(Object.keys(agg.groups.section).sort(), ['j1|s1', 'j1|s2']);
  assert.equal(agg.groups.planner['planner-x@v1'].decisions, 28);
  // A run never spans two sessions: four sessions of max run 4 still have max run 4.
  assert.equal(agg.global.modality.max_run.length, 4);
  assert.equal(agg.global.modality.counts.explanation, 20);
  assert.deepEqual(agg.completion.end_reasons, { learning_budget: 4 });
  assert.equal(foldSessions(shuffled).length, 4);
  // Cost and graph roll up the same way: per canvas, per user x canvas, globally.
  const canvases = Object.values(agg.groups.canvas);
  assert.equal(round6(canvases.reduce((n, entry) => n + entry.cost.total_usd, 0)), agg.global.cost.total_usd);
  assert.equal(agg.global.graph.node_count, 24);
  assert.equal(agg.global.graph.rabbit_holes.per_session, 1);
});

test('privacy: no credentials, hidden reasoning or email; learner words only under debug', async () => {
  const base = { eval_schema_version: 'tutor-session-eval-1', event_id: 'x:1', seq: 1, t_ms: 0, session_id: 'x', user_id: 'u', canvas_id: 'c' };
  assert.deepEqual(validateEvent({ ...base, type: 'session_ended', reason: 'done' }), []);
  assert.match(validateEvent({ ...base, type: 'tutor_action_ready', decision_id: 'd', decision: { thinking: '...' } }).join(), /forbidden field decision.thinking/);
  assert.match(validateEvent({ ...base, type: 'session_started', api_key: 'k' }).join(), /forbidden field api_key/);
  assert.match(validateEvent({ ...base, type: 'learner_message', kind: 'answer', input: 'typed', text: 'raw' }).join(), /under debug/);
  assert.match(validateEvent({ ...base, user_id: 'ana@example.com', type: 'session_started' }).join(), /user_id looks like an email/);
  assert.match(validateEvent({ ...base, type: 'session_started', owner_email: 'x' }).join(), /forbidden field owner_email/);
  const bundle = await runSession({ ...world({ script: REPAIR, start: START, debugText: false }).args });
  assert.ok(bundle.events.every(event => !('debug' in event)));
  assert.equal(groupMetrics([bundle.steps], taxonomy).decisions, 7); // analytics need no text
  const { emit } = createEmitter({ session_id: 's', user_id: 'u', canvas_id: 'c', clock: () => 0 });
  assert.throws(() => emit('tutor_action_ready', { decision_id: 'd' }), /needs decision/);
});

// ---------- Views, prompts, parsers ----------

test('the learner simulator never sees reasons, evidence, goals or hidden answers', async () => {
  const { steps } = await session();
  const view = learnerView({ material: steps[1].canvas_summary, options: steps[1].next_step_options }, [{ material: 'm', learner: 'l' }]);
  const json = JSON.stringify(view);
  for (const hidden of ['reason_codes', 'rationale', 'expected_evidence', 'evidence', 'learning_goal', 'misconception']) assert.ok(!json.includes(hidden), hidden);
  assert.deepEqual(Object.keys(view.options[0]), ['id', 'position', 'text']);
  const terms = profileTerms(profiles);
  assert.deepEqual(parseLearnerReply('{"selected_option_id":"h2","response":{"kind":"question","text":" why? ","choice_id":null}}', view, terms), { selected_option_id: 'h2', response: { kind: 'question', text: 'why?', choice_id: null } });
  assert.throws(() => parseLearnerReply('{"selected_option_id":"h9","response":{"kind":"answer","text":"x"}}', view, terms), /not one of/);
  assert.throws(() => parseLearnerReply('{"selected_option_id":"h1","response":{"kind":"answer","text":"as an intermediate learner"}}', view, terms), /intermediate/);
});

test('reviewer: sees no profile, must cite recorded steps, scores 1-5', async () => {
  const bundle = await session();
  const flagged = groupMetrics([bundle.steps], taxonomy).repetition.flagged_sequences;
  const view = reviewerView({ topic, steps: bundle.steps, flagged });
  assert.ok(!JSON.stringify(view).includes(bundle.simulator.profile));
  assert.ok(reviewerPrompt(view).system.includes('modality_appropriateness'));
  const scores = '"pedagogical_coherence":4,"responsiveness_to_evidence":4,"modality_appropriateness":3,"modality_variety":2,"pacing":3,"cognitive_load_balance":4,"engagement":3,"hook_quality":2,"progress_toward_goal":4,"unnecessary_repetition":2';
  const review = parseReview(`{"scores":{${scores}},"findings":[{"steps":[3,4,99],"text":"four explanations"}],"flagged_sequences":[{"id":"seq-1","justified":false,"note":"x"}]}`, view);
  assert.deepEqual(review.findings[0].steps, [3, 4]);
  assert.throws(() => parseReview(`{"scores":{${scores.replace('"pacing":3', '"pacing":7')}}}`, view), /pacing/);
  assert.throws(() => parseReview(`{"scores":{${scores}},"findings":[{"steps":[99],"text":"x"}]}`, view), /cites/);
  // Variety with purpose: diverse-but-unfit stays low, repetitive-but-justified keeps its fit.
  const metrics = groupMetrics([bundle.steps], taxonomy);
  assert.equal(varietyWithPurpose(metrics, review).score, round3(0.5 * metrics.modality.normalized_entropy));
  assert.equal(varietyWithPurpose(metrics, { ...review, flagged_sequences: [{ id: 'seq-1', justified: true }] }).score, 0.5);
});

test('the simulator reply schemas are strict and match what the parsers accept', () => {
  const strict = schema => {
    if (schema.type !== 'object') return schema.type === 'array' ? strict(schema.items) : true;
    return schema.additionalProperties === false && JSON.stringify([...schema.required].sort()) === JSON.stringify(Object.keys(schema.properties).sort()) && Object.values(schema.properties).every(strict);
  };
  assert.ok(strict(LEARNER_REPLY_SCHEMA));
  assert.ok(strict(REVIEW_SCHEMA));
  const view = learnerView({ options: HOOKS[0] }, []);
  const reply = { selected_option_id: 'h3', response: { kind: 'activity', text: 'B', choice_id: 'b' } };
  assert.deepEqual(parseLearnerReply(JSON.stringify(reply), view, profileTerms(profiles)), reply);
});

test('a cost-ceiling stop keeps every event recorded before it', async () => {
  const { args } = world({ script: REPAIR, start: START });
  const decide = args.tutor.decide;
  // The planner reserves its complete request (12 kB, 400 output tokens: about $0.06 at worst) before it is sent; the
  // reservation is settled by its reported usage.
  args.tutor.decide = async (input, meter) => {
    const ticket = meter.reserve({ body: { model: 'claude-opus-5-5', max_tokens: 400, messages: [{ role: 'user', content: 'x'.repeat(12000) }] } });
    return decide(input, { ...meter, call: (fields, own) => meter.call(fields, fields.model_role === 'tutor' ? ticket : own) });
  };
  const bundle = await runSession({ ...args, ledger: createLedger(0.08) });
  // Decision 1's planner ($0.0202 settled) and material ($0.013) leave too little of $0.08 for decision 2's worst case, so it
  // is refused before its planner call: one decision recorded, one listed as incomplete, every earlier cost line kept.
  assert.equal(bundle.simulator.stop_reason, 'cost_ceiling');
  assert.equal(bundle.session.decisions, 1);
  assert.equal(bundle.session.incomplete_decisions.length, 1);
  assert.equal(bundle.events.at(-1).reason, 'cost_ceiling');
  assert.equal(bundle.cost.anthropic.by_role.tutor.calls, 1);
});

// ---------- O1: a throwaway LEARN_DB per session ----------

test('each simulated session gets its own LEARN_DB; nothing is shared', async () => {
  const a = await freshLearnDb(), b = await freshLearnDb();
  try {
    a.sqlite.prepare('INSERT INTO canvases(org, name, owner_email, title) VALUES (?, ?, ?, ?)').run('ws', 'canvas-a', 'sim-user-a', 'A');
    assert.equal(a.sqlite.prepare('SELECT COUNT(*) AS n FROM canvases').get().n, 1);
    assert.equal(b.sqlite.prepare('SELECT COUNT(*) AS n FROM canvases').get().n, 0);
    assert.ok(b.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'learning_journeys'").get()); // the LP1 tables are there
    assert.equal((await a.LEARN_DB.prepare('SELECT COUNT(*) AS n FROM canvases').first()).n, 1); // the D1-shaped binding the product uses
  } finally { a.close(); b.close(); }
  assert.throws(() => a.sqlite.prepare('SELECT 1').get()); // thrown away
});

// ---------- Anti-hardcoding ----------

test('no harness source names a topic or a profile; renamed profiles and a new topic run unchanged', async () => {
  const sources = readdirSync(new URL('.', import.meta.url)).filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs'));
  const topics = readdirSync(new URL('fixtures/topics/', import.meta.url)).map(name => loadTopic(name.replace(/\.json$/, '')));
  const words = [...profiles.map(profile => profile.id), ...topics.flatMap(entry => [entry.id, ...entry.title.toLowerCase().split(/\s+/)])];
  for (const name of sources) {
    const code = readFileSync(new URL(name, import.meta.url), 'utf8').toLowerCase();
    for (const word of words) assert.ok(!new RegExp(`\\b${word}\\b`).test(code), `${name} names ${word}`);
  }
  const dir = mkdtempSync(join(tmpdir(), 'tutor-topic-'));
  writeFileSync(join(dir, 'binary-search.json'), JSON.stringify({ id: 'binary-search', title: 'Binary search', learner_goal: 'Find things fast in sorted lists.', opening_message: 'Teach me binary search.', session_budget_seconds: 600, max_decisions: 15 }));
  const renamed = profiles.map((profile, i) => ({ ...profile, id: `p${i}` })).toReversed();
  const bundle = await session({ topic: loadTopic('binary-search', new URL(`file:///${dir.replace(/\\/g, '/')}/`)), profile: renamed[0], profiles: renamed });
  assert.equal(bundle.simulator.stop_reason, 'learning_budget'); // the topic's own 600 s budget: 120+90+150+150+120 = 630
  assert.equal(bundle.session.decisions, 5);
  assert.match(learnerPrompt({ topic, profile: renamed[0], view: learnerView({}, []), terms: profileTerms(renamed) }).system, /p0, p1, p2|p2, p1, p0/);
});

test('a second topic runs through the same harness with no code change', async () => {
  const other = loadTopic('photosynthesis');
  const bundle = await session({ topic: other });
  assert.equal(bundle.simulator.topic, 'photosynthesis');
  assert.equal(bundle.events.find(event => event.type === 'learner_message').debug.text, other.opening_message);
  assert.equal(groupMetrics([bundle.steps], taxonomy).decisions, 7);
});

// ---------- Results files and the aggregate ----------

test('session files round-trip; aggregate.json has every section; table and CSV render', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tutor-session-'));
  for (const profile of profiles) writeSession(dir, await session({ profile, ledger: createLedger(4) }));
  writeFileSync(join(dir, 'run.json'), '{"run_id":"manifest, not a session"}');
  const bundles = readSessions(dir);
  assert.deepEqual(bundles.map(bundle => bundle.simulator.profile).sort(), ['advanced', 'intermediate', 'novice']);
  const agg = aggregate(bundles, taxonomy, { roles, cost: { total_usd: 0 } });
  for (const key of ['profiles', 'modality_histogram', 'card_type_histogram', 'reason_code_histogram', 'reason_by_modality', 'hook_metrics', 'evidence_metrics', 'engagement_metrics', 'latency_metrics', 'review_scores', 'variety_with_purpose', 'notable_sequences', 'cost_metrics', 'material_metrics', 'structure_metrics', 'graph_metrics_by_profile', 'graph_comparison']) assert.ok(key in agg, key);
  for (const key of ['total_usd', 'by_model', 'by_model_role', 'by_modality', 'by_material_type', 'by_canvas', 'by_session', 'mean_cost_per_decision', 'mean_cost_per_material', 'cost_per_learning_minute', 'attempted_cost_usd', 'successful_output_cost_usd', 'wasted_cost_usd', 'cache_savings_usd', 'unknown_cost_calls']) assert.ok(key in agg.cost_metrics, `cost_metrics.${key}`);
  assert.equal(agg.modality_histogram.all.explanation, 15);
  assert.equal(agg.notable_sequences.length, 3);
  assert.equal(agg.graph_comparison.novice.total_nodes, 6);
  assert.match(agg.taxonomy.source, /product's modality names/);
  assert.ok(bundles[0].cost.anthropic.total_usd > 0 && bundles[0].learning_graph.nodes.length === 6);
  const table = terminalTable(agg);
  assert.equal(table.split('\n').length, 4);
  assert.match(table, /novice/);
  assert.equal(stepsCsv(foldSessions(bundles.flatMap(bundle => bundle.events))).trim().split('\n').length, 1 + 21);
});
