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
import {
  LEARNER_REPLY_SCHEMA, REVIEW_SCHEMA, assertNoProfileLeak, createLedger, freshLearnDb, learnerPrompt, learnerView, loadProfiles,
  loadTaxonomy, loadTopic, parseLearnerReply, parseReview, profileTerms, readSessions, reviewerPrompt, reviewerView, runSession, usd, writeSession,
} from './harness.mjs';

const profiles = loadProfiles();
const taxonomy = loadTaxonomy();
const topic = loadTopic('logistic-regression');

// ---------- A scripted world: fake Tutor, hooks, learner, material on a fake clock ----------

const claim = (id, concept, state, extra = {}) => ({ claim: id, concept, state, ...extra });
// One scripted Tutor step: the decision, its estimated time, and the evidence after the learner's response.
const say = (modality, codes, targets, seconds, after, extra = {}) => ({
  decision: { action_type: extra.action_type ?? 'respond_text', modality, card_type: extra.card_type ?? modality, reason_codes: codes, rationale_summary: `because ${codes.join(', ')}`, target_concepts: targets, expected_evidence: extra.expected ?? null },
  seconds, after, material: extra.material ?? 'measured', signature: extra.signature ?? null,
});
const HOOKS = [
  [{ id: 'h1', position: 1, text: 'What if every score were identical?', learning_goal: 'g1' }, { id: 'h2', position: 2, text: 'Learn softmax', learning_goal: 'g2' }, { id: 'h3', position: 3, text: 'Why does a bigger input push the output toward one?', learning_goal: 'g3' }],
];

function world({ script, start = [], hookSets = HOOKS, chooseId = 'h1', leakAt = null, debugText = true }) {
  const time = { now: 0 };
  const advance = ms => { time.now += ms; };
  const seen = [];
  let index = 0, evidence = start;
  const tutor = {
    start: async () => ({ evidence: start, context: { journey_id: 'j1', section_id: 's1', canvas_version: 1 } }),
    decide: async input => {
      seen.push(input);
      advance(4000);
      const row = script[index];
      return { decision: row.decision, estimated_learning_seconds: row.seconds, available_modalities: Object.keys(taxonomy.modalities).filter(m => !taxonomy.modalities[m].expensive), planner: { model: 'planner-x', version: 'v1' }, planner_version: 'planner-x@v1', material_summary: `material ${index + 1} ${row.decision.modality}`, context: index === 2 ? { section_id: 's2' } : {}, tutor_input: { message: input.message } };
    },
    observe: async () => { advance(500); evidence = script[index].after; index++; return { evidence }; },
  };
  const hooks = async ({ decisions }) => { advance(1500); return { options: hookSets[(decisions - 1) % hookSets.length] }; };
  const learner = {
    choose: async () => { advance(5000); return { selected_option_id: chooseId }; },
    respond: async () => { advance(30000); return { response: { kind: index === leakAt ? 'answer' : 'answer', text: index === leakAt ? 'As an advanced learner I know this.' : `answer ${index + 1}` } }; },
  };
  const materialize = async ({ decision }, marks) => {
    const kind = script[index].material;
    if (kind === 'not_run') return { timing_source: 'not_run', cache_status: 'not_applicable' };
    if (kind === 'estimated') return { timing_source: 'estimated', cache_status: 'miss', cache_origin: 'fresh', asset_applicable: true, durations: { first_ms: 60000, complete_ms: 600000 } };
    marks.started(); advance(800); marks.first(); advance(1200);
    if (kind === 'measured_asset') { advance(3000); marks.asset(); }
    return { timing_source: 'measured', cache_status: kind === 'cache_hit' ? 'hit' : 'miss', cache_origin: kind === 'cache_hit' ? 'product_cache' : 'fresh', asset_applicable: kind === 'measured_asset', material_signature: script[index].signature ?? `${decision.modality}:${index}` };
  };
  return { args: { topic, profile: profiles[0], profiles, tutor, hooks, learner, materialize, clock: () => time.now, debugText }, seen };
}

// A session that misreads a concept, gets it repaired, and runs four explanations in a row.
const REPAIR = [
  say('explanation', ['advance_goal'], ['c1'], 120, [claim('k1', 'c1', 'uncertain'), claim('k2', 'c2', 'not_yet_observed')]),
  say('quiz', ['advance_goal'], ['c1'], 90, [claim('k1', 'c1', 'misconception', { misconception_id: 'm1' }), claim('k2', 'c2', 'not_yet_observed')]),
  say('explanation', ['repair_misconception'], ['c1'], 150, [claim('k1', 'c1', 'misconception', { misconception_id: 'm1' }), claim('k2', 'c2', 'not_yet_observed')], { material: 'not_run' }),
  say('explanation', ['repair_misconception'], ['c1'], 150, [claim('k1', 'c1', 'understood'), claim('k2', 'c2', 'not_yet_observed')], { material: 'cache_hit' }),
  say('explanation', ['advance_goal'], ['c1'], 120, [claim('k1', 'c1', 'understood'), claim('k2', 'c2', 'prerequisite_gap', { prerequisite: 'c0' })]),
  say('explanation', ['vary_modality', 'fill_prerequisite_gap'], ['c2'], 300, [claim('k1', 'c1', 'understood'), claim('k2', 'c2', 'uncertain')], { material: 'estimated' }),
  say('explain_back', ['advance_goal'], ['c2'], 400, [claim('k1', 'c1', 'understood'), claim('k2', 'c2', 'understood')]),
];
const START = [claim('k1', 'c1', 'not_yet_observed'), claim('k2', 'c2', 'not_yet_observed')];

// ---------- Fixtures ----------

test('topic and profile fixtures are data: a second topic loads through the same code', () => {
  for (const id of ['logistic-regression', 'photosynthesis']) {
    const loaded = loadTopic(id);
    assert.equal(loaded.id, id);
    assert.ok(loaded.session_budget_seconds > 0 && loaded.max_decisions > 0);
  }
  assert.deepEqual(profiles.map(profile => profile.id), ['novice', 'intermediate', 'advanced']);
  assert.equal(taxonomy.provisional, true);
  assert.throws(() => loadTopic('no-such-topic'));
});

// ---------- The session loop ----------

test('a session stops on the Tutor\'s estimated learning time, not on a turn count', async () => {
  const { args } = world({ script: REPAIR, start: START });
  const bundle = await runSession(args);
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
  const { args } = world({ script: REPAIR, start: START });
  const bundle = await runSession(args);
  for (const event of bundle.events) assert.deepEqual(validateEvent(event), []);
  assert.deepEqual(foldSession(bundle.events).steps, bundle.steps);
  const types = bundle.events.map(event => event.type);
  assert.equal(types[0], 'session_started');
  assert.equal(types.at(-1), 'session_ended');
  assert.equal(types.filter(type => type === 'tutor_decision_started').length, 7);
  assert.equal(types.filter(type => type === 'next_steps_ready').length, 6); // none before the first decision
  assert.ok(types.includes('canvas_context_changed'));
  assert.equal(bundle.steps[3].section_id, 's2');
});

// ---------- Timing ----------

test('timeline and derived latencies on a measured material', async () => {
  const { args } = world({ script: REPAIR, start: START });
  const { steps } = await runSession(args);
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
  assert.equal(two.timing.hook_backend_generation_ms, 1500);
  assert.equal(two.timing.hook_to_tutor_start_ms, 0);
  assert.equal(two.timing.click_to_first_material_ms, 4800); // the learner's 5 s of reading is not a wait
  assert.deepEqual(two.waits.map(wait => [wait.kind, wait.ms]), [['before_options', 2000], ['after_click', 4800]]);
});

test('not_run and estimated material are never reported as measured', async () => {
  const { args } = world({ script: REPAIR, start: START });
  const { steps } = await runSession(args);
  const notRun = steps[2].timing, estimated = steps[5].timing;
  assert.equal(notRun.timing_source, 'not_run');
  assert.equal(notRun.material_complete_ms, null);
  assert.equal(notRun.click_to_complete_material_ms, null);
  assert.deepEqual(steps[2].waits.at(-1), { kind: 'after_click', ms: 4000, lower_bound: true, source: 'not_run' });
  assert.equal(estimated.timing_source, 'estimated');
  assert.equal(estimated.material_complete_ms, 600000);
  assert.equal(estimated.click_to_complete_material_ms, 604000);
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
  const { args } = world({ script: REPAIR, start: START });
  const { steps } = await runSession(args);
  const m = groupMetrics([steps], taxonomy);
  assert.deepEqual(m.modality.counts, { explanation: 5, quiz: 1, explain_back: 1 });
  assert.equal(m.modality.distinct, 3);
  assert.equal(m.modality.available, 6); // expensive media were not available: not held against diversity
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
  const { args } = world({ script: REPAIR, start: START });
  const { steps } = await runSession(args);
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
  const { args } = world({ script: REPAIR, start: START });
  const { steps } = await runSession(args);
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
const round3 = x => Math.round(x * 1000) / 1000;

test('hooks: curiosity vs generic commands, answer leaks, position, staleness, ignored hooks', async () => {
  assert.deepEqual(hookFlags('Learn softmax'), { generic_command: true, curiosity: false, reveals_answer: false });
  assert.deepEqual(hookFlags('What if every score were identical?'), { generic_command: false, curiosity: true, reveals_answer: false });
  assert.equal(hookFlags('Why is the output a probability? Because the sigmoid squashes it.').reveals_answer, true);
  const { args } = world({ script: REPAIR, start: START });
  const { steps } = await runSession(args);
  const h = groupMetrics([steps], taxonomy).hooks;
  assert.equal(h.sets, 6);
  assert.equal(h.selection_rate, 1);
  assert.deepEqual(h.selected_position, { 1: 6 });
  assert.equal(h.generic_command_rate, round3(6 / 18));
  assert.equal(h.curiosity_rate, round3(12 / 18));
  assert.equal(h.stale_suggestion_rate, 1); // the same set every time
  assert.equal(h.repeatedly_ignored, 2); // h2 and h3 shown six times, never picked
  assert.ok(h.unchanged_after_evidence_change >= 1);
  assert.ok(h.mean_distinctness > 0.5);
});

test('latency: waits, buckets, wait fraction, time to first active learning', async () => {
  const { args } = world({ script: REPAIR, start: START });
  const { steps } = await runSession(args);
  const l = groupMetrics([steps], taxonomy).latency;
  assert.deepEqual(l.tutor_decision.measured, { n: 7, mean: 4000, p50: 4000, p95: 4000, max: 4000 });
  assert.equal(l.complete_material.not_run, 1);
  assert.equal(l.complete_material.estimated.n, 1);
  assert.equal(l.complete_material.measured.n, 5);
  assert.equal(l.by_cache_status.hit.measured.n, 1);
  assert.equal(l.lower_bound_waits, 1);
  assert.equal(l.longest_wait_ms, 60000 + 4000); // the estimated first material, never mistaken for measured
  // Step 1's wait (4.8 s) + 120 s learning + step 2's waits (2 s + 4.8 s).
  assert.deepEqual(l.time_to_first_active_learning, { seconds: 131.6, wait_seconds: 11.6, learning_seconds: 120 });
  assert.equal(l.estimated_learning_seconds, 1330);
  assert.ok(l.learner_wait_fraction > 0 && l.learner_wait_fraction < 0.2);
  assert.equal(Object.values(l.wait_buckets).reduce((a, b) => a + b, 0), steps.flatMap(step => step.waits).length);
});

// ---------- Real-user shape: events in, any grouping out ----------

test('events of many sessions aggregate by user, canvas, user x canvas, journey, section and planner', async () => {
  const events = [];
  for (const [i, profile] of profiles.slice(0, 2).entries()) for (const runId of ['a', 'b']) {
    const { args } = world({ script: REPAIR, start: START });
    events.push(...(await runSession({ ...args, profile, runId: `${runId}${i}` })).events);
  }
  const shuffled = events.toReversed(); // arrival order does not matter: seq orders each session
  const agg = aggregateEvents(shuffled, taxonomy);
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
});

test('privacy: no credentials or hidden reasoning in an event; learner words only under debug', async () => {
  const base = { trace_schema_version: 'tutor-trace-eval-0', event_id: 'x:1', seq: 1, t_ms: 0, session_id: 'x', user_id: 'u', canvas_id: 'c' };
  assert.deepEqual(validateEvent({ ...base, type: 'session_ended', reason: 'done' }), []);
  assert.match(validateEvent({ ...base, type: 'tutor_action_ready', decision_id: 'd', decision: { thinking: '...' } }).join(), /forbidden field decision.thinking/);
  assert.match(validateEvent({ ...base, type: 'session_started', api_key: 'k' }).join(), /forbidden field api_key/);
  assert.match(validateEvent({ ...base, type: 'learner_message', kind: 'answer', input: 'typed', text: 'raw' }).join(), /under debug/);
  assert.match(validateEvent({ ...base, user_id: 'ana@example.com', type: 'session_started' }).join(), /user_id looks like an email/);
  assert.match(validateEvent({ ...base, type: 'session_started', owner_email: 'x' }).join(), /forbidden field owner_email/);
  const { args } = world({ script: REPAIR, start: START, debugText: false });
  const bundle = await runSession(args);
  assert.ok(bundle.events.every(event => !('debug' in event)));
  assert.equal(groupMetrics([bundle.steps], taxonomy).decisions, 7); // analytics need no text
  const { emit } = createEmitter({ session_id: 's', user_id: 'u', canvas_id: 'c', clock: () => 0 });
  assert.throws(() => emit('tutor_action_ready', { decision_id: 'd' }), /needs decision/);
});

// ---------- Views, prompts, parsers ----------

test('the learner simulator never sees reasons, evidence, goals or hidden answers', async () => {
  const { args } = world({ script: REPAIR, start: START });
  const { steps } = await runSession(args);
  const view = learnerView({ material: steps[1].canvas_summary, options: steps[1].next_step_options }, [{ material: 'm', learner: 'l' }]);
  const text = JSON.stringify(view);
  for (const hidden of ['reason_codes', 'rationale', 'expected_evidence', 'evidence', 'learning_goal', 'misconception']) assert.ok(!text.includes(hidden), hidden);
  assert.deepEqual(Object.keys(view.options[0]), ['id', 'position', 'text']);
  const terms = profileTerms(profiles);
  assert.deepEqual(parseLearnerReply('{"selected_option_id":"h2","response":{"kind":"question","text":" why? ","choice_id":null}}', view, terms), { selected_option_id: 'h2', response: { kind: 'question', text: 'why?', choice_id: null } });
  assert.throws(() => parseLearnerReply('{"selected_option_id":"h9","response":{"kind":"answer","text":"x"}}', view, terms), /not one of/);
  assert.throws(() => parseLearnerReply('{"selected_option_id":"h1","response":{"kind":"answer","text":"as an intermediate learner"}}', view, terms), /intermediate/);
});

test('reviewer: sees no profile, must cite recorded steps, scores 1-5', async () => {
  const { args } = world({ script: REPAIR, start: START });
  const bundle = await runSession(args);
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

// ---------- Cost ----------

test('the ledger refuses a call whose worst case crosses the ceiling, and prices exactly', () => {
  const ledger = createLedger(4);
  assert.equal(usd('claude-opus-5-5', { input_tokens: 1e6, output_tokens: 1e6 }), 24);
  assert.equal(usd('claude-sonnet-5-5', { input_tokens: 1e6, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 1e6 }), 2 + 0.2 + 2.5);
  assert.throws(() => usd('claude-unknown', {}), /no price/);
  ledger.record({ role: 'tutor_planner', model: 'claude-opus-5-5', usage: { input_tokens: 500000, output_tokens: 50000 } }); // $3.00
  ledger.guard('learner_sim', ledger.worstCase({ model: 'claude-sonnet-5-5', inputChars: 3000, maxOutputTokens: 1000 }));
  // $3 spent + (600000 / 3 input tokens at $4 + 16000 output at $20) = $4.12 > $4.
  assert.throws(() => ledger.guard('reviewer', ledger.worstCase({ model: 'claude-opus-5-5', inputChars: 600000, maxOutputTokens: 16000 })), err => err.code === 'COST_CEILING');
  assert.equal(ledger.summary().anthropic.by_role.tutor_planner.usd, 3);
});

test('JEV is logged apart from the Anthropic ceiling, with a cost only when the provider reports one', () => {
  const ledger = createLedger(4);
  ledger.recordExternal({ role: 'jev', provider: 'typesafe', model: 'jev-1.13.0', ms: 180 });
  ledger.recordExternal({ role: 'jev', provider: 'typesafe', model: 'jev-1.13.0', ms: 3000, outcome: 'timeout' });
  let jev = ledger.summary().external.jev;
  assert.deepEqual([jev.calls, jev.ok, jev.failed, jev.cost_usd, jev.cost_status], [2, 1, 1, null, 'unknown']);
  assert.equal(ledger.spent(), 0); // never counted against the $4 Anthropic ceiling
  ledger.recordExternal({ role: 'jev', provider: 'typesafe', model: 'typesafe-ai/jev', ms: 200, billing: { cost_usd: 0.0000126, generation_id: 'gen_x' } });
  jev = ledger.summary().external.jev;
  assert.deepEqual([jev.cost_usd, jev.cost_status, jev.reported_cost_usd, jev.reported_calls], [null, 'partial', 0, 1]);
  const only = createLedger(4);
  only.recordExternal({ role: 'jev', provider: 'typesafe', ms: 200, billing: { cost_usd: 0.25 } });
  assert.deepEqual([only.summary().external.jev.cost_usd, only.summary().external.jev.cost_status], [0.25, 'reported']);
});

// ---------- Background work: backend time is not learner waiting ----------

// Hooks start with the material when it is passive (the learner only reads), after evidence when it is active.
const byMode = ({ decision }) => (taxonomy.modalities[decision.modality]?.mode === 'passive' ? 'with_material' : 'after_evidence');

test('hooks generated while the learner reads cost backend time but no wait', async () => {
  const { args } = world({ script: REPAIR, start: START });
  const { steps, events } = await runSession({ ...args, hookStart: byMode });
  const two = steps[1].timing; // hooks for decision 2, generated during decision 1's passive explanation
  assert.equal(two.hook_backend_generation_ms, 1500);
  assert.equal(two.hook_perceived_wait_ms, 0);
  assert.equal(two.hook_background_overlap_ms, 1500);
  assert.equal(two.options_blocking_ms, 0);
  assert.equal(two.sources.hook_wait, 'estimated'); // it depends on the simulated reading time
  assert.equal(two.hook_to_tutor_start_ms, 500); // the click came before the answer was committed
  assert.equal(steps[1].hook_state_changed_after_start, true); // the answer then changed the evidence
  const three = steps[2].timing; // hooks after decision 2's active quiz: after the evidence, fully blocking
  assert.deepEqual([three.hook_backend_generation_ms, three.hook_perceived_wait_ms, three.state_wait_before_options_ms, three.options_blocking_ms, three.sources.hook_wait], [1500, 1500, 500, 2000, 'measured']);
  // Appended out of time order (background), folded in time order.
  assert.ok(events.some((event, i) => i && event.t_ms < events[i - 1].t_ms));
  const l = groupMetrics([steps], taxonomy).latency;
  assert.equal(l.hook_perceived_wait.estimated.max, 0);
  assert.equal(l.hooks.measured.n, 6);
  // Every background set was ready before the learner was; the estimated blocking left is the estimated material (step 6).
  assert.deepEqual(steps.flatMap(step => step.waits).filter(wait => wait.kind === 'before_options' && wait.source === 'estimated').map(wait => wait.ms), [0, 0, 0, 0, 0]);
  assert.equal(l.blocking_wait_seconds_by_source.estimated, 64.5);
  // Hook sets 2, 5, 6 and 7 were generated before the learner's answer changed the evidence.
  assert.equal(groupMetrics([steps], taxonomy).hooks.generated_before_evidence_changed, 4);
  // Same backend work as when every hook set waits for evidence; less of it is waiting.
  const serial = groupMetrics([(await runSession(world({ script: REPAIR, start: START }).args)).steps], taxonomy).latency;
  assert.equal(l.total_backend_generation_seconds, serial.total_backend_generation_seconds);
  assert.ok(l.total_learner_blocking_wait_seconds < serial.total_learner_blocking_wait_seconds);
});

test('session totals keep backend generation and learner blocking apart', async () => {
  const { args } = world({ script: REPAIR, start: START });
  const { steps } = await runSession(args);
  const l = groupMetrics([steps], taxonomy).latency;
  // Backend: 7 decisions x 4 s, 6 hook sets x 1.5 s, 7 evaluations x 0.5 s, 5 measured materials x 2 s = 50.5 s.
  assert.equal(l.total_backend_generation_seconds, 50.5);
  assert.equal(l.total_learner_blocking_wait_seconds, l.waiting_time_seconds);
  assert.notEqual(l.total_learner_blocking_wait_seconds, l.total_backend_generation_seconds);
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
  const { args } = world({ script: REPAIR, start: START });
  const bundle = await runSession({ ...args, topic: loadTopic('binary-search', new URL(`file:///${dir.replace(/\\/g, '/')}/`)), profile: renamed[0], profiles: renamed });
  assert.equal(bundle.simulator.stop_reason, 'learning_budget'); // the topic's own 600 s budget: 120+90+150+150+120 = 630
  assert.equal(bundle.session.decisions, 5);
  assert.match(learnerPrompt({ topic, profile: renamed[0], view: learnerView({}, []), terms: profileTerms(renamed) }).system, /p0, p1, p2|p2, p1, p0/);
});

// ---------- Reply schemas ----------

test('the simulator reply schemas are strict and match what the parsers accept', async () => {
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
  const ledger = createLedger(0.01);
  const decide = args.tutor.decide;
  args.tutor.decide = async input => { ledger.guard('tutor', 0.004); ledger.record({ role: 'tutor', model: 'claude-opus-5-5', usage: { output_tokens: 200 } }); return decide(input); };
  const bundle = await runSession(args);
  assert.equal(bundle.simulator.stop_reason, 'cost_ceiling');
  assert.equal(bundle.session.decisions, 2);
  assert.equal(bundle.session.incomplete_decisions.length, 1); // the third was refused before the planner ran
  assert.equal(bundle.events.at(-1).reason, 'cost_ceiling');
});

// ---------- Results files and the aggregate ----------

test('session files round-trip; aggregate.json has the owner\'s sections; table and CSV render', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tutor-session-'));
  for (const profile of profiles) {
    const { args } = world({ script: REPAIR, start: START });
    writeSession(dir, await runSession({ ...args, profile }));
  }
  const bundles = readSessions(dir);
  assert.deepEqual(bundles.map(bundle => bundle.simulator.profile).sort(), ['advanced', 'intermediate', 'novice']);
  const agg = aggregate(bundles, taxonomy, { cost: { total_usd: 0 } });
  for (const key of ['profiles', 'modality_histogram', 'card_type_histogram', 'reason_code_histogram', 'reason_by_modality', 'hook_metrics', 'evidence_metrics', 'engagement_metrics', 'latency_metrics', 'review_scores', 'variety_with_purpose', 'notable_sequences']) assert.ok(key in agg, key);
  assert.equal(agg.modality_histogram.all.explanation, 15);
  assert.equal(agg.notable_sequences.length, 3);
  assert.equal(agg.taxonomy.provisional, true);
  const table = terminalTable(agg);
  assert.equal(table.split('\n').length, 4);
  assert.match(table, /novice/);
  assert.equal(stepsCsv(foldSessions(bundles.flatMap(bundle => bundle.events))).trim().split('\n').length, 1 + 21);
});

test('a second topic runs through the same harness with no code change', async () => {
  const other = loadTopic('photosynthesis');
  const { args } = world({ script: REPAIR, start: START });
  const bundle = await runSession({ ...args, topic: other });
  assert.equal(bundle.simulator.topic, 'photosynthesis');
  assert.equal(bundle.events.find(event => event.type === 'learner_message').debug.text, other.opening_message);
  assert.equal(groupMetrics([bundle.steps], taxonomy).decisions, 7);
});
