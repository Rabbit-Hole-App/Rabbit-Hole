// Fix C: a roadmap card's RAW Markdown quote found in the text the Markdown card SHOWS, and nothing found that is not that passage. The rendered side is the real Md.jsx
// output (server render) read as text segments per block, as the browser's textSegments reads the drawn card; adversarial look-alikes must be missing or ambiguous.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { foldMarkdown, foldedQuote, resolveFolded } from './markdown-anchor.js';
import { passageTarget, resolveQuote, resolveRawPassage } from './source-ref.js';

const tmp = mkdtempSync(join(tmpdir(), 'md-anchor-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
await esbuild.build({
  stdin: { contents: "export { Md } from './Md.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty', '.svg': 'empty' },
});
const lib = createRequire(import.meta.url)(outfile);
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };
const decode = s => s.replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, e => ENTITIES[e]);
const BLOCK = /^(p|li|td|th|tr|h[1-6]|pre|blockquote|dt|dd|figcaption|div)$/;
// The drawn card as the browser reads it: each text run with its textContent offset and its nearest block element.
function drawn(raw) {
  const markup = lib.renderToStaticMarkup(lib.createElement(lib.Md, { text: raw, doc: true, fences: true }));
  const segments = [], stack = [];
  let offset = 0, id = 0, text = '';
  for (const part of markup.split(/(<[^>]+>)/)) {
    if (!part) continue;
    const tag = /^<(\/?)([a-z0-9]+)/i.exec(part);
    if (tag) { if (BLOCK.test(tag[2])) { if (tag[1]) stack.pop(); else if (!part.endsWith('/>')) stack.push(++id); } continue; }
    const value = decode(part);
    segments.push({ text: value, offset, block: stack[stack.length - 1] ?? 0 });
    offset += value.length; text += value;
  }
  return { segments, text };
}
const DOC = [
  '# Gradient descent',
  '',
  'The **gradient** of the loss at a point is the *slope* there. See [the notes](https://example.com/notes?a=1) for more.',
  '',
  '## Update rule',
  '',
  '| Symbol | Meaning |',
  '| --- | --- |',
  '| `w` | the weight vector |',
  '| `eta` | the learning rate |',
  '',
  '1. Compute the gradient.',
  '2. Step against it by the learning rate.',
  '',
  '> Repeat until the loss stops falling.',
].join('\n');
// A minted quote exactly as the server builds it: the raw slice and up to 100 raw characters either side.
const minted = (raw, phrase, at = raw.indexOf(phrase)) => ({ exact: phrase, prefix: raw.slice(Math.max(0, at - 100), at), suffix: raw.slice(at + phrase.length, at + phrase.length + 100) });
const place = (raw, phrase) => { const { segments, text } = drawn(raw), found = resolveRawPassage(segments, minted(raw, phrase)); return found.status === 'resolved' ? text.slice(found.start, found.end) : found.status; };

test('the raw quote of a heading, bold, a link or a table is NOT in the rendered text, and the exact matcher says missing (the defect)', () => {
  const { text } = drawn(DOC);
  for (const phrase of ['## Update rule', 'The **gradient** of the loss', '[the notes](https://example.com/notes?a=1)', '| `w` | the weight vector |']) assert.equal(resolveQuote(text, minted(DOC, phrase)).status, 'missing', phrase);
});

test('a minted heading, emphasis, link, table row, list item and blockquote resolve to the words the card shows', () => {
  assert.equal(place(DOC, '## Update rule'), 'Update rule');
  assert.equal(place(DOC, 'The **gradient** of the loss at a point is the *slope* there.'), 'The gradient of the loss at a point is the slope there');
  assert.equal(place(DOC, 'See [the notes](https://example.com/notes?a=1) for more.'), 'See the notes for more', 'the URL is not drawn, so it is not in the passage');
  assert.equal(place(DOC, '| `w` | the weight vector |'), 'wthe weight vector', 'cells are blocks: matched across them, drawn without pipes');
  assert.equal(place(DOC, '2. Step against it by the learning rate.'), 'Step against it by the learning rate');
  assert.equal(place(DOC, '> Repeat until the loss stops falling.'), 'Repeat until the loss stops falling');
  assert.match(place(DOC, DOC.slice(0, DOC.indexOf('there.') + 6)), /^Gradient descentThe gradient of the loss at a point is the slope there$/, 'heading to paragraph');
});

test('adversarial look-alikes are never resolved: operators, decimals, signs, a word inside a word, the wrong context', () => {
  const look = (raw, quote) => resolveRawPassage(drawn(raw).segments, quote).status;
  const bare = exact => ({ exact, prefix: '', suffix: '' });
  assert.notEqual(look('Keep x < 50 here.', bare('x > 50')), 'resolved', '> is not <');
  assert.notEqual(look('The rate is 15 percent.', bare('rate is 1.5 percent')), 'resolved', '1.5 is not 15');
  assert.notEqual(look('Set it to 3 now.', bare('Set it to -3 now')), 'resolved', '-3 is not 3');
  assert.notEqual(look('We concatenate strings.', bare('**cat**')), 'resolved', 'no match inside a word');
  assert.notEqual(look('a = b', bare('a + b')), 'resolved');
  assert.equal(look('Alpha. The loss falls. Omega.', { exact: 'The loss falls.', prefix: 'Beta. ', suffix: '' }), 'missing', 'the only hit, but its context disagrees');
  assert.equal(look('The loss falls. Then. The loss falls.', bare('The **loss** falls.')), 'ambiguous', 'two hits, no context: never the first');
  assert.equal(look('A.\n\nThe loss falls.\n\nB.\n\nThe loss falls.', { exact: 'The **loss** falls.', prefix: 'A.\n\n', suffix: '\n\nB.' }), 'resolved', 'context tells them apart');
});

test('offsets stay in UTF-16 units past astral characters, so the highlight lands on the passage', () => {
  const raw = 'Let 𝑥 and 𝑦 be inputs. The **gradient** points uphill.';
  const { segments, text } = drawn(raw), found = resolveRawPassage(segments, minted(raw, 'The **gradient** points uphill.'));
  assert.equal(found.status, 'resolved');
  assert.equal(text.slice(found.start, found.end), 'The gradient points uphill');
});

test('a learner-selected passage keeps its exact-or-missing answer; a changed file is reported, not searched', () => {
  const { text } = drawn(DOC);
  assert.equal(passageTarget({ text, rev: 'r1', detail: { rev: 'r1', quote: minted(DOC, 'The **gradient** of the loss') } }).status, 'missing', 'passageTarget never folds');
  assert.equal(passageTarget({ text, rev: 'r1', detail: { rev: 'r1', quote: { exact: 'Update rule', prefix: '', suffix: '' } } }).status, 'resolved');
  assert.deepEqual(passageTarget({ text, rev: 'r2', detail: { rev: 'r1', quote: minted(DOC, '## Update rule') } }), { status: 'changed' });
});

test('the fold: raw-only syntax out, what Md.jsx draws as text kept, word boundaries and kept symbols', () => {
  assert.equal(foldMarkdown('- item [link](u "t") and 1. not a list').folded, 'item link and 1 not a list');
  assert.equal(foldMarkdown('<b>tag</b> &amp; x>=2').folded, '<b>tag< b> amp x>=2', 'tags and entities are drawn as text by Md.jsx, so they stay');
  assert.deepEqual(foldedQuote({ exact: '**Bold** [x](u)', prefix: '# H ', suffix: ' *e*' }), { exact: 'bold x', prefix: 'h', suffix: 'e' });
  assert.equal(resolveFolded('', { exact: 'x' }).status, 'missing');
});

test('only a roadmap card (stepId) is treated as raw: explanationsFor marks it, View passage carries it; a learner card is not', async () => {
  const { explanationsFor } = await import('./source-ref.js');
  const { viewPassage } = await import('./source-refs.js');
  const ref = { v: 1, id: 'sref_' + 'a'.repeat(24), kind: 'markdown', source: { key: 'file:fs_' + 'b'.repeat(24), rev: 'c'.repeat(64), name: 'n.md' }, anchor: { quote: { exact: '## H', prefix: '', suffix: '' } } };
  const cards = [{ id: 'mine', sourceRef: ref }, { id: 'tutor', stepId: 'st_1', sourceRef: ref }];
  assert.deepEqual(explanationsFor(cards, { key: ref.source.key, rev: ref.source.rev }).current.map(c => [c.cardId, c.raw]), [['mine', false], ['tutor', true]]);
  const file = { id: 'f', kind: 'markdown', fileRef: { source: { id: 'fs_' + 'b'.repeat(24), rev: ref.source.rev } } };
  const sent = [];
  for (const raw of [false, true]) viewPassage(ref, { blocks: [file], focus: () => {}, emit: event => sent.push(event.detail), wait: fn => fn(), raw });
  assert.deepEqual(sent.map(d => d.raw === true), [false, true]);
});
