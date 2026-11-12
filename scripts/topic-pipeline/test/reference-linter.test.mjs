import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { getEncoding } from 'js-tiktoken';
import { countSpecTokens, lintAuthoredFiles, lintModule, lintReferences } from '../checks/reference-linter.mjs';

const spec = diagram => ({ version: 1, diagram });
const tree = nodes => spec({ kind: 'tree', nodes });
function reference() {
  return {
    id: 'ml-fixture', prompts: ['show the fixture?'], keywords: ['fixture tree', 'class counts'],
    spec: tree([{ id: 'a', label: 'Choose a class' }, { id: 'b', parent: 'a', label: 'Predict a class' }]),
    depths: {
      overview: { spec: tree([{ id: 'a', label: 'Choose a class' }]) },
      deep: { spec: tree([{ id: 'a', label: 'Choose a class' }, { id: 'b', parent: 'a', label: 'Predict a class', detail: 'Count 7' }]) },
    },
  };
}
const sources = { test: 'assert.ok(derived().includes(7));' };
const run = (ref = reference(), options = {}) => lintReferences({ references: [ref], prompts: ['show the fixture?'], derived: () => [7], source: sources, ...options });
const ofRule = (flags, rule) => flags.filter(issue => issue.rule === rule);
function plot({ scale = 'linear', xs = [1, 10, 100], ys = [0.1, 0.5, 0.9], caption = 'Worked example.' } = {}) {
  return spec({ kind: 'coordinate-plot', x: { label: 'Training rows (count)', min: 1, max: 100, scale },
    y: { label: 'Probability', min: 0, max: 1 }, series: [{ label: 'Chance', kind: 'line', points: xs.map((x, i) => ({ x, y: ys[i] })) }], caption });
}
function staticFlags(content, file = 'topic-fixture-references.js', extra = {}) {
  return lintAuthoredFiles({ files: [{ path: `packages/web/src/tutor-diagrams/${file}`, content }], repoRoot: process.cwd(), topic: 'fixture', lesson: '03', ...extra });
}

test('rule 1: exact compact cl100k counts pass at 300 and fail above 300 at each depth', () => {
  const encoder = getEncoding('cl100k_base');
  const ref = reference();
  assert.equal(countSpecTokens(ref.spec), encoder.encode(JSON.stringify(ref.spec), [], []).length);
  assert.equal(ofRule(run(ref), 1).length, 0);
  let exact;
  for (let count = 1; count < 400; count++) {
    const candidate = tree([{ id: 'a', label: 'leaf '.repeat(count).trim() }]);
    if (countSpecTokens(candidate) === 300) { exact = candidate; break; }
  }
  assert.ok(exact, 'fixture reaches the exact token boundary');
  ref.spec = exact;
  assert.equal(ofRule(run(ref), 1).length, 0);
  ref.spec.diagram.nodes[0].label += ' more words';
  ref.depths.overview.spec = ref.spec;
  ref.depths.deep.spec = ref.spec;
  assert.deepEqual(ofRule(run(ref), 1).map(issue => issue.depth), ['overview', 'standard', 'deep']);
});

test('rule 2: verbatim prompts and short lowercase keywords pass; omissions and keyword violations fail', () => {
  assert.equal(ofRule(run(), 2).length, 0);
  assert.equal(ofRule(run(reference(), { prompts: [{ id: 1, referenceId: 'ml-fixture', prompt: 'Show the fixture?' }] }), 2).length, 1);
  assert.equal(ofRule(run(reference(), { prompts: ['another prompt?'] }), 2).length, 1);
  for (const keywords of [['only one'], ['one', 'two', 'three', 'four'], ['Upper Case', 'valid'], ['a phrase with four words', 'valid']]) {
    const ref = reference(); ref.keywords = keywords;
    assert.equal(ofRule(run(ref), 2).length, 1, JSON.stringify(keywords));
  }
});

test('rule 3: semantic role fields pass; all seven role-word label prefixes fail', () => {
  const ref = reference();
  ref.spec.diagram.nodes[0].role = 'decision';
  assert.equal(ofRule(run(ref), 3).length, 0);
  for (const word of ['parallel', 'merge', 'decision', 'process', 'terminal', 'start', 'end']) {
    ref.spec.diagram.nodes[0].label = `${word.toUpperCase()}: choose a class`;
    assert.equal(ofRule(run(ref), 3).length, 1, word);
  }
});

test('rule 4: delimited maths passes; bare commands, scripts and unmatched delimiters fail', () => {
  const ref = reference();
  ref.spec.diagram.caption = String.raw`Worked example. $\log_2 p+\frac{1}{2}=p^2$.`;
  assert.equal(ofRule(run(ref), 4).length, 0);
  for (const caption of [String.raw`Bare \log p`, String.raw`Bare \frac{1}{2}`, 'Bare x^2', 'Bare x_1', '$unfinished']) {
    ref.spec.diagram.caption = caption;
    assert.equal(ofRule(run(ref), 4).length, 1, caption);
  }
});

test('rule 5: learner quantities/units pass; unspecified and all forbidden axis labels fail', () => {
  const ref = reference(); ref.spec = plot();
  assert.equal(ofRule(run(ref), 5).length, 0);
  ref.spec.diagram.x = { label: 'Angle', unit: 'degrees', min: 0, max: 360 };
  assert.equal(ofRule(run(ref), 5).length, 0);
  for (const label of ['units', 'Weighted Gini in 48ths', '7.5° units', '', 'x']) {
    ref.spec.diagram.x.label = label; delete ref.spec.diagram.x.unit;
    assert.equal(ofRule(run(ref), 5).length, 1, label);
  }
});

test('rule 6: derived data plus an assertion pass; missing exports/numbers/tests and typed display numbers fail', () => {
  assert.equal(ofRule(run(reference(), { authored: true }), 6).length, 0);
  const missing = ofRule(run(reference(), { authored: true, derived: undefined }), 6);
  assert.equal(missing.length, 3);
  assert.ok(missing.every(issue => issue.severity === 'error'));
  const legacy = ofRule(run(reference(), { derived: undefined }), 6);
  assert.equal(legacy.length, 3);
  assert.ok(legacy.every(issue => issue.severity === 'warning'));
  assert.equal(ofRule(run(reference(), { authored: true, derived: () => [] }), 6).length, 1);
  assert.match(ofRule(run(reference(), { authored: true, source: {} }), 6)[0].detail, /test asserting/u);
  assert.match(ofRule(run(reference(), { authored: true, source: { test: '// derived(); assert.ok(true);' } }), 6)[0].detail, /test asserting/u);
  const typed = { ...sources, module: 'export const spec = { caption: "Count 7", label: `Depth 5` };' };
  assert.equal(ofRule(run(reference(), { authored: true, source: typed }), 6).length, 2);
  const computed = { ...sources, module: 'const count = data.length; export const spec = { caption: `Count ${count}` };' };
  assert.equal(ofRule(run(reference(), { authored: true, source: computed }), 6).length, 0);
});

test('rule 7: a 2-decade logarithmic data series passes; short ranges fail despite wide axis domains', () => {
  const ref = reference(); ref.spec = plot({ scale: 'log' });
  assert.equal(ofRule(run(ref), 7).length, 0);
  ref.spec = plot({ scale: 'log', xs: [1, 5, 20] });
  assert.equal(ofRule(run(ref), 7).length, 1);
  ref.spec = plot({ scale: 'linear', xs: [1, 5, 20] });
  assert.equal(ofRule(run(ref), 7).length, 0);
  ref.spec.diagram.y.scale = 'log';
  ref.spec.diagram.series[0].samples = { x: { values: [2, 4, 200], divisor: 2 }, y: [780, 860, 925], divisor: 1000 };
  delete ref.spec.diagram.series[0].points;
  assert.equal(ofRule(run(ref), 7).length, 1, 'decoded y range catches the historic forest accuracy defect');
  ref.spec.diagram.x.scale = 'log';
  ref.spec.diagram.series[0].samples.y = [1, 100, 1000];
  assert.equal(ofRule(run(ref), 7).length, 0, 'both compact x and y samples span enough decades');
});

test('rule 8: one worked reference plus a shape passes; actual same-kind selections and exact duplicates fail', () => {
  const ref = reference();
  const first = { id: ref.id, spec: ref.spec }, shape = { id: 'shape-tree', spec: ref.spec };
  assert.equal(ofRule(run(ref, { collisions: [{ prompt: 'query', depth: 'standard', references: [first, shape] }] }), 8).length, 0);
  const collisions = [{ prompt: 'query', depths: Object.fromEntries(['overview', 'standard', 'deep'].map(depth => [depth, { references: [first, { ...first, id: 'ml-other' }] }])) }];
  assert.equal(ofRule(run(ref, { collisions }), 8).length, 6);
  assert.equal(ofRule(run(ref, { collisions: [{ id: 1, depths: ['brief', 'balanced', 'detailed'].map(depth => ({ depth, collision: true, kind: 'tree', references: [first, { ...first, id: 'ml-other' }] })) }] }), 8).length, 6);
  assert.equal(ofRule(run(ref, { collisions: [{ prompt: 'query', depth: 'deep', collision: true }] }), 8).length, 1);
  assert.equal(ofRule(lintReferences({ references: [ref, { ...reference(), id: 'ml-other' }], derived: () => [7] }), 8).length, 6);
});

test('rule 9: smaller Brief and additional Detailed arithmetic pass; equal Brief and unchanged Detailed fail', () => {
  assert.equal(ofRule(run(), 9).length, 0);
  const ref = reference(); ref.depths.overview.spec = structuredClone(ref.spec); ref.depths.deep.spec = structuredClone(ref.spec);
  assert.deepEqual(ofRule(run(ref), 9).map(issue => issue.depth), ['overview', 'deep']);
  ref.depths.overview.spec = tree([{ id: 'a', label: 'Choose a class' }]);
  ref.depths.deep.spec.diagram.caption = 'Worked example. $p=1/2$.';
  assert.equal(ofRule(run(ref), 9).length, 0);
});

test('rule 10: illustrative prefix/N1 marker pass; unmarked illustrative values fail at every depth', () => {
  const ref = reference(); ref.data = 'illustrative';
  assert.equal(ofRule(run(ref), 10).length, 3);
  for (const value of [ref.spec, ref.depths.overview.spec, ref.depths.deep.spec]) value.diagram.caption = 'Illustrative values.';
  assert.equal(ofRule(run(ref), 10).length, 0);
  for (const value of [ref.spec, ref.depths.overview.spec, ref.depths.deep.spec]) { value.diagram.caption = 'Values for this picture.'; value.diagram.title = 'An illustrative tree'; }
  assert.equal(ofRule(run(ref), 10).length, 0);
  delete ref.data;
  for (const value of [ref.spec, ref.depths.overview.spec, ref.depths.deep.spec]) delete value.diagram.title;
  assert.equal(ofRule(run(ref, { prompts: [{ prompt: 'show the fixture?', data: 'illustrative' }] }), 10).length, 3);
});

test('rule 11: relative data imports and test-only node:test/node:assert pass; every forbidden API/import fails', () => {
  assert.deepEqual(staticFlags("import { value } from './topic-fixture-data.js'; export const data = value;"), []);
  assert.deepEqual(staticFlags("import data from './topic-fixture-data.json' with { type: 'json' }; export { data };"), []);
  assert.deepEqual(staticFlags("import { test } from 'node:test'; import assert from 'node:assert'; test('ok', () => assert.ok(true));", 'topic-fixture-references.test.mjs'), []);
  assert.ok(staticFlags("import assert from 'node:assert/strict';", 'topic-fixture-references.test.mjs').length);
  for (const [content, expected] of [
    ["import fs from 'node:fs';", 'node:fs'], ["import value from 'zod';", 'relative'],
    ["export { x } from 'bare-package';", 'relative'], ["import x from '../../../outside.js';", 'escapes'],
    ['require("thing")', 'require'], ['import("./topic-fixture-data.js")', 'dynamic import'],
    ['eval("2")', 'eval'], ['new Function("return 2")', 'new Function'], ['fetch("https://example.test")', 'fetch'],
    ['process.env', 'process.'], ['globalThis.console', 'globalThis.'], ['// child_process', 'child_process'],
    ['// worker_threads', 'worker_threads'], ['new WebSocket("url")', 'WebSocket'], ['new XMLHttpRequest()', 'XMLHttpRequest'],
    [String.raw`f\u0065tch('url')`, 'escaped'], ["import { test } from 'node:test';", 'node:test'],
  ]) assert.ok(staticFlags(content).some(issue => issue.detail.includes(expected)), content);
  assert.deepEqual(staticFlags("import assert from 'node:assert';", 'topic-fixture-data.test.mjs'), []);
  assert.ok(staticFlags("import fs from 'node:fs';", 'topic-fixture-data.test.mjs').some(issue => issue.detail.includes('node:fs')));
});

test('rule 11: 200 KB/40-file boundaries and topic allowlist pass; excess/escape paths fail', () => {
  const prefix = '//';
  assert.deepEqual(staticFlags(prefix + 'x'.repeat(200 * 1024 - prefix.length)), []);
  assert.ok(staticFlags(prefix + 'x'.repeat(200 * 1024 - prefix.length + 1)).some(issue => issue.detail.includes('200 KB')));
  const files = Array.from({ length: 40 }, (_, i) => ({ path: `packages/web/src/tutor-diagrams/topic-fixture-${i}.js`, content: 'export const data = [];' }));
  const options = { files, repoRoot: process.cwd(), topic: 'fixture', lesson: '03' };
  assert.deepEqual(lintAuthoredFiles(options), []);
  for (const name of ['docs/features/explain/topics/fixture/topic.json', 'docs/features/explain-on-canvas/handoff/phase02-library/topic-walkthroughs/fixture.md', 'scripts/explain-bench/sets/demo-fixture.json']) {
    assert.deepEqual(lintAuthoredFiles({ ...options, files: [{ path: name, content: '{}' }] }), []);
  }
  assert.ok(lintAuthoredFiles({ ...options, files: [...files, { ...files[0], path: 'packages/web/src/tutor-diagrams/topic-fixture-extra.js' }] }).some(issue => issue.detail.includes('maximum is 40')));
  for (const name of ['../escape.js', 'packages/control-plane/src/server.js', 'packages/web/src/tutor-diagrams/topic-other-data.js']) {
    assert.ok(lintAuthoredFiles({ ...options, files: [{ path: name, content: 'export const data = [];' }] }).some(issue => issue.detail.includes('allowlist')));
  }
});

async function fixture(t, files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'topic-linter-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const folder = path.join(root, 'packages/web/src/tutor-diagrams');
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  for (const [name, content] of Object.entries(files)) await writeFile(path.join(folder, name), content);
  return { root, folder, module: path.join(folder, 'topic-fixture-references.js') };
}
const moduleText = 'const data = [7]; const count = data[0]; export const references = '
  + JSON.stringify([reference()]).replace('"Count 7"', '`Count ${count}`') + '; export function derived() { return data; }';

test('rule 11: an unsafe authored relative dependency is rejected before the entry module can run', async t => {
  const { root, module } = await fixture(t, {
    'topic-fixture-references.js': "import './topic-fixture-data.js'; throw new Error('ENTRY EXECUTED');",
    'topic-fixture-data.js': "export const rows = []; fetch('never');",
  });
  const flags = await lintModule(module, { repoRoot: root, authored: true, topic: 'fixture' });
  assert.ok(flags.some(issue => issue.rule === 11 && issue.detail.includes('fetch')));
  assert.ok(flags.every(issue => !issue.detail.includes('ENTRY EXECUTED')));
  const mismatch = await lintModule(module, { repoRoot: root, authored: true, topic: 'fixture', files: [{ path: 'packages/web/src/tutor-diagrams/topic-fixture-references.js', content: moduleText }] });
  assert.ok(mismatch.some(issue => issue.detail.includes('differs from the file on disk')));
});

test('rule 11: safe authored closure can import trusted existing tutor-diagrams dependencies', async t => {
  const { root, module } = await fixture(t, {
    'topic-fixture-references.js': `import { trusted } from './spec.js'; ${moduleText}`,
    'spec.js': "import { basename } from 'node:path'; export const trusted = basename('/trusted');",
    'topic-fixture-references.test.mjs': "import assert from 'node:assert'; import { derived } from './topic-fixture-references.js'; assert.ok(derived().includes(7));",
  });
  const flags = await lintModule(module, { repoRoot: root, authored: true, topic: 'fixture' });
  assert.equal(ofRule(flags, 11).length, 0);
  assert.equal(ofRule(flags, 6).length, 0);
});

test('rule 2: overlays receive prompt/keyword checks and preserve verbatim coverage', async t => {
  const { root, module } = await fixture(t, { 'topic-fixture-references.js': moduleText });
  const flags = await lintModule(module, { repoRoot: root, prompts: ['an added prompt?'], overlays: { 'ml-fixture': { prompts: ['an added prompt?'], keywords: ['fixture tree', 'class counts'] } } });
  assert.equal(ofRule(flags, 2).length, 0);
  const bad = await lintModule(module, { repoRoot: root, overlays: { 'ml-fixture': { prompts: [], keywords: ['Too Long Keyword With Words'] }, 'ml-unknown': { prompts: ['q?'], keywords: ['one', 'two'] } } });
  assert.ok(ofRule(bad, 2).some(issue => issue.detail.includes('Overlay needs')));
  assert.ok(ofRule(bad, 2).some(issue => issue.detail.includes('unknown')));
});
