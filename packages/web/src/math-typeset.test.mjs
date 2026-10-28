// Equations render as typeset math in card fields as well as chat (owner brief 2026-10-28): the challenge hint and submitted answer,
// quiz choices, flashcards and table cells go through Md / MdInline, which share MathText's KaTeX config (trust:false). Bundled with
// esbuild and rendered with react-dom/server, as md-render.test.mjs does; layout at narrow widths needs a browser and is not covered here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'math-typeset-')), outfile = join(dir, 'm.cjs');
const stubs = { name: 'stubs', setup(build) {
  build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
  build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
} };
await esbuild.build({
  stdin: { contents: "export { LearningBlockBody } from './LearningBlocks.jsx'; export { Md, MdInline } from './Md.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [stubs],
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });
const card = block => B.renderToStaticMarkup(B.createElement(B.LearningBlockBody, { block, onChange() {}, onFile() {}, appName: 'x' }));
const inline = (text, props = {}) => B.renderToStaticMarkup(B.createElement('p', null, B.createElement(B.MdInline, { text, ...props })));
// What a reader sees: KaTeX keeps its TeX source in a MathML annotation, never on screen.
const visible = html => html.replace(/<annotation[^>]*>[\s\S]*?<\/annotation>/g, '').replace(/<[^>]+>/g, '');
const SOFTMAX = String.raw`$\operatorname{softmax}(z)_i = \frac{e^{z_i}}{\sum_j e^{z_j}}$`;
const typeset = html => (html.match(/class="katex"/g) || []).length;

test('the softmax formula typesets in a challenge prompt and its hint: fraction, subscripts, superscripts, operatorname, no raw dollar', () => {
  const html = card({ id: 'c1', type: 'challenge', prompt: `What does ${SOFTMAX} do to the scores?`, hint: `Think of ${SOFTMAX} as shares of one whole.`, expects: ['a', 'b'], answer: null });
  assert.equal(typeset(html), 2, 'prompt and hint each hold one equation');
  assert.doesNotMatch(html, /katex-error/);
  assert.match(html, /class="mfrac"/);
  assert.match(html, /class="msupsub"/);
  assert.match(html, /<span class="mop"><span class="mord mathrm">softmax<\/span><\/span>/, '\operatorname sets upright softmax');
  const text = visible(html);
  assert.doesNotMatch(text, /\$|\\frac|\\operatorname|\\sum/, 'no delimiter or TeX command on screen');
  // The hint stays inside its italic paragraph: MdInline adds no block element there.
  const hint = html.match(/<p class="mt-1 text-xs text-ink-2 italic">([\s\S]*?)<\/p>/)[1];
  assert.match(hint, /^Think of <span data-chat-math="inline"[^>]*><span class="katex">/);
  assert.doesNotMatch(hint, /<(div|p)[ >]/);
});

test('a submitted answer is typeset where the learner wrote math; currency and prose stay as typed', () => {
  const html = card({ id: 'c2', type: 'challenge', prompt: 'p', hint: 'h', expects: ['a', 'b'], answer: `It becomes ${SOFTMAX}, about $5 or $10 and my_var * 2`, verdict: 'VERDICT: partial\nClose.' });
  const answer = html.match(/<span data-answer[\s\S]*?<\/span><\/div>/)?.[0] || '';
  assert.match(answer, /class="katex"/);
  assert.match(visible(answer), /about \$5 or \$10 and my_var \* 2/);
  assert.doesNotMatch(answer, /<em>/, 'a learner\'s asterisks are not emphasis');
});

test('quiz options, flashcard sides and table cells typeset', () => {
  const quiz = card({ id: 'q', type: 'quiz', question: 'Which is the softmax?', options: [{ key: 'A', text: SOFTMAX, correct: true }, { key: 'B', text: 'costs $5' }], why: String.raw`Because $\sum_j p_j = 1$.`, choice: 'A' });
  assert.equal(typeset(quiz), 2, 'option A and the why');
  assert.match(visible(quiz), /costs \$5/);
  const flash = card({ id: 'f', type: 'flashcards', cards: [{ front: SOFTMAX, back: String.raw`$\frac{a}{b}$` }] });
  assert.equal(typeset(flash), 2, 'both sides are drawn (the back is hidden by CSS, not removed)');
  const table = card({ id: 't', type: 'table', title: 'T', columns: ['f', 'value'], rows: [[SOFTMAX, String.raw`$e^{x}$`], ['snake_case_name', '$5']] });
  assert.equal(typeset(table), 2);
  assert.match(visible(table), /snake_case_name/);
  assert.match(visible(table), /\$5/);
});

test('explanation folded-section label typesets inside its button without a block element', () => {
  const html = card({ id: 'e', type: 'explanation', title: 'T', body: 'b', more: [{ label: String.raw`Why $x_i$?`, text: 't' }] });
  const button = html.match(/<button[^>]*data-explain-more[\s\S]*?<\/button>/)[0];
  assert.match(button, /class="katex"/);
  assert.doesNotMatch(button, /<(div|p)[ >]/);
});

test('literal code, filenames, snake_case and currency are untouched', () => {
  assert.equal(visible(inline('call my_var_name in train_model.py with `x_1 * y_2`, it costs $5')), 'call my_var_name in train_model.py with x_1 * y_2, it costs $5');
  assert.equal(visible(inline('$10 and $20 are prices')), '$10 and $20 are prices');
  assert.equal(typeset(inline('$10 and $20 are prices')), 0);
  assert.equal(typeset(inline('code `$x$` stays code')), 0);
  assert.match(inline('a_b_c and 2 * 3 * 4'), /a_b_c and 2 \* 3 \* 4/);
});

test('streaming: an unterminated $ or $$ is plain text, never a throw or half an equation', () => {
  for (const text of ['Think of $\\frac{a}{', 'Think of $$\\frac{a}{', 'It is $x^2 and then', '$']) {
    const html = inline(text);
    assert.equal(typeset(html), 0, text);
    assert.doesNotMatch(html, /katex-error/);
  }
  assert.equal(typeset(inline('Think of $x^2$ and then $\\fra')), 1, 'the closed equation typesets, the open tail stays text');
  assert.equal(inline(undefined), '<p></p>', 'a missing hint renders nothing');
});

test('KaTeX stays untrusted: a javascript: link inside math is not rendered as a link', () => {
  const html = inline(String.raw`$\href{javascript:alert(1)}{x}$`);
  assert.doesNotMatch(html, /<a[ >]/);
  assert.doesNotMatch(html, /href="javascript/);
  assert.match(readFileSync(new URL('./MathText.jsx', import.meta.url), 'utf8'), /trust: false/);
});

test('display math inside an inline container is typeset inline, never a block', () => {
  const html = inline('So $$x^2$$ here');
  assert.match(html, /data-chat-math="inline"/);
  assert.doesNotMatch(html, /data-chat-math="display"/);
});
