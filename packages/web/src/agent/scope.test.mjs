import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askDraft, askQuestion, chipsFor, contextWithout, crumbsShown, endpointFor, fileContext, rangeContext, rangeTitle, scopeKey, scopeOf, whyQuestion } from './scope.js';

const SELECTED = { id: 'model_causalselfattention', label: 'CausalSelfAttention', commit: '3f2a1c9' };
const NANOGPT = { org: 'gmail-com', resource: { kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT' }, selected: SELECTED };

test('Home, Library and Explore show no chip, even with a selection left over', () => {
  for (const place of ['home', 'library', 'explore']) {
    const scope = scopeOf({ place, org: 'gmail-com', resource: null, selected: SELECTED });
    assert.deepEqual(scope, { org: 'gmail-com', kind: 'workspace', slug: null, title: null, selected: null });
    assert.deepEqual(chipsFor(scope), []);
  }
});

test('a project shows its title, and a selected node as a second chip', () => {
  assert.deepEqual(scopeOf(NANOGPT), { org: 'gmail-com', kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT', selected: SELECTED });
  assert.deepEqual(chipsFor(scopeOf(NANOGPT)), [{ key: 'resource', label: 'karpathy/nanoGPT' }, { key: 'selected', label: 'CausalSelfAttention' }]);
  assert.deepEqual(chipsFor(scopeOf({ org: 'gmail-com', resource: { kind: 'app', slug: 'counter', title: 'counter' } })), [{ key: 'resource', label: 'counter' }]);
});

test('the draft key survives renames and new commits, and changes with the selection', () => {
  const scope = scopeOf(NANOGPT);
  assert.equal(scopeKey(scope), 'gmail-com|project:repo-1a2b3c4d-nanogpt|model_causalselfattention');
  assert.equal(scopeKey({ ...scope, title: 'nanoGPT (fork)', selected: { ...SELECTED, label: 'Attention', commit: '9e8d7c6' } }), scopeKey(scope));
  assert.notEqual(scopeKey({ ...scope, selected: null }), scopeKey(scope));
  assert.notEqual(scopeKey({ ...scope, org: 'w-reading-group' }), scopeKey(scope));
  assert.equal(scopeKey(scopeOf({ org: 'gmail-com', resource: null })), 'gmail-com|workspace:|');
});

test('workspace and app threads use /api/ask; projects and canvases use Learn', () => {
  const at = (resource) => endpointFor(scopeOf({ org: 'gmail-com', resource }));
  assert.deepEqual(at(null), { path: '/api/ask', scope: {} });
  assert.deepEqual(at({ kind: 'app', slug: 'counter', title: 'counter' }), { path: '/api/ask', scope: { app: 'counter' } });
  assert.deepEqual(at({ kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT' }), { path: '/api/learn/ask', scope: { app: 'repo-1a2b3c4d-nanogpt' } });
  assert.deepEqual(at({ kind: 'canvas', slug: 'canvas-0f9e8d7c', title: 'Attention deep dive' }), { path: '/api/learn/ask', scope: { app: 'canvas-0f9e8d7c' } });
});

test('context is hierarchical: repository, file, symbol; a node named like its file shows once (workspace-dock.md)', () => {
  const symbol = { id: 'model_gpt_forward', label: 'GPT.forward', kind: 'symbol', path: 'model.py', line: 170, commit: '3f2a1c9' };
  const scope = scopeOf({ ...NANOGPT, selected: symbol });
  assert.deepEqual(chipsFor(scope), [{ key: 'resource', label: 'karpathy/nanoGPT' }, { key: 'file', label: 'model.py', title: 'model.py' }, { key: 'selected', label: 'GPT.forward' }]);
  assert.deepEqual(chipsFor(scopeOf({ ...NANOGPT, selected: fileContext('config/train_gpt2.py', '3f2a1c9') })), [{ key: 'resource', label: 'karpathy/nanoGPT' }, { key: 'selected', label: 'train_gpt2.py' }]);
  assert.equal(chipsFor(scopeOf({ ...NANOGPT, selected: { id: 'model', label: 'model.py', kind: 'code', path: 'model.py', line: 1 } })).length, 2);
});

test('x steps up one level: a symbol falls back to its file, a file to the repository', () => {
  const symbol = { id: 'model_gpt_forward', label: 'GPT.forward', kind: 'symbol', path: 'model.py', line: 170, commit: '3f2a1c9' };
  assert.deepEqual(contextWithout(symbol, 'selected'), { id: 'file:model.py', label: 'model.py', kind: 'file', path: 'model.py', line: 1, commit: '3f2a1c9' });
  assert.equal(contextWithout(symbol, 'file'), null);
  assert.equal(contextWithout(fileContext('train.py', '3f2a1c9'), 'selected'), null);
  assert.equal(contextWithout(SELECTED, 'selected'), null); // a node with no file
});

// repository-browser.md: a code-reader range is one more level, repo › file › lines a–b, and steps up to its file, then the repo.
test('a line range reads repo › file › lines a–b, keeps the whole range, and steps up to its file, then the repository', () => {
  const range = rangeContext('model.py', 115, 122, '3f2a1c9');
  assert.deepEqual(range, { id: 'range:model.py:115-122', label: 'lines 115–122', kind: 'range', path: 'model.py', line: 115, start: 115, end: 122, commit: '3f2a1c9' });
  assert.deepEqual(chipsFor(scopeOf({ ...NANOGPT, selected: range })), [{ key: 'resource', label: 'karpathy/nanoGPT' }, { key: 'file', label: 'model.py', title: 'model.py' }, { key: 'selected', label: 'lines 115–122' }]);
  assert.deepEqual(contextWithout(range, 'selected'), fileContext('model.py', '3f2a1c9'));
  assert.equal(contextWithout(range, 'file'), null);
  assert.notEqual(scopeKey(scopeOf({ ...NANOGPT, selected: range })), scopeKey(scopeOf({ ...NANOGPT, selected: rangeContext('model.py', 115, 123, '3f2a1c9') })));
  assert.equal(rangeTitle(range), 'model.py:115–122');
  assert.deepEqual([rangeContext('data/prepare.py', 7, 7, 'c').label, rangeTitle(rangeContext('data/prepare.py', 7, 7, 'c'))], ['line 7', 'prepare.py:7']);
  const large = rangeContext('train.py', 1, 337, '3f2a1c9'); // never shortened: the server bounds the snippet, not the identity
  assert.deepEqual([large.start, large.end, large.label], [1, 337, 'lines 1–337']);
});

// Owner, 2026-10-08: "if we are not in a particular project, the breadcrumbs disappear".
test('the breadcrumb (chips) shows only on that project\'s own page', () => {
  const project = scopeOf(NANOGPT), other = { ...project, slug: 'repo-9f9f9f9f-other' };
  const home = scopeOf({ org: 'gmail-com', resource: null }), app = scopeOf({ org: 'gmail-com', resource: { kind: 'app', slug: 's3-log', title: 's3-log' } });
  assert.equal(crumbsShown(project, project), true);
  assert.equal(crumbsShown(project, { ...project, selected: null }), true, 'the same project, another selection');
  assert.equal(crumbsShown(project, home), false, 'a draft held from the project, now on Home or the Library');
  assert.equal(crumbsShown(project, other), false);
  assert.equal(crumbsShown(app, app), false, 'an app is not a project');
  assert.equal(crumbsShown(home, home), false);
});

// Owner, 2026-10-08: Ask actions write a ready question; the learner presses Send.
test('Ask questions are plain and name the object; Why asks why it matters; a range names its lines', () => {
  const symbol = { id: 'n1', label: 'base64_decode()', kind: 'function', path: 'src/itsdangerous/encoding.py', line: 30, commit: 'abc' };
  assert.equal(askQuestion(symbol), 'What does base64_decode() do, and how is it used here?');
  assert.equal(whyQuestion(symbol), 'Why does base64_decode() matter in this codebase?');
  assert.equal(askQuestion(fileContext('src/itsdangerous/encoding.py', 'abc')), 'What does encoding.py do, and how is it used here?');
  assert.equal(askQuestion(rangeContext('src/itsdangerous/encoding.py', 12, 20, 'abc')), 'What do lines 12–20 of encoding.py do?');
  assert.equal(askQuestion(rangeContext('src/itsdangerous/encoding.py', 12, 12, 'abc')), 'What does line 12 of encoding.py do?');
  assert.equal(whyQuestion(rangeContext('src/itsdangerous/encoding.py', 12, 20, 'abc')), 'Why do lines 12–20 of encoding.py matter in this codebase?');
});

test('askDraft only asks the composer to write and focus: one small:ask-focus event carrying the text', () => {
  const seen = [], real = globalThis.window;
  globalThis.window = { dispatchEvent: (e) => seen.push([e.type, e.detail]) };
  try { askDraft('What does x do?'); } finally { globalThis.window = real; }
  assert.deepEqual(seen, [['small:ask-focus', { text: 'What does x do?' }]]);
});
