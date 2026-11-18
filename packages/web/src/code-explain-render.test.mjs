// The code-explain card's markup (CodeExplainCard.jsx, CodeLines.jsx; code-explain-card-spec.md section 6): server-rendered, so it proves structure and states only (no effects, no pointer,
// no layout, no colours): a browser check (e2e/code-explain-check.mjs) is what proves the interaction.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const tmp = mkdtempSync(join(tmpdir(), 'code-explain-render-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
await esbuild.build({
  stdin: { contents: "export { default as CodeExplainCard } from './CodeExplainCard.jsx'; export { default as CodeLines } from './CodeLines.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  plugins: [{ name: 'asset-url-stub', setup(build) { build.onResolve({ filter: /[?](url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset-stub' })); build.onLoad({ filter: /.*/, namespace: 'asset-stub' }, () => ({ contents: 'export default ""', loader: 'js' })); } }],
  loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty', '.svg': 'empty', '.png': 'empty', '.wasm': 'empty', '.py': 'text', '.md': 'text', '.txt': 'text', '.html': 'text' },
});
const lib = createRequire(import.meta.url)(outfile);
const render = (type, props) => lib.renderToStaticMarkup(lib.createElement(type, props));
const examples = JSON.parse(readFileSync(fileURLToPath(new URL('./tutor-diagrams/examples.json', import.meta.url)), 'utf8'));

const block = (over = {}) => ({
  id: 'chat-42', type: 'codeExplain', dx: 0, dy: 0, title: 'How attention hides later tokens', question: 'how does attention hide later tokens?',
  repo: 'karpathy/nanoGPT', commit: '3adf61e154c3fe3fca428ad6bc3818b27a3b8291',
  files: [
    { cardId: 'self', path: 'model.py', ranges: [{ id: 'r1', start: 52, end: 60 }, { id: 'r2', start: 67, end: 70 }] },
    { cardId: 'chat-42-file-1', path: 'configurator.py', ranges: [{ id: 'r3', start: 30, end: 34 }] },
  ],
  mentioned: [{ id: 'm1', path: 'bench.py', start: 88, end: 88 }],
  depth: 'standard',
  depths: {
    brief: { prose: 'Attention sets later scores to minus infinity. The softmax gives them zero weight.', anchors: [{ sentence: 0, target: 'r2' }] },
    standard: { prose: 'The model builds a mask. Positions above the diagonal are zero. The mask is applied before the softmax. Softmax zeroes minus infinity. The config can override the block size.', anchors: [{ sentence: 1, target: 'r1' }, { sentence: 2, target: 'r2' }, { sentence: 4, target: 'r3' }] },
    detailed: { prose: 'Take T equal to 4. The mask is tril of ones. A benchmark exercises this path.', anchors: [{ sentence: 1, target: 'r1' }, { sentence: 2, target: 'm1' }], trace: { input: 'T = 4', steps: ['mask = tril(ones(4,4))', 'softmax -> [1, 0, 0, 0]'] } },
  },
  figure: null,
  suggestions: ['Why is the mask added before the softmax?', 'What does -inf do to a probability?', 'What changes with flash attention?'],
  evidence: { model: 'claude-sonnet-5-5', sources: [], createdAt: '2026-11-15T19:20:00Z' },
  ...over,
});
const count = (html, pattern) => (html.match(pattern) || []).length;

test('the card shows the title, the repository at its short commit, Open in Files, three depth radios and the code pane', () => {
  const html = render(lib.CodeExplainCard, { block: block(), readOnly: false });
  assert.match(html, /data-code-explain-card/);
  assert.ok(html.includes('How attention hides later tokens'));
  assert.ok(html.includes('karpathy/nanoGPT @ 3adf61e'));
  assert.match(html, /data-code-explain-open[^>]*>.*Open in Files/);
  assert.equal(count(html, /role="radio"/g), 3);
  assert.match(html, /aria-checked="true" data-depth-option="standard"/);
  assert.match(html, /data-code-explain-path[^>]*>model\.py</);
  assert.match(html, /Show whole file/);
  assert.match(html, /role="status"[^>]*>.*Loading the code/);
  assert.match(html, /aria-label="More code explanation actions"/);
});

test('standard prose is its sentences, one span per anchored sentence, no trace, no figure slot', () => {
  const html = render(lib.CodeExplainCard, { block: block(), readOnly: false });
  assert.equal(count(html, /data-sentence="/g), 5);
  assert.equal(count(html, /data-anchor="/g), 3);
  assert.match(html, /data-sentence="1" data-anchor="r1"[^>]*>Positions above the diagonal are zero\.</);
  assert.match(html, /data-anchor="r3"/);
  assert.equal(count(html, /data-code-explain-trace/g), 0);
  assert.equal(count(html, /data-code-explain-figure/g), 0, 'a null figure draws no slot');
  assert.equal(count(html, /data-anchor-link/g), 0, 'the satellite is here: no link');
});

test('a satellite that is no longer on the board turns its anchor into a file:line link; the sentence stays', () => {
  const html = render(lib.CodeExplainCard, { block: block(), present: id => id !== 'chat-42-file-1' });
  assert.match(html, /data-anchor-link="r3"[^>]*>configurator\.py:30-34</);
  assert.match(html, /data-sentence="4" data-anchor="r3"[^>]*>The config can override the block size\.</);
  assert.equal(count(html, /data-anchor="/g), 3, 'anchors are never dropped');
});

test('the depth the card is saved at is the one drawn: brief is two sentences, detailed has the trace and the mention as a link', () => {
  const brief = render(lib.CodeExplainCard, { block: block({ depth: 'brief' }) });
  assert.equal(count(brief, /data-sentence="/g), 2);
  assert.match(brief, /aria-checked="true" data-depth-option="brief"/);
  const detailed = render(lib.CodeExplainCard, { block: block({ depth: 'detailed' }) });
  assert.match(detailed, /data-code-explain-trace[^>]*>.*Input: T = 4.*mask = tril\(ones\(4,4\)\).*softmax -&gt; \[1, 0, 0, 0\]/);
  assert.match(detailed, /data-anchor-link="m1"[^>]*>bench\.py:88</);
  assert.equal(count(detailed, /<li>/g), 2);
});

test('the figure slot exists only for a figure the existing renderer can draw', () => {
  const spec = examples[0];
  const drawn = render(lib.CodeExplainCard, { block: block({ figure: { referenceId: 'ref-1', spec } }) });
  assert.match(drawn, /data-code-explain-figure="ref-1"[^>]*>.*<svg/);
  assert.equal(count(render(lib.CodeExplainCard, { block: block({ figure: { referenceId: 'ref-1', spec: { diagram: { kind: 'nonsense' } } } }) }), /data-code-explain-figure/g), 0);
  assert.equal(count(render(lib.CodeExplainCard, { block: block({ figure: null }) }), /data-code-explain-figure/g), 0);
});

test('the three suggestions are buttons, disabled in a read-only viewer and with no chat', () => {
  const html = render(lib.CodeExplainCard, { block: block(), readOnly: true });
  assert.equal(count(html, /data-code-explain-suggestion="true"/g), 3);
  assert.equal(count(html, /data-code-explain-suggestion="true"[^>]*disabled/g), 3);
  assert.ok(html.includes('Why is the mask added before the softmax?'));
  // Everything else still renders for a viewer: the depth switch and the prose.
  assert.equal(count(html, /role="radio"/g), 3);
  assert.equal(count(html, /data-sentence="/g), 5);
});

test('the code pane: highlighted lines, dimmed lines between, a gap row, a lit range; whole file turns dimming off', () => {
  const file = Array.from({ length: 200 }, (_, i) => ({ n: i + 1, text: `line ${i + 1}` }));
  const ranges = [{ id: 'r1', start: 52, end: 54 }, { id: 'r2', start: 150, end: 151 }];
  const html = render(lib.CodeLines, { lines: file, ranges, lit: 'r2', onRange: () => {} });
  assert.equal(count(html, /data-highlighted="true"/g), 5);
  assert.match(html, /data-code-line="150"[^>]*data-range="r2"[^>]*data-range-first="r2"[^>]*data-lit="true"[^>]*role="button"/);
  assert.match(html, /data-code-line="53"[^>]*bg-accent\/10/);
  assert.match(html, /data-code-line="56"[^>]*opacity-40/);
  assert.match(html, /data-code-gap[^>]*>.*89 lines not shown/);
  assert.doesNotMatch(html, /data-code-line="100"/);
  const whole = render(lib.CodeLines, { lines: file, ranges, whole: true });
  assert.equal(count(whole, /data-code-line=/g), 200);
  assert.equal(count(whole, /opacity-40/g), 0);
  assert.equal(count(whole, /data-code-gap/g), 0);
  // A card without ranges is a plain code card's lines.
  const plain = render(lib.CodeLines, { lines: file.slice(0, 3), ranges: null });
  assert.equal(count(plain, /data-code-line=/g), 3);
  assert.equal(count(plain, /data-highlighted|opacity-40|role="button"/g), 0);
});

test('no UI label of the card carries an ellipsis', () => {
  const html = render(lib.CodeExplainCard, { block: block({ depth: 'detailed' }), readOnly: true });
  const text = html.replace(/<[^>]*>/g, ' ');
  assert.equal(/\.\.\.|…/.test(text), false);
});
