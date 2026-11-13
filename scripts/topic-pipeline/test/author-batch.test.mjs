import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assembleReferences, assembleTests, createBatchedAuthor, holdUnnamed, mergeRetry, paths, planBatches, retryScope, routeFailure, validateBatch, validateFoundation, wireRegistry } from '../author-batch.mjs';
import { estimateTopic } from '../budget.mjs';

const A = 'demo-topic', D = 'packages/web/src/tutor-diagrams', P = paths(A, D);
const rows = Array.from({ length: 10 }, (_, i) => ({ id: `p${i + 1}`, prompt: `Question ${i + 1}?`, kind: 'flow', keywords: ['a', 'b'] }));
const dataModule = [
  { path: P.data, content: "export const toyData = { rows: [1, 2, 3] };\nexport const metadata = { topic: 'demo', artifactTopic: 'demo-topic', lessons: ['04'], sources: [] };\nexport function derived() { return { total: 6 }; }\n" },
  { path: P.dataTest, content: "import test from 'node:test';\ntest('ok', () => {});\n" },
];
// A part: one reference per assigned prompt, a test body and its replay rows.
const expression = (row, suffix = '') => `reference({ id: 'ml-${row.id}', keywords: ['k'], useWhen: 'u', overview: { spec: spec({ kind: 'flow' }) }, standard: { spec: spec({ kind: 'flow' }) }, deep: { spec: spec({ kind: 'flow' }) } })${suffix}`;
const part = (assigned, last = false, suffix = '') => ({
  prelude: '',
  references: assigned.map(row => ({ id: `ml-${row.id}`, expression: expression(row, suffix) })),
  derived: `() => ({ ${assigned.map(row => `${row.id}: data.derived().total`).join(', ')} })`,
  tests: `test('refs ${assigned[0].id}', () => assert.equal(references.length > 0, true));`,
  replay: assigned.map(row => ({ id: row.id, prompt: row.prompt, referenceId: `ml-${row.id}`, paraphrases: ['a', 'b', 'c', 'd', 'e'] })),
  walkthrough: last ? '# Walkthrough' : '',
});
const registry = "import { x } from './x.js';\nimport { lessonDecisionTreesReferences } from './lesson-decision-trees-references.js';\nexport const diagramReferences = Object.freeze([\n  ...a,\n  ...lessonDecisionTreesReferences,\n  ...b,\n]);\n";

test('prompts split into batches in prompt order', () => {
  assert.deepEqual(planBatches(rows, 4).map(group => group.length), [4, 4, 2]);
  assert.deepEqual(planBatches(rows, 4)[1].map(row => row.id), ['p5', 'p6', 'p7', 'p8']);
  assert.equal(planBatches(rows.slice(0, 8), 4).length, 2);
});

test('merged parts form a loadable references module whose derived() merges every part', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'author-batch-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const groups = planBatches(rows, 4), parts = groups.map((group, i) => part(group, i === groups.length - 1));
  const refs = assembleReferences(A, parts);
  await writeFile(join(directory, `topic-${A}-data.js`), dataModule[0].content);
  await writeFile(join(directory, `topic-${A}-replay-cases.json`), JSON.stringify({ prompts: parts.flatMap(item => item.replay) }));
  await writeFile(join(directory, `topic-${A}-references.js`), refs.content);
  const loaded = await import(pathToFileURL(join(directory, `topic-${A}-references.js`)).href);
  assert.equal(loaded.references.length, 10);
  assert.equal(loaded.references[0].id, 'ml-p1');
  assert.deepEqual(loaded.references[0].paraphrases, ['a', 'b', 'c', 'd', 'e']);
  assert.equal(loaded.references[0].promptOrigins[0].prompt, 'Question 1?');
  assert.equal(loaded.derived().total, 6);
  assert.equal(loaded.derived().p9, 6);
  assert.deepEqual(refs.ranges.map(range => range.index), [0, 1, 2]);
  const lineOf = id => refs.content.split('\n').findIndex(line => line.includes(`id: '${id}'`)) + 1;
  for (const [id, index] of [['ml-p1', 0], ['ml-p6', 1], ['ml-p10', 2]]) {
    const range = refs.ranges.find(item => lineOf(id) >= item.start && lineOf(id) <= item.end);
    assert.equal(range.index, index, `${id} line ${lineOf(id)} belongs to batch ${index}`);
  }
  const tests = assembleTests(A, parts);
  assert.match(tests.content, /^import test from 'node:test';\nimport assert from 'node:assert';/u);
  assert.equal(tests.ranges.length, 3);
});

test('registry wiring adds one import and one spread, once', () => {
  const wired = wireRegistry(registry, A);
  assert.match(wired, /import \{ references as topicDemoTopicReferences \} from '\.\/topic-demo-topic-references\.js';/u);
  assert.match(wired, /\.\.\.lessonDecisionTreesReferences,\n  \.\.\.topicDemoTopicReferences,/u);
  assert.equal(wireRegistry(wired, A), wired);
  assert.throws(() => wireRegistry('export const x = 1;', A), /anchors/u);
});

test('failures route to the batch that owns them', () => {
  const groups = planBatches(rows, 4), parts = groups.map((group, i) => ({ output: part(group, i === 2), ok: true }));
  const refs = assembleReferences(A, parts.map(item => item.output)), tests = assembleTests(A, parts.map(item => item.output));
  const context = { artifactTopic: A, parts, referenceRanges: refs.ranges, testRanges: tests.ranges };
  const route = text => routeFailure(text, context, D);
  assert.deepEqual([...route('flag for ml-p6 rule 6').parts], [1]);
  assert.deepEqual([...route('flag for ml-p1 and ml-p10').parts].sort(), [0, 2]);
  assert.deepEqual([...route(`at ${P.references.split('/').pop()}:${refs.ranges[2].start}:5`).parts], [2]);
  assert.deepEqual([...route(`at file:///x/${P.tests.split('/').pop()}:${tests.ranges[1].start}:3`).parts], [1]);
  assert.deepEqual([...route('see topic-walkthroughs/demo-topic.md').parts], [2]);
  assert.equal(route(`bad ${P.data.split('/').pop()}`).foundation, true);
  assert.deepEqual([...route('some unrecognised failure').parts], [0, 1, 2]);
});

function mockedAuthor(extra = {}) {
  const calls = [], logs = [];
  const call = async (kind, payload, assigned, last, merge, all, reject) => {
    calls.push({ kind, batch: payload.batch, feedback: payload.feedback, previous: payload.previous, assigned: (assigned ?? []).map(row => row.id) });
    const message = extra.fail?.(kind, payload);
    if (message) { if (kind === 'batch') reject?.(part(all ?? assigned, last)); throw new Error(message); }
    return kind === 'foundation' ? { files: dataModule } : part(assigned, last);
  };
  const author = createBatchedAuthor({ seed: extra.seed, log: entry => logs.push(entry), call, base: { topic: 'demo' }, rows, size: 4, artifactTopic: A, diagrams: D, registry, exemplar: [{ path: `${D}/lesson-x-data.js`, content: '' }, { path: `${D}/lesson-x-references.js`, content: '' }, { path: 'docs/walk.md', content: '' }] });
  return { author, calls, logs };
}

test('round 1 runs the foundation once, then every batch in parallel; the merged files cover the stage', async () => {
  const { author, calls } = mockedAuthor();
  const response = await author('', 1);
  assert.deepEqual(calls.map(call => call.kind), ['foundation', 'batch', 'batch', 'batch']);
  assert.deepEqual(calls.filter(call => call.kind === 'batch').map(call => call.batch).sort(), [1, 2, 3]);
  assert.deepEqual(response.files.map(file => file.path.split('/').pop()), ['topic-demo-topic-data.js', 'topic-demo-topic-data.test.mjs', 'topic-demo-topic-references.js',
    'topic-demo-topic-references.test.mjs', 'topic-demo-topic-replay-cases.json', 'demo-topic.md', 'reference-library.js']);
  assert.equal(JSON.parse(response.files.find(file => file.path === P.replay).content).prompts.length, 10);
  assert.match(response.files.find(file => file.path === P.registry).content, /topicDemoTopicReferences/u);
});

test('a failure is repaired by calling only the owning batch, with the verbatim feedback', async () => {
  const { author, calls } = mockedAuthor();
  await author('', 1);
  calls.length = 0;
  await author('{"id":"ml-p6","rule":6,"detail":"Display numbers absent from derived(): 7"}', 2);
  assert.deepEqual(calls.map(call => [call.kind, call.batch]), [['batch', 2]]);
  assert.match(calls[0].feedback, /Display numbers absent/u);
  assert.deepEqual(calls[0].previous.references.map(reference => reference.id), ['ml-p6'], 'the batch sees only its own named reference');
  calls.length = 0;
  await author('Error in topic-demo-topic-data.js:3', 3);
  assert.deepEqual(calls.map(call => call.kind), ['foundation', 'batch', 'batch', 'batch']);
});

test('a batch whose call failed is called again next round while finished batches are kept', async () => {
  let failures = 0;
  const { author, calls } = mockedAuthor({ fail: (kind, payload) => kind === 'batch' && payload.batch === 2 && failures++ === 0 ? 'Agent output failed schema validation' : null });
  await assert.rejects(author('', 1), /schema validation/u);
  calls.length = 0;
  const response = await author('Agent output failed schema validation', 2);
  assert.deepEqual(calls.map(call => [call.kind, call.batch]), [['batch', 2]]);
  assert.equal(response.files.length, 7);
});

test('a reference id used by two batches is rejected with its name', async () => {
  const call = async (kind, payload, assigned, last) => kind === 'foundation' ? { files: dataModule }
    : { ...part(assigned, last), replay: part(assigned, last).replay.map(row => ({ ...row, referenceId: 'ml-same' })) };
  const author = createBatchedAuthor({ call, base: {}, rows, size: 4, artifactTopic: A, diagrams: D, registry, exemplar: [] });
  await assert.rejects(author('', 1), /ml-same is used by more than one batch/u);
});

test('batch and foundation answers are validated against their assignment', () => {
  const assigned = rows.slice(0, 2);
  assert.doesNotThrow(() => validateBatch(part(assigned), assigned, false));
  assert.throws(() => validateBatch(part(rows.slice(0, 1)), assigned, false), /assigned prompt ids/u);
  assert.throws(() => validateBatch({ ...part(assigned), replay: part(assigned).replay.map(row => ({ ...row, prompt: 'changed' })) }, assigned, false), /verbatim/u);
  assert.throws(() => validateBatch(part(assigned, false), assigned, true), /walkthrough/u);
  assert.throws(() => validateFoundation({ files: [dataModule[0]] }, { topic: 'decision-trees', dryRun: true, repoRoot: '.' }, P), /./u);
});

test('the preflight estimate counts one foundation plus ceil(12 / size) batch calls per round at the batch ceiling', () => {
  const config = { limits: { authorRounds: 5, verifyRounds: 2, regenerateOnce: true, perLessonUsd: 150 }, prices: { 'claude-fable-5-1': { inputPerMillionUsd: 10, outputPerMillionUsd: 50 }, 'claude-sonnet-5-5': { inputPerMillionUsd: 2, outputPerMillionUsd: 10 },
    'gpt-6.1-sol': { inputPerMillionUsd: 2, outputPerMillionUsd: 10 }, 'jev-latest': { inputPerMillionUsd: 1, outputPerMillionUsd: 0 } },
  anthropic: { reviewerModel: 'claude-fable-5-1', judgeModel: 'claude-sonnet-5-5', effort: 'high' }, openai: { authorModel: 'gpt-6.1-sol', reasoningEffort: 'high' } };
  const single = estimateTopic(config);
  const batched = estimateTopic({ ...config, limits: { ...config.limits, authorBatchSize: 4 } });
  // 5 rounds x 4 calls x (120000 in + 40000 out) vs 5 rounds x 1 call x (120000 in + 128000 out) at $2 / $10 per million
  assert.ok(Math.abs((batched - single) - (5 * 4 * (0.24 + 0.4) - 5 * (0.24 + 1.28))) < 1e-9);
});

test('replay ids go back to the prompts own id type (numbers in prompts.json)', async () => {
  const numeric = rows.map((row, i) => ({ ...row, id: i + 1 }));
  const call = async (kind, payload, assigned, last) => kind === 'foundation' ? { files: dataModule }
    : { ...part(assigned.map(row => ({ ...row, id: `n${row.id}` })), last), replay: assigned.map(row => ({ id: String(row.id), prompt: row.prompt, referenceId: `ml-n${row.id}`, paraphrases: ['a', 'b', 'c', 'd', 'e'] })) };
  const author = createBatchedAuthor({ call, base: {}, rows: numeric, size: 4, artifactTopic: A, diagrams: D, registry, exemplar: [] });
  const response = await author('', 1);
  const replay = JSON.parse(response.files.find(file => file.path === P.replay).content).prompts;
  assert.deepEqual(replay.map(row => row.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('feedback sent to a re-called batch is capped', async () => {
  const { capFeedback, FEEDBACK_LIMIT } = await import('../author-batch.mjs');
  assert.equal(capFeedback('short'), 'short');
  const capped = capFeedback('x'.repeat(FEEDBACK_LIMIT + 500));
  assert.ok(capped.length < FEEDBACK_LIMIT + 100 && /500 more characters/u.test(capped));
});

test('references the feedback does not name come back byte-identical from the previous answer', () => {
  const assigned = rows.slice(0, 4), previous = part(assigned), returned = part(assigned, false, ' /* rewritten */');
  const held = holdUnnamed(returned, previous, '{"id":"ml-p2","rule":6}');
  assert.deepEqual(held.references.map(reference => reference.expression), [previous.references[0].expression, returned.references[1].expression, previous.references[2].expression, previous.references[3].expression]);
  assert.deepEqual(held.replay.map(row => row.referenceId), ['ml-p1', 'ml-p2', 'ml-p3', 'ml-p4']);
  assert.equal(held.derived, returned.derived, 'the shared derived function stays the author\'s');
  assert.equal(holdUnnamed(returned, previous, 'Agent output failed schema validation'), returned, 'nothing is held when the feedback names no reference');
  assert.equal(holdUnnamed(returned, null, 'ml-p2'), returned, 'nothing is held on the first call');
  const dropped = holdUnnamed({ ...returned, references: [returned.references[1]], replay: [returned.replay[1]] }, previous, 'ml-p2');
  assert.deepEqual(dropped.references.map(reference => reference.id).sort(), ['ml-p1', 'ml-p2', 'ml-p3', 'ml-p4'], 'an unnamed reference the author dropped is restored');
});

test('a re-called batch keeps its unnamed references through the whole round loop', async () => {
  const call = async (kind, payload, assigned, last) => kind === 'foundation' ? { files: dataModule } : part(assigned, last, payload.round > 1 ? ' /* round ' + payload.round + ' */' : '');
  const author = createBatchedAuthor({ call, base: {}, rows, size: 4, artifactTopic: A, diagrams: D, registry, exemplar: [] });
  await author('', 1);
  const response = await author('{"id":"ml-p6"}', 2);
  const content = response.files.find(file => file.path === P.references).content;
  assert.match(content, /id: 'ml-p6'[^\n]*round 2/u);
  for (const id of ['ml-p5', 'ml-p7', 'ml-p8']) assert.doesNotMatch(content.split('\n').find(line => line.includes(`id: '${id}'`)), /round 2/u);
});

test('a re-called batch receives only the references the feedback names, and their feedback', async () => {
  const { author, calls, logs } = mockedAuthor();
  await author('', 1);
  calls.length = 0; logs.length = 0;
  const report = { topic: 'demo', figures: [{ id: 'ml-p6-brief', verdict: 'fix', reasons: ['axis'], layer: 'label' }, { id: 'ml-p5', verdict: 'ship', reasons: [], layer: 'label' }, { id: 'ml-p9', verdict: 'fix', reasons: ['x'], layer: 'label' }] };
  await author(JSON.stringify(report), 2);
  const batch2 = calls.find(call => call.batch === 2), batch3 = calls.find(call => call.batch === 3);
  assert.deepEqual(batch2.previous.references.map(reference => reference.id), ['ml-p6']);
  assert.deepEqual(batch2.previous.replay.map(row => row.referenceId), ['ml-p6']);
  assert.deepEqual(JSON.parse(batch2.feedback).figures.map(figure => figure.id), ['ml-p6-brief'], 'the feedback keeps only the figures naming its references');
  assert.deepEqual(batch3.previous.references.map(reference => reference.id), ['ml-p9']);
  assert.equal(calls.some(call => call.batch === 1), false, 'a batch the feedback does not name is not called');
  assert.deepEqual(logs.map(({ batch, mode, called, held }) => [batch, mode, called, held]), [[2, 'narrow', ['ml-p6'], ['ml-p5', 'ml-p7', 'ml-p8']], [3, 'narrow', ['ml-p9'], ['ml-p10']]], 'the round log says what each batch was sent and what was held');
});

test('a narrow retry replaces the named references in place and keeps every other reference byte-identical', () => {
  const assigned = rows.slice(0, 4), before = part(assigned), named = assigned[1];
  const scope = retryScope(before, assigned, '{"id":"ml-p2"}');
  assert.deepEqual(scope.rows.map(row => row.id), ['p2']);
  const returned = part([named], false, ' /* repaired */');
  const merged = mergeRetry({ ...returned, tests: 'complete tests' }, before);
  assert.deepEqual(merged.references.map(reference => reference.id), ['ml-p1', 'ml-p2', 'ml-p3', 'ml-p4']);
  assert.equal(merged.references[1].expression, returned.references[0].expression);
  for (const index of [0, 2, 3]) assert.equal(merged.references[index].expression, before.references[index].expression);
  assert.deepEqual(merged.replay.map(row => row.referenceId), ['ml-p1', 'ml-p2', 'ml-p3', 'ml-p4']);
  assert.equal(merged.tests, 'complete tests');
  assert.equal(retryScope(before, assigned, 'Agent output failed schema validation'), null, 'no reference named: the whole batch is called');
  assert.equal(retryScope(before, assigned, 'ml-p1 ml-p2 ml-p3 ml-p4'), null, 'every reference named: the whole batch is called');
  assert.equal(retryScope(null, assigned, 'ml-p2'), null, 'first call');
  assert.equal(retryScope(before, assigned, 'ml-p2 plain text failure').feedback, 'ml-p2 plain text failure', 'feedback that is not a verifier report stays whole');
});

test('a failed batch keeps the answer that was rejected, and a relaunch seeded from the snapshot repairs only the references the flags name', async () => {
  let failing = true;
  const first = mockedAuthor({ fail: (kind, payload) => kind === 'batch' && payload.batch === 2 && failing ? '{"flags":[{"id":"ml-p6","rule":5}]}' : null });
  await assert.rejects(first.author('', 1), /ml-p6/u);
  const snapshot = JSON.parse(JSON.stringify(first.author.snapshot()));   // what author/batches.json holds after the round
  assert.equal(snapshot.parts[1].ok, false);
  assert.deepEqual(snapshot.parts[1].rejected.references.map(reference => reference.id), ['ml-p5', 'ml-p6', 'ml-p7', 'ml-p8'], 'the rejected answer is kept');
  assert.deepEqual([0, 2].map(index => snapshot.parts[index].ok), [true, true]);
  failing = false;
  // A new process: same batches, seeded; the feedback is the last round's flags.
  const relaunch = mockedAuthor({ seed: snapshot });
  await relaunch.author('{"flags":[{"id":"ml-p6","rule":5,"detail":"axis"}]}', 2);
  assert.deepEqual(relaunch.calls.map(call => [call.kind, call.batch]), [['batch', 2]], 'no foundation and no accepted batch is called again');
  assert.deepEqual(relaunch.calls[0].assigned, ['p6'], 'the batch is called for the named reference only');
  assert.deepEqual(relaunch.calls[0].previous.references.map(reference => reference.id), ['ml-p6'], 'with its own rejected answer as the previous');
  assert.equal(relaunch.logs.find(entry => entry.batch === 2).mode, 'narrow');
  assert.ok(relaunch.logs.every(entry => !entry.foundation), 'the foundation is not asked again');
  const next = relaunch.author.snapshot();
  assert.equal(next.parts[1].ok, true);
  assert.equal(next.parts[1].rejected, null);
});

test('a seed that does not describe the same batches is ignored', async () => {
  const { author } = mockedAuthor({ seed: { foundation: dataModule, parts: [{ rowIds: ['other'], output: null, ok: true }] } });
  assert.equal(author.snapshot().foundation, null);
});
