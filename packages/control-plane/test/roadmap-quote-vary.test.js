import assert from 'node:assert/strict';
import test from 'node:test';
import { authorInput, authorRoute, generateRoadmapCard, quoteRoadmapCard, requestFingerprint } from '../src/roadmap/roadmap-generate.js';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';

// VAR-1: a library reference with `vary` is drawn from a request seed. The roadmap quotes a step's first author request at acceptance and refuses to send
// any other body (request_mismatch), so the quote and the dispatch must build the same body for a step that selects a varied reference (learning-curves).
const env = {}; // no Gemini key: the plan-model path, so the author call goes through callModel and no network is touched
const rec = { format: 'explanation', passageText: 'A learning curve plots error against training set size.', documentText: null, stepTitle: 'Learning curves',
  stepGoal: 'How can learning curves show whether more data may help?', claimsToCover: ['Training error rises and validation error falls as data grows.'],
  learnerInstruction: { original: '', revisions: [] }, teachingScope: { kind: 'whole' }, depth: 'balanced', sourceRef: null,
  cardId: 'card-1', stepId: 'step-1', proposalId: 'p-1', proposalVersion: 1, retry: 0 };
const access = { org: 'team', actorUserId: 'u-alice', actorEmail: 'u-alice@example.test', boardId: 'b-1', boardOwnerEmail: 'u-alice@example.test', role: 'owner', payerUserId: 'u-alice', app: 'learn' };

test('the roadmap quote and the dispatch send the same body for a step that selects the varied learning-curves reference (references as written)', async () => {
  assert.ok(diagramReferences.find(r => r.id === 'learning-curves')?.vary, 'the library as written carries vary on learning-curves');
  const quote = await quoteRoadmapCard(env, rec);
  assert.equal(quote.outcome, 'quoted');
  const sent = [];
  const callModel = async (e, body, model) => { sent.push({ body, model }); throw new Error('stop after the body is captured'); };
  const out = await generateRoadmapCard(env, access, { authorizationId: 'a-1' }, {
    loadAccepted: async () => ({ ...rec, requestFingerprint: quote.requestFingerprint, boundMicros: quote.boundMicros }),
    withProviderCall: async e => ({ env: e, opId: 'op-1' }), callModel });
  assert.notEqual(out.code, 'request_mismatch', 'the dispatched body is the quoted one');
  assert.equal(sent.length, 1, 'one author call');
  const text = JSON.stringify(sent[0].body);
  assert.ok(text.includes('Learning curves compare error as data increases'), 'the step selected the learning-curves reference, written into the author body');
  assert.equal(await requestFingerprint(sent[0].body, authorRoute(env, sent[0].model)), quote.requestFingerprint);
  // The quote is repeatable: no seed, no draw.
  assert.equal((await quoteRoadmapCard(env, rec)).requestFingerprint, quote.requestFingerprint);
});

test('why the roadmap must never pass a requestSeed: the same input with a seed draws other numbers into the body, so a quote would never match', () => {
  const built = authorInput(rec, undefined, env);
  assert.equal('requestSeed' in built.input, false, 'authorInput passes no requestSeed');
  const body = i => JSON.stringify(prepareArtifactAuthorRequest(env, i, built.options).body);
  assert.equal(body(built.input), body(built.input), 'no seed: the body repeats');
  const seeded = body({ ...built.input, requestSeed: 'seed-a' });
  assert.notEqual(seeded, body(built.input), 'a seed changes the body');
});
