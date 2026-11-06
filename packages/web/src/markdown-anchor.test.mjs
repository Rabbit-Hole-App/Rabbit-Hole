// Fix C part 3: a Markdown passage found in the text the card SHOWS, from raw-Markdown offsets or a minted anchor. The rendered side is the real Md.jsx output (server render,
// tags removed, entities decoded = textContent), so a heading, emphasis, a link, a table, a list and a code block are tested against what the viewer really draws.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { anchorOfRange, foldMarkdown, resolveFolded } from './markdown-anchor.js';
import { passageTarget, resolvePassage, resolveQuote } from './source-ref.js';
import { foldedQuote } from './markdown-anchor.js';

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
const rendered = raw => lib.renderToStaticMarkup(lib.createElement(lib.Md, { text: raw, doc: true, fences: true })).replace(/<[^>]+>/g, '').replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, e => ENTITIES[e]);

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
  'Repeat until the loss stops falling.',
].join('\n');
const span = (raw, phrase) => [raw.indexOf(phrase), raw.indexOf(phrase) + phrase.length];
const place = (raw, phrase) => {
  const [start, end] = span(raw, phrase), anchor = anchorOfRange(raw, start, end), shown = rendered(raw);
  const found = resolveFolded(shown, anchor);
  return { anchor, shown, found, text: found.status === 'resolved' ? shown.slice(found.start, found.end) : null };
};

test('the raw quote of a heading, bold, a link or a table is NOT in the rendered text, and the old matcher says missing (the defect)', () => {
  const shown = rendered(DOC);
  for (const phrase of ['## Update rule', 'The **gradient** of the loss', '[the notes](https://example.com/notes?a=1)', '| `w` | the weight vector |']) {
    assert.equal(resolveQuote(shown, { exact: phrase, prefix: '', suffix: '' }).status, 'missing', phrase);
  }
});

test('a heading, emphasis, a link, a table row and a list item resolve in the rendered text, to the words the viewer shows', () => {
  assert.equal(place(DOC, '## Update rule').text, 'Update rule');
  assert.equal(place(DOC, 'The **gradient** of the loss at a point is the *slope* there.').text, 'The gradient of the loss at a point is the slope there', 'the span runs from the first letter to the last letter or digit');
  const link = place(DOC, 'See [the notes](https://example.com/notes?a=1) for more.');
  assert.equal(link.text, 'See the notes for more', 'the URL is not drawn, so it is not in the passage');
  assert.equal(place(DOC, '| `w` | the weight vector |').text, 'wthe weight vector', 'a table cell is drawn without its pipes');
  assert.equal(place(DOC, '2. Step against it by the learning rate.').text, 'Step against it by the learning rate', 'the list number is the list\'s, not text');
  assert.equal(place(DOC, 'Repeat until the loss stops falling.').text, 'Repeat until the loss stops falling');
});

test('a passage across blocks (heading to paragraph) resolves from the first word to the last', () => {
  const raw = DOC, [start] = span(raw, '# Gradient descent'), [, end] = span(raw, 'is the *slope* there.');
  const anchor = anchorOfRange(raw, start, end), shown = rendered(raw), found = resolveFolded(shown, anchor);
  assert.equal(found.status, 'resolved');
  assert.match(shown.slice(found.start, found.end), /^Gradient descentThe gradient of the loss at a point is the slope there$/);
});

test('a repeated sentence is told apart by its context; with the same context it is ambiguous, never the first match', () => {
  const raw = 'Intro **A**.\n\nThe loss falls.\n\nMiddle B.\n\nThe loss falls.\n\nEnd C.';
  const [first] = span(raw, 'The loss falls.'), second = raw.lastIndexOf('The loss falls.');
  const at = start => resolveFolded(rendered(raw), anchorOfRange(raw, start, start + 'The loss falls.'.length));
  const one = at(first), two = at(second);
  assert.equal(one.status, 'resolved'); assert.equal(two.status, 'resolved');
  assert.ok(one.start < two.start, 'each is its own occurrence');
  const bare = resolveFolded(rendered(raw), { exact: 'thelossfalls', prefix: '', suffix: '' });
  assert.equal(bare.status, 'ambiguous');
});

test('a passage that is no longer there is missing, and the file changing under it is reported, not searched for', () => {
  const quote = { exact: 'Repeat until the loss **stops** falling.', prefix: '', suffix: '' };
  const raw = DOC.replace('stops falling', '**stops** falling');
  assert.equal(passageTarget({ text: rendered(raw.replace('**stops** falling', 'is flat')), rev: 'r1', detail: { rev: 'r1', quote } }).status, 'missing');
  assert.deepEqual(passageTarget({ text: rendered(raw), rev: 'r2', detail: { rev: 'r1', quote } }), { status: 'changed' });
  assert.equal(passageTarget({ text: rendered(raw), rev: 'r1', detail: { rev: 'r1', quote } }).status, 'resolved');
});

test('resolvePassage: a selected (rendered) quote resolves exactly as before; a minted RAW quote with its raw context is found folded; neither guesses', () => {
  const shown = rendered(DOC);
  assert.deepEqual(resolvePassage(shown, { exact: 'Update rule', prefix: '', suffix: '' }), resolveQuote(shown, { exact: 'Update rule', prefix: '', suffix: '' }));
  for (const phrase of ['## Update rule', 'The **gradient** of the loss at a point is the *slope* there.', 'See [the notes](https://example.com/notes?a=1) for more.', '| `w` | the weight vector |', '2. Step against it by the learning rate.']) {
    const at = DOC.indexOf(phrase), quote = { exact: phrase, prefix: DOC.slice(Math.max(0, at - 100), at), suffix: DOC.slice(at + phrase.length, at + phrase.length + 100) };
    const found = resolvePassage(shown, quote);
    assert.equal(found.status, 'resolved', phrase);
    assert.deepEqual(found, resolveFolded(shown, anchorOfRange(DOC, at, at + phrase.length)), 'the folded raw quote lands where the raw offsets do');
  }
  assert.equal(resolvePassage('nothing relevant', { exact: 'The **gradient**', prefix: '', suffix: '' }).status, 'missing');
  const twice = 'A.\n\nThe **loss** falls.\n\nB.\n\nThe loss falls.';
  assert.equal(resolvePassage(rendered(twice), { exact: 'The **loss** falls.', prefix: '', suffix: '' }).status, 'ambiguous', 'no context: ambiguous, never the first');
  assert.equal(resolvePassage(rendered(twice), { exact: 'The **loss** falls.', prefix: 'A.\n\n', suffix: '\n\nB.' }).status, 'resolved');
  assert.deepEqual(foldedQuote({ exact: '**Bold** [x](u)', prefix: '# H', suffix: '' }), { exact: 'boldx', prefix: 'h', suffix: '' });
});

test('raw syntax the renderer does not draw is taken out of the raw side only', () => {
  const raw = 'Para with &amp; entity, <b>tag</b> and ![alt](img.png "t") end.\n\n[ref]: https://example.com\n';
  assert.equal(foldMarkdown(raw).folded, 'parawithentitytagandaltend');
  assert.equal(anchorOfRange('---\n---\n', 0, 8), null, 'nothing to show');
});
