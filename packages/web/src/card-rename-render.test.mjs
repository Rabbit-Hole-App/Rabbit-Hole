// Every card shows the name a learner gave it (owner 2026-11-07): the shared title line, the shared describeBlock title (chat context,
// pills, search), the headers that draw their own, and the save path that must carry the field. Markup and source only, no browser.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { renameBlock } from './card-rename.js';
import { lightBlocks } from './canvas-persist.js';

const tmp = mkdtempSync(join(tmpdir(), 'card-rename-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
await esbuild.build({
  stdin: { contents: "export { default as CardCustomTitle } from './CardCustomTitle.jsx'; export { describeBlock } from './LearningBlocks.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  plugins: [{ name: 'asset-url-stub', setup(build) { build.onResolve({ filter: /[?](url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset-stub' })); build.onLoad({ filter: /.*/, namespace: 'asset-stub' }, () => ({ contents: 'export default ""', loader: 'js' })); } }],
  loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty', '.svg': 'empty', '.png': 'empty', '.wasm': 'empty', '.py': 'text', '.md': 'text', '.txt': 'text', '.html': 'text' },
});
const lib = createRequire(import.meta.url)(outfile);
const read = name => readFileSync(fileURLToPath(new URL('./' + name, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

test('the shared title line shows a renamed card in the card drag zone, and nothing for an unrenamed one', () => {
  const shown = lib.renderToStaticMarkup(lib.createElement(lib.CardCustomTitle, { block: { id: 'q', type: 'quiz', customTitle: '  Week 3 check  ' } }));
  assert.match(shown, /data-card-custom-title/);
  assert.match(shown, /data-drag-zone/);
  assert.ok(shown.includes('>Week 3 check<'));
  assert.equal(lib.renderToStaticMarkup(lib.createElement(lib.CardCustomTitle, { block: { id: 'q', type: 'quiz' } })), '');
  assert.equal(lib.renderToStaticMarkup(lib.createElement(lib.CardCustomTitle, { block: { id: 'q', type: 'quiz', customTitle: '   ' } })), '');
});

test('describeBlock carries the learner name as the title for chat context, pills and search; the card content is unchanged', () => {
  const quiz = { id: 'q', type: 'quiz', question: 'What is a gradient?', options: [{ key: 'A', text: 'A slope' }], answer: 'A' };
  assert.equal(lib.describeBlock(quiz).title, 'What is a gradient?');
  const named = lib.describeBlock({ ...quiz, customTitle: 'Week 3 check' });
  assert.equal(named.title, 'Week 3 check');
  assert.equal(named.text, lib.describeBlock(quiz).text, 'only the title changes');
  assert.equal(lib.describeBlock({ id: 'w', type: 'wiki', title: 'Gradient', customTitle: 'My notes' }), null, 'a card describeBlock never described stays so');
});

test('every card header shows the custom name where it drew its own label (source pins)', () => {
  const canvas = read('AdaptiveCanvas.jsx');
  assert.match(canvas, /Wikipedia\{customTitleOf\(block\) && <span data-card-custom-title/, 'Wikipedia header');
  assert.match(canvas, /PDF<span[^\n]*>\{customTitleOf\(block\) \|\| block\.label\}<\/span>/, 'PDF header');
  assert.match(canvas, /\{customTitleOf\(block\) \|\| block\.label\}<span className="h-px flex-1 bg-line-strong" \/><\/div>/, 'divider');
  assert.match(canvas, /<CardCustomTitle block=\{block\} \/>\n\s+<div data-slide=/, 'slide caption');
  assert.match(canvas, /<CardCustomTitle block=\{block\} \/><CanvasRefCard block=\{block\} \/>/, 'canvas reference');
  assert.match(canvas, /<CardCustomTitle block=\{block\} \/><Suspense fallback=\{<p role="status" className="px-3 text-sm text-ink-2">Loading the graph/, 'repository graph');
  assert.match(canvas, /\{typeof block\.title !== 'string' && <CardCustomTitle block=\{block\} \/>\}/, 'every generic card without its own string title (quiz, practice, flashcards, ...)');
  assert.match(canvas, /startTitleOf\(block, describeBlock\(block\)\?\.title\)/, 'the editor opens on the shown name');
  assert.match(canvas, /title: customTitleOf\(soleCard\) \|\| soleCard\.title/, 'the contents chip');
  assert.match(read('WebpageCard.jsx'), /const title = customTitleOf\(block\) \|\| block\.title \|\| host;/);
  assert.match(read('FileDocCard.jsx'), /\{customTitleOf\(block\) \|\| block\.label\}<\/span>/);
  assert.match(read('ModelCard.jsx'), /\{customTitleOf\(block\) \|\| block\.label\}<\/span>/);
  assert.match(read('NotebookCard.jsx'), /data-card-custom-title/);
});

test('the right-click Rename is gated only by renamable (every block) and read-only/local copy; a chat card is not a block', () => {
  assert.match(read('AdaptiveCanvas.jsx'), /renamable: object => !localCopy && renamable\(object\)/);
  assert.match(read('canvas-actions.js'), /id: 'rename'[^\n]*targets: \['card'\][^\n]*\n\s+applies: \(t, ctx\) => !!ctx\.canvas\.renamable\?\.\(t\.object\)/);
});

test('the custom name travels in the saved board: the doc is stringified whole, light blocks keep every field', () => {
  const blocks = renameBlock([{ id: 'f', type: 'file', kind: 'markdown', label: 'en.md', src: 'data:text/plain;base64,aGk=' }], 'f', 'Lecture 1');
  const light = lightBlocks(blocks);
  assert.equal(light[0].customTitle, 'Lecture 1');
  assert.equal(JSON.parse(JSON.stringify({ blocks: light })).blocks[0].customTitle, 'Lecture 1');
  // The server stores state as one JSON text (control-plane learn-boards.js stateText), with no per-field whitelist.
  const server = read('../../control-plane/src/learn-boards.js');
  assert.ok(!/customTitle/.test(server) && /stateText\(body\?\.state\)/.test(server), 'saveOwn stringifies the whole state');
});
