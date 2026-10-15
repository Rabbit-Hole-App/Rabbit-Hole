import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CODE_DRAG, codeCardRef, dragSource, insertCodeCard, nodeCodeCard, previewOf, provenanceOf, repoCodeCard, sameCodeSource, uploadCodeCard, PREVIEW_LINES } from './code-card.js';
import { codeLanguage, isCodeFile } from './code-language.js';
import { assetKeysOf } from './learn-board-assets.js';
import { sameRef } from './chat-context.js';
import { nodeRef, rangeRef } from './repo-context.js';

const sha = 'a'.repeat(40), other = 'b'.repeat(40);
const repo = { app: 'repo-1234abcd-nanogpt', repo: 'karpathy/nanoGPT', commit: sha };

test('a repository card stores where to read, never the code, as type repo-code', () => {
  const card = repoCodeCard({ ...repo, path: 'model.py', start: 10, end: 20 });
  assert.equal(card.type, 'repo-code');
  assert.equal(card.language, 'python');
  assert.deepEqual(card.source, { kind: 'repository', ...repo, path: 'model.py', start: 10, end: 20 });
  assert.equal(JSON.stringify(card).includes('text'), false);
  assert.equal(repoCodeCard({ ...repo, path: 'a/b/train.py', label: 'train()' }).title, 'train.py · train()');
});

test('equivalent sources: same file, commit and lines; another commit or range is a different card', () => {
  const a = repoCodeCard({ ...repo, path: 'model.py', start: 1, end: 5 }).source;
  assert.ok(sameCodeSource(a, { ...a }));
  assert.equal(sameCodeSource(a, { ...a, commit: other }), false);
  assert.equal(sameCodeSource(a, { ...a, end: 6 }), false);
  assert.equal(sameCodeSource(a, repoCodeCard({ ...repo, path: 'model.py' }).source), false);
  assert.ok(sameCodeSource(uploadCodeCard({ assetKey: 'k1', name: 'x.py', size: 3 }).source, { kind: 'upload', assetKey: 'k1' }));
});

test('insertCodeCard is a thin wrapper over canvasOps.insertCard with same = same source and range', () => {
  const calls = [];
  const ops = { insertCard: (block, options) => { calls.push({ block, options }); return 'id-1'; } };
  const card = repoCodeCard({ ...repo, path: 'model.py', start: 1, end: 5 });
  assert.equal(insertCodeCard(ops, card, { x: 3, y: 4 }), 'id-1');
  assert.deepEqual(calls[0].options.at, { x: 3, y: 4 });
  assert.equal(calls[0].options.same({ type: 'repo-code', source: { ...card.source } }), true);
  assert.equal(calls[0].options.same({ type: 'repo-code', source: { ...card.source, commit: other } }), false);
  assert.equal(calls[0].options.same({ type: 'snippet', source: card.source }), false);
  assert.equal(insertCodeCard({}, card), null, 'no insertCard (view-only page): nothing is created');
  assert.equal(insertCodeCard(null, card), null);
});

test('a card rides as the same code ref the graph and Files use, so they dedupe; uploads are card refs with bounded text', () => {
  const repository = { app: { repo: repo.repo }, snapshot: { commit: sha } };
  const range = codeCardRef(repoCodeCard({ ...repo, path: 'model.py', start: 3, end: 9 }));
  assert.ok(sameRef(range, rangeRef(repository, { path: 'model.py', start: 3, end: 9 })));
  const node = { id: 'model_gpt', label: 'GPT', path: 'model.py', line: 12 };
  assert.ok(sameRef(codeCardRef(nodeCodeCard(repo, { kind: 'symbol', path: 'model.py', line: 12, nodeId: 'model_gpt', label: 'GPT' })), nodeRef(repository, node)));
  const file = codeCardRef(nodeCodeCard(repo, { kind: 'file', path: 'model.py', label: 'model.py' }));
  assert.ok(sameRef(file, nodeRef(repository, { id: 'model', label: 'model.py', path: 'model.py' })));
  assert.equal(nodeCodeCard(repo, { kind: 'external', label: 'torch' }), null);
  const up = codeCardRef(uploadCodeCard({ assetKey: 'k9', name: 'notes.py', size: 1 }), 'x'.repeat(9000));
  assert.deepEqual([up.sourceId, up.kind, up.text.length], ['upload:k9', 'card', 8000]);
});

test('the preview is a bounded excerpt of the card own lines, and says so', () => {
  const text = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n');
  const range = previewOf(repoCodeCard({ ...repo, path: 'a.py', start: 10, end: 12 }), text);
  assert.deepEqual(range.lines.map(l => l.n), [10, 11, 12]);
  assert.equal(range.excerpt, false);
  const whole = previewOf(repoCodeCard({ ...repo, path: 'a.py' }), text);
  assert.deepEqual([whole.shown, whole.total, whole.excerpt], [PREVIEW_LINES, 100, true]);
  assert.deepEqual([previewOf(repoCodeCard({ ...repo, path: 'a.py' }), text, true).shown], [100]);
  const symbol = previewOf(repoCodeCard({ ...repo, path: 'a.py', start: 90, nodeId: 'n' }), text);
  assert.deepEqual([symbol.lines[0].n, symbol.total], [90, 11], 'a symbol reads on from its line');
  assert.equal(provenanceOf(repoCodeCard({ ...repo, path: 'a.py', start: 2, end: 4 })), `karpathy/nanoGPT › a.py:2-4 · ${sha.slice(0, 7)}`);
  assert.equal(provenanceOf(uploadCodeCard({ assetKey: 'k', name: 'dir/x.go', size: 1 })), 'Uploaded file · x.go');
});

test('a Files drag carries a checked repository source; anything else is ignored', () => {
  const dt = value => ({ getData: type => (type === CODE_DRAG ? value : '') });
  const good = { ...repo, path: 'model.py', start: 3, end: 4 };
  assert.deepEqual(dragSource(dt(JSON.stringify(good))), good);
  assert.equal(dragSource(dt(JSON.stringify({ ...good, commit: 'main' }))), null);
  assert.equal(dragSource(dt('not json')), null);
  assert.equal(dragSource(dt('')), null);
});

test('languages come from the file name; an upload card keeps its asset with the board', () => {
  assert.deepEqual(['x.py', 'a.tsx', 'Makefile', 'b.rs', 'notes.txt', 'img.png'].map(codeLanguage), ['python', 'tsx', 'make', 'rust', 'text', 'text']);
  assert.deepEqual(['x.py', 'notes.txt', 'img.png'].map(isCodeFile), [true, true, false]);
  assert.deepEqual(assetKeysOf({ blocks: [{ type: 'repo-code', source: { kind: 'upload', assetKey: 'import:7' } }, { type: 'repo-code', source: { kind: 'repository' } }] }), ['import:7']);
});

test('code is inert: the card never runs it, and the canvas renders repo-code as a CodeCard', () => {
  const card = readFileSync(new URL('./CodeCard.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(card, /runPython|pyodide|eval\(|new Function/);
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /block\.type === 'repo-code'\) return <CanvasNode[^\n]*<CodeCard block=\{block\}/);
});
