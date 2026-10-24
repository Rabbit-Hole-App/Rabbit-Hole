// WP6 (owner brief 2026-10-24, C:/s/spec/focus-study/wp6-brief.md): the compact Study header and PDF row. LearnPaper is bundled
// with esbuild and rendered with react-dom/server (as provenance-group.test.mjs renders its component); pdf.js is stubbed, so
// this proves the markup of each presentation before a document loads, and the default reader's row as it was. Heights, the
// folds below 400 px, the menus and the scanned-page information need a browser: e2e/study-compact-header-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { sourceOrigin, versionLine } from './study-ref.js';

const dir = mkdtempSync(join(tmpdir(), 'study-compact-')), outfile = join(dir, 'paper.cjs');
const stub = { name: 'stub-pdfjs', setup(build) { build.onResolve({ filter: /learn-paper-figures/ }, () => ({ path: 'figures', namespace: 'stub' })); build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const getDocument = () => { throw Error("not in this test"); };', loader: 'js' })); } };
await esbuild.build({
  stdin: { contents: "export { default as LearnPaper } from './LearnPaper.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [stub], loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const paper = { id: 'upload:abc', title: 'Tides.pdf', page: 1, pdfUrl: null };
const companion = { key: null, home: null, anchor: null, plainChat: () => null };
const render = props => B.renderToStaticMarkup(B.createElement(B.LearnPaper, { app: 'canvas-1', paper, onPage() {}, ...props }));

test('the default presentation is the reader as it was: the source line row, the wrapping companion row, no Study fold', () => {
  const html = render({ companion });
  assert.match(html, /^<section aria-label="Paper reader" class="relative flex min-h-0 flex-1 flex-col">/, 'the section, no container');
  assert.match(html, /<header class="flex shrink-0 items-center gap-2 border-b border-line pb-2 text-xs text-ink flex-wrap">/);
  assert.match(html, /<div class="min-w-0 flex-1 basis-full"><p class="truncate text-xs text-ink-2">Your upload<\/p><\/div>/);
  assert.match(html, /aria-label="Open original PDF" class="rounded border border-line p-1 hover:bg-hover"/);
  assert.doesNotMatch(html, /data-pdf-more|@container|@max-/);
  assert.equal(render({ companion, presentation: 'anything else' }), html, 'only study is compact');
  const card = render({});
  assert.match(card, /<h3 class="truncate text-sm font-medium">Tides\.pdf<\/h3>/, 'the canvas paper card keeps its title');
  assert.match(card, /<header class="flex shrink-0 items-center gap-2 border-b border-line pb-2 text-xs text-ink ">/);
});

test('the study presentation is one 40 px row with no source line; its More PDF tools button waits for the narrow fold', () => {
  const html = render({ companion, presentation: 'study' });
  assert.match(html, /^<section aria-label="Paper reader" class="relative flex min-h-0 flex-1 flex-col @container">/);
  assert.match(html, /<header class="flex h-10 shrink-0 items-center gap-1 border-b border-line px-3 text-xs text-ink pointer-coarse:h-12">/);
  assert.doesNotMatch(html, /Your upload|basis-full/, 'the source line is in Reference options');
  assert.match(html, /aria-label="Open original PDF" class="inline-flex [^"]*ml-auto @max-\[400px\]:hidden"/);
  assert.match(html, /data-pdf-more="true" aria-haspopup="menu" aria-expanded="false"[^>]*aria-label="More PDF tools"[^>]*class="hidden [^"]*@max-\[400px\]:inline-flex"/);
  assert.doesNotMatch(html, /\.\.\.|…/, 'no ellipsis in a label');
});

test('Reference options details: an upload or a context document says Your upload, a paper its arXiv number, a card nothing', () => {
  assert.equal(sourceOrigin('pdf', { sourceId: 'doc:ctx:0123456789ab', kind: 'doc' }), 'Your upload');
  assert.equal(sourceOrigin('pdf', { sourceId: 'paper:upload:abc', kind: 'web' }), 'Your upload');
  assert.equal(sourceOrigin('pdf', { sourceId: 'paper:2401.01234', kind: 'web' }), 'arXiv:2401.01234');
  assert.equal(sourceOrigin('text', { sourceId: 'card:n1' }), null);
  assert.equal(sourceOrigin('explanation', null), null);
  assert.equal(sourceOrigin('pdf', null), null);
  assert.equal(versionLine({ sourceId: 'doc:ctx:0123456789ab', version: '' }), 'Version verification unavailable', 'the details keep the version line');
});

test('StudyPane: one header row, the pane name kept, Add to chat on the same addPinned press, failures outside the options', () => {
  const pane = readFileSync(new URL('./StudyPane.jsx', import.meta.url), 'utf8');
  assert.match(pane, /<aside ref=\{box\} aria-label="Pinned reference" data-study-pane/);
  assert.doesNotMatch(pane, /uppercase/, 'no uppercase Pinned reference row');
  assert.match(pane, /data-study-header className="@container flex h-\[42px\] shrink-0 /);
  assert.match(pane, /<SourceReader presentation="study" /);
  assert.equal(pane.match(/onClick=\{addPinned\}/g)?.length, 1, 'one Add to chat, wired to addPinned');
  assert.match(pane, /data-study-attach title="Add to chat" className=\{`\$\{tool\} px-2`\} disabled=\{!canAttach \|\| !chat \|\| \(attach\?\.busy && attach\.cardId === pin\.cardId\)\} onMouseDown=\{event => event\.preventDefault\(\)\} onClick=\{addPinned\}>/,
    'the same disabled rule (pending press) and the mousedown that keeps the PDF selection');
  const menu = pane.slice(pane.indexOf('<Menu portal anchor={options.button.current}'), pane.indexOf('</Menu>}'));
  for (const name of ['>Change reference<', '>Locate on canvas<', '>Unpin<', 'data-study-version', 'Source details']) assert.ok(menu.includes(name), `Reference options holds ${name}`);
  for (const failure of ['data-study-attach-refused', 'data-study-attach-abandoned', 'data-study-unavailable']) assert.ok(!menu.includes(failure) && pane.includes(failure), `${failure} stays in the pane`);
});
