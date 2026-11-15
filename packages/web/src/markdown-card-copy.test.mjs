// The Markdown card's copy and link additions (owner 2026-11-14): rendered with react-dom/server, no browser. A display equation gets an
// icon-only Copy button that adds no text to the card; a link is marked so the canvas can ask first; a code block and its text are unchanged.
// Clicks and the clipboard need a browser: the wiring is pinned in canvas-paste.test.mjs.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { parseHTML } from 'linkedom';

const dir = mkdtempSync(join(tmpdir(), 'markdown-card-copy-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const outfile = join(dir, 'md.cjs');
await esbuild.build({
  stdin: { contents: "export { Md } from './Md.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  plugins: [{ name: 'stubs', setup(build) {
    build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
    build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
    build.onResolve({ filter: /^(mermaid|shiki|mathlive)$/ }, args => ({ path: args.path, namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default { initialize() {}, async render() { return { svg: "<svg></svg>" }; } }; export class MathfieldElement {} export async function codeToHtml() { throw new Error("stub"); }' }));
  } }],
});
const B = createRequire(import.meta.url)(outfile);
const render = (text, props = {}) => parseHTML(`<main>${B.renderToStaticMarkup(B.createElement(B.Md, { text, fences: true, ...props }))}</main>`).document;

const TEXT = ['Read [the paper](https://example.com/paper) first.', '', '$$', 'Gini(S) = 1 - \\sum p_k^2', '$$', '', '```python', 'print("hi")', '```'].join('\n');

test('a display equation has an icon-only Copy button that adds no text to the card', () => {
  const document = render(TEXT);
  const buttons = [...document.querySelectorAll('[data-math-copy]')];
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].getAttribute('aria-label'), 'Copy equation');
  assert.equal(buttons[0].textContent, '', 'no word in the button: the card\'s text is what it was');
  assert.ok(buttons[0].hasAttribute('data-explanation-ui'), 'the term and passage layers skip it');
  const math = document.querySelector('[data-chat-math="display"]');
  assert.ok(math && math.querySelector('.katex'), 'the equation is still typeset');
});

test('inline maths has no Copy button', () => {
  assert.equal(render('Heat flows $x^2$ always.').querySelectorAll('[data-math-copy]').length, 0);
});

test('a link is marked for the canvas to ask first, and still opens a new tab by itself', () => {
  const link = render(TEXT).querySelector('a');
  assert.equal(link.getAttribute('href'), 'https://example.com/paper');
  assert.equal(link.getAttribute('target'), '_blank');
  assert.ok(link.hasAttribute('data-web-link'));
});

test('a code block keeps its text and its own Copy button', () => {
  const document = render(TEXT);
  assert.equal(document.querySelector('[data-code-block] pre').textContent, 'print("hi")');
  assert.equal(document.querySelectorAll('[data-code-copy]').length, 1);
});

test('the rest of the card text is the same with or without the additions', () => {
  const text = render(TEXT).querySelector('main').textContent;
  assert.ok(text.includes('Read the paper first.'));
  assert.ok(!/Copy equation|Equation copied/.test(text));
});
