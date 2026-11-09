// The shared card header (CardHeader.jsx; owner 2026-11-07): icon, title (or a placeholder), one meta line, double-click rename. Markup only, no browser.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = name => readFileSync(join(here, name), 'utf8').replace(/\r\n/g, '\n');
const tmp = mkdtempSync(join(tmpdir(), 'card-header-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
await esbuild.build({
  stdin: { contents: "export { default as CardHeader, CardRename } from './CardHeader.jsx'; export { headerTitleOf, NARROW_CARD_PX, TITLE_TWO_LINES } from './card-rename.js'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: here, loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const lib = createRequire(import.meta.url)(outfile);
const render = (props, start = null) => {
  const header = lib.createElement(lib.CardHeader, props);
  return lib.renderToStaticMarkup(start ? lib.createElement(lib.CardRename.Provider, { value: start }, header) : header);
};

test('the header shows the type icon, the card title and one meta line, pinned above the body', () => {
  const markup = render({ block: { id: 'b1', type: 'explanation', title: 'How a gradient works' }, meta: 'Explanation' });
  assert.match(markup, /data-card-header/);
  assert.match(markup, /data-card-icon/, 'an icon, not the old dot');
  assert.match(markup, /<h3 data-card-title[^>]*>How a gradient works<\/h3>/);
  assert.match(markup, /data-card-meta[^>]*>Explanation</);
  assert.doesNotMatch(markup, /rounded-full bg-ink/, 'no dot');
  assert.match(markup, /shrink-0/, 'it never shrinks away from the top of the card');
});

test('no title: a muted placeholder to rename, never the file name; the learner\'s name wins over everything', () => {
  const placeholder = render({ block: { id: 'q1', type: 'quiz' } });
  assert.match(placeholder, /data-card-title-placeholder/);
  assert.match(placeholder, /italic/);
  const file = render({ block: { id: 'f1', type: 'file', kind: 'markdown', label: 'en.md' }, meta: 'en.md · Markdown · MD · 21 KiB · UTF-8' });
  assert.match(file, /data-card-title-placeholder/, 'a file card without a name shows the placeholder');
  assert.match(file, /Untitled file/);
  assert.match(file, /data-card-meta[^>]*>en\.md · Markdown/, 'the file name comes first in the meta line');
  const named = render({ block: { id: 'f1', type: 'file', kind: 'markdown', label: 'en.md', customTitle: 'Lecture notes' }, meta: 'en.md' });
  assert.doesNotMatch(named, /data-card-title-placeholder/);
  assert.match(named, /<h3[^>]*>Lecture notes<\/h3>/);
});

test('double-click rename is offered only where the canvas provides it and the card is renamable', () => {
  const block = { id: 'b1', type: 'table', title: 'Costs' };
  assert.doesNotMatch(render({ block }), /Double-click to rename/, 'no provider (a read-only board or a copy): no rename');
  assert.match(render({ block }, () => {}), /Double-click to rename/);
  assert.doesNotMatch(render({ block: { id: 'x' } }, () => {}), /Double-click to rename/, 'not a block: nothing to rename');
});

test('sticky, the trailing actions, the size and the passed attributes are applied', () => {
  const markup = render({ block: { id: 'b1', type: 'image', title: 'Tree' }, sticky: true, size: 'lg', trailing: lib.createElement('button', { 'data-act': '' }, 'x'), titleProps: { 'data-file-doc-title': '' }, metaProps: { 'data-file-doc-meta': '' }, meta: 'Image', className: 'px-3 pb-2' });
  assert.match(markup, /sticky top-0 z-10 bg-white/);
  assert.match(markup, /text-xl/);
  assert.match(markup, /data-act/);
  assert.match(markup, /data-file-doc-title/);
  assert.match(markup, /data-file-doc-meta/);
  assert.match(markup, /px-3 pb-2/);
});

test('sources: the dot Kicker is gone, every body hands its block to the header, and the canvas provides the rename starter', () => {
  const blocks = read('LearningBlocks.jsx');
  assert.doesNotMatch(blocks, /h-1\.5 w-1\.5 rounded-full bg-ink/, 'the Explanation card and every generic card lost the dot');
  assert.ok(!blocks.includes('{block.title}</p>'), 'no separate scrolling title line remains in a body');
  const kickers = blocks.match(/<Kicker\b[^>]*>/g) || [];
  assert.ok(kickers.length >= 20 && kickers.every(tag => /block=\{block\}/.test(tag)), 'every Kicker names its block');
  assert.match(blocks, /<div data-explanation-head data-focus-hide className="shrink-0">/, 'the Explanation card keeps its pinned head');
  assert.match(blocks, /return <CardHeader block=\{block\} meta=\{children\} trailing=\{trailing\} size=\{size\} sticky=\{sticky\} className=\{className\} icon=\{icon\} \/>;/);
  const canvas = read('AdaptiveCanvas.jsx');
  assert.match(canvas, /<CardRename\.Provider value=\{readOnly \|\| localCopy \? null : startRename\}>/);
  assert.match(canvas, /rename: id => startRename\(id\),/, 'the right-click Rename and the header open the same editor');
  const file = read('FileDocCard.jsx');
  assert.match(file, /<CardHeader block=\{block\}[^]*meta=\{\[block\.label, KIND_LABEL\[block\.kind\]/, 'the file card: its title is the card title, the file name leads the meta line');
});

test('the title wraps (owner 2026-11-08 final): the whole 160-character title is in the markup, clamped to two lines (three when the header is narrower than 440 px), never one nowrap truncated line; the whole text is the tooltip', () => {
  const long = 'How a gradient descent step uses the learning rate, the slope of the loss and the previous weights to choose the next weights in a model';
  const full = `${long} ${long}`.slice(0, 160).trim();
  for (const type of ['explanation', 'note', 'table']) {
    const markup = render({ block: { id: 'b1', type, title: full }, meta: 'Card' }, () => {});
    const h3 = markup.match(/<h3 data-card-title[^>]*>[^<]*<\/h3>/)[0];
    assert.ok(h3.includes(`>${full}<`), `${type}: the whole title is rendered`);
    assert.doesNotMatch(h3, /truncate|whitespace-nowrap|text-ellipsis/, 'not the one-line clip any more');
    assert.match(h3, /line-clamp-2/, 'two lines');
    assert.match(h3, /@max-\[405px\]:line-clamp-3/, 'three lines on a header narrower than a 440 px card (the minimized tile at 408 px, a narrow card)');
    assert.match(h3, /break-words/);
    assert.ok(h3.includes(`title="${full}"`), 'the whole text is the tooltip when it is long');
    assert.doesNotMatch(markup, /…|\.\.\./, 'the ellipsis is drawn by CSS only when the clamp is hit, never written into the text');
  }
});

test('a long unbroken token wraps too, and a title over 80 characters is not cut by the header name', () => {
  const token = 'Supercalifragilisticexpialidocious'.repeat(5);
  assert.match(render({ block: { id: 'b1', type: 'note', title: token } }), new RegExp(`>${token}</h3>`));
  const eighty = 'word '.repeat(40).trim(); // 199 characters, far over the 80 the derived name used to be cut at
  assert.equal(lib.headerTitleOf({ type: 'note', title: eighty }), eighty);
  assert.equal(lib.headerTitleOf({ type: 'note', title: eighty, customTitle: 'Mine' }), 'Mine', 'the learner\'s name still wins');
});

test('the header grows with the title: the row is top-aligned, the icon and trailing controls sit on the first line, the meta line stays one line', () => {
  const markup = render({ block: { id: 'b1', type: 'explanation', title: 'A title that needs more than one line at the narrowest card width, long enough for three' }, meta: 'Explanation', trailing: lib.createElement('span', null, 'T') });
  assert.match(markup, /items-start gap-2/, 'top-aligned: the title may take several lines');
  assert.match(markup, /shrink-0 text-ink-2 mt-0\.5/, 'the icon sits on the first line');
  assert.match(markup, /shrink-0 items-center gap-1 h-5/, 'the trailing controls are one first-line high');
  assert.match(markup, /data-card-meta="true" class="mt-0\.5 truncate/, 'the meta line is unchanged: one line');
});

test('the narrow breakpoint and the tooltip threshold are one named number each: the class says NARROW_CARD_PX - 3, a short title keeps the rename hint', () => {
  const source = read('CardHeader.jsx');
  assert.ok(source.includes(`@max-[${lib.NARROW_CARD_PX - 35}px]:line-clamp-3`), 'the container query is the header width of a card narrower than NARROW_CARD_PX (a container query measures the content box: 440 less the 2 px border and the 32 px padding, less 1)');
  assert.match(source, /@container shrink-0/, 'the header is the query container');
  const short = render({ block: { id: 'b1', type: 'note', title: 'Short title' } }, () => {});
  assert.match(short, /<h3 data-card-title[^>]* title="Double-click to rename"/);
  const edge = 'x'.repeat(lib.TITLE_TWO_LINES);
  assert.match(render({ block: { id: 'b1', type: 'note', title: edge } }, () => {}), /title="Double-click to rename"/, 'at the threshold it still fits two lines');
  assert.match(render({ block: { id: 'b1', type: 'note', title: edge + 'y' } }, () => {}), new RegExp('title="' + edge + 'y"'), 'one over: the whole text is the tooltip');
});

test('which headers are narrow: the 408 px tile and a 320 px card get three title lines, the 440 px card and the 546 px picture tile two (container query on the header content width)', () => {
  const content = cardWidth => cardWidth - 2 - 32; // the 2 px border and the header's 32 px side padding
  const narrow = cardWidth => content(cardWidth) <= lib.NARROW_CARD_PX - 35;
  assert.deepEqual([320, 408, 440, 546].map(narrow), [true, true, false, false]);
});
