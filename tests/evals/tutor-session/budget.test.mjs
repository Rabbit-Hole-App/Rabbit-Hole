// Budget enforcement for a paid run, proven offline (docs/features/tutor-decision-eval.md §18): complete-request worst cases,
// reservations before every request (concurrent, retried and escalated ones included), the eval's own simulator and
// reviewer requests, and the ceiling's scope. No model is called; the real product path runs behind the stub boundary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUEST_OVERHEAD_TOKENS, requestWorstCase } from './cost.mjs';
import { LEARNER_MAX_TOKENS, REVIEWER_MAX_TOKENS, REVIEW_DIMENSIONS, createLedger, learnerPrompt, learnerRequest, learnerView, loadProfiles, loadTaxonomy, loadTopic, modelLearner, profileTerms, reviewHoldback, reviewerPrompt, reviewerRequest, reviewerView, runSession, simulatedIds } from './harness.mjs';
import { aggregate } from './metrics.mjs';
import { COVERAGE, HOOK_DEBOUNCE_MS, productWorld, providerBoundary, stubAnswers } from './product.mjs';

const topic = loadTopic('logistic-regression'), profiles = loadProfiles(), profile = profiles[0];
const usd = (input, rate, output, outRate) => Math.ceil(((input * rate + output * outRate) / 1e6) * 1e6) / 1e6;
const body = (content, extra = {}) => ({ model: 'claude-opus-5-5', max_tokens: 500, messages: [{ role: 'user', content }], ...extra });

test('a request\'s worst case comes from the complete request: its UTF-8 bytes, an API overhead and its own max_tokens', () => {
  const plain = body('x'.repeat(1000));
  const bytes = Buffer.byteLength(JSON.stringify(plain), 'utf8');
  assert.deepEqual(requestWorstCase(plain), { usd: usd(bytes + REQUEST_OVERHEAD_TOKENS, 4, 500, 20), input_tokens_bound: bytes + REQUEST_OVERHEAD_TOKENS, output_tokens_bound: 500, model_id: 'claude-opus-5-5' });
  // Bytes, not characters: two-byte text bounds at two tokens per character, where chars/3 claimed a third of one.
  assert.ok(requestWorstCase(body('é'.repeat(1000))).input_tokens_bound >= 2000 + REQUEST_OVERHEAD_TOKENS);
  // A cache breakpoint prices the input at the cache-write rate; fast mode doubles everything.
  const cached = body('x', { system: [{ type: 'text', text: 'policy', cache_control: { type: 'ephemeral' } }] });
  const n = Buffer.byteLength(JSON.stringify(cached), 'utf8') + REQUEST_OVERHEAD_TOKENS;
  assert.equal(requestWorstCase(cached).usd, usd(n, 5, 500, 20));
  const fast = requestWorstCase(body('x', { speed: 'fast' }));
  assert.equal(fast.usd, usd(fast.input_tokens_bound, 2 * 4, 500, 2 * 20));
  // A text document is bounded by its bytes; anything else has no offline bound and is refused, never guessed.
  assert.ok(requestWorstCase(body([{ type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'notes' } }, { type: 'text', text: 'q' }])).usd > 0);
  for (const refused of [
    { ...body('x'), max_tokens: undefined },
    { ...body('x'), model: undefined },
    body('x', { model: 'claude-unknown' }),
    body([{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA==' } }]),
    body([{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'AA==' } }]),
  ]) assert.throws(() => requestWorstCase(refused), { code: 'UNBOUNDED_REQUEST' });
});

test('reservations: requests in flight count together, usage settles them, a missing usage holds them, a cost over the bound is caught', () => {
  const big = body('x'.repeat(100000), { max_tokens: 10000 }); // about $0.6 at worst
  const ledger = createLedger(1);
  const a = ledger.reserve({ body: big, role: 'tutor' });
  assert.throws(() => ledger.reserve({ body: big, role: 'tutor_evaluator' }), { code: 'COST_CEILING' }); // a is still in flight
  ledger.settle(a, { provider: 'anthropic', model_id: 'claude-opus-5-5', model_role: 'tutor', usage: { input_tokens: 2000, output_tokens: 300 } });
  const b = ledger.reserve({ body: big, role: 'tutor_evaluator' });
  // A request that fails with no usage keeps its whole reservation as possible spend.
  ledger.settle(b, { provider: 'anthropic', model_id: 'claude-opus-5-5', model_role: 'tutor_evaluator', outcome: 'failed' });
  assert.equal(ledger.summary().anthropic.held_usd, b.usd);
  assert.equal(ledger.spent(), Math.round(((2000 * 4 + 300 * 20) / 1e6 + b.usd) * 1e6) / 1e6);
  // A reported cost above its reservation breaks the bound: recorded, and the session stops on it (harness budget()).
  const ok = createLedger(1), small = ok.reserve({ body: body('x', { max_tokens: 10 }) });
  const line = ok.settle(small, { provider: 'anthropic', model_id: 'claude-opus-5-5', model_role: 'tutor', usage: { input_tokens: 50000, output_tokens: 10 } });
  assert.equal(line.bound_violation, true);
  assert.equal(ok.violations.length, 1);
  // The run's limit (a parent ledger) refuses what a session's own limit would still allow.
  const run = createLedger(0.7), session = createLedger(1.3, { parent: run });
  session.reserve({ body: big });
  assert.throws(() => session.reserve({ body: big }), { code: 'COST_CEILING' });
  assert.equal(session.refused, 1);
});

test('the ceiling is Anthropic only, and an unknown JEV cost is never counted as zero', () => {
  const ledger = createLedger(4);
  const t = ledger.reserve({ body: body('x') });
  ledger.settle(t, { provider: 'anthropic', model_id: 'claude-opus-5-5', model_role: 'tutor', usage: { input_tokens: 1000, output_tokens: 100 } });
  const jev = ledger.reserve({ provider: 'typesafe', role: 'jev' });
  assert.equal(jev.usd, null); // outside the ceiling: nothing to reserve
  ledger.settle(jev, { provider: 'typesafe', model_id: 'jev-1.13.0', model_role: 'jev' });
  const s = ledger.summary();
  assert.equal(s.anthropic.total_usd, 0.006);
  assert.deepEqual(s.all_providers, { usd: null, lower_bound_usd: 0.006, unknown_cost_calls: 1, ceiling_scope: 'anthropic' });
  assert.equal(s.external['typesafe:jev'].usd, null);
});

test('the learner simulator and the reviewer send complete, bounded requests through the same reservations', async () => {
  const view = learnerView({ material: 'A short reply.', options: [{ id: 'h1', position: 1, text: 'What if?' }] }, []);
  const learner = learnerRequest(learnerPrompt({ topic, profile, view, terms: profileTerms(profiles) }));
  assert.deepEqual([learner.model, learner.max_tokens, learner.output_config.format.type], ['claude-sonnet-5-5', LEARNER_MAX_TOKENS, 'json_schema']);
  assert.ok(requestWorstCase(learner).input_tokens_bound > JSON.stringify(learner.output_config).length); // the schema is part of the request
  const review = reviewerRequest(reviewerPrompt(reviewerView({ topic, steps: [{ step: 1, tutor_decision: { action_type: 'respond_text' } }] })));
  assert.deepEqual([review.model, review.max_tokens], ['claude-opus-5-5', REVIEWER_MAX_TOKENS]);
  // A simulator that reserves before it would call: its lines are eval_only cost under the same ceiling.
  const boundary = providerBoundary(stubAnswers());
  try {
    const world = await productWorld({ topic, ids: simulatedIds({ runId: 'budget-sim', topic, profile }), boundary });
    const ledger = createLedger(100);
    const reply = async ({ view: seen }, meter) => {
      const request = learnerRequest(learnerPrompt({ topic, profile, view: seen, terms: profileTerms(profiles) }));
      const ticket = meter.reserve({ body: request, role: 'learner_simulator' });
      meter.call({ provider: 'anthropic', transport: 'stub', model_id: request.model, model_role: 'learner_simulator', usage: { input_tokens: 800, output_tokens: 60 } }, ticket);
      return { selected_option_id: null, response: { kind: 'answer', text: 'It squashes the score.' } };
    };
    try {
      const bundle = await runSession({ topic, profile, profiles, tutor: world.tutor, hooks: world.hooks, hookStart: world.hookStart, hookDelayMs: HOOK_DEBOUNCE_MS, materialize: world.materialize, learner: { reply }, ledger, runId: 'budget-sim', maxDecisions: 2 });
      const sim = ledger.lines.filter(line => line.model_role === 'learner_simulator');
      assert.equal(sim.length, 2);
      assert.ok(sim.every(line => line.reserved_usd >= line.cost_usd));
      assert.equal(bundle.cost.anthropic.by_role.learner_simulator.calls, 2);
    } finally { world.close(); }
  } finally { boundary.restore(); }
});

// Mid-session: a valid, active LP1 journey first (its start is outside the budget under test), then a session on a run
// ledger that earlier sessions have nearly exhausted. Every request settles at its full worst case (usage 'worst'), so the
// order and size of the reservations decide exactly which request is the first that cannot fit.
async function midSession(ledger) {
  const boundary = providerBoundary(stubAnswers({ usage: 'worst' }));
  try {
    const world = await productWorld({ topic, ids: simulatedIds({ runId: 'mid', topic, profile }), boundary });
    try {
      const started = await world.tutor.start({ reserve: () => null, call: () => {} });
      const sentAtStart = boundary.requests.filter(entry => entry.provider === 'anthropic').length;
      let typed = 0;
      const learner = { reply: async ({ view }) => (view.options.length && typed ? { selected_option_id: view.options[0].id, response: { kind: 'acknowledge', text: '' } } : { selected_option_id: null, response: { kind: 'answer', text: `Answer ${++typed}.` } }) };
      const bundle = await runSession({ topic, profile, profiles, tutor: { ...world.tutor, start: async () => started }, hooks: world.hooks, hookStart: world.hookStart, hookDelayMs: HOOK_DEBOUNCE_MS, materialize: world.materialize, learner, ledger, runId: 'mid', maxDecisions: 4 });
      return { bundle, boundary, started, sentAtStart };
    } finally { world.close(); }
  } finally { boundary.restore(); }
}

test('mid-session: with an active journey and a nearly exhausted ledger, a later request is refused before transport and the session stops with cost_ceiling', async () => {
  // A dry run in an identical world gives the session's requests in order, with their reservations and settled costs.
  const dry = createLedger(100);
  await midSession(dry);
  const lines = dry.lines.filter(line => line.provider === 'anthropic');
  const k = lines.findIndex(line => line.model_role === 'tutor' && line.decision_id?.endsWith(':d2')); // decision 2's planner
  assert.ok(k > 0, 'decision 1 sent requests before decision 2\'s planner');
  const before = i => lines.slice(0, i).reduce((sum, line) => sum + line.cost_usd, 0);
  const need = i => before(i) + lines[i].reserved_usd; // settled spend plus this request's reservation, when it is reserved
  const room = Math.max(...lines.slice(0, k).map((_, i) => need(i)));
  assert.ok(room < need(k), 'everything before decision 2\'s planner fits a room that it does not');
  // The run's $4.00 limit, nearly exhausted by earlier sessions; this session's own limit is $1.30.
  const run = createLedger(4);
  run.record({ provider: 'anthropic', model_id: 'claude-opus-5-5', model_role: 'earlier_sessions', provider_reported_cost_usd: Math.floor((4 - room) * 1e6) / 1e6 });
  const session = createLedger(1.3, { parent: run });
  const { bundle, boundary, started, sentAtStart } = await midSession(session);
  // The journey was valid and active before any budgeted request.
  assert.ok(started.context.journey_id && started.evidence.length > 0);
  // Decision 1 completed; decision 2's planner request was refused at the boundary and never reached the transport.
  assert.equal(bundle.session.decisions, 1);
  assert.deepEqual(boundary.refused, [{ provider: 'anthropic', role: 'tutor', code: 'COST_CEILING' }]);
  assert.equal(boundary.requests.filter(entry => entry.provider === 'anthropic').length - sentAtStart, k);
  assert.deepEqual([bundle.simulator.stop_reason, bundle.events.at(-1).reason, bundle.session.incomplete_decisions.length], ['cost_ceiling', 'cost_ceiling', 1]);
  assert.ok(run.spent() <= 4 && session.spent() <= room + 1e-9);
});

// A real-path session with a ledger: every request the product sends goes through the boundary's reservation first.
async function budgeted(ledger, answers = stubAnswers()) {
  const boundary = providerBoundary(answers);
  try {
    const world = await productWorld({ topic, ids: simulatedIds({ runId: 'budget', topic, profile }), boundary });
    let typed = 0;
    const learner = { reply: async ({ view }) => (view.options.length && typed ? { selected_option_id: view.options[0].id, response: { kind: 'acknowledge', text: '' } } : { selected_option_id: null, response: { kind: 'answer', text: `Answer ${++typed}.` } }) };
    try { return { bundle: await runSession({ topic, profile, profiles, tutor: world.tutor, hooks: world.hooks, hookStart: world.hookStart, hookDelayMs: HOOK_DEBOUNCE_MS, materialize: world.materialize, learner, ledger, coverage: world.coverage, runId: 'budget', maxDecisions: 4 }), boundary }; }
    finally { world.close(); }
  } finally { boundary.restore(); }
}

test('every product request is reserved before it is sent: escalations and retries are their own reservations; a refusal stops the session', async () => {
  // A JEV 429 on its first call: the product's client retries once, and the retry is metered as its own request.
  let jevCalls = 0;
  const answers = stubAnswers();
  const jev = answers.jev;
  answers.jev = request => (jevCalls++ ? jev(request) : new Response('{}', { status: 429 }));
  const ledger = createLedger(100);
  const { bundle, boundary } = await budgeted(ledger, answers);
  const sent = boundary.requests.filter(entry => entry.provider === 'anthropic');
  const lines = ledger.lines.filter(line => line.provider === 'anthropic');
  assert.equal(lines.length, sent.length); // one reservation settled per request sent
  assert.ok(lines.every(line => line.reserved_usd != null && line.reserved_usd >= line.cost_usd));
  assert.deepEqual([ledger.violations.length, ledger.refused, ledger.reserved()], [0, 0, 0]);
  assert.ok(lines.some(line => line.model_role === 'tutor_next_steps_escalation')); // an escalation reserved like any request
  assert.equal(boundary.requests.filter(entry => entry.provider === 'typesafe').length, jevCalls);
  assert.equal(ledger.lines.filter(line => line.provider === 'typesafe').length, jevCalls); // the JEV retry is a metered request too
  assert.deepEqual(bundle.coverage, COVERAGE);
  assert.ok(bundle.coverage.not_exercised.includes('material_generation') && /not established/.test(bundle.coverage.teaching_quality));
  // A ceiling that holds the diagnostic's reservation but not the path planner's: the path request is refused unsent inside
  // the journey route (which answers it as a planner failure), and the ledger still names the stop.
  const diagnostic = lines.find(line => line.model_role === 'journey_diagnostic');
  const tight = createLedger(diagnostic.reserved_usd + 0.01);
  const refusedRun = await budgeted(tight);
  assert.equal(refusedRun.bundle.simulator.stop_reason, 'cost_ceiling');
  assert.deepEqual(refusedRun.boundary.refused, [{ provider: 'anthropic', role: 'journey_path', code: 'COST_CEILING' }]);
  assert.equal(refusedRun.boundary.requests.filter(entry => entry.provider === 'anthropic').length, 1); // only the diagnostic was sent
  assert.deepEqual([refusedRun.bundle.session.decisions, refusedRun.bundle.events.at(-1).reason], [0, 'cost_ceiling']);
  assert.ok(tight.spent() <= diagnostic.reserved_usd + 0.01);
});

// The eval's own two calls through a scripted transport (evalCall): `answer` reads the view the request carries; usage is
// the request's full worst case ('worst') or a token count of what was sent and answered.
const scripted = (usage, answer) => Object.assign(async request => {
  const text = JSON.stringify(answer(JSON.parse(request.messages[0].content)));
  const counted = usage === 'worst' ? { input_tokens: requestWorstCase(request).input_tokens_bound, output_tokens: request.max_tokens } : { input_tokens: Math.ceil(JSON.stringify(request).length / 4), output_tokens: Math.ceil(text.length / 4) };
  return { id: 'msg_scripted', model: request.model, usage: counted, content: [{ type: 'text', text }] };
}, { kind: 'stub' });
const typedOrClick = () => { let n = 0; return view => (view.options.length && n++ % 2 ? { selected_option_id: view.options[0].id, response: { kind: 'acknowledge', text: '', choice_id: null } } : { selected_option_id: null, response: { kind: 'answer', text: 'It turns the weighted sum into a probability.', choice_id: null } }); };
const reviewOf = view => ({ scores: Object.fromEntries(REVIEW_DIMENSIONS.map(key => [key, 3])), findings: [{ steps: [view.steps[0].step], text: 'A scripted finding.' }], flagged_sequences: view.flagged_sequences.map(entry => ({ id: entry.id, justified: false, note: 'scripted' })) });

async function reviewed(usage, { session = 1.3, reviewer = true } = {}) {
  const boundary = providerBoundary(stubAnswers({ usage }));
  try {
    const world = await productWorld({ topic, ids: simulatedIds({ runId: 'review', topic, profile }), boundary });
    const run = createLedger(4), ledger = createLedger(session, { parent: run });
    try {
      const bundle = await runSession({ topic, profile, profiles, tutor: world.tutor, hooks: world.hooks, hookStart: world.hookStart, hookDelayMs: HOOK_DEBOUNCE_MS, materialize: world.materialize, learner: modelLearner({ topic, profile, profiles, transport: scripted(usage, typedOrClick()) }), reviewer: reviewer ? scripted(usage, reviewOf) : null, ledger, runId: 'review', maxDecisions: 15, budgetSeconds: 1e9 });
      return { bundle, boundary, run, ledger };
    } finally { world.close(); }
  } finally { boundary.restore(); }
}

test('the reviewer\'s worst case is held from the session\'s start: a session stopped by the ceiling is still reviewed inside its limits', async () => {
  const holdback = requestWorstCase(reviewHoldback({ topic, maxDecisions: 15 })).usd;
  // Every request at its full worst case: without the holdback the session spends its limit on decisions and no review fits.
  const bare = await reviewed('worst', { reviewer: false });
  const held = await reviewed('worst');
  assert.equal(held.bundle.simulator.stop_reason, 'cost_ceiling');
  assert.ok(held.bundle.session.decisions >= 1 && held.bundle.session.decisions < bare.bundle.session.decisions);
  // The review ran on the trace recorded so far, under the holdback, and everything stayed inside the session and run limits.
  const line = held.ledger.lines.find(entry => entry.model_role === 'session_reviewer');
  assert.deepEqual([held.bundle.review.status, held.bundle.review.holdback_usd, line.transport], ['ok', holdback, 'stub']);
  assert.ok(line.reserved_usd <= holdback && line.cost_usd <= line.reserved_usd);
  assert.ok(held.ledger.spent() <= 1.3 && held.run.spent() <= 4);
  assert.deepEqual([held.ledger.reserved(), held.run.reserved(), held.ledger.violations.length, held.boundary.errors.length], [0, 0, 0, 0]);
  // The simulator's moves are reserved calls too, re-checked by the strict parser.
  assert.equal(held.ledger.lines.filter(entry => entry.model_role === 'learner_simulator').length, held.bundle.session.decisions);
  // At low usage the session runs until the limit, and the review still fits inside it. Measured: 15 of 15 decisions on r28;
  // 14 on r29, whose journey requests are larger once the evaluate reply's evidence is adopted (the hook input's path.next,
  // the next_section offer): about $0.09 more per session at these token counts, so decision 15 no longer fits under $1.30
  // beside the reviewer's holdback. Beta item 5a (owner 2026-10-09): the stub evaluator answers every check 0.95, so every idea
  // is both stated and contradicted - contested, never a pass - and the session no longer reaches path.next; its requests
  // shrink back and all 15 decisions fit again, the review still inside the limit. Progression keeps the final-section rule
  // in a compact NEXT_SECTION_SYSTEM: the longer inherited wording needed $1.301242 at decision 15 (spent + holdback +
  // reservation). Equivalent compact wording restores 15 without changing the fixture, models, ceilings or reviewer holdback.
  const low = await reviewed('stub');
  assert.deepEqual([low.bundle.session.decisions, low.bundle.simulator.stop_reason, low.bundle.review.status], [15, 'max_decisions', 'ok']);
  assert.ok(low.ledger.spent() <= 1.3 && low.ledger.reserved() === 0);
  assert.equal(aggregate([low.bundle], loadTaxonomy()).review_scores.mean.pacing, 3);
  // A limit below the holdback: the session never starts, so nothing is sent and there is nothing to review.
  const none = await reviewed('stub', { session: holdback / 2 });
  assert.deepEqual([none.bundle.session.decisions, none.bundle.simulator.stop_reason, none.bundle.review.status, none.boundary.requests.length], [0, 'cost_ceiling', 'skipped', 0]);
});

test('a review that outgrows its holdback reserves again, and is recorded as refused, unsent, when that does not fit', async () => {
  // A scripted Tutor that sends nothing, so the holdback alone fills the limit; a 1-byte-per-step holdback is too small.
  const tutor = { start: async () => ({ evidence: [], context: {} }), decide: async () => ({ decision: { action_type: 'respond_text', modality: 'explanation', reason_codes: ['respond_to_question'] }, estimated_learning_seconds: 30, material_summary: 'A reply.' }) };
  const small = requestWorstCase(reviewHoldback({ topic, maxDecisions: 3, stepBytes: 1 })).usd;
  const ledger = createLedger(small + 1e-6);
  const bundle = await runSession({ topic, profile, profiles, tutor, hooks: async () => ({ options: [] }), learner: { reply: async () => ({ selected_option_id: null, response: { kind: 'answer', text: 'Yes.' } }) }, reviewer: scripted('stub', reviewOf), reviewStepBytes: 1, ledger, runId: 'small', maxDecisions: 3, budgetSeconds: 1e9 });
  assert.deepEqual([bundle.session.decisions, bundle.simulator.stop_reason, bundle.review.status, bundle.review.error.code], [3, 'max_decisions', 'refused', 'COST_CEILING']);
  assert.deepEqual([ledger.lines.length, ledger.reserved()], [0, 0]); // never sent, nothing left reserved
  assert.equal(aggregate([bundle], loadTaxonomy()).review_scores.mean, null); // an unscored review is not averaged
});
