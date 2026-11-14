// HL-1/HL-2/HL-3 (release 145, owner Ctrl+K spec items 1, 2, 6): a passage explained through Ctrl+K carries its source reference, shows pink (never the Highlight yellow),
// stays visible through the Ctrl+K dim, and links both ways with its card. Pure helpers and wiring pins; the rendered result is checked on a local stack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { passageQuote } from './inline-highlight.js';
import { markdownDraft } from './source-ref.js';
import { runLearnCommand } from './learn-slash.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const REV = 'a'.repeat(64), FILE = `fs_${'1'.repeat(24)}`, REF = { v: 1, id: `sref_${'1'.repeat(24)}`, kind: 'markdown' };
const TEXT = 'Notes on trees. Split criteria: measuring impurity in trees. Summary of the chapter.';
const block = { id: 'file-1', kind: 'markdown', fileRef: { source: { id: FILE, rev: REV } } };

// The selection of a Markdown file card, as far as quoteFromRange reads it (jsdom-free: a root holding the rendered text and a range inside it).
const selectionIn = (exact, { rich = false, kind = 'markdown' } = {}) => {
  const start = TEXT.indexOf(exact), inside = { nodeType: 3, parentElement: { closest: selector => (rich && selector.includes('.katex') ? {} : null) } };
  const root = { textContent: TEXT, contains: () => true };
  const card = { querySelector: selector => (selector === '[data-file-doc-md]' ? root : null) };
  const range = { collapsed: false, commonAncestorContainer: inside, startContainer: inside, endContainer: inside, startOffset: start, toString: () => exact };
  globalThis.document = { createRange: () => ({ setStart() {}, setEnd(_node, offset) { this.offset = offset; }, toString() { return TEXT.slice(0, this.offset); } }) };
  return { card, range, block: { ...block, kind } };
};

test('HL-1: the words picked in a Markdown file card become the quote a source reference is minted from', () => {
  const { card, range, block: file } = selectionIn('Split criteria: measuring impurity');
  const quote = passageQuote(card, file, range);
  assert.deepEqual(quote, { exact: 'Split criteria: measuring impurity', prefix: 'Notes on trees. ', suffix: TEXT.slice(TEXT.indexOf(' in trees'), TEXT.indexOf(' in trees') + 32) });
  const draft = markdownDraft({ block: file, quote, app: 'demo' });
  assert.deepEqual([draft.app, draft.key, draft.rev, draft.anchor.quote.exact], ['demo', `file:${FILE}`, REV, 'Split criteria: measuring impurity']);
});

test('HL-1: no quote for another kind of card, or a selection that starts in typeset math (its text is markup, not words)', () => {
  const other = selectionIn('Split criteria: measuring impurity', { kind: 'explanation' });
  assert.equal(passageQuote(other.card, other.block, other.range), null);
  const math = selectionIn('Split criteria: measuring impurity', { rich: true });
  assert.equal(passageQuote(math.card, math.block, math.range), null);
});

test('HL-1: Ctrl+K over those words runs the command with the draft (the job command; the written /explain is covered in source-refs.test.mjs), mints the reference first, and the job carries it; a changed file stops before anything is made', async () => {
  const { card, range, block: file } = selectionIn('Split criteria: measuring impurity');
  const sourceDraft = markdownDraft({ block: file, quote: passageQuote(card, file, range), app: 'demo' });
  const started = [], posts = [];
  const canvas = { startExplain: async (words, options) => { started.push([words, options.sourceRef ?? null]); return { blockId: 'ex-1' }; }, reserve: () => 'slot', release: () => {} };
  const post = async (path, body) => { posts.push([path, body]); return { ref: REF }; };
  const out = await runLearnCommand('/interactive why impurity', { app: 'demo', internal: true, target: { id: 'file-1', kind: 'card', title: 'notes', text: 'x', sourceDraft }, canvas, post }) /* internal: main's SLASH_FLAGS turned /interactive off for a person; the command's draft and ref handling is what is under test */;
  assert.equal(out.notice.blockId, 'ex-1');
  assert.deepEqual(posts, [['/api/learn/source-refs', sourceDraft]]);
  assert.deepEqual(started, [['why impurity', REF.id]]);
  const stale = async () => { throw Object.assign(new Error('changed'), { status: 409, data: { code: 'source_changed' } }); };
  const refused = await runLearnCommand('/interactive why impurity', { app: 'demo', internal: true, target: { id: 'file-1', text: 'x', sourceDraft }, canvas, post: stale });
  assert.equal(refused.notice.tone, 'error');
  assert.equal(started.length, 1, 'nothing was made');
});

test('HL-1: the editor hands that draft to the command over highlighted Markdown words, and the Markdown pill still mints at once and marks its passage', () => {
  const editor = read('InlineAiEditor.jsx'), picked = read('inline-highlight.js'), md = read('FileDocMarkdown.jsx');
  assert.match(editor, /const sourceDraft = source && highlight\.quote \? markdownDraft\(\{ block: source, quote: highlight\.quote, app: canWrite\(\) \? fileScope\(\)\?\.app : null \}\) : null;/);
  assert.match(editor, /\.\.\.\(sourceDraft \? \{ sourceDraft \} : \{\}\)/);
  assert.match(picked, /highlight: \{ id, text, rects, quote: passageQuote\(card, block, range\),/);
  assert.ok(md.includes('onQuickAsk={() => explain(bar.quote)}'), 'the pill keeps its Explain: it mints at once and Ctrl+K opens with the passage as its words');
  assert.ok(md.includes('if (draft && picked?.rangeCount) markSet({ live: picked.getRangeAt(0).cloneRange() });'), 'and marks the passage pink while the window is open');
});

test('HL-1: the explained passage is pink in the card and in the Ctrl+K mark, the Highlight stays yellow, and no olive Tutor tint is left', () => {
  const index = read('index.css'), layout = read('card-layout.css');
  assert.match(index, /--color-explained: #ec4899;/);
  assert.match(index, /\.dark|--color-explained: #f472b6;/, 'a dark value too');
  assert.match(index, /::highlight\(inline-target\) \{ background-color: color-mix\(in oklab, var\(--color-explained\) 42%, transparent\); \}/);
  assert.match(layout, /::highlight\(tutor-source\) \{ background-color: color-mix\(in oklab, var\(--color-explained\) 42%, transparent\)/);
  assert.equal(/128 105 22|a58b4c/.test(layout), false, 'no olive Tutor tint');
  assert.match(index, /::highlight\(wiki-highlight\) \{\s*background-color: #fde047;/, 'the plain Highlight stays yellow');
  assert.match(index, /\[data-file-doc-text\] ::highlight\(wiki-highlight\) \{ background-color: rgb\(253 224 71 \/ 0\.4\)/);
});

test('HL-2: the Ctrl+K dim has holes for the words being explained and for every explained passage, with overlapping rects merged so the even-odd cut cannot re-dim them', async () => {
  const { mergeRects, scrimPath } = await import('./inline-highlight.js');
  const line = { left: 10, top: 10, width: 100, height: 16 };
  assert.deepEqual(mergeRects([line, { ...line, left: 20, width: 50, top: 11, height: 14 }, { ...line }]), [line], 'a box, the text inside it and a repeat are one hole');
  const next = { left: 10, top: 26, width: 60, height: 16 };
  assert.equal(mergeRects([line, next]).length, 2, 'lines that only touch stay separate holes');
  assert.equal(mergeRects([{ left: 0, top: 0, width: 0, height: 5 }]).length, 0, 'an empty rect is no hole');
  assert.equal((scrimPath({ w: 400, h: 300 }, mergeRects([line, line, next]), 0).match(/M/g) || []).length, 3, 'the surface and two holes');
  const editor = read('InlineAiEditor.jsx'), mark = read('inline-highlight-mark.js'), md = read('FileDocMarkdown.jsx');
  assert.ok(editor.includes('const dimHoles = pageBox ? mergeRects([...(highlight ? marked || [] : []), ...[...markRects, ...explainedRects()].map(rect =>'));
  assert.ok(editor.includes('useEffect(() => () => { if (preset) markClear(); }, []);'), 'the pill mark goes with the window');
  assert.match(editor, /data-inline-scrim [^>]*style=\{dimHoles\.length && pageBox \? \{ clipPath: scrimPath\(\{ w: pageBox\.width, h: pageBox\.height \}, dimHoles, 0\) \} : undefined\}/);
  assert.match(mark, /export const explainedSet/);
  assert.match(md, /explainedSet\(key, ranges\);/, 'the persisted pink passages are the ones cut out');
});

test('HL-2: the registry keeps only non-empty ranges and answers their drawn rects', async () => {
  const { explainedRects, explainedSet } = await import('./inline-highlight-mark.js');
  const range = rects => ({ getClientRects: () => rects });
  explainedSet('a', [range([{ left: 1, top: 2, width: 30, height: 10 }, { left: 0, top: 0, width: 0, height: 4 }])]);
  explainedSet('b', [{ getClientRects() { throw new Error('detached'); } }]);
  assert.deepEqual(explainedRects(), [{ left: 1, top: 2, width: 30, height: 10 }]);
  explainedSet('a', []);
  explainedSet('b', []);
  assert.deepEqual(explainedRects(), []);
});

test('HL-3: one icon, two directions: the card header offers Go to highlight over a Markdown passage, the pink passage offers Go to card, both through the one camera function', async () => {
  const { HEAD_OPEN } = await import('./SourceRefChip.jsx').catch(() => ({}));
  const chip = read('SourceRefChip.jsx'), md = read('FileDocMarkdown.jsx'), refs = read('source-refs.js'), { viewCardLabel } = await import('./file-doc-highlights.js');
  assert.match(chip, /export const HEAD_OPEN = ref => \(ref\?\.kind === 'markdown' \? 'Go to highlight' : 'View passage'\);/);
  assert.match(chip, /aria-label=\{HEAD_OPEN\(ref\)\} title=\{HEAD_OPEN\(ref\)\}[\s\S]*<ScanText size=\{16\}/, 'the ScanText icon, in the card header');
  assert.match(md, /title="Go to card" aria-label=\{viewCardLabel\(anchor\.cards\)\}[\s\S]*<ScanText size=\{16\}/, 'the same icon on the passage');
  assert.equal(viewCardLabel([{ title: 'Impurity' }]), 'Go to card: Impurity');
  assert.match(refs, /const goTo = \(focus, cardId, options\) => focus\?\.\(cardId, options\);/);
  assert.match(refs, /goTo\(focus, cardId, rect \? \{ passage: rect \} : undefined\);\r?\n  \/\/ The camera moves first/);
  assert.match(refs, /focusExplanation = \(cardId, \{ focus = state\.focus \} = \{\}\) => goTo\(focus, cardId\);/);
  void HEAD_OPEN;
});
