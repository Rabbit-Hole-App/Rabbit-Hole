import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { assembleReferences, assembleTests, paths, prevalidatePayload } from '../author-batch.mjs';
import { buildConstraints, OUTPUT } from '../build-renderer-constraints.mjs';

const run = promisify(execFile);
const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../../..');
const A = 'demo', D = 'packages/web/src/tutor-diagrams', P = paths(A, D);
const dataModule = [{ path: P.data, content: "export const toyData = { rows: [1] };\nexport const metadata = { topic: 'demo', artifactTopic: 'demo', lessons: ['04'], sources: [] };\nexport function derived() { return { total: 1 }; }\n" }];
const flow = nodes => `{ kind: 'flow', title: 'Route', caption: 'Follow the route.', nodes: ${JSON.stringify(nodes)}, edges: [{ from: 'a', to: 'b' }] }`;
const part = (standardNodes, deepCaption = 'Worked example. $p=1/2$.') => ({
  prelude: `const good = ${flow([{ id: 'a', label: 'Read input', role: 'process' }, { id: 'b', label: 'Write output', role: 'outcome' }])};`,
  references: [{ id: 'ml-demo-flow', expression: `(() => { const standard = ${flow(standardNodes)}; return reference({ id: 'ml-demo-flow', keywords: ['route', 'flow path'], useWhen: 'a route', overview: { spec: spec(good) }, standard: { spec: spec(standard) }, deep: { spec: spec({ ...standard, caption: '${deepCaption}' }) } }); })()` }],
  derived: '',
  tests: "test('derived', () => { assert.ok(derived().total === 1); });",
  replay: [{ id: '1', prompt: 'How does it route?', referenceId: 'ml-demo-flow', paraphrases: ['a', 'b', 'c', 'd', 'e'] }],
  walkthrough: '',
});
const rows = [{ id: 1, prompt: 'How does it route?', kind: 'flow' }];

async function check(t, value, assigned = rows) {
  const directory = await mkdtemp(join(tmpdir(), 'prevalidate-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const request = prevalidatePayload({ artifactTopic: A, diagrams: D, value, dataModule, assigned, scratch: join(directory, 'scratch') });
  await writeFile(join(directory, 'in.json'), JSON.stringify(request));
  await run(process.execPath, [join(here, '../author-runtime.mjs'), 'prevalidate', join(directory, 'in.json'), join(directory, 'out.json')], { cwd: repoRoot });
  return JSON.parse(await readFile(join(directory, 'out.json'), 'utf8')).flags;
}

test('the batch payload carries the data module, references, tests and replay rows', () => {
  const request = prevalidatePayload({ artifactTopic: A, diagrams: D, value: part([]), dataModule, assigned: rows, scratch: 's' });
  assert.deepEqual(request.files.map(file => file.name), ['topic-demo-data.js', 'topic-demo-references.js', 'topic-demo-references.test.mjs', 'topic-demo-replay-cases.json']);
  assert.equal(request.entry, 'topic-demo-references.js');
  assert.deepEqual(JSON.parse(request.files[3].content).prompts[0].id, 1, 'replay ids take the prompt id type');
  assert.match(assembleReferences(A, [part([])]).content, /const parts/u);
  assert.match(assembleTests(A, [part([])]).content, /node:assert/u);
});

test('a valid batch has no flags', async t => {
  const flags = await check(t, part([{ id: 'a', label: 'Read input', role: 'process' }, { id: 'b', label: 'Write output', role: 'outcome' }]));
  assert.deepEqual(flags, []);
});

test('every invalid spec and a wrong kind come back together, before any round is spent', async t => {
  const flags = await check(t, part([{ id: 'a', label: 'Read input', role: 'process' }, { id: 'b', label: 'Write output', role: 'outcome' }, { id: 'c', label: 'Lost', role: 'process' }]),
    [{ id: 1, prompt: 'How does it route?', kind: 'tree' }]);
  assert.ok(flags.some(flag => flag.rule === 'spec' && /exactly one root|unreachable/u.test(flag.detail)), JSON.stringify(flags));
  assert.ok(flags.some(flag => flag.rule === 2 && /requires tree; ml-demo-flow has flow/u.test(flag.detail)), JSON.stringify(flags));
  assert.ok(flags.length >= 2);
});

test('a typed caption number outside a formula constant is flagged by the file-free linter rules', async t => {
  const flags = await check(t, part([{ id: 'a', label: 'Read input', role: 'process' }, { id: 'b', label: 'Write output', role: 'outcome' }], 'Worked example. $p=0.37$.'));
  assert.ok(flags.some(flag => flag.rule === 6), JSON.stringify(flags));
});

test('renderer-constraints.md is current and lists the refinement messages by kind', async () => {
  const content = await buildConstraints();
  assert.equal((await readFile(OUTPUT, 'utf8')).replace(/\r\n/g, '\n'), content, 'run: node scripts/topic-pipeline/build-renderer-constraints.mjs');
  for (const message of ['A flow needs exactly one root', 'A merge needs at least two incoming routes and exactly one outgoing route', 'A tree node side requires the binary layout']) assert.ok(content.includes(message), message);
  assert.match(content, /^## flow$/mu);
  assert.match(content, /^## tree$/mu);
});

test('a batch that asserts through data.derived() still satisfies the derived-assertion rule', async t => {
  const value = part([{ id: 'a', label: 'Read input', role: 'process' }, { id: 'b', label: 'Write output', role: 'outcome' }]);
  value.tests = "test('numbers', () => { const d = data.derived(); assert.ok(d.total === 1); });";
  assert.deepEqual(await check(t, value), []);
});

// Item 5 (reviewer 2026-11-13): the release suite's content contract runs before the round is spent, with the rule id in the flag.
test('a flow label that is not an action and two nodes with one label are flagged with their contract rule before stage 05', async t => {
  const flags = await check(t, part([{ id: 'a', label: 'Model output', role: 'process' }, { id: 'b', label: 'Model output', role: 'outcome' }]));
  const contract = flags.filter(flag => String(flag.rule).startsWith('content-contract:'));
  assert.ok(contract.some(flag => flag.rule === 'content-contract:flow-label-verb-first' && /nodes\.0\.label/u.test(flag.detail) && /Model output/u.test(flag.detail)), JSON.stringify(flags));
  assert.ok(contract.some(flag => flag.rule === 'content-contract:duplicate-node-label' && /repeats nodes\[0\]/u.test(flag.detail)), JSON.stringify(flags));
  assert.ok(contract.every(flag => flag.severity === 'error'));
});

test('a placeholder edge label is a contract error, and a label that follows the contract is not', async t => {
  const good = await check(t, part([{ id: 'a', label: 'Compute score', role: 'process' }, { id: 'b', label: 'Check threshold', role: 'outcome' }]));
  assert.deepEqual(good.filter(flag => String(flag.rule).startsWith('content-contract:')), []);
});

test('renderer-constraints.md carries the content contract: the rule ids, the unique-label rule and the verb list the release suite uses', async () => {
  const content = await buildConstraints();
  assert.match(content, /^## Content contract/mu);
  for (const rule of ['flow-label-verb-first', 'duplicate-node-label', 'placeholder-edge-label', 'math-delimiters', 'block-component-name']) assert.ok(content.includes(`- ${rule}:`), rule);
  assert.match(content, /Node labels must be unique within one node list/u);
  assert.match(content, /\bcompute\b/u);
  assert.match(content, /"Compute prediction" passes; "Prediction" and "Model output" fail/u);
});

// The author runtime runs from a copy inside the topic worktree (author.mjs): every file it imports must be in that copy, or stage 03 fails before the first call.
test('every relative import of author-runtime.mjs is copied into the topic worktree by author.mjs', async () => {
  const runtime = await readFile(join(here, '../author-runtime.mjs'), 'utf8'), author = await readFile(join(here, '../author.mjs'), 'utf8');
  const imports = [...runtime.matchAll(/from '\.\/([A-Za-z0-9./-]+\.mjs)'/gu)].map(match => match[1]);
  assert.ok(imports.length >= 2);
  for (const file of imports) assert.ok(author.includes(`'${file.split('/').pop()}'`), `${file} is imported by author-runtime.mjs but not copied by author.mjs`);
});

test('a math-delimiters flag carries the arrow hint, with a real backslash and no tab, and the constraints sheet says the same', async () => {
  const { contractFlags } = await import('../checks/content-contract.mjs');
  const [flag] = contractFlags(() => [{ rule: 'math-delimiters', path: ['diagram', 'x'], message: 'Put it in $…$.', value: 'a → b' }], { id: 'r', depth: 'overview', field: 'spec', spec: {} });
  assert.ok(flag.detail.includes(String.raw`($J=17.2 \to J=10.49$)`), flag.detail);
  assert.ok(!/\t/u.test(flag.detail));
  const sheet = await buildConstraints();
  assert.ok(sheet.includes(String.raw`(`+'`$a \to b$`'+`)`) || sheet.includes(String.raw`$a \to b$`), 'the sheet names the one-span form');
  assert.ok(!/\t/u.test(sheet));
});
