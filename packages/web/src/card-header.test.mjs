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
  stdin: { contents: "export { default as CardHeader, CardRename } from './CardHeader.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: here, loader: 'jsx' },
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
