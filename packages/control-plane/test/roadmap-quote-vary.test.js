import assert from 'node:assert/strict';
import test from 'node:test';
import { EXAMPLES_CAP_CHARS, PLAN_DELTA_BYTES, authorInput, authorRoute, generateRoadmapCard, quoteRoadmapCard, requestFingerprint } from '../src/roadmap/roadmap-generate.js';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { BYTES_PER_CHAR, QUOTE_ROOM_BYTES, capExamples } from '../src/explanation-example-cap.js';
import { planFromAnswers } from '../src/explanation-planner.js';
import { figuresBoundMicros } from '../src/explanation-figures.js';
import { requestSpendBound } from '../src/learn-spend.js';
import { toMicros } from '../src/learn-usage.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';

// GEN-1 G6 (rewritten from VAR-1's "the roadmap must never pass a seed"): the dispatch has its own requestSeed, so its body is NOT the quoted body (a varied reference is drawn with other
// numbers, a plan adds its statement, later G1 examples). There is no equality check any more. The quote stays stored as the audit and bounds the WORST such body; the guard is that bound.
const env = {}; // no Gemini key: the plan-model path, so the author call goes through callModel and no network is touched
const rec = { format: 'explanation', passageText: 'A learning curve plots error against training set size.', documentText: null, stepTitle: 'Learning curves',
  stepGoal: 'How can learning curves show whether more data may help?', claimsToCover: ['Training error rises and validation error falls as data grows.'],
  learnerInstruction: { original: '', revisions: [] }, teachingScope: { kind: 'whole' }, depth: 'balanced', sourceRef: null,
  cardId: 'card-1', stepId: 'step-1', proposalId: 'p-1', proposalVersion: 1, retry: 0 };
const access = { org: 'team', actorUserId: 'u-alice', actorEmail: 'u-alice@example.test', boardId: 'b-1', boardOwnerEmail: 'u-alice@example.test', role: 'owner', payerUserId: 'u-alice', app: 'learn' };
const authorOnlyBound = (e, quote) => quote.boundMicros - figuresBoundMicros(e);
const bodyBound = (body, route) => toMicros(requestSpendBound(body, route.model, route.provider === 'subscription' ? 'anthropic' : route.provider));

test('the dispatch of a step that selects the varied learning-curves reference is accepted under the quoted bound; its body is not required to be the quoted one', async () => {
  assert.ok(diagramReferences.find(r => r.id === 'learning-curves')?.vary, 'the library as written carries vary on learning-curves');
  const quote = await quoteRoadmapCard(env, rec);
  assert.equal(quote.outcome, 'quoted');
  const sent = [];
  const callModel = async (e, body, model) => { sent.push({ body, model }); throw new Error('stop after the body is captured'); };
  const out = await generateRoadmapCard(env, access, { authorizationId: 'a-1' }, {
    loadAccepted: async () => ({ ...rec, requestFingerprint: quote.requestFingerprint, boundMicros: quote.boundMicros }),
    withProviderCall: async e => ({ env: e, opId: 'op-1' }), callModel });
  assert.notEqual(out.code, 'request_over_bound', 'under the quoted bound');
  assert.equal(sent.length, 1, 'one author call');
  assert.ok(JSON.stringify(sent[0].body).includes('Learning curves compare error as data increases'), 'the step selected the learning-curves reference, written into the author body');
  const route = authorRoute(env, sent[0].model);
  assert.ok(bodyBound(sent[0].body, route) <= authorOnlyBound(env, quote), 'the dispatched body costs no more than the quoted author bound');
  assert.equal((await quoteRoadmapCard(env, rec)).requestFingerprint, quote.requestFingerprint, 'the quote is repeatable: no seed, no draw');
});

test('a body dearer than the quoted bound is refused before any provider call (request_over_bound); the quoted fingerprint is not compared', async () => {
  const quote = await quoteRoadmapCard(env, rec);
  let called = 0;
  const out = await generateRoadmapCard(env, access, { authorizationId: 'a-1' }, {
    loadAccepted: async () => ({ ...rec, requestFingerprint: quote.requestFingerprint, boundMicros: 1 }), // a bound no body can meet
    withProviderCall: async e => ({ env: e, opId: 'op-1' }), callModel: async () => { called++; throw new Error('must not be reached'); } });
  assert.equal(out.code, 'request_over_bound');
  assert.equal(called, 0, 'refused before the provider call');
  const wrongPrint = await generateRoadmapCard(env, access, { authorizationId: 'a-1' }, {
    loadAccepted: async () => ({ ...rec, requestFingerprint: 'not-the-fingerprint-of-anything', boundMicros: quote.boundMicros }),
    withProviderCall: async e => ({ env: e, opId: 'op-1' }), callModel: async () => { throw new Error('stop'); } });
  assert.notEqual(wrongPrint.code, 'request_mismatch', 'a different fingerprint no longer refuses the dispatch');
  assert.notEqual(wrongPrint.code, 'request_over_bound');
});

test('the roadmap dispatch passes its own requestSeed and writes an archive record of the card (the typed route\'s record, source roadmap)', async () => {
  assert.equal('requestSeed' in authorInput(rec, undefined, env).input, false, 'the quote\'s input has no seed: the seed is the dispatch\'s');
  const puts = [];
  const bucket = { put: async (key, text) => { puts.push({ key, record: JSON.parse(text) }); } };
  const seen = [];
  const generate = async (e, input, options) => { seen.push({ input, options }); return { result: 'validation_error', error: 'explanation_bad_diagram: x' }; };
  const dispatch = () => generateRoadmapCard({ ...env, RUNS: bucket }, access, { authorizationId: 'a-1' }, { loadAccepted: async () => ({ ...rec }), withProviderCall: async e => ({ env: e, opId: 'op-1' }), generate });
  await dispatch(); await dispatch();
  assert.equal(seen.length, 2);
  for (const { input, options } of seen) { assert.ok(typeof input.requestSeed === 'string' && input.requestSeed.length >= 16, 'a seed'); assert.equal(options.trace.requestSeed, input.requestSeed, 'the trace carries it'); assert.equal('planned' in input, false, 'no planned flag: the planner runs'); }
  assert.notEqual(seen[0].input.requestSeed, seen[1].input.requestSeed, 'each dispatch draws its own');
  assert.equal(puts.length, 2, 'one archive record per dispatch');
  for (const [i, { key, record }] of puts.entries()) {
    assert.match(key, /^explain-archive\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.json$/);
    assert.deepEqual([record.requestSeed, record.source, record.cardId, record.proposalId, record.outcome, record.userId], [seen[i].input.requestSeed, 'roadmap', 'card-1', 'p-1', 'validation_error', 'u-alice']);
    assert.equal(JSON.stringify(record).includes('example.test'), false, 'no email in the record');
  }
});

test('why the quote bounds the worst case: a seed changes the body (a varied reference is drawn), and the plan changes it more', () => {
  const built = authorInput(rec, undefined, env);
  const body = i => JSON.stringify(prepareArtifactAuthorRequest(env, i, built.options).body);
  assert.equal(body(built.input), body(built.input), 'no seed: the body repeats');
  assert.notEqual(body({ ...built.input, requestSeed: 'seed-a' }), body(built.input), 'a seed changes the body');
});

test('the limits of the quote (Reviewer 2026-11-18): examples capped at 4,500 characters at 2 bytes, a plan delta of 26,000 bytes; capExamples enforces the cap and a capped library block stays inside its bytes', () => {
  assert.deepEqual([EXAMPLES_CAP_CHARS, BYTES_PER_CHAR, PLAN_DELTA_BYTES, QUOTE_ROOM_BYTES], [4500, 2, 26000, 35000]);
  const bytes = s => new TextEncoder().encode(s).length;
  const block = diagramReferences.slice(0, 60).map(r => JSON.stringify({ id: r.id, spec: r.spec })).join('\n'); // one example per line, as the author sees them
  assert.ok(block.length > EXAMPLES_CAP_CHARS, 'the uncapped block is longer than the cap (so the cap does something)');
  const capped = capExamples(block);
  assert.ok(capped.length <= EXAMPLES_CAP_CHARS && block.startsWith(capped), 'cut to the cap, a prefix of the block');
  assert.ok(capped.length === EXAMPLES_CAP_CHARS || block[capped.length] === '\n', 'at a line end when the block has one');
  assert.ok(bytes(JSON.stringify(capped)) <= EXAMPLES_CAP_CHARS * BYTES_PER_CHAR, 'the capped block, JSON-escaped in the body, stays inside 2 bytes a character');
  assert.equal(capExamples('short'), 'short');
  assert.equal(capExamples('x'.repeat(5000)).length, EXAMPLES_CAP_CHARS, 'one long line is cut at the cap');
});

test('the quote bounds every planned, seeded dispatch body: the examples headroom and PLAN_DELTA_BYTES cover the library prompts x 24 kinds on the roadmap Gemini profile', async () => {
  const geminiEnv = { EXPLANATION_INTERACTIONS: 'true', GEMINI_API_KEY: 'k', FIREWORKS_API_KEY: 'k' };
  const kinds = ['flow', 'comparison', 'tree', 'sequence', 'cycle', 'relationship', 'transformation', 'layers', 'timeline', 'matrix', 'coordinate-plot', 'bar-chart', 'histogram', 'box-plot', 'heatmap', 'number-line', 'sample-set', 't-account', 'waterfall', 'argument', 'figure', 'tensor', 'token-links', 'block-stack'];
  const answers = k => ({ visualType: { choice: 'diagram', confidence: 0.95, probabilities: { diagram: 0.95, picture: 0.03, both: 0.02 } }, kind: { choice: k, confidence: 0.9, probabilities: { [k]: 0.9, flow: 0.1 } }, depthTreatment: { choice: 'mechanism', confidence: 0.8, probabilities: {} }, needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 } });
  const prompts = ['Show one boosting update that adds a residual correction', ...diagramReferences.filter((r, i) => i % 97 === 0).flatMap(r => (r.prompts || []).slice(0, 1))].slice(0, 6);
  const bytes = s => new TextEncoder().encode(s).length;
  let pairs = 0;
  for (const prompt of prompts) {
    const r = { ...rec, stepTitle: prompt.slice(0, 60), stepGoal: prompt };
    const quote = await quoteRoadmapCard(geminiEnv, r);
    assert.equal(quote.outcome, 'quoted');
    const built = authorInput(r, undefined, geminiEnv), q = prepareArtifactAuthorRequest(geminiEnv, built.input, built.options);
    for (const kind of kinds) {
      const d = prepareArtifactAuthorRequest(geminiEnv, { ...built.input, planned: true, plan: planFromAnswers(answers(kind), 'standard'), requestSeed: 'seed-x' }, built.options);
      if (d.result) continue;
      pairs++;
      assert.ok(bodyBound(d.body, authorRoute(geminiEnv, d.model)) <= authorOnlyBound(geminiEnv, quote), `${kind} on "${prompt.slice(0, 30)}": the dispatch body is under the quoted author bound`);
      assert.ok(bytes(JSON.stringify(d.body)) - bytes(JSON.stringify(q.body)) <= PLAN_DELTA_BYTES, `${kind}: the plan's growth fits the constant`);
    }
  }
  assert.ok(pairs >= 100, `${pairs} pairs checked`);
});
