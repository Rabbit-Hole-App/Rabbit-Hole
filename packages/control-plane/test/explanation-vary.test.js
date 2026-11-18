// VAR-1 step 3: the request seed, and `vary` on a reference sampled where a selected reference reaches the author. No reference of the library carries `vary` yet: the fixture below is test-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { artifactFetch, generateArtifact, prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { selectDiagramReferences, selectWithSteer, selectForAuthor } from '../src/explanation-references.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import { parseTutorDiagram } from '../../web/src/tutor-diagrams/spec.js';
import { OWNER } from './explain-fixture.js';

const PROMPT = 'What does predicting the mean give as a regression baseline?';
const fixture = {
  id: 'fixture-mean-baseline', lessons: [], prompts: [PROMPT], keywords: ['mean baseline', 'regression', 'baseline'], useWhen: 'Show the constant mean prediction against a small set of targets.',
  spec: { version: 1, diagram: { kind: 'coordinate-plot', title: 'A constant mean baseline', x: { label: 'Sample', min: 1, max: 5, scale: 'linear' }, y: { label: 'Target', min: 0, max: 8 },
    series: [{ label: 'Targets', kind: 'scatter', points: [1, 4, 2, 5, 3].map((y, i) => ({ x: i + 1, y })) }],
    annotations: [{ kind: 'reference-line', axis: 'y', derive: 'series.0:mean', label: 'Mean prediction of {{d:annotations.0.value}}' }], caption: 'Illustrative values.' } },
  vary: Object.fromEntries([0, 1, 2, 3, 4].map(i => [`series.0.points.${i}.y`, [0, 8, 1]])),
};
const pick = seed => selectWithSteer({ prompt: PROMPT, from: [fixture], shapeFallback: false, ...(seed ? { seed } : {}) }).references[0];
const targets = ref => ref.spec.diagram.series[0].points.map(p => p.y);

test('a seeded request draws the reference the author copies: same seed same spec, another seed other inputs', () => {
  const a = pick('req-1'), again = pick('req-1'), b = pick('req-2');
  assert.equal(a.id, 'fixture-mean-baseline');
  assert.deepEqual(a, again);
  assert.notDeepEqual(targets(a), targets(b));
  assert.equal(JSON.stringify(a.spec.diagram.series[0].label), JSON.stringify(b.spec.diagram.series[0].label)); // structure and labels the same
  for (const ref of [a, b]) {
    const line = ref.spec.diagram.annotations[0], mean = targets(ref).reduce((x, y) => x + y, 0) / 5;
    assert.equal(line.value, Number(mean.toFixed(1)));
    assert.equal(line.label, `Mean prediction of ${line.value}`);
  }
});

test('without a seed the reference goes out at its written inputs, its token label printed', () => {
  const ref = pick(null);
  assert.deepEqual(targets(ref), [1, 4, 2, 5, 3]);
  assert.equal(ref.spec.diagram.annotations[0].label, 'Mean prediction of 3');
  assert.equal(fixture.spec.diagram.annotations[0].label, 'Mean prediction of {{d:annotations.0.value}}', 'the library object is never changed');
});

test('a draw that fails never fails the request: the reference goes out as written, one log line says why', t => {
  const logs = [], log = console.log; console.log = line => { logs.push(String(line)); }; t.after(() => { console.log = log; });
  const broken = { ...fixture, vary: { 'series.0.points.0.y': [5, 1, 1] } };
  const ref = selectWithSteer({ prompt: PROMPT, from: [broken], shapeFallback: false, seed: 's' }).references[0];
  assert.deepEqual(targets(ref), [1, 4, 2, 5, 3]);
  assert.equal(ref.spec.diagram.annotations[0].label, 'Mean prediction of 3'); // even then the author never sees a raw token
  assert.ok(logs.some(l => l.includes('explanation_vary_failed') && l.includes('fixture-mean-baseline')));
});

test('a part of a composed reference is never varied by the whole reference\'s paths', t => {
  const logs = [], log = console.log; console.log = line => { logs.push(String(line)); }; t.after(() => { console.log = log; });
  const composed = { ...fixture, id: 'fixture-composed', spec: { version: 1, diagram: { kind: 'comparison', variant: 'panels', title: 'Two', panels: [{ heading: 'One', diagram: fixture.spec.diagram }, { heading: 'Two', diagram: fixture.spec.diagram }] } },
    vary: { 'panels.0.diagram.series.0.points.0.y': [0, 8, 1] } };
  const required = selectWithSteer({ prompt: PROMPT, from: [composed], requiredKinds: ['coordinate-plot'], shapeFallback: false, seed: 's' }).references;
  assert.ok(required.length && required.every(ref => ref.sourceId === 'fixture-composed' && !('vary' in ref && ref.vary)));
  assert.ok(!logs.some(l => l.includes('explanation_vary_failed')), 'no draw was attempted on a part');
});

test('the library is untouched by a seed: every reference prompt selects byte-identical references with and without one', () => {
  let compared = 0;
  for (const [i, ref] of diagramReferences.entries()) {
    if (i % 4) continue; // every fourth reference here (about 15 s for all of them: the evidence script compares the whole library)
    const prompt = ref.prompts?.[0] ?? ref.keywords?.[0];
    if (!prompt) continue;
    const plain = selectDiagramReferences({ prompt, depth: 'standard' }), seeded = selectDiagramReferences({ prompt, depth: 'standard', seed: 'any-seed' });
    assert.equal(JSON.stringify(seeded), JSON.stringify(plain), ref.id);
    compared++;
  }
  assert.ok(compared > 100, `compared ${compared} references`);
});

test('the author request is byte-identical with and without a seed (no reference carries vary), and reports its seed', () => {
  for (const args of [PROMPT, 'How is a binary tree traversed in order?', 'Show a box plot', 'Explain softmax']) {
    const plain = prepareArtifactAuthorRequest({}, { command: 'explanation', args }), seeded = prepareArtifactAuthorRequest({}, { command: 'explanation', args, requestSeed: 'abc' });
    assert.equal(JSON.stringify(seeded.body), JSON.stringify(plain.body), args);
    assert.deepEqual([plain.requestSeed, seeded.requestSeed], [null, 'abc']);
  }
});

test('selectForAuthor passes the seed to the picked reference and to a single-diagram swap', () => {
  const { references } = selectForAuthor({ prompt: PROMPT, from: [fixture], seed: 'r' });
  assert.deepEqual(targets(references[0]), targets(pick('r')));
});

const bucket = () => { const puts = []; return { puts, async put(key, body) { puts.push({ key, record: JSON.parse(body) }); } }; };
const envWith = LEARN_MEDIA => ({ LEARN_MEDIA, CONTROL_PLANE: { fetch: async () => Response.json({ name: 'demo', org: OWNER.org, user_id: OWNER.userId }) } });
const post = (env, generate) => artifactFetch(new Request('https://dev.test/api/learn/artifact', { method: 'POST', body: JSON.stringify({ app: 'demo', command: 'explanation', args: PROMPT }) }), env, generate);
const ask = async () => Response.json({ content: [{ type: 'tool_use', id: 't1', name: 'ask_clarifying_question', input: { question: 'Which part?' } }], stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 } });

test('the route makes one seed per request, gives it to the author, and the archive record carries it', async () => {
  const media = bucket(), seen = [];
  await post(envWith(media), (env, input, options) => { seen.push(input.requestSeed); return generateArtifact(env, input, { ...options, callModel: ask }); });
  await post(envWith(media), (env, input, options) => { seen.push(input.requestSeed); return generateArtifact(env, input, { ...options, callModel: ask }); });
  assert.equal(seen.length, 2);
  assert.ok(seen.every(seed => typeof seed === 'string' && seed.length >= 32) && seen[0] !== seen[1]);
  assert.deepEqual(media.puts.map(p => p.record.requestSeed), seen);
});

test('a request that fails before the author still archives its seed, and a card is reproduced from the stored record', async () => {
  const media = bucket();
  await post(envWith(media), async () => { throw new Error('boom'); });
  assert.match(media.puts[0].record.requestSeed, /^[0-9a-f-]{36}$/);
  // The record holds the request and the seed: replaying the selection from them gives the same references, byte for byte.
  const { requestSeed, request } = media.puts[0].record;
  const replay = () => selectForAuthor({ prompt: request.args, from: [fixture], seed: requestSeed }).references;
  assert.equal(JSON.stringify(replay()), JSON.stringify(replay()));
  assert.notEqual(JSON.stringify(replay()), JSON.stringify(selectForAuthor({ prompt: request.args, from: [fixture], seed: 'someone-else' }).references));
  assert.doesNotThrow(() => parseTutorDiagram(replay()[0].spec));
});
