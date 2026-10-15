import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardLines } from './card-source.js';
import { CODE_CARD, CODE_DRAG, codeCardRef, dragSource, insertCodeCard, insertCodeCards, nodeCodeCard, previewOf, provenanceOf, repoCodeCard, sameCodeSource, uploadCodeCard, PREVIEW_LINES } from './code-card.js';
import { codeLanguage, isCodeFile } from './code-language.js';
import { assetKeysOf } from './learn-board-assets.js';
import { sameRef } from './chat-context.js';
import { refCardSpot } from './canvas-refs-model.js';
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
  // The hook hands over the card's range already cut (cardLines); the preview never cuts it again.
  const range = previewOf(cardLines(text, 10, 12).lines);
  assert.deepEqual(range.lines.map(l => l.n), [10, 11, 12]);
  assert.equal(range.excerpt, false);
  const whole = previewOf(cardLines(text).lines);
  assert.deepEqual([whole.shown, whole.total, whole.excerpt], [PREVIEW_LINES, 100, true]);
  assert.deepEqual([previewOf(cardLines(text).lines, true).shown], [100]);
  const symbol = previewOf(cardLines(text, 90).lines);
  assert.deepEqual([symbol.lines[0].n, symbol.total], [90, 11], 'a symbol reads on from its line');
  // Home's repro: a card from line 118 labelled 118 showed file line 235 (the range cut twice).
  const file = Array.from({ length: 300 }, (_, i) => `src ${i + 1}`).join('\r\n');
  const ranged = previewOf(cardLines(file, 118).lines);
  assert.deepEqual([ranged.lines[0].n, ranged.lines[0].text], [118, 'src 118']);
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

test('an uploaded code card reads its text from the board asset (cache, then the board copy), never a URL', async () => {
  const { uploadText } = await import('./use-card-source.js');
  assert.deepEqual(await uploadText('k', async () => 'print(1)'), { content: 'print(1)' });
  assert.deepEqual(await uploadText('k', async () => new Blob(['x = 2'])), { content: 'x = 2' });
  await assert.rejects(uploadText('k', async () => null), error => error.status === 404, 'a missing asset is unavailable');
  const card = readFileSync(new URL('./CodeCard.jsx', import.meta.url), 'utf8');
  assert.match(card, /const \{ status, lines \} = useCardSource\(block\);/);
  assert.match(card, /previewOf\(lines, expanded\)/);
});

test('several code cards go in as one group: one insertCards call with the card size, duplicates collapsed, existing ones skipped', () => {
  const a = repoCodeCard({ ...repo, path: 'model.py', start: 118 }), b = repoCodeCard({ ...repo, path: 'train.py' }), again = repoCodeCard({ ...repo, path: 'model.py', start: 118 });
  const calls = [], single = [];
  const ops = { insertCards: (list, options) => { calls.push({ list, options }); return list.map((_, i) => `n${i}`); }, insertCard: block => { single.push(block); return { id: 'one' }; } };
  assert.deepEqual(insertCodeCards(ops, [a, b, again, null]), ['n0', 'n1']);
  assert.equal(calls.length, 1, 'one group, so one undo step');
  assert.deepEqual(calls[0].list, [a, b]);
  assert.deepEqual(calls[0].options.size, CODE_CARD);
  const onCanvas = { id: 'x', type: 'repo-code', source: a.source };
  assert.equal(calls[0].options.sameAs(a)(onCanvas), true, 'an equivalent card already on the canvas is found');
  assert.equal(calls[0].options.sameAs(b)(onCanvas), false);
  insertCodeCards(ops, [b]);
  assert.deepEqual(single, [b], 'one card keeps insertCodeCard');
});

test('a group of cards is placed as one box in free space in view, never on a card', () => {
  const visible = { x: 0, y: 0, w: 1000, h: 900 }, box = { w: 980, h: 660 };
  const spot = refCardSpot({ x: visible.x, y: visible.y }, [{ x: 0, y: 0, w: 1000, h: 200 }], visible, box);
  assert.equal(spot.offscreen, false);
  assert.ok(spot.y >= 200, 'clear of the card at the top');
  assert.ok(spot.y + box.h <= visible.y + visible.h && spot.x >= visible.x && spot.x + box.w <= visible.x + visible.w, 'inside the view');
});

test('the canvas places a group as a grid in one undo step and selects it; a card press takes the keyboard from the companion', () => {
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  const group = canvas.slice(canvas.indexOf('insertGroup: (list, size) =>'), canvas.indexOf('liveRefs:'));
  assert.ok(group.includes('refCardSpot({ x: visible.x, y: visible.y }, inlineCanvas.obstacles(), visible, box)'), 'the grid is placed as one box in free space in view');
  assert.equal(group.split('snapshot()').length - 1, 1, 'one undo step');
  assert.ok(group.includes('setSelection(added.map(block => block.id))'), 'the new cards are selected');
  const press = canvas.split('\n').find(line => line.includes('onPointerDownCapture={event => { if (event.timeStamp - lastPress.current'));
  assert.ok(press?.includes("if (document.activeElement?.closest?.('[data-companion]')) document.activeElement.blur();"), 'a card press releases a companion focus');
  const page = readFileSync(new URL('./LearnPage.jsx', import.meta.url), 'utf8');
  assert.ok(page.includes('insertCards: (list, { sameAs = null, size } = {}) =>'));
  assert.ok(readFileSync(new URL('./GraphPanel.jsx', import.meta.url), 'utf8').includes('const addCode = nodes => insertCodeCards(ops, '));
});
