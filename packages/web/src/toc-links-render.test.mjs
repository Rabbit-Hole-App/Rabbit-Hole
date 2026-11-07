// Add a link > Link to TOC, rendered (owner 2026-11-07; no browser): the card's "Linked section" row beside its canvas links, the contents row's linked
// cards and its "Add a link" icon, the chooser and the picker, and the wiring (pinned in the source) that opens the contents and highlights the section.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = name => fileURLToPath(new URL('./' + name, import.meta.url));
const read = name => readFileSync(here(name), 'utf8').replace(/\r\n/g, '\n');
const tmp = mkdtempSync(join(tmpdir(), 'toc-links-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
await esbuild.build({
  stdin: { contents: "export { default as CanvasRefChips, CanvasRefs } from './CanvasRefChips.jsx'; export { default as TableOfContents } from './TableOfContents.jsx'; export { default as ItemPicker, AddLinkChooser } from './LinkPickers.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  plugins: [{ name: 'asset-url-stub', setup(build) { build.onResolve({ filter: /[?](url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset-stub' })); build.onLoad({ filter: /.*/, namespace: 'asset-stub' }, () => ({ contents: 'export default ""', loader: 'js' })); } }],
  loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty', '.svg': 'empty', '.png': 'empty', '.wasm': 'empty', '.py': 'text', '.md': 'text', '.txt': 'text', '.html': 'text' },
});
const lib = createRequire(import.meta.url)(outfile);
const html = element => lib.renderToStaticMarkup(element);
const count = (markup, text) => markup.split(text).length - 1;

const refs = (over = {}) => ({ resolve: target => ({ title: 'Other ' + target, href: '/c/' + target, path: '' }), go() {}, onRemove() {}, refsOf: () => [], tocLinksOf: () => [], goToc() {}, onRemoveToc() {}, ...over });
const chips = value => html(lib.createElement(lib.CanvasRefs.Provider, { value }, lib.createElement(lib.CanvasRefChips, { id: 'c1' })));

test('a card shows its section link as a "Linked section" row, in the same row look as a linked canvas, with Open and a Remove link menu', () => {
  const markup = chips(refs({ tocLinksOf: () => [{ id: 'h2', title: 'Slopes' }] }));
  assert.equal(count(markup, 'Linked section'), 1);
  assert.match(markup, /data-toc-link="h2"/);
  assert.match(markup, /data-toc-link-title[^>]*>Slopes</, 'the section title');
  assert.match(markup, /data-toc-link-open/, 'Open');
  assert.match(markup, /aria-label="Open Slopes in the table of contents"/);
  assert.match(markup, /aria-label="Link options"/, 'the options menu is there where the board can be edited');
  assert.doesNotMatch(markup, /<a /, 'a section link is not a URL: Open goes through the page (goToc), never an address');
});

test('beside canvas links: canvas rows first, then section rows; two show and the rest sit under +N more', () => {
  const markup = chips(refs({ refsOf: () => [{ id: 'r1', target: 'canvas-a' }], tocLinksOf: () => [{ id: 'h1', title: 'Intro' }, { id: 'h2', title: 'Slopes' }, { id: 'h3', title: 'Tiny' }] }));
  const order = [markup.indexOf('Linked canvas'), markup.indexOf('Linked section')];
  assert.ok(order[0] > 0 && order[1] > order[0], 'a canvas link, then a section link');
  assert.equal(count(markup, 'data-ref-chip=""'), 2, 'two rows');
  assert.match(markup, /\+2 more/);
});

test('a view-only board shows the link but no way to remove it; a page without a contents panel shows none', () => {
  const viewOnly = chips(refs({ onRemoveToc: undefined, tocLinksOf: () => [{ id: 'h2', title: 'Slopes' }] }));
  assert.match(viewOnly, /Linked section/);
  assert.doesNotMatch(viewOnly, /aria-label="Link options"/);
  assert.equal(chips(refs()), '', 'nothing linked, nothing drawn');
  const canvas = read('AdaptiveCanvas.jsx');
  assert.ok(canvas.includes("tocLinksOf: id => (refLinks.goToc ? resolvedLinks(blocks.find(block => block.id === id), outline) : [])"), 'the member page has no contents tab (no goToc): no section rows there');
});

const outline = [{ id: 'h1', level: 1, label: 'Intro', done: false, description: '' }, { id: 'h2', level: 2, label: 'Slopes', done: false, description: '' }];
const toc = props => html(lib.createElement(lib.TableOfContents, { outline, canvasApi: { current: null }, tocLinks: [], ...props }));

test('a contents row lists its linked cards (derived from the cards), with Go to the card and an unlink, and has the Add a link icon', () => {
  const markup = toc({ onAddLink() {}, tocLinks: [['c1', 'Gradients', ['h2']], ['c2', 'Loss', ['h2']]] });
  const rows = markup.split('data-toc-entry=').slice(1);
  const slopes = rows.find(row => row.includes('Slopes') && row.includes('data-toc-linked-card'));
  assert.ok(slopes, 'the linked cards sit in their section row');
  assert.equal(count(slopes, 'data-toc-linked-card="'), 2);
  assert.match(slopes, /data-toc-linked-card="c1"/);
  assert.match(slopes, /data-toc-unlink/);
  assert.equal(count(markup, 'data-toc-add-link'), 2, 'Add a link on every manual section row (Intro and Slopes)');
  assert.match(markup, /title="Add a link \(a card\)"/);
  const intro = rows.find(row => row.startsWith('"h1"'));
  assert.ok(intro && !intro.includes('data-toc-linked-card'), 'a section nobody links to lists no cards');
});

test('more than two linked cards collapse to +N more; a viewer sees the cards but cannot add or unlink', () => {
  const many = [['c1', 'A', ['h1']], ['c2', 'B', ['h1']], ['c3', 'C', ['h1']], ['c4', 'D', ['h1']]];
  const markup = toc({ onAddLink() {}, tocLinks: many });
  assert.equal(count(markup, 'data-toc-linked-card="'), 2);
  assert.match(markup, /data-toc-links-more[^>]*>\+2 more</);
  const viewer = toc({ readOnly: true, onAddLink() {}, tocLinks: many });
  assert.match(viewer, /data-toc-linked-card="c1"/);
  assert.doesNotMatch(viewer, /data-toc-unlink|data-toc-add-link/);
  assert.doesNotMatch(toc({ tocLinks: many }), /data-toc-add-link/, 'no picker to open: no icon');
});

test('Add a link opens a chooser with Link to canvas and Link to TOC; the section picker lists numbered sections and marks the linked one', () => {
  const chooser = html(lib.createElement(lib.AddLinkChooser, { onChoose() {}, onClose() {} }));
  assert.match(chooser, /data-add-link-chooser/);
  assert.match(chooser, />Add a link</);
  assert.match(chooser, /data-link-choice="canvas"[^>]*>.*Link to canvas/s);
  assert.match(chooser, /data-link-choice="toc"[^>]*>.*Link to TOC/s);
  const picker = html(lib.createElement(lib.ItemPicker, { title: 'Link to TOC', searchLabel: 'Search sections', items: [{ id: 'h1', title: 'Intro', path: '1' }, { id: 'h2', title: 'Slopes', path: '1.1' }], linked: ['h2'], onPick() {}, onClose() {} }));
  assert.match(picker, /data-item-picker/);
  assert.match(picker, /placeholder="Search sections"/);
  assert.match(picker, /data-picker-option="h1"/);
  assert.match(picker, /tabular-nums">1\.1</, 'the number path');
  assert.equal(count(picker, 'data-already-linked'), 1);
  const empty = html(lib.createElement(lib.ItemPicker, { title: 'Link to TOC', searchLabel: 'Search sections', items: [], emptyText: 'No sections in the table of contents yet.', onPick() {}, onClose() {} }));
  assert.match(empty, /No sections in the table of contents yet\./);
});

test('the wiring: the menu row is "Add a link", the page opens the contents tab and highlights the section, removing a section prunes its links', () => {
  const actions = read('canvas-actions.js'), menus = read('canvas-menus.js'), page = read('LearnPage.jsx'), canvas = read('AdaptiveCanvas.jsx'), tocSource = read('TableOfContents.jsx');
  assert.match(actions, /\{ id: 'link-canvas', label: 'Add a link', icon: 'Link2'/, 'the right-click row, ids and data attributes kept');
  assert.match(actions, /data: 'data-menu-link-canvas'/);
  assert.match(menus, /\{ label: 'Add a link', icon: Link, onSelect: onLinkToCanvas \}/, 'the Insert menu row');
  assert.match(page, /onLinkCanvas=\{setAddLink\}/);
  assert.match(page, /onLinkToCanvas: \(\) => setAddLink\(\{\}\)/);
  assert.match(page, /onChoose=\{kind => \{ const arg = addLink; setAddLink\(null\); if \(kind === 'canvas'\) setRefPick\(arg\); else setTocPick\(arg\); \}\}/, 'canvas keeps the existing picker');
  assert.match(page, /goToc: entryId => \{ setPanelOpen\(true\); setPanelTab\('toc'\); setTocFlash\(\{ id: entryId, key: performance\.now\(\) \}\); \}/);
  assert.match(page, /<TableOfContents tocLinks=\{canvasState\.tocLinks\} onAddLink=\{entryId => setCardPick\(\{ entryId \}\)\} flash=\{tocFlash\}/);
  assert.match(page, /if \(tocPick\.blockId\) return canvasApi\.current\?\.addTocLink\?\.\(tocPick\.blockId, entry\.id\) \|\| \{ ok: false \}; setCardPick\(\{ entryId: entry\.id \}\); return \{ ok: true \};/, 'with no card chosen yet: a section, then a card by title');
  assert.match(canvas, /removeSection: id => \{ if \(readOnlyRef\.current\) return; snapshot\(\); setToc\(removeTocEntry\(blocksRef\.current, tocRef\.current, id\)\); \},/, 'removing a section still changes the contents only (learn-outline-model.test.mjs): the cards are not written');
  assert.match(canvas, /withTocLink\(withLiveLinks\(blocksRef\.current\.find\(block => block\.id === blockId\), entries\), entryId\)/, 'dead links are dropped when a link is written, not when a section is removed');
  assert.match(canvas, /addTocLink: \(blockId, entryId\) => \{[\s\S]*?snapshot\(\);[\s\S]*?tocLinks: next\.tocLinks/, 'each link is one undo step');
  assert.match(canvas, /tocLinks: JSON\.parse\(linksKey\)/, 'the page learns which card links to which section');
  assert.match(tocSource, /scrollIntoView\(\{ block: 'center', behavior: calm \? 'auto' : 'smooth' \}\)/);
  assert.match(tocSource, /prefers-reduced-motion: reduce/);
  assert.match(tocSource, /motion-reduce:transition-none/, 'the highlight fades; no animation under reduced motion');
  assert.match(tocSource, /setTimeout\(\(\) => setFlashed\(previous => \(previous === flash\.id \? null : previous\)\), 1600\)/, 'a moment, then it clears');
  assert.match(tocSource, /ancestorsOf\(outline, flash\.id\)/, 'a folded parent opens so the row is on screen');
});
